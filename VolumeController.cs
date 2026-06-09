using System;
using System.Net;
using System.Text;
using System.Threading.Tasks;
using System.IO;
using System.Diagnostics;
using NAudio.CoreAudioApi;

namespace VolumeController
{
    class Program
    {
        private static HttpListener? _listener;
        private static readonly int Port = 9876;
        private static bool _noTargetProcesses = false;

        static async Task Main(string[] args)
        {
            Console.WriteLine("VolumeController v9.0 (Auto-close)");

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
                await Task.Delay(5000); // Проверяем каждые 5 секунд

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
            response.Headers.Add("Access-Control-Allow-Methods", "POST, OPTIONS");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            if (request.HttpMethod == "POST" && request.Url?.AbsolutePath == "/set-volume")
            {
                string body = new StreamReader(request.InputStream).ReadToEnd();
                float targetVolume = ParseVolume(body);

                bool success = SetVolumeForProcesses(targetVolume);

                string responseText = success ? "{\"success\": true}" : "{\"success\": false}";
                byte[] buffer = Encoding.UTF8.GetBytes(responseText);
                response.ContentLength64 = buffer.Length;
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
                response.StatusCode = 200;
            }
            else
            {
                response.StatusCode = 404;
            }
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
    }
}