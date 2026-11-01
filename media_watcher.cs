using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
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
        // Паузы между попытками получить обложку (мс)
        static readonly int[] Delays = { 150, 300, 500, 800, 1200, 2000, 3000 };

        static GlobalSystemMediaTransportControlsSessionManager sessionManager;
        static GlobalSystemMediaTransportControlsSession currentSession;

        static readonly object sessionLock = new object();
        static readonly object pubLock = new object();
        static readonly CancellationTokenSource appCts = new CancellationTokenSource();

        static CancellationTokenSource runCts;

        // Что уже отправлено клиенту (меняется только под pubLock)
        static string publishedInfo = null;
        static string publishedHash = "";
        static string handledTrack = "";

        static Stream stdout;

        // Запуск: MediaInfoWatcher.exe [parentPid]
        static async Task Main(string[] args)
        {
            stdout = Console.OpenStandardOutput();

            try
            {
                sessionManager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            }
            catch
            {
                return;
            }

            sessionManager.CurrentSessionChanged += (s, e) => OnSessionChanged();
            OnSessionChanged();

            // Условия завершения
            if (args.Length > 0 && int.TryParse(args[0], out int pid))
                _ = WatchParentPidAsync(pid);
            _ = WatchStdinAsync();

            try { await Task.Delay(Timeout.Infinite, appCts.Token); }
            catch (OperationCanceledException) { }
            finally
            {
                runCts?.Cancel();
                lock (sessionLock) { UnsubscribeSession(); }
            }
        }

        // ---------- Завершение ----------

        static async Task WatchParentPidAsync(int pid)
        {
            try
            {
                using var p = Process.GetProcessById(pid);
                await p.WaitForExitAsync();
            }
            catch { }
            appCts.Cancel();
        }

        // Когда Electron закрывается, stdin у дочернего процесса закрывается -> EOF
        static async Task WatchStdinAsync()
        {
            try
            {
                var input = Console.OpenStandardInput();
                var buf = new byte[256];
                while (await input.ReadAsync(buf, 0, buf.Length) > 0) { }
            }
            catch { }
            appCts.Cancel();
        }

        // ---------- Сессии и события ----------

        static void OnSessionChanged()
        {
            lock (sessionLock)
            {
                UnsubscribeSession();
                try { currentSession = sessionManager.GetCurrentSession(); }
                catch { currentSession = null; }

                if (currentSession != null)
                {
                    currentSession.MediaPropertiesChanged += OnSessionEvent;
                    currentSession.PlaybackInfoChanged += OnSessionEvent;
                }
            }
            Schedule();
        }

        static void UnsubscribeSession()
        {
            if (currentSession != null)
            {
                currentSession.MediaPropertiesChanged -= OnSessionEvent;
                currentSession.PlaybackInfoChanged -= OnSessionEvent;
                currentSession = null;
            }
        }

        static void OnSessionEvent(GlobalSystemMediaTransportControlsSession s, object args) => Schedule();

        // Новое событие отменяет предыдущий прогон: одновременно живёт только один
        static void Schedule()
        {
            CancellationTokenSource cts;
            lock (sessionLock)
            {
                runCts?.Cancel();
                runCts = cts = CancellationTokenSource.CreateLinkedTokenSource(appCts.Token);
            }
            _ = RunAsync(cts.Token);
        }

        // ---------- Основная логика ----------

        static async Task RunAsync(CancellationToken ct)
        {
            try
            {
                for (int i = 0; i < Delays.Length; i++)
                {
                    await Task.Delay(Delays[i], ct);

                    GlobalSystemMediaTransportControlsSession s;
                    lock (sessionLock) { s = currentSession; }
                    if (s == null) { PublishClear(ct); return; }

                    GlobalSystemMediaTransportControlsSessionMediaProperties props;
                    try { props = await s.TryGetMediaPropertiesAsync(); }
                    catch { PublishClear(ct); return; }

                    if (props == null || string.IsNullOrEmpty(props.Title))
                    {
                        PublishClear(ct);
                        return;
                    }

                    // 1) INFO: независимо от обложки, сразу
                    bool playing = false;
                    try
                    {
                        playing = s.GetPlaybackInfo()?.PlaybackStatus ==
                                  GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                    }
                    catch { }

                    PublishInfo(props.Title ?? "", props.Artist ?? "", props.AlbumTitle ?? "", playing, ct);

                    // 2) COVER: по хешу, название нужно только чтобы понять "это новый трек?"
                    string trackKey = $"{props.Artist}|{props.Title}|{props.AlbumTitle}";
                    bool newTrack = trackKey != handledTrack;
                    bool last = i == Delays.Length - 1;

                    byte[] cover = await ReadThumbAsync(props.Thumbnail);
                    string hash = cover == null ? "" : Convert.ToHexString(SHA256.HashData(cover));

                    // Обложка реально изменилась -> публикуем, что бы там ни было с названием
                    if (cover != null && hash != publishedHash)
                    {
                        PublishCover(hash, cover, trackKey, ct);
                        return;
                    }

                    // Событие не про смену трека (например, пауза/плей) -> делать нечего
                    if (!newTrack) return;

                    // Новый трек, но обложка та же самая или её нет:
                    // возможно, плеер ещё не обновил её -> ждём
                    if (!last) continue;

                    // Последняя попытка: принимаем как есть
                    if (cover == null && publishedHash != "")
                        PublishCover("", null, trackKey, ct);   // обложки нет, сбрасываем старую
                    else
                        MarkHandled(trackKey, ct);              // тот же альбом, обложка совпала
                    return;
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Debug.WriteLine($"RunAsync error: {ex}"); }
        }

        // ---------- Публикация (все проверки отмены под pubLock) ----------

        static void PublishInfo(string title, string artist, string album, bool playing, CancellationToken ct)
        {
            var msg = new { type = "info", title, artist, album, is_playing = playing };
            string json = JsonSerializer.Serialize(msg);

            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                if (json == publishedInfo) return;
                WriteLine(json);
                publishedInfo = json;
            }
        }

        static void PublishCover(string hash, byte[] data, string trackKey, CancellationToken ct)
        {
            var msg = new
            {
                type = "cover",
                hash,
                data = data == null ? null : Convert.ToBase64String(data)
            };
            string json = JsonSerializer.Serialize(msg);

            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                WriteLine(json);
                publishedHash = hash;
                handledTrack = trackKey;
            }
        }

        static void MarkHandled(string trackKey, CancellationToken ct)
        {
            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                handledTrack = trackKey;
            }
        }

        static void PublishClear(CancellationToken ct)
        {
            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                if (publishedInfo == null && publishedHash == "" && handledTrack == "") return;
                WriteLine("{\"type\":\"clear\"}");
                publishedInfo = null;
                publishedHash = "";
                handledTrack = "";
            }
        }

        static void WriteLine(string json)
        {
            try
            {
                var bytes = Encoding.UTF8.GetBytes(json + "\n");
                stdout.Write(bytes, 0, bytes.Length);
                stdout.Flush();
            }
            catch
            {
                // stdout закрыт -> родителя больше нет
                appCts.Cancel();
            }
        }

        // ---------- Чтение картинки ----------

        static async Task<byte[]> ReadThumbAsync(IRandomAccessStreamReference thumb)
        {
            if (thumb == null) return null;
            try
            {
                using var stream = await thumb.OpenReadAsync();
                if (stream == null || stream.Size == 0) return null;

                var buf = new byte[stream.Size];
                using var reader = new DataReader(stream);
                uint loaded = await reader.LoadAsync((uint)stream.Size);
                if (loaded != stream.Size) return null;
                reader.ReadBytes(buf);

                return IsValidImageHeader(buf) ? buf : null;
            }
            catch
            {
                return null;
            }
        }

        static bool IsValidImageHeader(byte[] d)
        {
            if (d.Length < 4) return false;
            if (d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF) return true;                          // JPEG
            if (d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47) return true;          // PNG
            return false;
        }
    }
}