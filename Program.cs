using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Threading;
using System.Diagnostics;
using System.Text;
using System.Runtime.InteropServices;
using Windows.Media.Control;
using Windows.Storage.Streams;
using System.Runtime.InteropServices.WindowsRuntime;

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
        static GlobalSystemMediaTransportControlsSessionManager manager;

        static async Task Main(string[] args)
        {
            // Скрываем консоль
            var handle = GetConsoleWindow();
            if (handle != IntPtr.Zero)
                ShowWindow(handle, SW_HIDE);

            // Папка для сохранения
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            saveDir = Path.Combine(appData, "musichub");
            Directory.CreateDirectory(saveDir);
            infoFile = Path.Combine(saveDir, "media_info.json");
            coverFile = Path.Combine(saveDir, "cover.jpg");

            // Проверяем, запущен ли MusicHub
            if (!IsMusicHubRunning())
                return;

            // Подключаемся к Windows Media API
            try
            {
                manager = await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            }
            catch
            {
                return;
            }

            // Основной цикл
            while (true)
            {
                try
                {
                    if (!IsMusicHubRunning())
                    {
                        CleanupFiles();
                        return;
                    }

                    var session = manager.GetCurrentSession();
                    if (session != null)
                    {
                        var props = await session.TryGetMediaPropertiesAsync();
                        if (props != null && !string.IsNullOrEmpty(props.Title))
                        {
                            string trackKey = $"{props.Artist}|{props.Title}";

                            if (trackKey != lastTrackKey)
                            {
                                lastTrackKey = trackKey;

                                // Получаем статус воспроизведения (правильный способ)
                                bool isPlaying = false;
                                try
                                {
                                    var playbackInfo = session.GetPlaybackInfo();
                                    isPlaying = playbackInfo.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                                }
                                catch { isPlaying = true; }

                                // Сохраняем JSON
                                var info = new
                                {
                                    title = props.Title ?? "",
                                    artist = props.Artist ?? "",
                                    album = props.AlbumTitle ?? "",
                                    is_playing = isPlaying
                                };

                                string json = JsonSerializer.Serialize(info);
                                await File.WriteAllTextAsync(infoFile, json, Encoding.UTF8);

                                // Сохраняем обложку
                                if (props.Thumbnail != null)
                                {
                                    await SaveCoverFixed(props.Thumbnail);
                                }
                            }
                        }
                    }
                }
                catch
                {
                    // Игнорируем ошибки
                }

                await Task.Delay(500);
            }
        }

        static bool IsMusicHubRunning()
        {
            try
            {
                foreach (var proc in Process.GetProcesses())
                {
                    string name = proc.ProcessName.ToLower();
                    if (name.Contains("musichub") || name.Contains("electron"))
                    {
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        static void CleanupFiles()
        {
            try { if (File.Exists(infoFile)) File.Delete(infoFile); } catch { }
            try { if (File.Exists(coverFile)) File.Delete(coverFile); } catch { }
        }

        static async Task SaveCoverFixed(IRandomAccessStreamReference thumbnail)
        {
            try
            {
                if (thumbnail == null) return;

                using (var stream = await thumbnail.OpenReadAsync())
                {
                    if (stream == null || stream.Size == 0) return;

                    // Читаем через DataReader
                    using (var dataReader = new DataReader(stream))
                    {
                        await dataReader.LoadAsync((uint)stream.Size);
                        byte[] bytes = new byte[stream.Size];
                        dataReader.ReadBytes(bytes);

                        if (bytes.Length > 100)
                        {
                            // Сохраняем во временный файл, потом заменяем
                            string tempFile = coverFile + ".tmp";
                            await File.WriteAllBytesAsync(tempFile, bytes);

                            // Небольшая задержка
                            await Task.Delay(50);

                            // Заменяем основной файл
                            if (File.Exists(coverFile))
                                File.Delete(coverFile);
                            File.Move(tempFile, coverFile);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Cover save error: {ex.Message}");
            }
        }
    }
}