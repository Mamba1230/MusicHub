using System;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using System.Collections.Concurrent;
using System.Threading;

namespace VolumeController
{
    class Program
    {
        private static HttpListener? _listener;
        private static readonly int Port = 9876;
        private static bool _isShuttingDown = false;

        // ========== АУДИО-СТРИМИНГ ==========
        private static WasapiLoopbackCapture? _capture;
        private static ConcurrentDictionary<WebSocket, SemaphoreSlim> _audioClients = new ConcurrentDictionary<WebSocket, SemaphoreSlim>();
        private static bool _isAudioStreaming = false;
        private static string _selectedDeviceId = "";
        private static int _audioMode = 0;
        private static readonly object _lock = new object();
        private static int _startupAttempts = 0;
        private static readonly int MAX_STARTUP_ATTEMPTS = 3;

        // Медиа-клавиши
        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

        private const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
        private const byte VK_MEDIA_STOP = 0xB2;
        private const byte VK_MEDIA_NEXT_TRACK = 0xB0;
        private const byte VK_MEDIA_PREV_TRACK = 0xB1;
        private const uint KEYEVENTF_KEYDOWN = 0x0000;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        static async Task Main(string[] args)
        {
            Console.WriteLine("VolumeController v10.2 (Audio Streaming Fixed)");

            if (!CheckTargetProcessesExist())
            {
                Console.WriteLine("❌ musichub.exe и electron.exe не запущены.");
                await Task.Delay(2000);
                return;
            }

            Console.WriteLine("✅ Целевой процесс найден. Сервер запущен.");

            LoadSettings();

            var serverTask = Task.Run(() => StartServer());
            var monitorTask = Task.Run(() => MonitorProcesses());

            await Task.WhenAny(serverTask, monitorTask);
        }

        // ========== ПРОВЕРКА ПРОЦЕССОВ ==========
        static bool CheckTargetProcessesExist()
        {
            string[] targetNames = { "musichub", "electron" };
            foreach (string name in targetNames)
            {
                try
                {
                    var processes = Process.GetProcessesByName(name);
                    if (processes.Length > 0)
                    {
                        foreach (var p in processes) p.Dispose();
                        return true;
                    }
                }
                catch { }
            }
            return false;
        }

        static async Task MonitorProcesses()
        {
            int failCount = 0;
            const int maxFails = 3;

            while (!_isShuttingDown)
            {
                await Task.Delay(5000);

                if (_isShuttingDown) break;

                bool anyAlive = CheckTargetProcessesExist();

                if (!anyAlive)
                {
                    failCount++;
                    Console.WriteLine($"⚠️ Процессы не найдены ({failCount}/{maxFails})");

                    if (failCount >= maxFails)
                    {
                        Console.WriteLine("❌ Целевые процессы не найдены. Завершаю работу...");
                        _isShuttingDown = true;
                        Shutdown();
                        return;
                    }
                }
                else
                {
                    failCount = 0;
                }
            }
        }

        static void Shutdown()
        {
            Console.WriteLine("🛑 Завершение работы...");

            StopAudioStreaming();

            foreach (var kvp in _audioClients)
            {
                var client = kvp.Key;
                var sem = kvp.Value;
                try
                {
                    if (client.State == WebSocketState.Open || client.State == WebSocketState.Connecting)
                    {
                        client.CloseAsync(WebSocketCloseStatus.NormalClosure, "Shutdown", CancellationToken.None).Wait(1000);
                    }
                    client.Dispose();
                }
                catch { }
                finally
                {
                    sem.Dispose();
                }
            }
            _audioClients.Clear();

            try
            {
                _listener?.Stop();
                _listener?.Close();
            }
            catch { }

            Console.WriteLine("✅ Завершено");
            Environment.Exit(0);
        }

        // ========== ЗАГРУЗКА НАСТРОЕК ==========
        static void LoadSettings()
        {
            try
            {
                string configPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "musichub", "audio_config.json");
                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    var config = System.Text.Json.JsonSerializer.Deserialize<AudioConfig>(json);
                    if (config != null)
                    {
                        _audioMode = config.Mode;
                        _selectedDeviceId = config.DeviceId ?? "";
                        Console.WriteLine($"📋 Загружены настройки: Mode={_audioMode}, Device={_selectedDeviceId}");
                    }
                }
                else
                {
                    Console.WriteLine("📋 Файл конфига не найден, используются значения по умолчанию");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Ошибка загрузки настроек: {ex.Message}");
            }
        }

        static void SaveSettings()
        {
            try
            {
                string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
                string dir = Path.Combine(appData, "musichub");
                if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

                string configPath = Path.Combine(dir, "audio_config.json");
                var config = new AudioConfig { Mode = _audioMode, DeviceId = _selectedDeviceId };
                string json = System.Text.Json.JsonSerializer.Serialize(config, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configPath, json);
                Console.WriteLine($"💾 Настройки сохранены: {configPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Ошибка сохранения настроек: {ex.Message}");
            }
        }

        // ========== ПОЛУЧЕНИЕ СПИСКА УСТРОЙСТВ ==========
        static string GetAudioDevicesJson()
        {
            try
            {
                using var enumerator = new MMDeviceEnumerator();
                var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);

                var list = new System.Collections.Generic.List<DeviceInfo>();
                var defaultDevice = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                string defaultId = defaultDevice?.ID ?? "";

                foreach (var device in devices)
                {
                    list.Add(new DeviceInfo
                    {
                        Id = device.ID ?? "unknown",
                        Name = device.FriendlyName ?? "Unknown Device",
                        IsDefault = device.ID == defaultId
                    });
                }

                return System.Text.Json.JsonSerializer.Serialize(list);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Ошибка получения устройств: {ex.Message}");
                return "[]";
            }
        }

        // ========== АУДИО-СТРИМИНГ ==========
        static void StartAudioStreaming(string deviceId = "")
        {
            lock (_lock)
            {
                if (_isShuttingDown) return;

                if (_isAudioStreaming)
                {
                    Console.WriteLine("⚠️ Захват уже активен, останавливаем перед перезапуском");
                    StopAudioStreaming();
                    Thread.Sleep(500);
                }

                _startupAttempts = 0;
                StartAudioStreamingInternal(deviceId);
            }
        }

static void StartAudioStreamingInternal(string deviceId)
{
    try
    {
        MMDevice? device = null;
        using var enumerator = new MMDeviceEnumerator();

        // ЛОГИРОВАНИЕ
        Console.WriteLine($"========================================");
        Console.WriteLine($"📥 Получен DeviceId: '{deviceId}'");
        Console.WriteLine($"   Длина строки: {deviceId.Length}");
        Console.WriteLine($"   Пустая строка: {string.IsNullOrEmpty(deviceId)}");
        Console.WriteLine($"========================================");

        if (!string.IsNullOrEmpty(deviceId))
        {
            try
            {
                device = enumerator.GetDevice(deviceId);
                Console.WriteLine($"✅ УСТРОЙСТВО ПО ID: {device?.FriendlyName}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️ Не удалось получить устройство по ID '{deviceId}': {ex.Message}");
            }
        }

        if (device == null)
        {
            device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            Console.WriteLine($"🎧 УСТРОЙСТВО ПО УМОЛЧАНИЮ: {device?.FriendlyName}");
        }

        if (device == null)
        {
            Console.WriteLine("❌ Не найдено устройство для захвата");
            // ... остальной код ...
            return;
        }

        _capture = new WasapiLoopbackCapture(device);
        _capture.DataAvailable += OnAudioDataAvailable;
        _capture.RecordingStopped += OnRecordingStopped;

        _capture.StartRecording();
        _isAudioStreaming = true;
        _startupAttempts = 0;

        Console.WriteLine($"✅ ЗАХВАТ ЗАПУЩЕН:");
        Console.WriteLine($"   Устройство: {device.FriendlyName}");
        Console.WriteLine($"   Частота: {_capture.WaveFormat.SampleRate}Hz");
        Console.WriteLine($"   Каналы: {_capture.WaveFormat.Channels}");
        Console.WriteLine($"   Биты: {_capture.WaveFormat.BitsPerSample}bit");
        Console.WriteLine($"========================================");

        NotifyClientsFormat();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"❌ Ошибка запуска: {ex.Message}");
        _isAudioStreaming = false;
        _capture?.Dispose();
        _capture = null;

                _startupAttempts++;
                if (_startupAttempts < MAX_STARTUP_ATTEMPTS && _audioMode == 1)
                {
                    Console.WriteLine($"🔄 Попытка {_startupAttempts + 1}/{MAX_STARTUP_ATTEMPTS} через 2 секунды...");
                    Task.Run(async () =>
                    {
                        await Task.Delay(2000);
                        if (_audioMode == 1 && !_isShuttingDown)
                        {
                            lock (_lock) { StartAudioStreamingInternal(_selectedDeviceId); }
                        }
                    });
                }
            }
        }

        static void NotifyClientsFormat()
        {
            if (_capture == null || !_isAudioStreaming) return;

            var format = new
            {
                sampleRate = _capture.WaveFormat.SampleRate,
                channels = _capture.WaveFormat.Channels,
                bitsPerSample = _capture.WaveFormat.BitsPerSample
            };
            string formatJson = System.Text.Json.JsonSerializer.Serialize(format);
            byte[] formatBytes = Encoding.UTF8.GetBytes("FORMAT:" + formatJson);

            var clients = _audioClients.ToArray();
            foreach (var kvp in clients)
            {
                var client = kvp.Key;
                var sem = kvp.Value;
                if (client.State == WebSocketState.Open)
                {
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await sem.WaitAsync();
                            if (client.State == WebSocketState.Open)
                            {
                                await client.SendAsync(new ArraySegment<byte>(formatBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                            }
                        }
                        catch { }
                        finally { sem.Release(); }
                    });
                }
            }
        }

        static void StopAudioStreaming()
        {
            lock (_lock)
            {
                if (_capture != null)
                {
                    try
                    {
                        _capture.DataAvailable -= OnAudioDataAvailable;
                        _capture.RecordingStopped -= OnRecordingStopped;
                        _capture.StopRecording();
                        _capture.Dispose();
                        Console.WriteLine("⏹️ Захват остановлен");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"⚠️ Ошибка при остановке захвата: {ex.Message}");
                    }
                    _capture = null;
                }
                _isAudioStreaming = false;
            }
        }

        // ========== ОБРАБОТКА АУДИО-ДАННЫХ ==========
        static void OnAudioDataAvailable(object? sender, WaveInEventArgs e)
        {
            if (_isShuttingDown || e.BytesRecorded == 0) return;

            byte[] lengthBytes = BitConverter.GetBytes(e.BytesRecorded);
            byte[] dataPacket = new byte[4 + e.BytesRecorded];
            Array.Copy(lengthBytes, 0, dataPacket, 0, 4);
            Array.Copy(e.Buffer, 0, dataPacket, 4, e.BytesRecorded);

            var clients = _audioClients.ToArray();
            foreach (var kvp in clients)
            {
                var client = kvp.Key;
                var sem = kvp.Value;

                if (client.State == WebSocketState.Open)
                {
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await sem.WaitAsync();
                            if (client.State == WebSocketState.Open)
                            {
                                await client.SendAsync(
                                    new ArraySegment<byte>(dataPacket),
                                    WebSocketMessageType.Binary,
                                    true,
                                    CancellationToken.None);
                            }
                        }
                        catch { }
                        finally
                        {
                            sem.Release();
                        }
                    });
                }
            }
        }

        static void OnRecordingStopped(object? sender, StoppedEventArgs e)
        {
            if (_isShuttingDown) return;

            Console.WriteLine($"⚠️ Запись остановлена: {e.Exception?.Message ?? "нормальная остановка"}");

            lock (_lock)
            {
                _isAudioStreaming = false;

                if (_audioMode == 1 && !_isShuttingDown)
                {
                    Console.WriteLine("🔄 Автоматический перезапуск захвата через 1 секунду...");
                    Task.Run(async () =>
                    {
                        await Task.Delay(1000);
                        if (_audioMode == 1 && !_isShuttingDown)
                        {
                            StartAudioStreaming(_selectedDeviceId);
                        }
                    });
                }
            }
        }

        // ========== WEBSOCKET ==========
        static async Task HandleWebSocket(HttpListenerContext context)
        {
            if (_isShuttingDown)
            {
                context.Response.StatusCode = 503;
                context.Response.Close();
                return;
            }

            if (!context.Request.IsWebSocketRequest)
            {
                context.Response.StatusCode = 400;
                context.Response.Close();
                return;
            }

            WebSocket? webSocket = null;
            SemaphoreSlim? sem = null;

            try
            {
                var wsContext = await context.AcceptWebSocketAsync(null);
                webSocket = wsContext.WebSocket;

                sem = new SemaphoreSlim(1, 1);
                if (!_audioClients.TryAdd(webSocket, sem))
                {
                    sem.Dispose();
                    webSocket.Dispose();
                    return;
                }

                Console.WriteLine($"🔌 WebSocket клиент подключен (всего: {_audioClients.Count})");

                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ВСЕГДА проверяем состояние захвата
                bool captureActive = false;
                lock (_lock)
                {
                    captureActive = _isAudioStreaming && _capture != null;
                }

                if (captureActive)
                {
                    var format = new
                    {
                        sampleRate = _capture!.WaveFormat.SampleRate,
                        channels = _capture.WaveFormat.Channels,
                        bitsPerSample = _capture.WaveFormat.BitsPerSample
                    };
                    string formatJson = System.Text.Json.JsonSerializer.Serialize(format);
                    byte[] formatBytes = Encoding.UTF8.GetBytes("FORMAT:" + formatJson);
                    await webSocket.SendAsync(new ArraySegment<byte>(formatBytes), WebSocketMessageType.Text, true, CancellationToken.None);
                    Console.WriteLine($"📤 Отправлен формат клиенту: {formatJson}");
                }
                else
                {
                    byte[] msg = Encoding.UTF8.GetBytes("INFO:Capture not active, waiting...");
                    await webSocket.SendAsync(new ArraySegment<byte>(msg), WebSocketMessageType.Text, true, CancellationToken.None);
                    Console.WriteLine("⚠️ Захват не активен при подключении WebSocket");

                    // Пытаемся запустить захват, если режим Modern
                    if (_audioMode == 1 && !_isShuttingDown)
                    {
                        Console.WriteLine("🔄 Попытка запустить захват для WebSocket клиента...");
                        Task.Run(() =>
                        {
                            Thread.Sleep(500);
                            if (_audioMode == 1 && !_isShuttingDown)
                            {
                                StartAudioStreaming(_selectedDeviceId);
                            }
                        });
                    }
                }

                var buffer = new byte[1024];
                while (webSocket.State == WebSocketState.Open && !_isShuttingDown)
                {
                    try
                    {
                        var result = await webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                        if (result.MessageType == WebSocketMessageType.Close)
                        {
                            await webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closing", CancellationToken.None);
                        }
                    }
                    catch (WebSocketException)
                    {
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ WebSocket ошибка: {ex.Message}");
            }
            finally
            {
                if (webSocket != null)
                {
                    if (_audioClients.TryRemove(webSocket, out var removedSem))
                    {
                        removedSem.Dispose();
                    }
                    try { webSocket.Dispose(); } catch { }
                    Console.WriteLine($"🔌 WebSocket клиент отключён (осталось: {_audioClients.Count})");
                }
                else if (sem != null)
                {
                    sem.Dispose();
                }
            }
        }

        // ========== ОБРАБОТКА ЗАПРОСОВ ==========
        static async Task ProcessRequest(HttpListenerContext context)
        {
            if (_isShuttingDown)
            {
                context.Response.StatusCode = 503;
                context.Response.Close();
                return;
            }

            var request = context.Request;
            var response = context.Response;

            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            if (request.Url?.AbsolutePath == "/audio-stream")
            {
                await HandleWebSocket(context);
                return;
            }

            if (request.Url?.AbsolutePath == "/audio-devices" && request.HttpMethod == "GET")
            {
                string devicesJson = GetAudioDevicesJson();
                byte[] buffer = Encoding.UTF8.GetBytes(devicesJson);
                response.ContentLength64 = buffer.Length;
                response.ContentType = "application/json";
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
                response.StatusCode = 200;
                response.Close();
                return;
            }

            if (request.Url?.AbsolutePath == "/audio-config" && request.HttpMethod == "POST")
            {
                string body = new StreamReader(request.InputStream).ReadToEnd();
                Console.WriteLine($"📥 POST /audio-config: {body}");

                try
                {
                    var config = System.Text.Json.JsonSerializer.Deserialize<AudioConfig>(body);
                    if (config != null)
                    {
                        Console.WriteLine($"📝 Применение конфига: Mode={config.Mode}, DeviceId={config.DeviceId}");

                        // ЗАЩИТА: если просят Mode=0, но уже Mode=1 – игнорируем!
                        if (config.Mode == 0 && _audioMode == 1)
                        {
                            Console.WriteLine("⚠️ Попытка сброса Modern → игнорируем");
                            SendResponse(response, true); // соврём, что успешно
                            return;
                        }

                        _audioMode = config.Mode;
                        _selectedDeviceId = config.DeviceId ?? "";

                        SaveSettings();

                        StopAudioStreaming();

                        if (_audioMode == 1)
                        {
                            _ = Task.Run(async () =>
                            {
                                await Task.Delay(800);
                                if (_audioMode == 1 && !_isShuttingDown)
                                    StartAudioStreaming(_selectedDeviceId);
                            });
                            Console.WriteLine("🔄 Modern захват запланирован");
                        }
                        else
                        {
                            Console.WriteLine("⏹️ Захват остановлен");
                        }

                        SendResponse(response, true);
                        return;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"❌ Ошибка обработки конфига: {ex.Message}");
                }
                SendResponse(response, false);
                return;
            }

            if (request.Url?.AbsolutePath == "/start-capture" && request.HttpMethod == "POST")
            {
                string body = new StreamReader(request.InputStream).ReadToEnd();
                Console.WriteLine($"📥 POST /start-capture: {body}");

                try
                {
                    var data = System.Text.Json.JsonSerializer.Deserialize<StartCaptureRequest>(body);
                    string deviceId = data?.DeviceId ?? "";

                    Console.WriteLine($"🎤 Запуск захвата: DeviceId={deviceId}");

                    // Останавливаем текущий
                    StopAudioStreaming();
                    Thread.Sleep(300);

                    // Запускаем новый
                    _audioMode = 1;
                    _selectedDeviceId = deviceId;
                    StartAudioStreaming(deviceId);

                    // НЕ СОХРАНЯЕМ В ФАЙЛ — только в памяти

                    SendResponse(response, true);
                    return;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"❌ Ошибка: {ex.Message}");
                    SendResponse(response, false);
                    return;
                }
            }

            // ОСТАНОВКА ЗАХВАТА
            if (request.Url?.AbsolutePath == "/stop-capture" && request.HttpMethod == "POST")
            {
                Console.WriteLine("⏹️ Остановка захвата");

                StopAudioStreaming();
                _audioMode = 0;

                SendResponse(response, true);
                return;
            }

            // СТАТУС ЗАХВАТА
            if (request.Url?.AbsolutePath == "/capture-status" && request.HttpMethod == "GET")
            {
                var status = new
                {
                    isActive = _isAudioStreaming,
                    deviceId = _selectedDeviceId,
                    sampleRate = _capture?.WaveFormat.SampleRate ?? 0,
                    channels = _capture?.WaveFormat.Channels ?? 0
                };

                string json = System.Text.Json.JsonSerializer.Serialize(status);
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentLength64 = buffer.Length;
                response.ContentType = "application/json";
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
                response.StatusCode = 200;
                response.Close();
                return;
            }

            // СОХРАНЕНИЕ НАСТРОЕК (вызывается только при выходе)
            if (request.Url?.AbsolutePath == "/save-settings" && request.HttpMethod == "POST")
            {
                SaveSettings();
                SendResponse(response, true);
                return;
            }


            if (request.Url?.AbsolutePath == "/audio-status" && request.HttpMethod == "GET")
            {
                var status = new
                {
                    isStreaming = _isAudioStreaming,
                    mode = _audioMode,
                    deviceId = _selectedDeviceId
                };
                string json = System.Text.Json.JsonSerializer.Serialize(status);
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentLength64 = buffer.Length;
                response.ContentType = "application/json";
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
                response.StatusCode = 200;
                response.Close();
                return;
            }

            if (request.Url?.AbsolutePath == "/audio-config" && request.HttpMethod == "GET")
            {
                var config = new { Mode = _audioMode, DeviceId = _selectedDeviceId };
                string json = System.Text.Json.JsonSerializer.Serialize(config);
                byte[] buffer = Encoding.UTF8.GetBytes(json);
                response.ContentLength64 = buffer.Length;
                response.ContentType = "application/json";
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
                response.StatusCode = 200;
                response.Close();
                Console.WriteLine($"📤 GET /audio-config: {json}");
                return;
            }

            if (request.HttpMethod == "POST")
            {
                string body = new StreamReader(request.InputStream).ReadToEnd();

                if (request.Url?.AbsolutePath == "/set-volume")
                {
                    float targetVolume = ParseVolume(body);
                    bool success = SetVolumeForProcesses(targetVolume);
                    SendResponse(response, success);
                }
                else if (request.Url?.AbsolutePath == "/media-playpause")
                {
                    bool success = SendMediaKey(VK_MEDIA_PLAY_PAUSE);
                    SendResponse(response, success);
                }
                else if (request.Url?.AbsolutePath == "/media-stop")
                {
                    bool success = SendMediaKey(VK_MEDIA_STOP);
                    SendResponse(response, success);
                }
                else if (request.Url?.AbsolutePath == "/media-next")
                {
                    bool success = SendMediaKey(VK_MEDIA_NEXT_TRACK);
                    SendResponse(response, success);
                }
                else if (request.Url?.AbsolutePath == "/media-previous")
                {
                    bool success = SendMediaKey(VK_MEDIA_PREV_TRACK);
                    SendResponse(response, success);
                }
                else if (request.Url?.AbsolutePath == "/media-ping")
                {
                    SendResponse(response, true);
                }
                else
                {
                    response.StatusCode = 404;
                    response.Close();
                }
            }
            else
            {
                response.StatusCode = 404;
                response.Close();
            }
        }

        // ========== СЕРВЕР ==========
        static void StartServer()
        {
            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add($"http://localhost:{Port}/");
                _listener.Start();

                Console.WriteLine($"✅ Сервер запущен на http://localhost:{Port}/");

                // Запускаем захват после запуска сервера, если режим Modern
                if (_audioMode == 1)
                {
                    Console.WriteLine("🎤 Автозапуск захвата (режим Modern)...");
                    Task.Run(async () =>
                    {
                        await Task.Delay(1000); // даём серверу полностью стартовать
                        if (_audioMode == 1 && !_isShuttingDown)
                        {
                            StartAudioStreaming(_selectedDeviceId);
                        }
                    });
                }

                while (_listener.IsListening && !_isShuttingDown)
                {
                    try
                    {
                        var context = _listener.GetContext();
                        _ = Task.Run(() => ProcessRequest(context));
                    }
                    catch (HttpListenerException) when (_isShuttingDown)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Ошибка сервера: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Ошибка запуска сервера: {ex.Message}");
                Shutdown();
            }
        }

        // ========== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ==========
        static void SendResponse(HttpListenerResponse response, bool success)
        {
            string responseText = success ? "{\"success\": true}" : "{\"success\": false}";
            byte[] buffer = Encoding.UTF8.GetBytes(responseText);
            response.ContentLength64 = buffer.Length;
            response.ContentType = "application/json";
            response.OutputStream.Write(buffer, 0, buffer.Length);
            response.StatusCode = 200;
            response.Close();
        }

        static float ParseVolume(string json)
        {
            int idx = json.IndexOf("\"volume\":");
            if (idx != -1)
            {
                int start = idx + 9;
                int end = json.IndexOfAny(new char[] { ',', '}' }, start);
                if (end == -1) end = json.Length;
                string volStr = json.Substring(start, end - start).Trim();
                if (float.TryParse(volStr, System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out float vol))
                {
                    return Math.Clamp(vol, 0f, 1f);
                }
            }
            return 0.5f;
        }

        static bool SetVolumeForProcesses(float volume)
        {
            bool success = false;
            string[] targetNames = { "musichub", "electron" };

            try
            {
                using (var enumerator = new MMDeviceEnumerator())
                {
                    var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active);
                    foreach (var device in devices)
                    {
                        var sessions = device.AudioSessionManager.Sessions;
                        for (int i = 0; i < sessions.Count; i++)
                        {
                            var session = sessions[i];
                            try
                            {
                                uint processIdUint = session.GetProcessID;
                                int processId = (int)processIdUint;
                                if (processId > 0)
                                {
                                    string processName = "";
                                    try
                                    {
                                        var proc = Process.GetProcessById(processId);
                                        processName = proc.ProcessName;
                                        proc.Dispose();
                                    }
                                    catch { }
                                    foreach (var target in targetNames)
                                    {
                                        if (processName.Equals(target, StringComparison.OrdinalIgnoreCase))
                                        {
                                            var simpleVolume = session.SimpleAudioVolume;
                                            if (simpleVolume != null)
                                            {
                                                simpleVolume.Volume = volume;
                                                success = true;
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Ошибка: {ex.Message}");
            }

            return success;
        }

        static bool SendMediaKey(byte keyCode)
        {
            try
            {
                keybd_event(keyCode, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);
                Thread.Sleep(50);
                keybd_event(keyCode, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Ошибка: {ex.Message}");
                return false;
            }
        }
    }

    // ========== КЛАССЫ ==========
    public class AudioConfig
    {
        public int Mode { get; set; } = 0;
        public string DeviceId { get; set; } = "";
    }

    public class StartCaptureRequest
    {
        public string DeviceId { get; set; } = "";
    }

    public class DeviceInfo
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public bool IsDefault { get; set; } = false;
    }
}