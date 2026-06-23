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
const { setVolume, getVolume } = require('easy-volume');
const nircmdPath = path.join(__dirname, 'nircmd.exe');
const DiscordRPC = require('discord-rpc');



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




const express = require('express');
const WebSocket = require('ws');
const os = require('os');

let mobileServer = null;
let mobileWs = null;
let currentMobileStatus = {
    title: 'Не играет',
    artist: '—',
    album: '—',
    artwork: '',
    isPlaying: false,
    volume: 0.5,
    progress: 0,
    duration: 0,
    service: ''
};

// Получение локального IP
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Функция отправки статуса всем подключённым клиентам
function broadcastMobileStatus() {
    if (mobileWs) {
        const clients = mobileWs.clients;
        const data = JSON.stringify({
            type: 'status',
            data: currentMobileStatus
        });
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }
}

ipcMain.handle('get-local-ip', () => {
    const interfaces = os.networkInterfaces();
    
    // Приоритет: 192.168.x.x > 10.x.x.x > 172.16.x.x
    const priorities = [
        (ip) => ip.startsWith('192.168.'),  // Домашние сети
        (ip) => ip.startsWith('10.'),        // Корпоративные сети
        (ip) => ip.startsWith('172.16.') || ip.startsWith('172.17.') || 
                ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
                ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
                ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
                ip.startsWith('172.24.') || ip.startsWith('172.25.') ||
                ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
                ip.startsWith('172.28.') || ip.startsWith('172.29.') ||
                ip.startsWith('172.30.') || ip.startsWith('172.31.')   // Диапазон 172.16.0.0 - 172.31.255.255
    ];
    
    let foundIP = null;
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Пропускаем IPv6 и внутренние
            if (iface.family !== 'IPv4' || iface.internal) continue;
            
            const ip = iface.address;
            
            // Проверяем приоритеты
            for (let i = 0; i < priorities.length; i++) {
                if (priorities[i](ip)) {
                    // Если нашли IP с более высоким приоритетом - сразу возвращаем
                    if (i === 0) {
                        return ip; // 192.168.x.x — сразу возвращаем
                    }
                    // Запоминаем, но продолжаем искать 192.168
                    if (!foundIP) {
                        foundIP = ip;
                    }
                }
            }
        }
    }
    
    // Если нашли 10.x.x.x или 172.16.x.x — возвращаем
    if (foundIP) return foundIP;
    
    // Если ничего не нашли — возвращаем localhost
    return 'localhost';
});

// Запуск мобильного сервера
function startMobileServer() {
    const app = express();
    const server = http.createServer(app);
    const ws = new WebSocket.Server({ server });
    mobileWs = ws;
    
    // === СТАТИЧЕСКИЕ ФАЙЛЫ ===
    app.use(express.static(path.join(__dirname, 'mobile')));
    
    // === API ===
    app.get('/api/status', (req, res) => {
        res.json(currentMobileStatus);
    });
    
    app.post('/api/play', (req, res) => {
        // Отправляем команду в renderer
        if (win && !win.isDestroyed()) {
            win.webContents.send('mobile-command', 'playpause');
        }
        res.json({ success: true });
    });
    
    app.post('/api/next', (req, res) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('mobile-command', 'next');
        }
        res.json({ success: true });
    });
    
    app.post('/api/prev', (req, res) => {
        if (win && !win.isDestroyed()) {
            win.webContents.send('mobile-command', 'prev');
        }
        res.json({ success: true });
    });
    
    app.post('/api/volume', express.json(), (req, res) => {
        const { volume } = req.body;
        if (win && !win.isDestroyed()) {
            win.webContents.send('mobile-volume', volume);
        }
        res.json({ success: true });
    });
    
    // === WebSocket ===
    ws.on('connection', (client) => {
        console.log('📱 Мобильный клиент подключён');
        
        // Отправляем текущий статус
        client.send(JSON.stringify({
            type: 'status',
            data: currentMobileStatus
        }));
        
        client.on('close', () => {
            console.log('📱 Мобильный клиент отключён');
        });
    });
    
    // Запуск сервера
    const PORT = 3457;
    server.listen(PORT, '0.0.0.0', () => {
        const ip = getLocalIP();
        console.log(`📱 Мобильный сервер запущен на порту ${PORT}`);
        console.log(`🌐 Открой в телефоне: http://${ip}:${PORT}`);
        
        // Показываем QR-код или ссылку в приложении
        if (win && !win.isDestroyed()) {
            win.webContents.send('mobile-server-started', {
                url: `http://${ip}:${PORT}`,
                ip: ip,
                port: PORT
            });
        }
    });
    
    return server;
}

// Остановка сервера
function stopMobileServer() {
    if (mobileWs) {
        mobileWs.clients.forEach(client => client.close());
        mobileWs.close();
        mobileWs = null;
    }
    if (mobileServer) {
        mobileServer.close();
        mobileServer = null;
    }
}

// Обработчики из renderer для обновления статуса
ipcMain.on('mobile-update-status', (event, status) => {
    currentMobileStatus = { ...currentMobileStatus, ...status };
    broadcastMobileStatus();
});

// Запускаем сервер при старте
setTimeout(() => {
    startMobileServer();
}, 2000);


ipcMain.on('mobile-update-status', (event, status) => {
    currentMobileStatus = { ...currentMobileStatus, ...status };
    broadcastMobileStatus();
});

ipcMain.on('mobile-command', (event, command) => {
    // Пересылаем в renderer
    if (win && !win.isDestroyed()) {
        win.webContents.send('mobile-command', command);
    }
});

ipcMain.on('mobile-volume', (event, volume) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('mobile-volume', volume);
    }
});

function getArtworkFromFile() {
    const appData = process.env.APPDATA;
    const coverPath = path.join(appData, 'musichub', 'cover.jpg');
    
    if (fs.existsSync(coverPath)) {
        try {
            const coverBuffer = fs.readFileSync(coverPath);
            const base64 = coverBuffer.toString('base64');
            return `data:image/jpeg;base64,${base64}`;
        } catch (err) {
            return '';
        }
    }
    return '';
}

// Функция получения информации о треке из файла
function getTrackInfoFromFile() {
    const appData = process.env.APPDATA;
    const infoPath = path.join(appData, 'musichub', 'media_info.json');
    
    try {
        if (fs.existsSync(infoPath)) {
            let content = fs.readFileSync(infoPath, 'utf8');
            // Удаляем BOM если есть
            if (content.charCodeAt(0) === 0xFEFF || content.startsWith('я╗┐')) {
                content = content.replace(/^[\uFEFFя╗┐]/, '');
            }
            const info = JSON.parse(content);
            return {
                title: info.title || 'Не играет',
                artist: info.artist || '—',
                album: info.album || '—'
            };
        }
    } catch (err) {
        console.log('Ошибка чтения media_info.json:', err.message);
    }
    return null;
}

// Обновлённая функция отправки статуса
ipcMain.on('mobile-update-status', (event, status) => {
    // Получаем актуальную обложку из файла
    const artworkFromFile = getArtworkFromFile();
    const trackInfo = getTrackInfoFromFile();
    
    // Обновляем статус
    currentMobileStatus = {
        ...currentMobileStatus,
        ...status,
        // Приоритет: данные из файла важнее
        title: trackInfo?.title || status.title || 'Не играет',
        artist: trackInfo?.artist || status.artist || '—',
        artwork: artworkFromFile || status.artwork || '',
        volume: status.volume || 0.5,
        isPlaying: status.isPlaying || false,
        service: status.service || 'unknown',
        accentColor: status.accentColor || '#1DB954'
    };
    
    broadcastMobileStatus();
});
















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
            startMinimized: config.startMinimized || false,
            startupPage: config.startupPage || 'last'  // ✅ Добавлено
        };
    } 
    catch (e) { 
        return { 
            width: 1300, 
            height: 850, 
            activeTab: 'yandex', 
            theme: 'dark', 
            startMinimized: false,
            startupPage: 'last'  // ✅ Добавлено
        }; 
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
                startMinimized: startMinimizedFlag,
                startupPage: startupPage || 'last'  // ✅ Убедитесь, что это поле есть
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('💾 Config saved:', config);
        } else {
            // Если окна нет, сохраняем без bounds
            const config = {
                width: 1300,
                height: 850,
                activeTab: activeTab,
                theme: theme,
                startMinimized: startMinimizedFlag,
                startupPage: startupPage || 'last'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            console.log('💾 Config saved (no window):', config);
        }
    } catch (e) {
        console.log('❌ Ошибка сохранения конфига:', e.message);
    }
};

// ========== DISCORD RPC ==========

const clientId = '1518602342331842570';
let rpc = null;
let rpcEnabled = false;
let rpcUpdateInterval = null;
const discordSettingsPath = path.join(app.getPath('userData'), 'discord_settings.json');

// Загрузка настроек Discord из файла
function loadDiscordSettings() {
    try {
        if (fs.existsSync(discordSettingsPath)) {
            const data = fs.readFileSync(discordSettingsPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.log('Ошибка загрузки настроек Discord:', e);
    }
    return {};
}

// Сохранение настроек Discord в файл
function saveDiscordSettings(settings) {
    try {
        const current = loadDiscordSettings();
        const updated = { ...current, ...settings };
        fs.writeFileSync(discordSettingsPath, JSON.stringify(updated, null, 2));
    } catch (e) {
        console.log('Ошибка сохранения настроек Discord:', e);
    }
}

// Функция для обновления статуса
function updateDiscordPresence(trackInfo) {
    console.log('🎵 updateDiscordPresence ВЫЗВАН');
    console.log('📌 rpc:', !!rpc);
    console.log('📌 rpcEnabled:', rpcEnabled);
    console.log('📌 trackInfo:', trackInfo);
    
    if (!rpc) {
        console.log('❌ RPC не инициализирован');
        return;
    }
    
    if (!rpcEnabled) {
        console.log('❌ RPC выключен');
        return;
    }
    
    const title = trackInfo?.title || 'Не играет';
    const artist = trackInfo?.artist || '';
    
const presence = {
    details: title,
    state: artist || 'Ожидание',
    startTimestamp: Date.now(),
    largeImageKey: 'musichub_icon',
    largeImageText: 'MusicHub v3.0.5',
    buttons: [
        {
            label: '🎵 MusicHub',
            url: 'https://github.com/Mamba1230/MusicHub'
        }
    ]
};
    
    console.log('📤 Отправляем в Discord:', JSON.stringify(presence, null, 2));
    
    rpc.setActivity(presence)
        .then(() => {
            console.log('✅ RPC УСПЕШНО УСТАНОВЛЕН!');
        })
        .catch(err => {
            console.log('❌ ОШИБКА RPC:', err.message);
            console.log('❌ Полная ошибка:', err);
        });
}

// Инициализация RPC
function initRPC() {
    if (rpc) {
        console.log('ℹ️ RPC уже инициализирован');
        return;
    }
    
    console.log('🔧 Начинаем инициализацию RPC...');
    
    try {
        const DiscordRPC = require('discord-rpc');
        console.log('✅ discord-rpc загружен');
        
        DiscordRPC.register(clientId);
        console.log('✅ DiscordRPC.register() выполнен');
        
        rpc = new DiscordRPC.Client({ transport: 'ipc' });
        console.log('✅ Клиент RPC создан');
        
        rpc.on('ready', () => {
            console.log('✅ Discord RPC ГОТОВ!');
            if (rpcEnabled) {
                console.log('🔄 RPC включён, отправляем статус...');
                updateDiscordPresence(global.currentTrackInfo);
            }
        });
        
        rpc.on('error', (err) => {
            console.log('❌ RPC ошибка:', err);
        });
        
        console.log('🔑 Логинимся в Discord...');
        rpc.login({ clientId }).then(() => {
            console.log('✅ RPC login успешен');
        }).catch(err => {
            console.log('❌ Ошибка входа:', err);
            rpc = null;
        });
        
    } catch (err) {
        console.log('❌ Ошибка инициализации RPC:', err);
    }
}

// Включение/выключение RPC
function toggleDiscordRPC(enabled) {
    console.log(`🔄 toggleDiscordRPC(${enabled})`);
    rpcEnabled = enabled;
    saveDiscordSettings({ discordRPCEnabled: enabled });
    
    if (enabled) {
        if (!rpc) {
            console.log('🔧 Инициализируем RPC...');
            initRPC();
        } else {
            console.log('🔄 Обновляем RPC...');
            updateDiscordPresence(global.currentTrackInfo);
        }
        if (rpcUpdateInterval) clearInterval(rpcUpdateInterval);
        rpcUpdateInterval = setInterval(() => {
            if (rpc && rpcEnabled) {
                updateDiscordPresence(global.currentTrackInfo);
            }
        }, 15000);
        console.log('✅ Discord RPC включён');
    } else {
        if (rpcUpdateInterval) {
            clearInterval(rpcUpdateInterval);
            rpcUpdateInterval = null;
        }
        if (rpc) {
            try {
                rpc.clearActivity();
                rpc.destroy();
            } catch (e) {}
            rpc = null;
        }
        console.log('🔇 Discord RPC выключён');
    }
}

// Делаем функции глобальными
global.toggleDiscordRPC = toggleDiscordRPC;
global.updateDiscordPresence = updateDiscordPresence;
global.rpc = rpc;
global.rpcEnabled = rpcEnabled;
global.currentTrackInfo = { title: 'Не играет', artist: '' };

// Обработчики IPC
ipcMain.on('toggle-discord-rpc', (event, enabled) => {
    console.log('📨 Получен toggle-discord-rpc:', enabled);
    toggleDiscordRPC(enabled);
});

ipcMain.handle('get-discord-rpc-status', () => {
    return rpcEnabled;
});

ipcMain.on('update-track-info', (event, trackInfo) => {
    console.log('📨 Получен update-track-info:', trackInfo);
    global.currentTrackInfo = trackInfo;
    if (rpc && rpcEnabled) {
        updateDiscordPresence(trackInfo);
    }
});







// ============================================================
// ГИБКИЕ ГОРЯЧИЕ КЛАВИШИ (MAIN.JS) - ИСПРАВЛЕННАЯ ВЕРСИЯ
// ============================================================

// Глобальные переменные для клавиш
let registeredHotkeys = {};
let hotkeyListeners = {};

// ============================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================


// ОБРАБОТКА КЛАВИШ ВНУТРИ ОКНА (РАБОТАЕТ СО ВСЕМИ КЛАВИШАМИ)
function setupWindowHotkeys() {
    if (!win || win.isDestroyed()) return;
    
    // Получаем webContents окна
    const webContents = win.webContents;
    
    // Слушаем все клавиши в окне
    webContents.on('before-input-event', (event, input) => {
        // Игнорируем если ввод в поле
        if (input.type === 'keyDown') {
            // Собираем комбинацию
            const keys = [];
            if (input.control) keys.push('Control');
            if (input.alt) keys.push('Alt');
            if (input.shift) keys.push('Shift');
            if (input.meta) keys.push('Meta');
            
            // Определяем основную клавишу
            let mainKey = input.key;
            
            // Преобразуем специальные клавиши
            if (mainKey === ' ') mainKey = 'Space';
            if (mainKey === 'ArrowUp') mainKey = 'ArrowUp';
            if (mainKey === 'ArrowDown') mainKey = 'ArrowDown';
            if (mainKey === 'ArrowLeft') mainKey = 'ArrowLeft';
            if (mainKey === 'ArrowRight') mainKey = 'ArrowRight';
            if (mainKey === 'MediaPlayPause') mainKey = 'MediaPlayPause';
            if (mainKey === 'MediaNextTrack') mainKey = 'MediaNextTrack';
            if (mainKey === 'MediaPreviousTrack') mainKey = 'MediaPreviousTrack';
            if (mainKey === 'VolumeUp') mainKey = 'VolumeUp';
            if (mainKey === 'VolumeDown') mainKey = 'VolumeDown';
            if (mainKey === 'VolumeMute') mainKey = 'VolumeMute';
            
            // Добавляем основную клавишу (если это не модификатор)
            if (!['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) {
                keys.push(mainKey);
            }
            
            // Если только модификаторы - пропускаем
            if (keys.length <= 1 && ['Control', 'Alt', 'Shift', 'Meta'].includes(keys[0])) {
                return;
            }
            
            // Сортируем модификаторы
            const order = { 'Control': 0, 'Alt': 1, 'Shift': 2, 'Meta': 3 };
            keys.sort((a, b) => {
                const aIsMod = order[a] !== undefined;
                const bIsMod = order[b] !== undefined;
                if (aIsMod && bIsMod) return order[a] - order[b];
                if (aIsMod) return -1;
                if (bIsMod) return 1;
                return 0;
            });
            
            const binding = keys.join('+');
            
            // Проверяем, есть ли такая комбинация в наших hotkeys
            if (binding && registeredHotkeys) {
                for (const [action, hotkeyBinding] of Object.entries(registeredHotkeys)) {
                    if (hotkeyBinding === binding) {
                        console.log(`🔔 Клавиша в окне: ${action} (${binding})`);
                        event.preventDefault();
                        
                        // Отправляем в renderer
                        webContents.send('hotkey-pressed', action);
                        break;
                    }
                }
            }
        }
    });
    
    console.log('✅ Обработка клавиш в окне настроена');
}

// Функция регистрации с поддержкой Numpad и специальных клавиш
function registerHotkeyWithFallback(action, binding) {
    console.log(`🔧 Регистрация: ${action} → ${binding}`);
    
    // Если binding пустой - пропускаем
    if (!binding || binding === '' || binding === 'null' || binding === 'undefined') {
        console.log(`⚠️ Пропуск ${action}: пустое значение`);
        return false;
    }
    
    // Пробуем зарегистрировать через globalShortcut
    try {
        const success = globalShortcut.register(binding, () => {
            console.log(`🔔 КЛАВИША СРАБОТАЛА: ${action} (${binding})`);
            if (win && !win.isDestroyed()) {
                win.webContents.send('hotkey-pressed', action);
            }
        });
        
        if (success) {
            console.log(`✅ Зарегистрирована (globalShortcut): ${action} → ${binding}`);
            return true;
        }
    } catch (err) {
        console.log(`❌ Ошибка регистрации ${action}:`, err.message);
    }
    
    // === FALLBACK: ЧЕРЕЗ RENDERER ===
    console.log(`🔄 Использую fallback для ${action} → ${binding}`);
    
    // Сохраняем для отправки в renderer
    hotkeyListeners[action] = binding;
    
    // Регистрируем через renderer (отправляем событие)
    if (win && !win.isDestroyed()) {
        win.webContents.send('register-fallback-hotkey', { action, binding });
    }
    
    return true;
}

// Основная функция регистрации всех клавиш
function registerAllHotkeys(hotkeys) {
    console.log('🔄 Регистрация горячих клавиш:', hotkeys);
    
    // Отключаем все старые globalShortcut
    try {
        globalShortcut.unregisterAll();
    } catch (e) {
        console.log('Ошибка отключения клавиш:', e);
    }
    
    registeredHotkeys = {};
    
    if (!hotkeys) {
        console.log('ℹ️ Нет клавиш для регистрации');
        return 0;
    }
    
    let registeredCount = 0;
    
    for (const [action, binding] of Object.entries(hotkeys)) {
        if (!binding || binding === '' || binding === 'null' || binding === 'undefined') {
            console.log(`⚠️ Пропуск ${action}: пустое значение`);
            continue;
        }
        
        // === СОХРАНЯЕМ ВСЕ КЛАВИШИ В registeredHotkeys ===
        // Они будут обрабатываться через before-input-event
        registeredHotkeys[action] = binding;
        registeredCount++;
        console.log(`✅ Сохранена: ${action} → ${binding}`);
        
        // === ДЛЯ ПРОСТЫХ КЛАВИШ (буквы, цифры) ПРОБУЕМ globalShortcut ===
        // Это нужно чтобы клавиши работали даже когда окно не в фокусе
        const simpleKeys = ['A','B','C','D','E','F','G','H','I','J','K','L','M',
                           'N','O','P','Q','R','S','T','U','V','W','X','Y','Z',
                           '0','1','2','3','4','5','6','7','8','9',
                           'Space','Tab','Escape','Enter','Backspace',
                           'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
        
        const parts = binding.split('+');
        let isSimple = true;
        for (const part of parts) {
            if (!simpleKeys.includes(part) && !['Control','Alt','Shift','Meta'].includes(part)) {
                isSimple = false;
                break;
            }
        }
        
        if (isSimple) {
            try {
                const success = globalShortcut.register(binding, () => {
                    console.log(`🔔 globalShortcut: ${action} (${binding})`);
                    if (win && !win.isDestroyed()) {
                        win.webContents.send('hotkey-pressed', action);
                    }
                });
                if (success) {
                    console.log(`✅ globalShortcut: ${action} → ${binding}`);
                }
            } catch (err) {
                console.log(`❌ globalShortcut ошибка ${action}:`, err.message);
            }
        } else {
            console.log(`🔄 Только внутри окна: ${action} → ${binding}`);
        }
    }
    
    console.log(`✅ Зарегистрировано ${registeredCount} горячих клавиш`);
    return registeredCount;
}

// ============================================================
// ЗАГРУЗКА ИЗ ФАЙЛА
// ============================================================

function loadHotkeysFromFile() {
    try {
        const fs = require('fs');
        const path = require('path');
        const hotkeysPath = path.join(app.getPath('userData'), 'hotkeys.json');
        
        if (fs.existsSync(hotkeysPath)) {
            const data = fs.readFileSync(hotkeysPath, 'utf8');
            const hotkeys = JSON.parse(data);
            console.log('📥 Загружены hotkeys из файла:', hotkeys);
            return hotkeys;
        }
    } catch (err) {
        console.error('❌ Ошибка загрузки hotkeys:', err);
    }
    return null;
}

function saveHotkeysToFile(hotkeys) {
    try {
        const fs = require('fs');
        const path = require('path');
        const hotkeysPath = path.join(app.getPath('userData'), 'hotkeys.json');
        fs.writeFileSync(hotkeysPath, JSON.stringify(hotkeys, null, 2));
        console.log('💾 Hotkeys сохранены в файл');
    } catch (err) {
        console.error('❌ Ошибка сохранения hotkeys:', err);
    }
}

function getDefaultHotkeys() {
    return {
        playpause: 'Control+Shift+Space',
        next: 'Control+Shift+Right',
        prev: 'Control+Shift+Left',
        stop: 'Control+Shift+.',
        volumeup: 'Control+Shift+Up',
        volumedown: 'Control+Shift+Down'
    };
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function initHotkeys() {
    // Пробуем загрузить из файла
    let hotkeys = loadHotkeysFromFile();
    
    // Если нет - создаём дефолтные
    if (!hotkeys) {
        hotkeys = getDefaultHotkeys();
        saveHotkeysToFile(hotkeys);
        console.log('📝 Созданы дефолтные hotkeys');
    }
    
    // Регистрируем
    registerAllHotkeys(hotkeys);
    
    // Отправляем в renderer
    if (win && !win.isDestroyed()) {
        win.webContents.send('load-hotkeys', hotkeys);
    }
    
    return hotkeys;
}

// ============================================================
// ОБРАБОТЧИКИ IPC
// ============================================================

ipcMain.on('update-hotkeys', (event, hotkeys) => {
    console.log('📥 MAIN получил hotkeys:', hotkeys);
    
    // Сохраняем в файл
    saveHotkeysToFile(hotkeys);
    
    // Регистрируем
    registerAllHotkeys(hotkeys);
});

ipcMain.handle('get-hotkeys-from-storage', () => {
    return loadHotkeysFromFile() || getDefaultHotkeys();
});

// Обработчик из renderer для fallback клавиш
ipcMain.on('fallback-hotkey-pressed', (event, action) => {
    console.log(`🔔 Fallback клавиша из renderer: ${action}`);
    if (win && !win.isDestroyed()) {
        win.webContents.send('hotkey-pressed', action);
    }
});

// ============================================================
// МЕДИА-КОМАНДЫ
// ============================================================

ipcMain.on('media-playpause', () => {
    console.log('📨 media-playpause из renderer');
    sendMediaCommand('playpause');
});

ipcMain.on('media-next', () => {
    console.log('📨 media-next из renderer');
    sendMediaCommand('next');
});

ipcMain.on('media-prev', () => {
    console.log('📨 media-prev из renderer');
    sendMediaCommand('previous');
});

ipcMain.on('media-stop', () => {
    console.log('📨 media-stop из renderer');
    sendMediaCommand('stop');
});

ipcMain.on('volume-up', () => {
    console.log('📨 volume-up из renderer');
});

ipcMain.on('volume-down', () => {
    console.log('📨 volume-down из renderer');
});

// ============================================================
// ЗАПУСК ПРИ СТАРТЕ
// ============================================================

// Экспортируем для использования в других частях
module.exports = { 
    registerAllHotkeys, 
    registerHotkeyWithFallback,
    initHotkeys,
    loadHotkeysFromFile,
    saveHotkeysToFile
};

// Загружаем при старте (будет вызвано из app.whenReady)
console.log('🎮 Модуль горячих клавиш загружен');































// ============================================================
// СИСТЕМА ПЛАГИНОВ (main.js) — ИСПРАВЛЕННАЯ
// ============================================================

// === ПЕРЕМЕННЫЕ ===
const PLUGINS_PATH = path.join(__dirname, 'plugins');
const USER_PLUGINS_PATH = path.join(app.getPath('userData'), 'plugins');

let loadedPlugins = [];
let pluginWindows = []; // ← ОБЪЯВЛЯЕМ ПЕРЕМЕННУЮ!

// === ЗАГРУЗКА ПЛАГИНОВ ===
function loadPlugins() {
    loadedPlugins = [];
    
    const pluginPaths = [PLUGINS_PATH, USER_PLUGINS_PATH];
    
    for (const basePath of pluginPaths) {
        if (!fs.existsSync(basePath)) {
            console.log(`⚠️ Папка плагинов не найдена: ${basePath}`);
            continue;
        }
        
        const folders = fs.readdirSync(basePath).filter(f => {
            return fs.statSync(path.join(basePath, f)).isDirectory();
        });
        
        for (const folder of folders) {
            const pluginPath = path.join(basePath, folder);
            const manifestPath = path.join(pluginPath, 'manifest.json');
            
            if (!fs.existsSync(manifestPath)) {
                console.log(`⚠️ Нет manifest.json в ${folder}`);
                continue;
            }
            
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                
                if (!manifest.id || !manifest.name) {
                    console.log(`⚠️ В манифесте ${folder} нет id или name`);
                    continue;
                }
                
                const plugin = {
                    id: manifest.id,
                    name: manifest.name,
                    version: manifest.version || '1.0.0',
                    description: manifest.description || 'Нет описания',
                    author: manifest.author || 'Неизвестен',
                    path: pluginPath,
                    manifest: manifest,
                    icon: manifest.icon ? path.join(pluginPath, manifest.icon) : null,
                    loaded: false,
                    script: null,
                    rendererCode: null
                };
                
                // Загружаем main.js
                if (manifest.main) {
                    const mainPath = path.join(pluginPath, manifest.main);
                    if (fs.existsSync(mainPath)) {
                        try {
                            const script = require(mainPath);
                            if (typeof script.activate === 'function') {
                                script.activate(plugin);
                            }
                            plugin.script = script;
                        } catch (err) {
                            console.error(`❌ Ошибка загрузки main.js плагина ${plugin.id}:`, err);
                        }
                    }
                }
                
                // Загружаем renderer.js
                if (manifest.renderer) {
                    const rendererPath = path.join(pluginPath, manifest.renderer);
                    if (fs.existsSync(rendererPath)) {
                        plugin.rendererCode = fs.readFileSync(rendererPath, 'utf8');
                        
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('load-plugin-renderer', {
                                id: plugin.id,
                                code: plugin.rendererCode
                            });
                        }
                    }
                }
                
                plugin.loaded = true;
                loadedPlugins.push(plugin);
                console.log(`✅ Плагин загружен: ${plugin.name} (${plugin.id})`);
                
            } catch (err) {
                console.error(`❌ Ошибка загрузки плагина ${folder}:`, err);
            }
        }
    }
    
    console.log(`📦 Всего загружено плагинов: ${loadedPlugins.length}`);
    return loadedPlugins;
}

// === УСТАНОВКА ПЛАГИНА ===
async function installPlugin(pluginPath) {
    const manifestPath = path.join(pluginPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Манифест не найден');
    }
    
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.id) {
        throw new Error('В манифесте нет id');
    }
    
    const targetPath = path.join(USER_PLUGINS_PATH, manifest.id);
    
    // Проверяем, не установлен ли уже
    if (fs.existsSync(targetPath)) {
        throw new Error(`Плагин "${manifest.name}" уже установлен`);
    }
    
    // Создаём папку если нет
    if (!fs.existsSync(USER_PLUGINS_PATH)) {
        fs.mkdirSync(USER_PLUGINS_PATH, { recursive: true });
    }
    
    // Копируем плагин
    await fs.promises.cp(pluginPath, targetPath, { recursive: true });
    
    console.log(`✅ Плагин "${manifest.name}" установлен`);
    return manifest;
}

// === УДАЛЕНИЕ ПЛАГИНА ===
async function uninstallPlugin(pluginId) {
    const pluginPath = path.join(USER_PLUGINS_PATH, pluginId);
    if (!fs.existsSync(pluginPath)) {
        throw new Error('Плагин не найден');
    }
    
    await fs.promises.rm(pluginPath, { recursive: true, force: true });
    console.log(`🗑️ Плагин "${pluginId}" удалён`);
}

let activePluginPopups = new Map(); // pluginId → BrowserWindow

async function openPluginPopup(pluginId) {
    const plugin = loadedPlugins.find(p => p.id === pluginId);
    if (!plugin) {
        throw new Error('Плагин не найден');
    }
    
    // === ПРОВЕРКА: УЖЕ ОТКРЫТ ===
    if (activePluginPopups.has(pluginId)) {
        const existingPopup = activePluginPopups.get(pluginId);
        if (existingPopup && !existingPopup.isDestroyed()) {
            // Фокусируем существующее окно
            existingPopup.focus();
            existingPopup.show();
            console.log(`🔁 Плагин "${plugin.name}" уже открыт, фокусирую`);
            return existingPopup;
        } else {
            // Окно уничтожено, удаляем из Map
            activePluginPopups.delete(pluginId);
        }
    }
    
    const popupPath = path.join(plugin.path, 'popup.html');
    
    const popup = new BrowserWindow({
        width: 400,
        height: 500,
        parent: win,
        modal: false,
        show: false,
        frame: false,
        resizable: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    
    // === СОХРАНЯЕМ В MAP ===
    activePluginPopups.set(pluginId, popup);
    
    // Иконка плагина
    if (plugin.icon && fs.existsSync(plugin.icon)) {
        try {
            const icon = require('electron').nativeImage.createFromPath(plugin.icon);
            popup.setIcon(icon);
        } catch (e) {}
    }
    
    // Загружаем popup.html
    if (fs.existsSync(popupPath)) {
        await popup.loadFile(popupPath);
    } else {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${plugin.name}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        background: #1a1a1a;
                        color: #fff;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                    }
                    .custom-titlebar {
                        position: fixed; top: 0; left: 0; right: 0; height: 38px;
                        background: #141414; display: flex; align-items: center;
                        padding: 0 12px; -webkit-app-region: drag;
                        border-bottom: 1px solid #2a2a2a; z-index: 1000;
                    }
                    .custom-titlebar .icon {
                        width: 20px; height: 20px; border-radius: 4px;
                        margin-right: 10px; display: flex; align-items: center;
                        justify-content: center; font-size: 14px;
                        background: rgba(255,255,255,0.05); overflow: hidden;
                    }
                    .custom-titlebar .title {
                        flex: 1; font-size: 13px; font-weight: 600; color: #ddd;
                        -webkit-app-region: drag;
                    }
                    .custom-titlebar .controls {
                        display: flex; gap: 8px; -webkit-app-region: no-drag;
                    }
                    .custom-titlebar .controls button {
                        background: none; border: none; color: #666; font-size: 14px;
                        cursor: pointer; padding: 2px 6px; border-radius: 4px;
                        transition: all 0.2s; line-height: 1;
                    }
                    .custom-titlebar .controls .close-btn:hover {
                        background: #ff4444; color: #fff;
                    }
                    .content {
                        margin-top: 38px;
                        width: 100%;
                        height: calc(100% - 38px);
                        overflow: auto;
                        padding: 20px;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        flex-direction: column;
                    }
                    .placeholder-icon { font-size: 48px; margin-bottom: 12px; }
                    .placeholder-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; color: #fff; }
                    .placeholder-version { font-size: 12px; color: #666; margin-bottom: 8px; }
                    .placeholder-desc { font-size: 14px; color: #999; text-align: center; max-width: 280px; }
                </style>
            </head>
            <body>
                <div class="custom-titlebar">
                    <div class="icon">${plugin.icon ? `<img src="file://${plugin.icon}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">` : '🔌'}</div>
                    <span class="title">${plugin.name}</span>
                    <div class="controls">
                        <button class="close-btn" onclick="window.close()">✕</button>
                    </div>
                </div>
                <div class="content">
                    <div class="placeholder-icon">🎛️</div>
                    <div class="placeholder-name">${plugin.name}</div>
                    <div class="placeholder-version">v${plugin.version}</div>
                    <div class="placeholder-desc">${plugin.description || 'Нет описания'}</div>
                </div>
            </body>
            </html>
        `;
        await popup.loadURL(`data:text/html,${encodeURIComponent(html)}`);
    }
    
    popup.once('ready-to-show', () => {
        if (win && !win.isDestroyed()) {
            const parentBounds = win.getBounds();
            const x = parentBounds.x + (parentBounds.width - 400) / 2;
            const y = parentBounds.y + (parentBounds.height - 500) / 2;
            popup.setPosition(Math.round(x), Math.round(y));
        }
        popup.show();
    });
    
    // === ПРИ ЗАКРЫТИИ УДАЛЯЕМ ИЗ MAP ===
    popup.on('closed', () => {
        activePluginPopups.delete(pluginId);
        const index = pluginWindows.indexOf(popup);
        if (index !== -1) {
            pluginWindows.splice(index, 1);
        }
    });
    
    pluginWindows.push(popup);
    return popup;
}

// === IPC ОБРАБОТЧИКИ ===
ipcMain.handle('get-plugins', async () => {
    loadPlugins();
    return loadedPlugins.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
        author: p.author,
        icon: p.icon,
        loaded: p.loaded
    }));
});

ipcMain.handle('install-plugin', async (event, pluginPath) => {
    return await installPlugin(pluginPath);
});

ipcMain.handle('uninstall-plugin', async (event, pluginId) => {
    return await uninstallPlugin(pluginId);
});

ipcMain.handle('open-plugin-popup', async (event, pluginId) => {
    return await openPluginPopup(pluginId);
});

// === СОБЫТИЕ ДЛЯ ЗАГРУЗКИ В RENDERER ===
ipcMain.on('load-plugin-renderer', (event, data) => {
    // Пересылаем в renderer
    if (win && !win.isDestroyed()) {
        win.webContents.send('load-plugin-renderer', data);
    }
});

// === ИНИЦИАЛИЗАЦИЯ ===
function initPlugins() {
    // Создаём папку для плагинов если нет
    if (!fs.existsSync(USER_PLUGINS_PATH)) {
        fs.mkdirSync(USER_PLUGINS_PATH, { recursive: true });
    }
    
    loadPlugins();
    console.log('🔌 Система плагинов инициализирована');
}

// Вызываем при старте
setTimeout(initPlugins, 1000);










// ============================================================
// МАГАЗИН ПЛАГИНОВ (main.js)
// ============================================================

// === КОНСТАНТЫ ===
const PLUGIN_STORE_URL = 'https://raw.githubusercontent.com/Mamba1230/musichub-plugins/refs/heads/main/plugins.json';


// === ПОЛУЧЕНИЕ СПИСКА ПЛАГИНОВ ===
async function fetchPluginStore() {
    return new Promise((resolve, reject) => {
        https.get(PLUGIN_STORE_URL, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// ============================================================
// ПЕРЕДАЧА СТАТУСА В ПЛАГИНЫ (ПРОСТОЙ МОСТ)
// ============================================================

let pluginStatus = {};

ipcMain.on('send-plugin-status', (event, status) => {
    pluginStatus = status;
    
    // Отправляем всем открытым попапам
    for (const popup of pluginWindows) {
        if (popup && !popup.isDestroyed()) {
            popup.webContents.send('plugin-status', pluginStatus);
        }
    }
});

// === СКАЧИВАНИЕ И УСТАНОВКА ПЛАГИНА ===
async function downloadAndInstallPlugin(pluginId, downloadUrl) {
    return new Promise((resolve, reject) => {
        const zipPath = path.join(USER_PLUGINS_PATH, `${pluginId}.zip`);
        const extractPath = path.join(USER_PLUGINS_PATH, pluginId);
        
        // Создаём папку если нет
        if (!fs.existsSync(USER_PLUGINS_PATH)) {
            fs.mkdirSync(USER_PLUGINS_PATH, { recursive: true });
        }
        
        // Скачиваем архив
        const file = fs.createWriteStream(zipPath);
        https.get(downloadUrl, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                
                // Распаковываем
                try {
                    const zip = new AdmZip(zipPath);
                    zip.extractAllTo(extractPath, true);
                    
                    // Удаляем архив
                    fs.unlinkSync(zipPath);
                    
                    // Проверяем манифест
                    const manifestPath = path.join(extractPath, 'manifest.json');
                    if (!fs.existsSync(manifestPath)) {
                        reject(new Error('Манифест не найден'));
                        return;
                    }
                    
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    resolve(manifest);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (e) => {
            fs.unlinkSync(zipPath);
            reject(e);
        });
    });
}

// === IPC ОБРАБОТЧИКИ ===
ipcMain.handle('get-plugin-store', async () => {
    try {
        const store = await fetchPluginStore();
        return store;
    } catch (err) {
        console.error('❌ Ошибка загрузки магазина:', err);
        return { plugins: [], error: err.message };
    }
});

ipcMain.handle('install-plugin-from-store', async (event, pluginId, downloadUrl) => {
    try {
        const manifest = await downloadAndInstallPlugin(pluginId, downloadUrl);
        // Перезагружаем плагины
        loadPlugins();
        return { success: true, manifest };
    } catch (err) {
        return { success: false, error: err.message };
    }
});












































































ipcMain.on('open-external-url', (event, url) => {
    console.log(`🔗 Открываем musichub:// URL: ${url}`);
    
    // Нормализуем URL
    let cleanUrl = url.replace('musichub://', '');
    
    // Если это поиск YouTube Music
    if (cleanUrl.includes('music.youtube.com/search')) {
        console.log(`🎵 Поиск в YouTube Music: ${cleanUrl}`);
    }
    
    // Отправляем в renderer
    if (win && !win.isDestroyed()) {
        win.webContents.send('open-external-url', cleanUrl);
    }
});






// ========== УПРАВЛЕНИЕ МЕДИА-КНОПКАМИ ЧЕРЕЗ VOLUMECONTROLLER ==========
async function sendMediaCommand(command) {
    // command: 'playpause', 'stop', 'next', 'previous'
    const port = 9876;
    const url = `http://localhost:${port}/media-${command}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await response.json();
        return result.success === true;
    } catch (error) {
        console.error('Ошибка отправки медиа-команды:', error);
        return false;
    }
}

// ========== ОБРАБОТЧИКИ МЕДИА-КНОПОК ==========
ipcMain.handle('media-playpause', async () => {
    return await sendMediaCommand('playpause');
});

ipcMain.handle('media-stop', async () => {
    return await sendMediaCommand('stop');
});

ipcMain.handle('media-next', async () => {
    return await sendMediaCommand('next');
});

ipcMain.handle('media-previous', async () => {
    return await sendMediaCommand('previous');
});

// Проверка доступности VolumeController
ipcMain.handle('media-ping', async () => {
    try {
        const response = await fetch('http://localhost:9876/media-ping', {
            method: 'POST',
            signal: AbortSignal.timeout(1000)
        });
        return response.ok;
    } catch {
        return false;
    }
});

ipcMain.handle('parse-ai-command', (event, text) => {
    // Парсим команды из текста
    const commands = [];
    
    const patterns = {
        '🎵\\[CMD:PLAY\\]': 'play',
        '🎵\\[CMD:PAUSE\\]': 'pause',
        '🎵\\[CMD:STOP\\]': 'stop',
        '🎵\\[CMD:NEXT\\]': 'next',
        '🎵\\[CMD:PREV\\]': 'prev',
        '🎵\\[CMD:VOLUP\\]': 'volume_up',
        '🎵\\[CMD:VOLDOWN\\]': 'volume_down',
        '🎵\\[CMD:MUTE\\]': 'mute',
        '🎵\\[CMD:UNMUTE\\]': 'unmute',
        '🎵\\[CMD:TOGGLE\\]': 'toggle',
        '🎵\\[CMD:VOLSET:(\\d+)\\]': 'volume_set'
    };
    
    for (const [pattern, command] of Object.entries(patterns)) {
        const regex = new RegExp(pattern, 'g');
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (command === 'volume_set' && match[1]) {
                commands.push({ command, value: parseInt(match[1]) });
            } else {
                commands.push({ command });
            }
        }
    }
    
    return commands;
});

ipcMain.handle('execute-ai-command', async (event, commandData) => {
    // Выполняем команду через VolumeController
    const { command, value } = commandData;
    
    switch(command) {
        case 'play':
        case 'pause':
        case 'toggle':
            return await sendMediaCommand('playpause');
        case 'stop':
            return await sendMediaCommand('stop');
        case 'next':
            return await sendMediaCommand('next');
        case 'prev':
            return await sendMediaCommand('previous');
        case 'volume_up':
        case 'volume_down':
        case 'volume_set':
            // Получаем текущую громкость и меняем
            // ...
            return true;
        case 'mute':
            // Выключаем звук
            return true;
        case 'unmute':
            // Включаем звук
            return true;
        default:
            return false;
    }
});


let volumeControllerProcess = null;
let volumeControllerRestartTimer = null;

function getVolumeControllerPath() {
    if (app.isPackaged) {
        // В собранном приложении
        return path.join(process.resourcesPath, 'VolumeController.exe');
    } else {
        // В разработке
        return path.join(__dirname, 'VolumeController.exe');
    }
}

function startVolumeController() {
    const exePath = getVolumeControllerPath();
    console.log('🔍 Looking for VolumeController at:', exePath);
    
    if (!fs.existsSync(exePath)) {
        console.error('❌ VolumeController.exe не найден в:', exePath);
        return;
    }
    
    console.log('✅ Starting VolumeController...');
    
    volumeControllerProcess = spawn(exePath, [], {
        cwd: app.getPath('userData'),
        detached: false,
        stdio: 'pipe'
    });
    
    volumeControllerProcess.stdout.on('data', (data) => {
        console.log('📦 VolumeController:', data.toString().trim());
    });
    
    volumeControllerProcess.stderr.on('data', (data) => {
        console.error('⚠️ VolumeController error:', data.toString());
    });
    
    volumeControllerProcess.on('close', (code) => {
        console.log('💀 VolumeController exited with code:', code);
        // Планируем перезапуск через 5 секунд
        if (volumeControllerRestartTimer) clearTimeout(volumeControllerRestartTimer);
        volumeControllerRestartTimer = setTimeout(() => {
            console.log('🔄 Перезапуск VolumeController...');
            startVolumeController();
        }, 5000);
    });
    
    volumeControllerProcess.on('error', (err) => {
        console.error('❌ VolumeController error:', err);
    });
}

// Функция остановки VolumeController (для корректного завершения)
function stopVolumeController() {
    if (volumeControllerRestartTimer) {
        clearTimeout(volumeControllerRestartTimer);
        volumeControllerRestartTimer = null;
    }
    
    if (volumeControllerProcess && !volumeControllerProcess.killed) {
        console.log('🛑 Останавливаем VolumeController...');
        volumeControllerProcess.kill();
        volumeControllerProcess = null;
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')  // ← важно!
        }
    });
    
    mainWindow.loadFile('index.html');
}


let currentTrayRequest = null; // для отмены предыдущего запроса

function updateTrayWithArtwork(imageData) {
    if (!tray) return;
    
    const { nativeImage } = require('electron');
    const iconPath = path.join(__dirname, 'icon.png');
    const defaultIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;
    
    // Отменяем предыдущий запрос, если он был
    if (currentTrayRequest) {
        currentTrayRequest.destroy();
        currentTrayRequest = null;
    }
    
    // Если нет данных - ставим стандартную иконку
    if (!imageData || imageData === 'null') {
        if (defaultIcon) tray.setImage(defaultIcon);
        return;
    }
    
    try {
        let image;
        
        // Если это base64
        if (imageData.startsWith('data:image')) {
            const base64Data = imageData.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            image = nativeImage.createFromBuffer(buffer);
            const resized = image.resize({ width: 16, height: 16 });
            tray.setImage(resized);
            return;
        }
        
        // Если это HTTP URL
        if (imageData.startsWith('http')) {
            const protocol = imageData.startsWith('https') ? https : http;
            const request = protocol.get(imageData, (response) => {
                let chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        const img = nativeImage.createFromBuffer(buffer);
                        const resized = img.resize({ width: 16, height: 16 });
                        // Устанавливаем иконку только если этот запрос актуален
                        if (currentTrayRequest === request) {
                            tray.setImage(resized);
                            currentTrayRequest = null;
                        }
                    } catch (err) {
                        console.log('Ошибка обработки картинки:', err);
                        if (defaultIcon) tray.setImage(defaultIcon);
                        currentTrayRequest = null;
                    }
                });
                response.on('error', () => {
                    if (currentTrayRequest === request) {
                        if (defaultIcon) tray.setImage(defaultIcon);
                        currentTrayRequest = null;
                    }
                });
            });
            request.on('error', () => {
                if (currentTrayRequest === request) {
                    if (defaultIcon) tray.setImage(defaultIcon);
                    currentTrayRequest = null;
                }
            });
            currentTrayRequest = request;
            return;
        }
        
        // Неизвестный формат
        if (defaultIcon) tray.setImage(defaultIcon);
        
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

function registerProtocol() {
    // Определяем путь к исполняемому файлу
    let exePath;
    if (app.isPackaged) {
        // В собранном приложении
        exePath = process.execPath;
    } else {
        // В разработке
        exePath = process.execPath;
    }
    
    // Регистрируем протокол musichub://
    const succeeded = app.setAsDefaultProtocolClient('musichub', exePath);
    console.log(`📌 Регистрация протокола musichub: ${succeeded ? 'успешно' : 'ошибка'}`);
}

function setAllWebviewsVolume(volume) {
    if (!win || win.isDestroyed()) return;
    
    // Получаем все webview через mainWindow
    const webContents = win.webContents;
    
    // Отправляем команду в renderer
    if (webContents && !webContents.isDestroyed()) {
        webContents.send('global-set-volume', volume);
    }
}

// IPC обработчик
ipcMain.on('set-all-webviews-volume', (event, volume) => {
    setAllWebviewsVolume(volume);
});


function getMediaFromFiles() {
    const appData = process.env.APPDATA;
    const basePath = path.join(appData, 'musichub');
    const infoPath = path.join(basePath, 'media_info.json');
    const coverPath = path.join(basePath, 'cover.jpg');
    
    console.log('🔍 Looking for files in:', basePath);
    
    try {
        if (!fs.existsSync(infoPath)) {
            return null;
        }
        
        // Читаем файл как буфер и удаляем BOM
        let content = fs.readFileSync(infoPath, 'utf8');
        // Удаляем BOM если есть (символы \uFEFF или я╗┐)
        if (content.charCodeAt(0) === 0xFEFF || content.startsWith('я╗┐')) {
            content = content.replace(/^[\uFEFFя╗┐]/, '');
        }
        
        const info = JSON.parse(content);
        
        if (!info.title) {
            return null;
        }
        
        if (fs.existsSync(coverPath)) {
            const coverBuffer = fs.readFileSync(coverPath);
            info.artwork_base64 = coverBuffer.toString('base64');
            console.log('✅ Cover loaded, size:', coverBuffer.length);
        }
        if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('musichub', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('musichub');
}
        
        return info;
    } catch (err) {
        console.log('Ошибка чтения:', err.message);
        return null;
    }
}

ipcMain.on('set-master-volume', (event, volume) => {
    // Пересылаем во все webview
    const webviews = win.webContents;
    // Отправляем команду во все webview
    win.webContents.send('global-volume-change', volume);
});

ipcMain.handle('set-system-volume', async (event, volumePercent) => {
    if (require('fs').existsSync(nircmdPath)) {
        const value = Math.round(volumePercent * 655.35); // 0-65535
        exec(`"${nircmdPath}" changesysvolume ${value}`, (err, stdout, stderr) => {
            if (err) console.log('Ошибка nircmd:', err);
        });
        return { success: true };
    }
    return { success: false };
});

ipcMain.handle('get-system-volume', async () => {
    try {
        const volume = await getVolume();
        return { success: true, volume };
    } catch (err) {
        return { success: false, error: err.message };
    }
});


ipcMain.handle('get-artwork-from-server', async () => {
    const appData = process.env.APPDATA;
    const coverPath = path.join(appData, 'musichub', 'cover.jpg');
    
    if (fs.existsSync(coverPath)) {
        try {
            const coverBuffer = fs.readFileSync(coverPath);
            return coverBuffer.toString('base64');
        } catch (err) {
            console.log('Error reading cover:', err);
            return null;
        }
    }
    return null;
});
// IPC для renderer
ipcMain.handle('get-media-from-files', async () => {
    console.log('📥 Запрос из renderer в', new Date().toLocaleTimeString());
    const result = getMediaFromFiles();
    
    // ПРОВЕРЯЕМ, ЧТО ВОЗВРАЩАЕТСЯ
    if (result && result.artwork_base64) {
        console.log('✅ artwork_base64 есть, длина:', result.artwork_base64.length);
    } else {
        console.log('❌ artwork_base64 ОТСУТСТВУЕТ');
    }
    
    return result;
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
    startVolumeController();
    startMediaWatcher();
    registerProtocol();
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
    
        setTimeout(() => {
        setupWindowHotkeys();
    }, 500);

    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = ua;
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });


    session.fromPartition('persist:music');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'AutoplayIgnoreWebAudio');

    win.loadFile('index.html');

    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Разрешаем автовоспроизведение
    webPreferences.autoplayPolicy = 'no-user-gesture-required';
    // Отключаем ограничения для звука
    webPreferences.webSecurity = false;
    webPreferences.allowRunningInsecureContent = true;
});
    
    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Убираем ограничения для webview
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = false;
    webPreferences.allowRunningInsecureContent = true;
});

// Глобальный обработчик ошибок
app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
        contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            // Игнорируем ERR_ABORTED (-3) - это обычно редиректы
            if (errorCode === -3) {
                console.log('ℹ️ Webview редирект, игнорируем');
                return;
            }
            console.log('Webview error:', errorCode, errorDescription, validatedURL);
            // Не перезагружаем автоматически, чтобы избежать циклов
        });
    }
});

    win.once('ready-to-show', () => {
        // Показываем или скрываем окно
        if (startMinimizedFlag) {
            win.hide();
        } else {
            win.show();
        }
        
        // Отправляем настройки в renderer
        if (win && !win.isDestroyed()) {
            win.webContents.send('init-active-tab', config.activeTab || 'yandex');
            win.webContents.send('init-theme', config.theme || 'dark');

        }
    });


win.on('close', (e) => {
    // Сохраняем размер и позицию ПЕРЕД скрытием
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
    
    if (!isQuitting) {
        e.preventDefault();
        win.hide();
        saveConfig();
    }
});


// ========== ПОЛУЧЕНИЕ УСТРОЙСТВ ДЛЯ C# ==========
ipcMain.handle('get-audio-devices', async () => {
    try {
        const response = await fetch('http://localhost:9876/audio-devices', {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Ошибка получения устройств:', error);
        return [];
    }
});

// ========== СОХРАНЕНИЕ НАСТРОЕК АУДИО ==========
ipcMain.handle('set-audio-config', async (event, config) => {
    try {
        const response = await fetch('http://localhost:9876/audio-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
            signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
            const result = await response.json();
            return result.success || false;
        }
        return false;
    } catch (error) {
        console.error('Ошибка сохранения настроек:', error);
        return false;
    }
});

// ========== ПОЛУЧЕНИЕ НАСТРОЕК АУДИО ==========
ipcMain.handle('get-audio-config', async () => {
    try {
        const response = await fetch('http://localhost:9876/audio-config', {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
            return await response.json();
        }
        return { mode: 0, deviceId: '' };
    } catch (error) {
        return { mode: 0, deviceId: '' };
    }
});



function loadConfig() {
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
    } catch (e) {
        return { width: 1300, height: 850, activeTab: 'yandex', theme: 'dark', startMinimized: false };
    }
}

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


let scrollPositions = new Map();

ipcMain.on('save-scroll-position', (event, webviewId, scrollY) => {
    scrollPositions.set(webviewId, scrollY);
    console.log(`Saved scroll for ${webviewId}: ${scrollY}`);
});

ipcMain.handle('get-scroll-position', (event, webviewId) => {
    return scrollPositions.get(webviewId) || 0;
});


// ========== ЗАПУСК ==========
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
    return;
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        
        const musichubUrl = commandLine.find(arg => arg.startsWith('musichub://'));
        if (musichubUrl) {
            console.log('🔗 MAIN отправляет:', musichubUrl);
            win.webContents.send('open-external-url', musichubUrl);
        }
    }
});


ipcMain.on('set-startup-page', (event, page) => {
    startupPage = page;
    console.log(`💾 Сохранение startupPage в main: ${page}`);
    saveConfig(); // <- эта функция должна перезаписывать файл
    // Дополнительно можно отправить подтверждение обратно
    event.reply('startup-page-saved', { success: true, page });
});

// Получение страницы запуска
ipcMain.handle('get-startup-page', () => {
    const saved = startupPage || 'last';
    console.log(`📤 Возвращаю startupPage: ${saved}`);
    return saved;
});



app.whenReady().then(() => {
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    globalShortcut.unregisterAll();
    app.commandLine.appendSwitch('ignore-certificate-errors');

    app.allowRendererProcessReuse = true;
    startArtworkServer();
    createWindow();
    
    // ========== ЗАПУСК DISCORD RPC (если включено в настройках) ==========
    try {
        const discordSettings = loadDiscordSettings();
        if (discordSettings.discordRPCEnabled === true) {
            console.log('🔄 Discord RPC включён по настройкам, запускаем...');
            setTimeout(() => {
                toggleDiscordRPC(true);
                setTimeout(() => {
                    if (rpc) {
                        rpc.setActivity({
                            details: 'MusicHub v3.0.5',
                            state: 'Слушаю музыку 🎵',
                            largeImageKey: 'spotify',
                            largeImageText: 'MusicHub'
                        }).then(() => {
                            console.log('✅ Discord RPC активен!');
                        }).catch(err => {
                            console.log('❌ Ошибка RPC:', err);
                        });
                    }
                }, 3000);
            }, 3000);
        } else {
            console.log('ℹ️ Discord RPC отключён в настройках');
        }
    } catch (e) {
        console.log('⚠️ Ошибка загрузки настроек Discord:', e);
        // Если ошибка — запускаем принудительно для теста
        console.log('🔄 Принудительный запуск RPC для теста...');
        setTimeout(() => {
            toggleDiscordRPC(true);
        }, 5000);
    }
    
    // ========== ГЛОБАЛЬНЫЕ КЛАВИШИ ==========
    let currentBinding = null;
    let isEnabled = false;
    
    function registerShortcut() {
        try {
            globalShortcut.unregisterAll();
            
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
        registerShortcut();
    });
    
    registerShortcut();
});

app.on('will-quit', () => {
        if (volumeControllerProcess) {
        volumeControllerProcess.kill();
        console.log('❌ VolumeController.exe остановлен');
    }
    globalShortcut.unregisterAll();
    if (httpServer) httpServer.close();
});