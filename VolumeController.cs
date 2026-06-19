using System;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;

namespace VolumeController
{
    class Program
    {
        private static HttpListener? _listener;
        private static readonly int Port = 9876;
        private static bool _noTargetProcesses = false;

        // Импорт Windows API для медиа-кнопок
        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        private const byte VK_MEDIA_PLAY_PAUSE = 0xB3;
        private const byte VK_MEDIA_STOP = 0xB2;
        private const byte VK_MEDIA_NEXT_TRACK = 0xB0;
        private const byte VK_MEDIA_PREV_TRACK = 0xB1;

        private const uint KEYEVENTF_KEYDOWN = 0x0000;
        private const uint KEYEVENTF_KEYUP = 0x0002;

        static async Task Main(string[] args)
        {
            Console.WriteLine("VolumeController v9.1 (Media Keys Support)");

            // Проверяем, есть ли целевые процессы
            if (!CheckTargetProcessesExist())
            {
                Console.WriteLine("❌ musichub.exe и electron.exe не запущены.");
                Console.WriteLine("VolumeController будет закрыт через 2 секунды...");
                await Task.Delay(2000);
                return;
            }

            Console.WriteLine("✅ Целевой процесс найден. Сервер запущен.");
            StartServer();

            // Запускаем мониторинг процессов в фоне
            _ = Task.Run(MonitorProcesses);

            await Task.Delay(-1);
        }

        static bool CheckTargetProcessesExist()
        {
            string[] targetNames = { "musichub", "electron" };
            foreach (string name in targetNames)
            {
                var processes = Process.GetProcessesByName(name);
                if (processes.Length > 0)
                {
                    foreach (var p in processes) p.Dispose();
                    return true;
                }
            }
            return false;
        }

        static async Task MonitorProcesses()
        {
            while (true)
            {
                await Task.Delay(5000);

                bool anyAlive = false;
                string[] targetNames = { "musichub", "electron" };

                foreach (string name in targetNames)
                {
                    var processes = Process.GetProcessesByName(name);
                    if (processes.Length > 0)
                    {
                        anyAlive = true;
                        foreach (var p in processes) p.Dispose();
                        break;
                    }
                }

                if (!anyAlive)
                {
                    Console.WriteLine("❌ musichub.exe и electron.exe не запущены. Завершаю работу...");
                    _listener?.Stop();
                    Environment.Exit(0);
                }
            }
        }

        static void StartServer()
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add($"http://localhost:{Port}/");
            _listener.Start();

            while (_listener.IsListening)
            {
                try
                {
                    var context = _listener.GetContext();
                    _ = Task.Run(() => ProcessRequest(context));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Ошибка сервера: {ex.Message}");
                }
            }
        }

        static async Task ProcessRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS, GET");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            // ========== ОБРАБОТКА МЕДИА-КОМАНД ==========
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
                    // Проверка доступности
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

        static void SendResponse(HttpListenerResponse response, bool success)
        {
            string responseText = success ? "{\"success\": true}" : "{\"success\": false}";
            byte[] buffer = Encoding.UTF8.GetBytes(responseText);
            response.ContentLength64 = buffer.Length;
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

        // ========== ОТПРАВКА МЕДИА-КЛАВИШ ==========
        static bool SendMediaKey(byte keyCode)
        {
            try
            {
                // Нажимаем и отпускаем клавишу
                keybd_event(keyCode, 0, KEYEVENTF_KEYDOWN, UIntPtr.Zero);
                System.Threading.Thread.Sleep(50);
                keybd_event(keyCode, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);

                Console.WriteLine($"🎵 Отправлена медиа-клавиша: {keyCode:X2}");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Ошибка отправки медиа-клавиши: {ex.Message}");
                return false;
            }
        }

        // Альтернативный метод через SendMessage (если keybd_event не работает)
        static bool SendMediaKeyViaMessage(byte keyCode)
        {
            try
            {
                // Ищем окно, которое может обработать медиа-команды
                IntPtr hWnd = FindWindow("Shell_TrayWnd", null);
                if (hWnd == IntPtr.Zero)
                {
                    // Пробуем найти активное окно
                    hWnd = GetForegroundWindow();
                }

                if (hWnd != IntPtr.Zero)
                {
                    // Отправляем сообщение WM_APPCOMMAND для медиа-кнопок
                    const int WM_APPCOMMAND = 0x0319;
                    const int APPCOMMAND_MEDIA_PLAY_PAUSE = 14;
                    const int APPCOMMAND_MEDIA_STOP = 13;
                    const int APPCOMMAND_MEDIA_NEXTTRACK = 11;
                    const int APPCOMMAND_MEDIA_PREVIOUSTRACK = 12;

                    int command = 0;
                    switch (keyCode)
                    {
                        case VK_MEDIA_PLAY_PAUSE: command = APPCOMMAND_MEDIA_PLAY_PAUSE; break;
                        case VK_MEDIA_STOP: command = APPCOMMAND_MEDIA_STOP; break;
                        case VK_MEDIA_NEXT_TRACK: command = APPCOMMAND_MEDIA_NEXTTRACK; break;
                        case VK_MEDIA_PREV_TRACK: command = APPCOMMAND_MEDIA_PREVIOUSTRACK; break;
                        default: return false;
                    }

                    SendMessage(hWnd, WM_APPCOMMAND, IntPtr.Zero, (IntPtr)(command << 16));
                    return true;
                }
                return false;
            }
            catch
            {
                return false;
            }
        }

        // Windows API для альтернативного метода
        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
    }
}