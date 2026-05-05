// main.js

const { app, BrowserWindow, session, ipcMain, Tray, Menu, globalShortcut, shell } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions'); // отдельный импорт
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const url = require('url');
const AdmZip = require('adm-zip');
const https = require('https');



const CHROME_STORE_API = 'https://clients2.google.com/service/update2/crx';
const EXTENSIONS_DB = path.join(app.getPath('userData'), 'extensions_db.json');


const sessionKey = crypto.randomBytes(32).toString('hex');

const EXTENSIONS_PATH = path.join(app.getPath('userData'), 'extensions');
 
let ext;
app.whenReady().then(() => {
    ext = new ElectronChromeExtensions({
        session: session.defaultSession,
        createTab: (createProperties) => {
            // можно открыть новое окно, если расширение запросит вкладку
        }
    });
    createWindow();
    // теперь расширения будут загружены с поддержкой API
});


async function loadExtensions() {
    // Создаём папку если нет
    if (!fs.existsSync(EXTENSIONS_PATH)) {
        fs.mkdirSync(EXTENSIONS_PATH, { recursive: true });
    }
    
    // Читаем установленные расширения
    const extensions = fs.readdirSync(EXTENSIONS_PATH).filter(f => {
        return fs.statSync(path.join(EXTENSIONS_PATH, f)).isDirectory();
    });
    
    // Загружаем каждое расширение
    for (const extId of extensions) {
        const extPath = path.join(EXTENSIONS_PATH, extId);
        const manifestPath = path.join(extPath, 'manifest.json');
        
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                await ext.loadExtension(extensionPath);
                console.log(`✅ Загружено расширение: ${manifest.name || extId}`);
            } catch (err) {
                console.log(`❌ Ошибка загрузки ${extId}:`, err.message);
            }
        }
    }
}

async function installExtension(filePath) {
    const extName = path.basename(filePath, '.crx');
    const targetPath = path.join(EXTENSIONS_PATH, extName);
    
    if (fs.existsSync(targetPath)) {
        throw new Error('Расширение уже установлено');
    }
    
    // Копируем или разархивируем
    fs.mkdirSync(targetPath, { recursive: true });
    
    if (filePath.endsWith('.crx')) {
        // Распаковка CRX (требуется дополнительная библиотека)
        const { extract } = require('extract-zip');
        await extract(filePath, { dir: targetPath });
    } else {
        // Копируем папку
        fs.cpSync(filePath, targetPath, { recursive: true });
    }
    
    await loadExtensions();
    return targetPath;
}

// Удаление расширения
async function uninstallExtension(extId) {
    const extPath = path.join(EXTENSIONS_PATH, extId);
    if (fs.existsSync(extPath)) {
        fs.rmSync(extPath, { recursive: true });
        await loadExtensions();
        return true;
    }
    return false;
}

async function searchChromeExtensions(query) {
    return new Promise((resolve) => {
        const url = `https://chrome.google.com/webstore/search/${encodeURIComponent(query)}?hl=ru`;
        
        // Используем простой парсинг (можно заменить на официальное API)
        // В реальности лучше использовать стороннее API или парсить страницу
        const extensions = [
            {
                id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm', // uBlock Origin
                name: 'uBlock Origin',
                description: 'Блокировщик рекламы',
                icon: 'https://chrome.google.com/webstore/icons/ublock.png',
                rating: 4.8,
                users: '10M+'
            },
            {
                id: 'aapbdbdomjkkjkaonfhkkikfgjllcleb', // Google Translate
                name: 'Google Translate',
                description: 'Переводчик страниц',
                icon: 'https://chrome.google.com/webstore/icons/translate.png',
                rating: 4.7,
                users: '5M+'
            },
            {
                id: 'dbepggeogbaibhgnhhndojpepiihcmeb', // Vimium
                name: 'Vimium',
                description: 'Управление с клавиатуры',
                icon: 'https://chrome.google.com/webstore/icons/vimium.png',
                rating: 4.6,
                users: '1M+'
            }
        ];
        
        resolve(extensions.filter(e => 
            e.name.toLowerCase().includes(query.toLowerCase()) ||
            e.description.toLowerCase().includes(query.toLowerCase())
        ));
    });
}

// Скачивание расширения по ID
async function installExtensionFromChromeStore(extensionId) {
    const extensionPath = path.join(EXTENSIONS_PATH, extensionId);
    
    if (fs.existsSync(extensionPath)) {
        throw new Error('Расширение уже установлено');
    }
    
    // Создаём папку для расширения
    fs.mkdirSync(extensionPath, { recursive: true });
    
    // Формируем URL для скачивания CRX
    const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=stable&prodversion=124.0.6367.91&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
    const crxPath = path.join(EXTENSIONS_PATH, `${extensionId}.crx`);
    
    // Скачиваем CRX
    await downloadFile(crxUrl, crxPath);
    
    // Читаем CRX файл
    const crxData = fs.readFileSync(crxPath);
    
    // CRX формат: первые 4 байта "Cr24", затем 4 байта версии (2 или 3), затем 4 байта длины заголовка, затем заголовок, затем ZIP
    // Для версии 3 заголовок переменной длины, для версии 2 - фиксированный.
    // Проверим сигнатуру
    const signature = crxData.toString('ascii', 0, 4);
    if (signature !== 'Cr24') {
        throw new Error('Неверный формат CRX');
    }
    
    const version = crxData.readUInt32LE(4);
    let headerLength;
    if (version === 2) {
        headerLength = crxData.readUInt32LE(8);
    } else if (version === 3) {
        headerLength = crxData.readUInt32LE(8);
        // Для crx3 заголовок может иметь дополнительные поля, но ZIP начинается после заголовка
    } else {
        throw new Error(`Неподдерживаемая версия CRX: ${version}`);
    }
    
    const zipStartOffset = 4 + 4 + 4 + headerLength; // сигнатура(4) + версия(4) + длина_заголовка(4) + заголовок
    
    const zipData = crxData.slice(zipStartOffset);
    const zipPath = path.join(EXTENSIONS_PATH, `${extensionId}.zip`);
    fs.writeFileSync(zipPath, zipData);
    
    // Распаковываем ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extensionPath, true);
    
    // Удаляем временные файлы
    fs.unlinkSync(crxPath);
    fs.unlinkSync(zipPath);
    
    // Загружаем расширение
    await ext.loadExtension(extensionPath);
    
    // Сохраняем в базу
    const db = loadExtensionsDb();
    db.installed.push({ id: extensionId, installedAt: Date.now(), version: 'latest' });
    saveExtensionsDb(db);
    
    return extensionPath;
}

// Загрузка файла
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Следовать редиректу
                const redirectUrl = response.headers.location;
                downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Ошибка загрузки: ${response.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(destPath);
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', reject);
        }).on('error', reject);
        request.end();
    });
}

// База установленных расширений
function loadExtensionsDb() {
    try {
        if (fs.existsSync(EXTENSIONS_DB)) {
            return JSON.parse(fs.readFileSync(EXTENSIONS_DB, 'utf8'));
        }
    } catch(e) {}
    return { installed: [] };
}

function saveExtensionsDb(db) {
    fs.writeFileSync(EXTENSIONS_DB, JSON.stringify(db, null, 2));
}

// IPC handlers



ipcMain.handle('show-input-dialog', async (event, options) => {
    const { dialog } = require('electron');
    const { response } = await dialog.showMessageBox({
        type: 'question',
        title: options.title || 'Ввод',
        message: options.message || 'Введите значение:',
        buttons: ['OK', 'Отмена'],
        defaultId: 0,
        cancelId: 1,
        detail: options.detail || ''
    });
    if (response === 0) {
        // Здесь нужно показать отдельное окно с полем ввода – проще использовать BrowserWindow или другой модуль
        // Но для простоты пока вернём null, а лучше используйте маленькое окно.
    }
    return null;
});

ipcMain.on('open-extensions-window', () => {
    const extWin = new BrowserWindow({
        width: 1000,
        height: 700,
        parent: win,
        modal: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,            // важно для эмуляции
            preload: path.join(__dirname, 'preload-chrome.js') // новый preload
        }
    });

        extWin.webContents.on('did-start-loading', () => {
        extWin.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
            details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            callback({ cancel: false, requestHeaders: details.requestHeaders });
        });
    });
    
    extWin.loadURL('https://chrome.google.com/webstore/category/extensions?hl=ru');
});


ipcMain.handle('search-extensions', async (event, query) => {
    return await searchChromeExtensions(query);
});



// IPC обработчики для расширений

ipcMain.handle('open-extension-popup', async (event, extId) => {
    const extensionPath = path.join(EXTENSIONS_PATH, extId);
    const manifestPath = path.join(extensionPath, 'manifest.json');
    
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Манифест расширения не найден');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`🔍 Открываем расширение: ${manifest.name} (${extId})`);
    
    // 1. Пытаемся найти popup (сначала V3, потом V2)
    let popupRelative = null;
    if (manifest.action && manifest.action.default_popup) {
        popupRelative = manifest.action.default_popup;
    } else if (manifest.browser_action && manifest.browser_action.default_popup) {
        popupRelative = manifest.browser_action.default_popup;
    }
    
    if (popupRelative) {
        const popupFullPath = path.join(extensionPath, popupRelative);
        console.log(`📄 Попупа найден: ${popupFullPath}`);
        
        if (fs.existsSync(popupFullPath)) {
            // Создаём окно для попапа
            const popupWin = new BrowserWindow({
                width: 500,
                height: 600,
                parent: win,
                modal: false,
                resizable: true,
                show: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false,
                    webSecurity: false,      // отключаем безопасность для локальных файлов
                    allowRunningInsecureContent: true
                }
            });
            
            // Загружаем HTML попапа
            popupWin.loadFile(popupFullPath);
            
            // После загрузки инжектим полные заглушки chrome API
            popupWin.webContents.on('did-finish-load', () => {
                popupWin.webContents.executeJavaScript(`
                    (function() {
                        if (window.chrome) return;
                        window.chrome = {
                            runtime: {
                                id: '${extId}',
                                getURL: function(path) {
                                    return 'file:///${extensionPath.replace(/\\\\/g, '/')}/' + path;
                                },
                                sendMessage: function() {},
                                onMessage: { addListener: function() {} },
                                onMessageExternal: { addListener: function() {} },
                                connect: function() { return { postMessage: function() {}, onDisconnect: { addListener: function() {} } }; },
                                getManifest: function() { return ${JSON.stringify(manifest)}; }
                            },
                            extension: {
                                getURL: window.chrome.runtime.getURL,
                                getBackgroundPage: function(cb) { if(cb) cb(null); }
                            },
                            storage: {
                                local: {
                                    get: function(keys, cb) { if(cb) cb({}); },
                                    set: function(items, cb) { if(cb) cb(); }
                                },
                                sync: {
                                    get: function(keys, cb) { if(cb) cb({}); },
                                    set: function(items, cb) { if(cb) cb(); }
                                }
                            },
                            i18n: {
                                getMessage: function(key) { return key; }
                            }
                        };
                        console.log('✅ Chrome API заглушки внедрены для расширения ${extId}');
                    })();
                `).catch(err => console.warn('Ошибка внедрения заглушек:', err));
            });
            
            popupWin.once('ready-to-show', () => popupWin.show());
            return { success: true, type: 'popup' };
        } else {
            console.warn(`⚠️ Файл попапа не существует: ${popupFullPath}`);
        }
    }
    
    // 2. Если попапа нет – открываем информационное окно (уже было)
    const infoHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>${manifest.name}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: system-ui; background: #1a1a1a; color: #fff; padding: 24px; }
            h1 { color: #1DB954; margin-bottom: 8px; }
            .version { font-size: 12px; color: #888; margin-bottom: 16px; }
            .desc { margin-bottom: 20px; }
            .info { background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; font-size: 12px; word-break: break-all; margin-bottom: 20px; }
            button { background: #1DB954; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 10px; }
            .btn-secondary { background: rgba(255,255,255,0.1); color: #fff; }
        </style>
        </head>
        <body>
            <h1>${manifest.name}</h1>
            <div class="version">Версия ${manifest.version}</div>
            <div class="desc">${manifest.description || 'Нет описания'}</div>
            <div class="info"><strong>ID:</strong> ${extId}<br><strong>Путь:</strong> ${extensionPath}</div>
            <div>
                <button id="openFolderBtn">📁 Открыть папку</button>
                <button id="closeBtn" class="btn-secondary">✕ Закрыть</button>
            </div>
            <script>
                const { shell } = require('electron');
                document.getElementById('openFolderBtn').onclick = () => {
                    shell.openPath('${extensionPath}');
                };
                document.getElementById('closeBtn').onclick = () => window.close();
            </script>
        </body>
        </html>
    `;
    
    const infoWin = new BrowserWindow({
        width: 400,
        height: 320,
        parent: win,
        modal: false,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    infoWin.loadURL(`data:text/html,${encodeURIComponent(infoHtml)}`);
    infoWin.once('ready-to-show', () => infoWin.show());
    return { success: true, type: 'info' };
});

ipcMain.handle('get-extensions', async () => {
    const extensions = [];
    const dirs = fs.readdirSync(EXTENSIONS_PATH);
    for (const dir of dirs) {
        const manifestPath = path.join(EXTENSIONS_PATH, dir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            extensions.push({
                id: dir,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                icon: manifest.icons?.['128'] || null
            });
        }
    }
    return extensions;
});

ipcMain.handle('install-extension', async (event, filePath) => {
    try {
        const result = await installExtension(filePath);
        return { success: true, path: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('uninstall-extension', async (event, extId) => {
    return await uninstallExtension(extId);
});

ipcMain.handle('install-from-chrome', async (event, extensionId) => {
    try {
        const result = await installExtensionFromChromeStore(extensionId);
        return { success: true, path: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


// Fallback через PowerShell (Windows)
function pressMediaKeyFallback(action) {
    const keyCodes = {
        'playpause': 0xB3,
        'next': 0xB0,
        'previous': 0xB1,
        'volume_up': 0xAF,
        'volume_down': 0xAE,
        'mute': 0xAD
    };
    
    const vk = keyCodes[action];
    if (vk) {
        const psScript = `
            Add-Type -TypeDefinition '
            using System;
            using System.Runtime.InteropServices;
            public class KeySim {
                [DllImport("user32.dll")]
                public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
            }
            '
            [KeySim]::keybd_event(${vk}, 0, 0x0001, [UIntPtr]::Zero);
            Start-Sleep -Milliseconds 50;
            [KeySim]::keybd_event(${vk}, 0, 0x0001 -bor 0x0002, [UIntPtr]::Zero);
        `;
        
        exec(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, (err) => {
            if (err) console.log('❌ PowerShell тоже не сработал');
        });
    }
}

// Подключаем к remote-control
ipcMain.on('remote-control', (event, action) => {
    console.log(`🎮 Remote action: ${action}`);
    pressMediaKey(action);
});

 
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

 
if (process.env.NODE_ENV !== 'development') {
    app.setPath('userData', path.join(app.getPath('appData'), 'MusicHub'));
}

 
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log('MusicHub уже запущен, закрываем второй экземпляр');
    app.quit();
    return;
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('Попытка запустить второй экземпляр - показываем существующий');
    
    if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        
        if (!win.isVisible()) {
            win.show();
        }
    }
});

 
app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-accelerated-video-decode');
app.commandLine.appendSwitch('disable-accelerated-mjpeg-decode');
app.commandLine.appendSwitch('js-flags', '--max_old_space_size=512 --max_semi_space_size=4');

let win;
let tray = null;
let isQuitting = false;
let activeTab = 'yandex';
let theme = 'dark';
let startMinimizedFlag = false;
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

 
const initialConfig = loadConfig();
startMinimizedFlag = initialConfig.startMinimized || false;

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
            spellcheck: false,
            disableHtmlFullscreenWindowResize: true,
            enableWebSQL: false,
            navigateOnDragDrop: false,
        }
    });

    win.webContents.session.setCertificateVerifyProc((request, callback) => {
        callback(0);
    });

     
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = ua;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    win.loadFile('index.html');
    
    win.once('ready-to-show', () => {
        if (startMinimizedFlag) {
            win.hide();
        } else {
            win.show();
        }
        
        if (win && !win.isDestroyed()) {
            win.webContents.send('init-active-tab', config.activeTab || 'yandex');
            win.webContents.send('init-theme', config.theme || 'dark');
            win.webContents.setFrameRate(60);
        }
    });

    win.on('blur', () => {
        if (!win.isDestroyed()) {
            win.webContents.setFrameRate(30);
            win.webContents.send('app-blur');
        }
    });

    win.on('focus', () => {
        if (!win.isDestroyed()) {
            win.webContents.setFrameRate(60);
            win.webContents.send('app-focus');
        }
    });

    win.on('hide', () => {
        if (!win.isDestroyed()) {
            win.webContents.setFrameRate(15);
            win.webContents.send('app-hidden');
            
            if (global.gc) {
                setTimeout(() => global.gc(), 2000);
            }
        }
    });

    win.on('show', () => {
        if (!win.isDestroyed()) {
            win.webContents.setFrameRate(60);
            win.webContents.send('app-shown');
        }
    });

    let saveTimeout;
    win.on('resize', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveConfig, 500);
    });

    win.on('move', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveConfig, 500);
    });

     
    app.on('web-contents-created', (event, contents) => {
        if (contents.getType() === 'webview') {
            contents.on('did-finish-load', () => {
                setTimeout(() => {
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('optimize-webviews');
                    }
                }, 500);
            });
            
            contents.on('crashed', () => {
                console.log('webview crashed, reloading...');
                setTimeout(() => contents.reload(), 1000);
            });
        }
    });

     
    const iconPath = path.join(__dirname, 'icon.png');
if (fs.existsSync(iconPath)) {
    tray = new Tray(iconPath);
    tray.setContextMenu(Menu.buildFromTemplate([
        { 
            label: 'Развернуть', 
            click: () => {
                if (win && !win.isDestroyed()) {
                    win.show();
                    win.focus();
                }
            }
        },
        { 
            label: 'Выход', 
            click: () => { 
                 
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
                } else {
                     
                    const config = {
                        width: 1300,
                        height: 850,
                        activeTab: 'yandex',
                        theme: 'dark',
                        startMinimized: startMinimizedFlag
                    };
                    fs.writeFileSync(configPath, JSON.stringify(config));
                }
                isQuitting = true;
                app.quit(); 
            }
        }
    ]));
    
    tray.on('double-click', () => {
        if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
        }
    });
}

win.on('close', (e) => {
    if (!isQuitting) { 
        e.preventDefault(); 
        win.hide(); 
         
        saveConfig();
    } else {
        try {
            if (!win.isDestroyed()) {
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
        } catch (err) {}
    }
});

    setInterval(() => {
        if (!win || win.isDestroyed()) return;
    }, 60000);
}

 
ipcMain.on('window-ctrl', (e, cmd) => {
    if (!win || win.isDestroyed()) return;
    if (cmd === 'min') win.minimize();
    if (cmd === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (cmd === 'close') win.hide();
});

ipcMain.handle('get-start-minimized', () => {
    return startMinimizedFlag;
});

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
        console.log('✅ Настройка startMinimized сохранена:', startMinimizedFlag);
    } catch (err) {
        console.log('Ошибка сохранения:', err);
    }
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

 
let steamCallbackServer = null;
let steamApiKey = null;

async function getSteamApiKey() {
    if (steamApiKey) return steamApiKey;
    
    const response = await fetch(`${STEAM_WORKER_URL}/steam-key`, {
        headers: { 'X-App-Key': APP_KEY }
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    steamApiKey = data.key;
    return steamApiKey;
}

async function getSteamUserInfo(steamId) {
    const key = await getSteamApiKey();
    const response = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${steamId}`
    );
    const data = await response.json();
    const player = data.response.players[0];
    
    if (!player) return null;
    
    return {
        steamId: steamId,
        name: player.personaname,
        avatar: player.avatarfull,
        profileUrl: player.profileurl
    };
}

function startSteamCallbackServer() {
    if (steamCallbackServer) {
        steamCallbackServer.close();
    }
    
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, `http://localhost:3001`);
            
            if (url.pathname === '/steam-callback') {
                const claimedId = url.searchParams.get('openid.claimed_id');
                if (claimedId) {
                    const steamId = claimedId.split('/').pop();
                    const userInfo = await getSteamUserInfo(steamId);
                    
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<!DOCTYPE html>
                        <html>
                        <head><meta charset="UTF-8"><title>Steam Auth - MusicHub</title>
                        <style>
                            body { background: #1a1a1a; color: #fff; font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                            .container { background: #2a2a2a; padding: 40px; border-radius: 20px; }
                            h2 { color: #1DB954; }
                            .success { color: #4caf50; font-size: 48px; }
                        </style>
                        </head>
                        <body>
                            <div class="container">
                                <div class="success">✅</div>
                                <h2>Авторизация успешна!</h2>
                                <p>Вы вошли как <strong>${userInfo.name}</strong></p>
                                <p>Можете закрыть это окно.</p>
                                <script>setTimeout(() => window.close(), 3000);</script>
                            </div>
                        </body>
                        </html>`);
                    
                    server.close();
                    steamCallbackServer = null;
                    resolve(steamId);
                } else {
                    res.end('<h2>❌ Ошибка авторизации</h2>');
                    reject(new Error('No claimed_id'));
                }
            }
        });
        
        server.listen(3001, () => {
            console.log('✅ Steam callback server running on http://localhost:3001');
        });
        
        server.on('error', reject);
        steamCallbackServer = server;
    });
}

ipcMain.handle('steam-login', async () => {
    try {
        const serverPromise = startSteamCallbackServer();
        
        const openIdUrl = 'https://steamcommunity.com/openid/login?' + new URLSearchParams({
            'openid.ns': 'http://specs.openid.net/auth/2.0',
            'openid.mode': 'checkid_setup',
            'openid.return_to': 'http://localhost:3001/steam-callback',
            'openid.realm': 'http://localhost:3001',
            'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
            'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        });
        
        shell.openExternal(openIdUrl);
        const steamId = await serverPromise;
        const userInfo = await getSteamUserInfo(steamId);
        
        return {
            success: true,
            name: userInfo.name,
            avatar: userInfo.avatar,
            steamId: userInfo.steamId
        };
        
    } catch (err) {
        console.error('Steam auth error:', err);
        return { success: false, error: err.message };
    }
});

 
app.whenReady().then(() => {
    app.allowRendererProcessReuse = true;
    createWindow();
    if (ext) {
    ext.addTab(win.webContents);
}
    globalShortcut.register('Control+Tab', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('global-switch');
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    try {
        if (win && !win.isDestroyed()) {
            const bounds = win.getBounds();
            fs.writeFileSync(configPath, JSON.stringify(bounds));
        }
    } catch (err) {}
    
    if (global.gc) {
        global.gc();
    }
});



 
process.on('uncaughtException', (error) => {
    console.log('Нефатальная ошибка:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.log('Нефатальная ошибка:', error.message);
});