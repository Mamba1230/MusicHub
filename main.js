const { app, BrowserWindow, session, ipcMain, Tray, Menu, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');

 
const sessionKey = crypto.randomBytes(32).toString('hex');

 
const APP_KEY = 'musichub-secret-key-2024';
const STEAM_WORKER_URL = 'https://steam-proxy.170610maksim.workers.dev';

 
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