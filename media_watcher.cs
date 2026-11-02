using System;
using System.Collections.Concurrent;
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
        static string publishedTimeline = null;
        static string publishedHash = "";
        static string handledTrack = "";

        // ---------- Источник музыки (процесс) ----------
        // Кэш по AUMID: AUMID стабилен для приложения, поэтому при смене сессии/трека не сбрасываем.
        static readonly ConcurrentDictionary<string, (int pid, string name, string path)> sourceCache =
            new ConcurrentDictionary<string, (int pid, string name, string path)>();

        // Отрицательный результат кэшируем ненадолго: окно приложения может появиться чуть позже,
        // но перебирать все процессы на каждое событие тоже нельзя.
        static readonly ConcurrentDictionary<string, long> sourceMissUntil = new ConcurrentDictionary<string, long>();
        const long SourceMissTtlMs = 30000;

        static readonly (int pid, string name, string path) NoSource = (0, "", "");

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
        // stdin: построчные JSON-команды от Electron. Когда Electron закрывается,
        // stdin у дочернего процесса закрывается -> EOF -> завершаем работу.
        static async Task WatchStdinAsync()
        {
            try
            {
                using var reader = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
                string line;
                while ((line = await reader.ReadLineAsync()) != null)
                {
                    if (line.Length == 0) continue;
                    HandleCommand(line);
                }
            }
            catch { }
            appCts.Cancel();
        }

        // Формат: {"cmd":"seek","position":<тики 100 нс от начала трека>}
        static void HandleCommand(string line)
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                if (!root.TryGetProperty("cmd", out var cmdEl)) return;

                switch (cmdEl.GetString())
                {
                    case "seek":
                        if (root.TryGetProperty("position", out var posEl) && posEl.TryGetInt64(out long ticks) && ticks >= 0)
                            _ = SeekAsync(ticks);
                        break;
                }
            }
            catch (Exception ex) { Console.Error.WriteLine($"HandleCommand error: {ex.Message}"); }
        }

        // Перемотка текущей сессии. Не все плееры поддерживают (вернут false) - это нормально,
        // клиент увидит реальную позицию из следующего timeline.
        static async Task SeekAsync(long ticks)
        {
            try
            {
                GlobalSystemMediaTransportControlsSession s;
                lock (sessionLock) { s = currentSession; }
                if (s == null) return;

                bool ok = await s.TryChangePlaybackPositionAsync(ticks);

                // Логируем РЕАЛЬНЫЙ ответ Windows (виден в консоли npm start как "⚠️ Watcher stderr: [SEEK] ...")
                Console.Error.WriteLine($"[SEEK] ticks={ticks} ok={ok}");

                // Не каждый плеер шлёт TimelinePropertiesChanged после перемотки - публикуем сами.
                // Дедупликацию сбрасываем: клиент двигает позицию заранее, и если плеер перемотку
                // отклонил, ему нужно получить реальную позицию, даже если она не изменилась.
                await Task.Delay(600, appCts.Token);
                lock (pubLock) { publishedTimeline = null; }
                PublishTimeline(s, appCts.Token);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Console.Error.WriteLine($"SeekAsync error: {ex.Message}"); }
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
                    currentSession.TimelinePropertiesChanged += OnSessionEvent;
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
                currentSession.TimelinePropertiesChanged -= OnSessionEvent;
                currentSession = null;
            }
        }

        // Общий обработчик для всех событий сессии.
        // Таймлайн обрабатываем отдельно, БЕЗ Schedule(): события таймлайна идут часто,
        // и каждый Schedule() отменял бы текущий прогон RunAsync (ретраи обложки сбрасывались бы).
        static void OnSessionEvent(GlobalSystemMediaTransportControlsSession s, object args)
        {
            if (args is TimelinePropertiesChangedEventArgs)
            {
                OnTimelineChanged(s);
                return;
            }
            Schedule();
        }

        // Публикация таймлайна по событию. Событие приходит НЕ на каждый тик (плеер сам решает,
        // когда обновлять Position/LastUpdatedTime) - это нормально: клиент интерполирует позицию
        // сам по формуле position + (now - updated), пока is_playing = true.
        static void OnTimelineChanged(GlobalSystemMediaTransportControlsSession s)
        {
            try
            {
                GlobalSystemMediaTransportControlsSession cur;
                lock (sessionLock) { cur = currentSession; }

                // Событие от уже неактуальной сессии - игнорируем
                if (cur == null || !ReferenceEquals(cur, s)) return;

                PublishTimeline(cur, appCts.Token);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Debug.WriteLine($"OnTimelineChanged error: {ex}"); }
        }

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

                    // Все обращения к currentSession - под sessionLock
                    GlobalSystemMediaTransportControlsSession s;
                    string aumid = "";
                    lock (sessionLock)
                    {
                        s = currentSession;
                        try { aumid = s?.SourceAppUserModelId ?? ""; }
                        catch { }
                    }
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

                    var source = ResolveSource(aumid);

                    PublishInfo(props.Title ?? "", props.Artist ?? "", props.AlbumTitle ?? "", playing, source, ct);
                    PublishTimeline(s, ct);

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

        // ---------- Источник музыки ----------

        // Определяет процесс-источник по AUMID сессии.
        // ОГРАНИЧЕНИЕ: для браузеров (Chrome/Edge/Firefox) результат - сам браузер, а не вкладка.
        // Штатно (через GSMTC) узнать вкладку нельзя.
        // Также: у UWP-приложений окно может принадлежать ApplicationFrameHost - тогда источник не найдётся (0/""/"").
        static (int pid, string name, string path) ResolveSource(string aumid)
        {
            if (string.IsNullOrEmpty(aumid)) return NoSource;

            if (sourceCache.TryGetValue(aumid, out var cached))
            {
                if (IsProcessAlive(cached)) return cached;
                // Приложение перезапустили: AUMID тот же, а pid уже другой -> ищем заново
                sourceCache.TryRemove(aumid, out _);
            }

            if (sourceMissUntil.TryGetValue(aumid, out long until) && Environment.TickCount64 < until)
                return NoSource;

            var found = FindSourceProcess(aumid);
            if (found.pid != 0)
            {
                sourceCache[aumid] = found;
                sourceMissUntil.TryRemove(aumid, out _);
            }
            else
            {
                sourceMissUntil[aumid] = Environment.TickCount64 + SourceMissTtlMs;
            }
            return found;
        }

        static bool IsProcessAlive((int pid, string name, string path) src)
        {
            try
            {
                using var p = Process.GetProcessById(src.pid);
                return !p.HasExited && p.ProcessName == src.name;
            }
            catch { return false; }
        }

        static (int pid, string name, string path) FindSourceProcess(string aumid)
        {
            // Для UWP AUMID имеет вид "PackageFamily!App", а в пути лежит только PackageFamily
            string key = aumid;
            int bang = aumid.IndexOf('!');
            if (bang > 0) key = aumid.Substring(0, bang);

            Process[] all;
            try { all = Process.GetProcesses(); }
            catch { return NoSource; }

            var result = NoSource;
            foreach (var p in all)
            {
                try
                {
                    // Берём первый подходящий, но Dispose нужен для всех -> без break
                    if (result.pid == 0 && p.MainWindowHandle != IntPtr.Zero)
                    {
                        string path = p.MainModule?.FileName;   // у системных процессов бросит - это нормально
                        if (!string.IsNullOrEmpty(path) &&
                            path.IndexOf(key, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            result = (p.Id, p.ProcessName, path);
                        }
                    }
                }
                catch { }
                finally { p.Dispose(); }
            }
            return result;
        }

        // ---------- Публикация (все проверки отмены под pubLock) ----------

        static void PublishInfo(string title, string artist, string album, bool playing,
                                (int pid, string name, string path) source, CancellationToken ct)
        {
            var msg = new
            {
                type = "info",
                title,
                artist,
                album,
                is_playing = playing,
                source_pid = source.pid,
                source_name = source.name,
                source_path = source.path
            };
            string json = JsonSerializer.Serialize(msg);

            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                if (json == publishedInfo) return;
                WriteLine(json);
                publishedInfo = json;
            }
        }

        // Все значения - в тиках (100 нс): position/start/end/min_seek/max_seek - длительности,
        // updated - UtcTicks момента, когда плеер обновил position.
        static void PublishTimeline(GlobalSystemMediaTransportControlsSession s, CancellationToken ct)
        {
            string json;
            try
            {
                var tl = s.GetTimelineProperties();
                if (tl == null) return;

                var msg = new
                {
                    type = "timeline",
                    position = tl.Position.Ticks,
                    start = tl.StartTime.Ticks,
                    end = tl.EndTime.Ticks,
                    min_seek = tl.MinSeekTime.Ticks,
                    max_seek = tl.MaxSeekTime.Ticks,
                    updated = tl.LastUpdatedTime.UtcTicks
                };
                json = JsonSerializer.Serialize(msg);
            }
            catch (Exception ex)
            {
                // Сессия могла умереть между событием и вызовом - не критично
                Debug.WriteLine($"PublishTimeline error: {ex.Message}");
                return;
            }

            lock (pubLock)
            {
                ct.ThrowIfCancellationRequested();
                if (json == publishedTimeline) return;
                WriteLine(json);
                publishedTimeline = json;
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
                if (publishedInfo == null && publishedTimeline == null && publishedHash == "" && handledTrack == "") return;
                WriteLine("{\"type\":\"clear\"}");
                publishedInfo = null;
                publishedTimeline = null;
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