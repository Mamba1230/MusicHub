using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace MediaInfoWatcher
{
    class Program
    {
        [DllImport("kernel32.dll")]
        static extern IntPtr GetConsoleWindow();

        [DllImport("user32.dll")]
        static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        const int SW_HIDE = 0;

        static string saveDir;
        static string infoFile;
        static string coverFile;

        static string lastTrackKey = "";

        // SemaphoreSlim вместо CancellationTokenSource для очереди обложек — гарантирует порядок
        static readonly SemaphoreSlim coverLock = new SemaphoreSlim(1, 1);
        static CancellationTokenSource coverCts;

        static GlobalSystemMediaTransportControlsSessionManager sessionManager;
        static GlobalSystemMediaTransportControlsSession currentSession;

        // Объект синхронизации для работы с currentSession из разных потоков
        static readonly object sessionLock = new object();

        static readonly CancellationTokenSource appCts = new CancellationTokenSource();

        static async Task Main(string[] args)
        {
            var handle = GetConsoleWindow();
            if (handle != IntPtr.Zero)
                ShowWindow(handle, SW_HIDE);

            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            saveDir = Path.Combine(appData, "musichub");
            Directory.CreateDirectory(saveDir);
            infoFile = Path.Combine(saveDir, "media_info.json");
            coverFile = Path.Combine(saveDir, "cover.jpg");

            if (!IsMusicHubRunning())
                return;

            try
            {
                sessionManager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            }
            catch
            {
                return;
            }

            sessionManager.CurrentSessionChanged += OnCurrentSessionChanged;
            // Инициализируем сессию вручную при старте
            await RefreshCurrentSessionAsync();

            _ = MonitorMusicHubProcessAsync(appCts.Token);

            try
            {
                await Task.Delay(Timeout.Infinite, appCts.Token);
            }
            catch (OperationCanceledException) { }
            finally
            {
                sessionManager.CurrentSessionChanged -= OnCurrentSessionChanged;
                UnsubscribeCurrentSession();
                // Отменяем текущую загрузку обложки
                coverCts?.Cancel();
                CleanupFiles();
            }
        }

        static async Task MonitorMusicHubProcessAsync(CancellationToken token)
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(500, token);
                }
                catch (OperationCanceledException)
                {
                    return;
                }

                if (!IsMusicHubRunning())
                {
                    appCts.Cancel();
                    return;
                }
            }
        }

        static void OnCurrentSessionChanged(
            GlobalSystemMediaTransportControlsSessionManager sender,
            CurrentSessionChangedEventArgs args)
        {
            // Запускаем асинхронно, не блокируя event-поток WinRT
            _ = RefreshCurrentSessionAsync();
        }

        static async Task RefreshCurrentSessionAsync()
        {
            GlobalSystemMediaTransportControlsSession newSession;
            try
            {
                newSession = sessionManager.GetCurrentSession();
            }
            catch
            {
                newSession = null;
            }

            lock (sessionLock)
            {
                UnsubscribeCurrentSession();
                currentSession = newSession;

                if (currentSession != null)
                    currentSession.MediaPropertiesChanged += OnMediaPropertiesChanged;
            }

            if (newSession != null)
                await HandleMediaPropertiesAsync();
            else
                ClearCurrentTrack();
        }

        static void UnsubscribeCurrentSession()
        {
            // Вызывается только внутри lock(sessionLock)
            if (currentSession != null)
            {
                currentSession.MediaPropertiesChanged -= OnMediaPropertiesChanged;
                currentSession = null;
            }
        }

        static void OnMediaPropertiesChanged(
            GlobalSystemMediaTransportControlsSession sender,
            MediaPropertiesChangedEventArgs args)
        {
            _ = HandleMediaPropertiesAsync();
        }

        static async Task HandleMediaPropertiesAsync()
        {
            // Отменяем предыдущую загрузку обложки
            CancellationToken token;
            lock (sessionLock)
            {
                coverCts?.Cancel();
                coverCts?.Dispose();
                coverCts = new CancellationTokenSource();
                token = coverCts.Token;
            }

            try
            {
                GlobalSystemMediaTransportControlsSession session;
                lock (sessionLock) { session = currentSession; }

                if (session == null) return;

                GlobalSystemMediaTransportControlsSessionMediaProperties props;
                try
                {
                    props = await session.TryGetMediaPropertiesAsync();
                }
                catch
                {
                    // Сессия стала недействительной
                    ClearCurrentTrack();
                    return;
                }

                if (props == null || string.IsNullOrEmpty(props.Title))
                {
                    ClearCurrentTrack();
                    return;
                }

                token.ThrowIfCancellationRequested();

                string trackKey = $"{props.Artist ?? ""}|{props.Title ?? ""}";

                bool isPlaying = false;
                try
                {
                    var playbackInfo = session.GetPlaybackInfo();
                    isPlaying = playbackInfo?.PlaybackStatus ==
                                GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                }
                catch { }

                // Сначала пишем JSON, потом обложку — читатель всегда видит актуальные данные
                var info = new
                {
                    title  = props.Title       ?? "",
                    artist = props.Artist      ?? "",
                    album  = props.AlbumTitle  ?? "",
                    is_playing = isPlaying
                };

                string json = JsonSerializer.Serialize(info);
                await WriteFileAtomicAsync(infoFile, Encoding.UTF8.GetBytes(json), token);

                lastTrackKey = trackKey;

                await SaveCoverAtomicAsync(props.Thumbnail, token);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                Debug.WriteLine($"HandleMediaProperties error: {ex}");
            }
        }

        /// <summary>
        /// Атомарная запись любого файла через temp → Move.
        /// Исключает ситуацию, когда читатель видит частично записанный файл.
        /// </summary>
        static async Task WriteFileAtomicAsync(string targetPath, byte[] data, CancellationToken token)
        {
            string tmp = targetPath + ".tmp";
            try
            {
                await File.WriteAllBytesAsync(tmp, data, token);
                token.ThrowIfCancellationRequested();
                File.Move(tmp, targetPath, overwrite: true);
            }
            catch (OperationCanceledException)
            {
                TryDeleteFile(tmp);
                throw;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"WriteFileAtomic error ({targetPath}): {ex.Message}");
                TryDeleteFile(tmp);
            }
        }

        static async Task SaveCoverAtomicAsync(
            IRandomAccessStreamReference thumbnail,
            CancellationToken token)
        {
            if (thumbnail == null)
            {
                TryDeleteFile(coverFile);
                return;
            }

            // coverLock гарантирует, что одновременно пишется только одна обложка
            await coverLock.WaitAsync(token);
            try
            {
                token.ThrowIfCancellationRequested();

                IRandomAccessStreamWithContentType stream;
                try
                {
                    stream = await thumbnail.OpenReadAsync();
                }
                catch
                {
                    // Thumbnail недоступен — не трогаем старую обложку
                    return;
                }

                using (stream)
                {
                    if (stream == null || stream.Size == 0)
                    {
                        TryDeleteFile(coverFile);
                        return;
                    }

                    // Читаем весь поток за один раз
                    byte[] buffer = new byte[stream.Size];
                    using (var reader = new DataReader(stream))
                    {
                        uint loaded = await reader.LoadAsync((uint)stream.Size);
                        if (loaded != stream.Size)
                        {
                            // Неполное чтение — не сохраняем мусор
                            TryDeleteFile(coverFile);
                            return;
                        }
                        reader.ReadBytes(buffer);
                    }

                    token.ThrowIfCancellationRequested();

                    // Минимальная валидация: JPEG начинается с FF D8, PNG с 89 50
                    if (buffer.Length < 4 ||
                        !IsValidImageHeader(buffer))
                    {
                        TryDeleteFile(coverFile);
                        return;
                    }

                    await WriteFileAtomicAsync(coverFile, buffer, token);
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Cover save error: {ex.Message}");
            }
            finally
            {
                coverLock.Release();
            }
        }

        /// <summary>
        /// Проверяет сигнатуру файла: JPEG (FF D8 FF) или PNG (89 50 4E 47).
        /// </summary>
        static bool IsValidImageHeader(byte[] data)
        {
            if (data.Length < 4) return false;
            // JPEG
            if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return true;
            // PNG
            if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47) return true;
            return false;
        }

        static void ClearCurrentTrack()
        {
            lastTrackKey = "";
            TryDeleteFile(infoFile);
            TryDeleteFile(coverFile);
        }

        static void TryDeleteFile(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        static bool IsMusicHubRunning()
        {
            try
            {
                var procs = Process.GetProcesses();
                foreach (var proc in procs)
                {
                    try
                    {
                        string name = proc.ProcessName;
                        if (name.IndexOf("musichub",  StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("electron",  StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            proc.Dispose();
                            return true;
                        }
                    }
                    catch { }
                    finally { proc.Dispose(); }
                }
            }
            catch { }
            return false;
        }

        static void CleanupFiles()
        {
            TryDeleteFile(infoFile);
            TryDeleteFile(coverFile);
            TryDeleteFile(coverFile + ".tmp");
            TryDeleteFile(infoFile  + ".tmp");
        }
    }
}