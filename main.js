// main.js - ПОЛНАЯ ВЕРСИЯ

const { app, BrowserWindow, session, ipcMain, Tray, Menu, globalShortcut, shell } = require('electron');

const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const url = require('url');
const AdmZip = require('adm-zip');
const https = require('https');

// Константы
const CHROME_STORE_API = 'https://clients2.google.com/service/update2/crx';
const EXTENSIONS_DB = path.join(app.getPath('userData'), 'extensions_db.json');
const sessionKey = crypto.randomBytes(32).toString('hex');
const EXTENSIONS_PATH = path.join(app.getPath('userData'), 'extensions');

// Глобальные переменные
let win;
let tray = null;
let isQuitting = false;
let activeTab = 'yandex';
let theme = 'dark';
let startMinimizedFlag = false;
let ext;
let httpServer = null;
let currentArtworkBase64 = null;
let currentTrackInfo = { title: '', artist: '' };

// Конфиг
const configPath = path.join(app.getPath('userData'), 'config.json');

const loadConfig = () => {
    try { 
        const config = JSON.parse(fs.readFileSync(configPath));
        return {
            width: config.width || 1300,
            height: config.height || 850,
            x: config.x,
            y: config.y,
            activeTab: config.activeTab || 'yandex',
            theme: config.theme || 'dark',
            startMinimized: config.startMinimized || false
        };
    } 
    catch (e) { 
        return { width: 1300, height: 850, activeTab: 'yandex', theme: 'dark', startMinimized: false }; 
    }
};

const saveConfig = () => {
    try {
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            const config = {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                activeTab: activeTab,
                theme: theme,
                startMinimized: startMinimizedFlag
            };
            fs.writeFileSync(configPath, JSON.stringify(config));
        }
    } catch (e) {
        console.log('Ошибка сохранения конфига:', e.message);
    }
};

function updateTrayWithArtwork(imageData) {
    if (!tray) return;
    
    const { nativeImage } = require('electron');
    const iconPath = path.join(__dirname, 'icon.png');
    const defaultIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
    
    // Если нет данных - ставим стандартную иконку
    if (!imageData || imageData === 'null') {
        if (defaultIcon) tray.setImage(defaultIcon);
        return;
    }
    
    try {
        let image;
        
        // Если это base64 (начинается с data:image)
        if (imageData.startsWith('data:image')) {
            // Извлекаем base64 данные
            const base64Data = imageData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            image = nativeImage.createFromBuffer(buffer);
        } 
        // Если это http URL
        else if (imageData.startsWith('http')) {
            // Синхронно скачать не получится, используем асинхронный подход
            const protocol = imageData.startsWith('https') ? https : http;
            protocol.get(imageData, (response) => {
                let chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        const img = nativeImage.createFromBuffer(buffer);
                        const resized = img.resize({ width: 16, height: 16 });
                        tray.setImage(resized);
                    } catch (err) {}
                });
            }).on('error', () => {
                if (defaultIcon) tray.setImage(defaultIcon);
            });
            return;
        }
        else {
            if (defaultIcon) tray.setImage(defaultIcon);
            return;
        }
        
        const resized = image.resize({ width: 16, height: 16 });
        tray.setImage(resized);
        
    } catch (err) {
        console.log('Ошибка установки иконки трея:', err);
        if (defaultIcon) tray.setImage(defaultIcon);
    }
}

// IPC для получения обложки из renderer
ipcMain.on('update-artwork-for-tray', (event, imageData) => {
    updateTrayWithArtwork(imageData);
});


let pythonProcess = null;

function getWatcherPath() {
    if (app.isPackaged) {
        // В собранном приложении
        return path.join(process.resourcesPath, 'media_watcher.exe');
    } else {
        // В разработке
        return path.join(__dirname, 'media_watcher.exe');
    }
}

function startMediaWatcher() {
    const exePath = getWatcherPath();
    console.log('🔍 Looking for watcher at:', exePath);
    
    if (fs.existsSync(exePath)) {
        console.log('✅ Starting Media Watcher...');
        pythonProcess = spawn(exePath, [], {
            cwd: app.getPath('userData'),  // Сохраняем файлы в папку пользователя
            detached: false
        });
        
        pythonProcess.stdout.on('data', (data) => {
            console.log('📦 Watcher:', data.toString().trim());
        });
        
        pythonProcess.stderr.on('data', (data) => {
            console.error('⚠️ Watcher error:', data.toString());
        });
        
        pythonProcess.on('close', (code) => {
            console.log('💀 Watcher exited with code:', code);
            setTimeout(startMediaWatcher, 5000);
        });
    } else {
        console.log('❌ Watcher not found at:', exePath);
    }
}
function getMediaFilesPath() {
    if (app.isPackaged) {
        return app.getPath('userData');  // %APPDATA%/MusicHub
    } else {
        return __dirname;  // Папка с проектом
    }
}

function getMediaFromFiles() {
    // Фиксированный путь для всех пользователей Windows
    const appData = process.env.APPDATA; // C:\Users\USERNAME\AppData\Roaming
    const basePath = path.join(appData, 'musichub');
    
    const infoPath = path.join(basePath, 'media_info.json');
    const coverPath = path.join(basePath, 'cover.jpg');
    
    console.log('🔍 Looking for files in:', basePath);
    console.log('   info exists:', fs.existsSync(infoPath));
    console.log('   cover exists:', fs.existsSync(coverPath));
    
    try {
        if (!fs.existsSync(infoPath)) {
            console.log('❌ media_info.json not found');
            return null;
        }
        
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        
        if (!info.title) {
            console.log('❌ No title in info');
            return null;
        }
        
        if (fs.existsSync(coverPath)) {
            const coverBuffer = fs.readFileSync(coverPath);
            info.artwork_base64 = coverBuffer.toString('base64');
            console.log('✅ Cover loaded, size:', coverBuffer.length);
        }
        
        return info;
    } catch (err) {
        console.log('Ошибка чтения:', err);
        return null;
    }
}

// IPC для renderer
ipcMain.handle('get-media-from-files', async () => {
    return getMediaFromFiles();
});

// Функция чтения информации из файлов
function readMediaInfo() {
    const infoPath = path.join(__dirname, 'media_info.json');
    const coverPath = path.join(__dirname, 'cover.jpg');
    
    console.log('🔍 Проверка файлов:');
    console.log('   infoPath:', infoPath, 'exists:', fs.existsSync(infoPath));
    console.log('   coverPath:', coverPath, 'exists:', fs.existsSync(coverPath));
    
    try {
        if (fs.existsSync(infoPath)) {
            const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            console.log('📄 Прочитан info:', info);
            
            // Читаем обложку
            if (fs.existsSync(coverPath)) {
                const coverBuffer = fs.readFileSync(coverPath);
                info.artwork_base64 = coverBuffer.toString('base64');
                console.log('🖼️ Обложка прочитана, размер:', coverBuffer.length, 'bytes');
            } else {
                console.log('❌ Обложка не найдена');
            }
            
            return info;
        } else {
            console.log('❌ media_info.json не существует');
        }
    } catch (err) {
        console.log('Ошибка чтения медиа-файлов:', err);
    }
    return null;
}

// IPC для получения информации
ipcMain.handle('get-windows-media-info', async () => {
    const result = readMediaInfo();
    console.log('📤 Возвращаем в renderer:', result ? 'есть данные' : 'нет данных');
    return result;
});


// Запускаем при старте
app.whenReady().then(() => {
    startMediaWatcher();
    // ... остальной код
});



// В startArtworkServer() - сервер должен читать из папки musichub
function startArtworkServer() {
    const PORT = 3456;
    
    httpServer = http.createServer((req, res) => {
        const url = req.url.split('?')[0];
        
        if (url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="2">
    <style>body{margin:0;background:#000}img{width:100%;height:100%;object-fit:contain}</style>
</head>
<body>
    <img id="artwork" src="/artwork">
    <script>
        setInterval(() => {
            document.getElementById('artwork').src = '/artwork?t=' + Date.now();
        }, 2000);
    </script>
</body>
</html>`);
        }
        else if (url === '/artwork') {
            // Читаем обложку из папки musichub
            const appData = process.env.APPDATA;
            const coverPath = path.join(appData, 'musichub', 'cover.jpg');
            
            if (fs.existsSync(coverPath)) {
                const imageBuffer = fs.readFileSync(coverPath);
                res.writeHead(200, {
                    'Content-Type': 'image/jpeg',
                    'Cache-Control': 'no-cache'
                });
                res.end(imageBuffer);
            } else {
                // Заглушка
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1"><path d="M3 10H21M7 15H11M7 4V20M17 4V20"/></svg>';
                res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
                res.end(svg);
            }
        }
        else {
            res.writeHead(404);
            res.end();
        }
    });
    
    httpServer.listen(PORT, '127.0.0.1', () => {
        console.log(`✅ Artwork server: http://127.0.0.1:${PORT}/`);
    });
}



function updateCurrentArtwork() {
    const appData = process.env.APPDATA;
    const coverPath = path.join(appData, 'musichub', 'cover.jpg');
    
    if (fs.existsSync(coverPath)) {
        const coverBuffer = fs.readFileSync(coverPath);
        currentArtworkBase64 = coverBuffer.toString('base64');
        currentArtworkUrl = `data:image/jpeg;base64,${currentArtworkBase64}`;
    } else {
        currentArtworkBase64 = null;
        currentArtworkUrl = null;
    }
}

let artworkWindow = null;

function getOrCreateArtworkWindow() {
    if (artworkWindow && !artworkWindow.isDestroyed()) return artworkWindow;
    artworkWindow = new BrowserWindow({
        width: 400,
        height: 400,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    artworkWindow.loadURL('http://127.0.0.1:3456/');
    artworkWindow.on('closed', () => { artworkWindow = null; });
    return artworkWindow;
}

ipcMain.on('reload-artwork-page', () => {
    const win = getOrCreateArtworkWindow();
    win.reload();
});

// ========== IPC HANDLERS ==========


ipcMain.on('window-ctrl', (e, cmd) => {
    if (!win || win.isDestroyed()) return;
    if (cmd === 'min') win.minimize();
    if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (cmd === 'close') win.hide();
});

ipcMain.handle('get-start-minimized', () => startMinimizedFlag);

ipcMain.on('set-start-minimized', (e, value) => {
    startMinimizedFlag = value;
    try {
        let config;
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            config = {
                width: bounds.width,
                height: bounds.height,
                x: bounds.x,
                y: bounds.y,
                activeTab: activeTab,
                theme: theme,
                startMinimized: startMinimizedFlag
            };
        } else {
            config = {
                width: 1300,
                height: 850,
                activeTab: 'yandex',
                theme: 'dark',
                startMinimized: startMinimizedFlag
            };
        }
        fs.writeFileSync(configPath, JSON.stringify(config));
    } catch (err) {}
});

ipcMain.on('toggle-mini', (e, isMini) => {
    if (!win || win.isDestroyed()) return;
    const config = loadConfig();
    if (isMini) {
        const bounds = win.getBounds();
        global.savedNormalBounds = bounds;
        win.setBounds({ width: 420, height: 550, x: bounds.x, y: bounds.y });
        win.setAlwaysOnTop(true);
        win.setResizable(false);
    } else {
        const bounds = global.savedNormalBounds || config;
        win.setBounds({ width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y });
        win.setAlwaysOnTop(false);
        win.setResizable(true);
    }
});

ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
});

ipcMain.on('set-autostart', (e, s) => app.setLoginItemSettings({ openAtLogin: s }));

ipcMain.on('update-artwork-url', (event, url, trackInfo) => {
    currentArtworkUrl = url;  // храним URL, не base64
    if (trackInfo) currentTrackInfo = trackInfo;
});

let currentArtworkUrl = null;

// ========== РАСШИРЕНИЯ ==========
async function loadExtensions() {
    if (!fs.existsSync(EXTENSIONS_PATH)) {
        fs.mkdirSync(EXTENSIONS_PATH, { recursive: true });
    }
    const extensions = fs.readdirSync(EXTENSIONS_PATH).filter(f => {
        return fs.statSync(path.join(EXTENSIONS_PATH, f)).isDirectory();
    });
}

ipcMain.handle('open-extension-popup', async (event, extId) => {
    const extensionPath = path.join(EXTENSIONS_PATH, extId);
    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('Манифест не найден');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    const infoWin = new BrowserWindow({
        width: 400,
        height: 320,
        parent: win,
        modal: false,
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    const infoHtml = `<html><body><h1>${manifest.name}</h1><p>Версия ${manifest.version}</p></body></html>`;
    infoWin.loadURL(`data:text/html,${encodeURIComponent(infoHtml)}`);
    infoWin.once('ready-to-show', () => infoWin.show());
    return { success: true };
});

ipcMain.handle('get-extensions', async () => []);
ipcMain.handle('install-extension', async () => ({ success: false, error: 'В разработке' }));
ipcMain.handle('uninstall-extension', async () => false);
ipcMain.handle('install-from-chrome', async () => ({ success: false, error: 'В разработке' }));

// ========== СОЗДАНИЕ ОКНА ==========
function createWindow() {
    const config = loadConfig();
    startMinimizedFlag = config.startMinimized || false;
    
    win = new BrowserWindow({
        width: config.width, 
        height: config.height,
        x: config.x, 
        y: config.y,
        minWidth: 500, 
        minHeight: 400,
        backgroundColor: '#000000',
        frame: false,
        show: false,
        webPreferences: { 
            webviewTag: true, 
            nodeIntegration: false, 
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: true,
            offscreen: false,
            enableRemoteModule: false,
            devTools: true,
            webSecurity: false,
            spellcheck: false
        }
    });

    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = ua;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    win.loadFile('index.html');
    
    win.once('ready-to-show', () => {
        if (startMinimizedFlag) win.hide();
        else win.show();
        if (win && !win.isDestroyed()) {
            win.webContents.send('init-active-tab', config.activeTab || 'yandex');
            win.webContents.send('init-theme', config.theme || 'dark');
        }
    });

    win.on('close', (e) => {
        if (!isQuitting) { 
            e.preventDefault(); 
            win.hide(); 
            saveConfig();
        }
    });

    // Трей
    const iconPath = path.join(__dirname, 'icon.png');
    if (fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'Развернуть', click: () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } } },
            { label: 'Выход', click: () => { isQuitting = true; app.quit(); } }
        ]));
        tray.on('double-click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
    }
}

// ========== ЗАПУСК ==========
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

app.whenReady().then(() => {
    globalShortcut.unregisterAll();
    app.commandLine.appendSwitch('ignore-certificate-errors');

    app.allowRendererProcessReuse = true;
    startArtworkServer();
    createWindow();
    
    // ========== ГЛОБАЛЬНЫЕ КЛАВИШИ ==========
    let currentBinding = null;
    let isEnabled = false;
    
    function registerShortcut() {
        try {
            // ВАЖНО: сначала ОТКЛЮЧАЕМ ВСЕ возможные старые
            // Это гарантирует, что никакая клавиша не останется
            globalShortcut.unregisterAll();
            
            // Если есть бинд и он включен - регистрируем
            if (isEnabled && currentBinding && currentBinding !== '' && currentBinding !== 'null') {
                const success = globalShortcut.register(currentBinding, () => {
                    console.log('🔔 КЛАВИША СРАБОТАЛА:', currentBinding);
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('global-switch');
                    }
                });
                if (success) {
                    console.log(`✅ Зарегистрирована: ${currentBinding}`);
                } else {
                    console.log(`❌ Не удалось: ${currentBinding}`);
                }
            } else {
                console.log(`ℹ️ Клавиши выключены (isEnabled=${isEnabled}, binding=${currentBinding})`);
            }
        } catch (err) {
            console.log('Ошибка:', err);
        }
    }
    
    ipcMain.on('update-tab-binding', (event, data) => {
        console.log('📥 MAIN получил:', data);
        currentBinding = data.binding;
        isEnabled = data.enabled;
        registerShortcut();  // Сразу применяем
    });
    
    registerShortcut();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (httpServer) httpServer.close();
});