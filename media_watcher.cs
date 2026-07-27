using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
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
        static string coverSavedForKey = "";

        static readonly SemaphoreSlim coverLock = new SemaphoreSlim(1, 1);
        static CancellationTokenSource coverCts;

        static GlobalSystemMediaTransportControlsSessionManager sessionManager;
        static GlobalSystemMediaTransportControlsSession currentSession;

        static readonly object sessionLock = new object();
        static readonly CancellationTokenSource appCts = new CancellationTokenSource();

        // Счетчик попыток для текущего трека
        static int coverRetryCount = 0;
        const int MAX_COVER_RETRIES = 8;
        static DateTime lastCoverAttemptTime = DateTime.MinValue;

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
                ClearCurrentTrack();
                return;
            }

            if (props == null || string.IsNullOrEmpty(props.Title))
            {
                ClearCurrentTrack();
                return;
            }

            string trackKey = $"{props.Artist ?? ""}|{props.Title ?? ""}";

            // Проверяем смену трека
            bool isTrackChanged = trackKey != lastTrackKey;

            if (isTrackChanged)
            {
                // Сброс состояния при смене трека
                coverRetryCount = 0;
                coverSavedForKey = "";

                // Останавливаем старую загрузку
                lock (sessionLock)
                {
                    coverCts?.Cancel();
                    coverCts?.Dispose();
                    coverCts = new CancellationTokenSource();
                }

                // Удаляем старую обложку ПРИНУДИТЕЛЬНО
                TryDeleteFile(coverFile);
                TryDeleteFile(coverFile + ".tmp");

                Debug.WriteLine($"[MediaInfo] Track changed: {trackKey}");
            }

            CancellationToken token;
            lock (sessionLock)
            {
                if (coverCts == null || coverCts.IsCancellationRequested)
                {
                    coverCts?.Dispose();
                    coverCts = new CancellationTokenSource();
                }
                token = coverCts.Token;
            }

            try
            {
                // Записываем JSON всегда
                bool isPlaying = false;
                try
                {
                    isPlaying = session.GetPlaybackInfo()?.PlaybackStatus
                                == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                }
                catch { }

                var info = new
                {
                    title = props.Title ?? "",
                    artist = props.Artist ?? "",
                    album = props.AlbumTitle ?? "",
                    is_playing = isPlaying
                };

                await WriteFileAtomicAsync(infoFile, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(info)), token);
                lastTrackKey = trackKey;

                // Обложку сохраняем, если трек изменился или ещё не сохранена
                if (isTrackChanged || coverSavedForKey != trackKey)
                {
                    Debug.WriteLine($"[MediaInfo] Attempting cover save for: {trackKey}");

                    bool ok = await SaveCoverAtomicAsync(props.Thumbnail, token);

                    if (ok)
                    {
                        coverSavedForKey = trackKey;
                        coverRetryCount = 0;
                        Debug.WriteLine($"[MediaInfo] Cover saved successfully");
                    }
                    else
                    {
                        Debug.WriteLine($"[MediaInfo] Cover save failed, starting retry");
                        // Запускаем агрессивный ретрай
                        _ = AggressiveRetryCoverAsync(trackKey);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Debug.WriteLine($"[MediaInfo] Operation cancelled");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"HandleMediaProperties error: {ex}");
            }
        }

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

        static async Task<bool> SaveCoverAtomicAsync(
            IRandomAccessStreamReference thumbnail,
            CancellationToken token)
        {
            if (thumbnail == null)
            {
                Debug.WriteLine($"[Cover] Thumbnail is null");
                return false;
            }

            await coverLock.WaitAsync(token);
            try
            {
                token.ThrowIfCancellationRequested();

                IRandomAccessStreamWithContentType stream;
                try
                {
                    stream = await thumbnail.OpenReadAsync();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[Cover] OpenRead failed: {ex.Message}");
                    return false;
                }

                using (stream)
                {
                    if (stream == null || stream.Size == 0)
                    {
                        Debug.WriteLine($"[Cover] Stream is empty");
                        return false;
                    }

                    byte[] buffer = new byte[stream.Size];
                    using (var reader = new DataReader(stream))
                    {
                        uint loaded = await reader.LoadAsync((uint)stream.Size);
                        if (loaded != stream.Size)
                        {
                            Debug.WriteLine($"[Cover] Incomplete read: {loaded}/{stream.Size}");
                            return false;
                        }
                        reader.ReadBytes(buffer);
                    }

                    token.ThrowIfCancellationRequested();

                    if (buffer.Length < 4 || !IsValidImageHeader(buffer))
                    {
                        Debug.WriteLine($"[Cover] Invalid image header");
                        return false;
                    }

                    await WriteFileAtomicAsync(coverFile, buffer, token);
                    Debug.WriteLine($"[Cover] Cover saved, size: {buffer.Length} bytes");
                    return true;
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Cover save error: {ex.Message}");
                return false;
            }
            finally
            {
                coverLock.Release();
            }
        }

        static bool IsValidImageHeader(byte[] data)
        {
            if (data.Length < 4) return false;
            if (data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF) return true;
            if (data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47) return true;
            return false;
        }

        // Агрессивный ретрай с увеличивающимися интервалами
        static async Task AggressiveRetryCoverAsync(string trackKey)
        {
            int[] delays = { 300, 500, 800, 1200, 2000, 3000, 5000 };

            for (int i = 0; i < delays.Length && coverRetryCount < MAX_COVER_RETRIES; i++)
            {
                // Проверяем, не изменился ли трек
                if (trackKey != lastTrackKey)
                {
                    Debug.WriteLine($"[Retry] Track changed, stopping retry");
                    return;
                }

                // Проверяем, не сохранена ли уже обложка
                if (coverSavedForKey == trackKey)
                {
                    Debug.WriteLine($"[Retry] Cover already saved");
                    return;
                }

                coverRetryCount++;
                Debug.WriteLine($"[Retry] Attempt {coverRetryCount}/{MAX_COVER_RETRIES}, waiting {delays[i]}ms");

                try
                {
                    await Task.Delay(delays[i]);
                }
                catch
                {
                    return;
                }

                // Повторно проверяем трек после задержки
                if (trackKey != lastTrackKey || coverSavedForKey == trackKey)
                    return;

                GlobalSystemMediaTransportControlsSession s;
                lock (sessionLock) { s = currentSession; }
                if (s == null)
                {
                    Debug.WriteLine($"[Retry] Session lost");
                    return;
                }

                GlobalSystemMediaTransportControlsSessionMediaProperties p;
                try
                {
                    p = await s.TryGetMediaPropertiesAsync();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[Retry] Get props failed: {ex.Message}");
                    continue;
                }

                if (p == null)
                {
                    Debug.WriteLine($"[Retry] Props is null");
                    continue;
                }

                CancellationToken token;
                lock (sessionLock)
                {
                    if (coverCts == null || coverCts.IsCancellationRequested)
                    {
                        coverCts?.Dispose();
                        coverCts = new CancellationTokenSource();
                    }
                    token = coverCts.Token;
                }

                Debug.WriteLine($"[Retry] Attempting to save cover (attempt {coverRetryCount})");
                if (await SaveCoverAtomicAsync(p.Thumbnail, token))
                {
                    coverSavedForKey = trackKey;
                    coverRetryCount = 0;
                    Debug.WriteLine($"[Retry] Cover saved successfully on attempt {coverRetryCount}");
                    return;
                }
            }

            Debug.WriteLine($"[Retry] All retry attempts exhausted for: {trackKey}");
        }

        static void ClearCurrentTrack()
        {
            lastTrackKey = "";
            coverSavedForKey = "";
            coverRetryCount = 0;
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
                        if (name.IndexOf("musichub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("electron", StringComparison.OrdinalIgnoreCase) >= 0)
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
            TryDeleteFile(infoFile + ".tmp");
        }
    }
}
