import asyncio
import json
import os
import sys
import psutil
import winsdk.windows.media.control as wmc
from winsdk.windows.storage.streams import Buffer, InputStreamOptions

# ========== ОПРЕДЕЛЯЕМ ПРАВИЛЬНУЮ ПАПКУ ДЛЯ СОХРАНЕНИЯ ==========
def get_save_path():
    if getattr(sys, 'frozen', False):
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        save_dir = os.path.join(appdata, 'musichub')
    else:
        save_dir = os.path.dirname(os.path.abspath(__file__))
    
    os.makedirs(save_dir, exist_ok=True)
    return save_dir

SAVE_DIR = get_save_path()
INFO_FILE = os.path.join(SAVE_DIR, 'media_info.json')
COVER_FILE = os.path.join(SAVE_DIR, 'cover.jpg')

def log(msg):
    try:
        print(f"[{SAVE_DIR}] {msg}")
        sys.stdout.flush()
    except:
        pass

log(f"Working directory: {SAVE_DIR}")

last_track_key = ""

def is_musichub_running():
    """Проверяет, запущен ли MusicHub/Electron"""
    try:
        for proc in psutil.process_iter(['name']):
            name = proc.info['name'].lower()
            if 'musichub' in name or 'electron' in name:
                return True
        return False
    except:
        return True  # Если ошибка - не выключаемся

async def get_media():
    try:
        manager = await wmc.GlobalSystemMediaTransportControlsSessionManager.request_async()
        session = manager.get_current_session()
        if not session:
            return None, None
        
        props = await session.try_get_media_properties_async()
        if not props:
            return None, None
        
        info = {
            'title': getattr(props, 'title', '') or '',
            'artist': getattr(props, 'artist', '') or '',
            'album': getattr(props, 'album', '') or '',
            'is_playing': session.playback_status == 4 if hasattr(session, 'playback_status') else False
        }
        
        thumbnail_bytes = None
        thumb = getattr(props, 'thumbnail', None)
        if thumb:
            try:
                stream = await thumb.open_read_async()
                buffer = Buffer(5 * 1024 * 1024)
                buffer.length = buffer.capacity
                await stream.read_async(buffer, buffer.capacity, InputStreamOptions.PARTIAL)
                thumbnail_bytes = bytes(buffer)
            except Exception as e:
                log(f"Thumb error: {e}")
        
        return info, thumbnail_bytes
    except Exception as e:
        log(f"Get error: {e}")
        return None, None

async def watch_media():
    global last_track_key
    log("Media Watcher started...")
    
    while True:
        # Проверяем, жив ли MusicHub (каждую секунду)
        if not is_musichub_running():
            log("MusicHub/Electron not running, exiting...")
            # Очищаем файлы перед выходом
            if os.path.exists(INFO_FILE):
                os.remove(INFO_FILE)
            if os.path.exists(COVER_FILE):
                os.remove(COVER_FILE)
            sys.exit(0)
        
        try:
            info, thumbnail = await get_media()
            
            if info and info['title']:
                track_key = f"{info['artist']}|{info['title']}"
                
                if track_key != last_track_key:
                    last_track_key = track_key
                    log(f"Track: {info['title']} - {info['artist']}")
                    
                    with open(INFO_FILE, 'w', encoding='utf-8') as f:
                        json.dump(info, f, ensure_ascii=False)
                    log(f"JSON saved")
                    
                    if thumbnail and len(thumbnail) > 1000:
                        with open(COVER_FILE, 'wb') as f:
                            f.write(thumbnail)
                        log(f"Cover saved: {len(thumbnail)} bytes")
                    else:
                        if os.path.exists(COVER_FILE):
                            os.remove(COVER_FILE)
                        log("No cover")
            else:
                if os.path.exists(INFO_FILE):
                    os.remove(INFO_FILE)
                if os.path.exists(COVER_FILE):
                    os.remove(COVER_FILE)
                last_track_key = ""
                    
        except Exception as e:
            log(f"Watch error: {e}")
        
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    # Устанавливаем psutil если его нет
    try:
        import psutil
    except ImportError:
        os.system('pip install psutil')
        import psutil
    
    asyncio.run(watch_media())