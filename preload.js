// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Единый объект API
const api = {
    // Управление окном
    windowCtrl: (cmd) => ipcRenderer.send('window-ctrl', cmd),
    toggleMini: (isMini) => ipcRenderer.send('toggle-mini', isMini),
    setAutostart: (enabled) => ipcRenderer.send('set-autostart', enabled),
    restoreWindow: (bounds) => ipcRenderer.send('restore-window', bounds),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    updateArtwork: (url) => ipcRenderer.send('update-artwork', url),
    onMinimizeWindow: (callback) => ipcRenderer.on('minimize-window', callback),
    onGlobalSwitch: (callback) => ipcRenderer.on('global-switch', callback),
    updateArtworkForTray: (url) => ipcRenderer.send('update-artwork-for-tray', url),
    onInitActiveTab: (callback) => ipcRenderer.on('init-active-tab', callback),
    onInitTheme: (callback) => ipcRenderer.on('init-theme', callback),
    onOptimizeWebviews: (callback) => ipcRenderer.on('optimize-webviews', callback),
    onAppBlur: (callback) => ipcRenderer.on('app-blur', callback),
    onAppFocus: (callback) => ipcRenderer.on('app-focus', callback),
    onAppHidden: (callback) => ipcRenderer.on('app-hidden', callback),
    setStartMinimized: (value) => ipcRenderer.send('set-start-minimized', value),
    onAppShown: (callback) => ipcRenderer.on('app-shown', callback),
    onInitStartMinimized: (callback) => ipcRenderer.on('init-start-minimized', callback),
    getStartMinimized: () => ipcRenderer.invoke('get-start-minimized'),
    updateTrackInfo: (info) => ipcRenderer.send('update-track-info', info),
    updateArtworkBase64: (base64, trackInfo) => ipcRenderer.send('update-artwork-base64', base64, trackInfo),
    updateTabBinding: (data) => ipcRenderer.send('update-tab-binding', data),
    openExtensionPopup: (extId) => ipcRenderer.invoke('open-extension-popup', extId),
    getExtensions: () => ipcRenderer.invoke('get-extensions'),
    installExtension: (path) => ipcRenderer.invoke('install-extension', path),
    uninstallExtension: (extId) => ipcRenderer.invoke('uninstall-extension', extId),
    installFromChrome: (extId) => ipcRenderer.invoke('install-from-chrome', extId),
    reloadArtworkPage: () => ipcRenderer.send('reload-artwork-page'),
    updateArtworkUrl: (url, trackInfo) => ipcRenderer.send('update-artwork-url', url, trackInfo),
    getWindowsMediaInfo: () => ipcRenderer.invoke('get-windows-media-info'),
    getMediaFromFiles: () => ipcRenderer.invoke('get-media-from-files'),
    getArtworkFromServer: () => ipcRenderer.invoke('get-artwork-from-server'),
    onOpenUrl: (callback) => ipcRenderer.on('open-url', callback),
    onOpenHomePage: (callback) => ipcRenderer.on('open-home-page', callback),
    onOpenExternalUrl: (callback) => ipcRenderer.on('open-external-url', callback),
    setSystemVolume: (volume) => ipcRenderer.invoke('set-system-volume', volume),
    getSystemVolume: () => ipcRenderer.invoke('get-system-volume'),
    setMasterVolume: (volume) => ipcRenderer.send('set-master-volume', volume),
    onVolumeChange: (callback) => ipcRenderer.on('volume-changed', callback),
    setAllWebviewsVolume: (volume) => ipcRenderer.send('set-all-webviews-volume', volume),
    onGlobalSetVolume: (callback) => ipcRenderer.on('global-set-volume', callback),
    setYandexVolume: (volumePercent) => ipcRenderer.send('set-yandex-volume', volumePercent),
    getSystemMuted: () => ipcRenderer.invoke('get-system-muted'),
    setSystemMute: (muted) => ipcRenderer.invoke('set-system-mute', muted),
    mediaPlayPause: () => ipcRenderer.invoke('media-playpause'),
    mediaStop: () => ipcRenderer.invoke('media-stop'),
    mediaNext: () => ipcRenderer.invoke('media-next'),
    mediaPrevious: () => ipcRenderer.invoke('media-previous'),
    mediaPing: () => ipcRenderer.invoke('media-ping'),
    getAudioDevices: () => ipcRenderer.invoke('get-audio-devices'),
    setAudioConfig: (config) => ipcRenderer.invoke('set-audio-config'),
    getAudioConfig: () => ipcRenderer.invoke('get-audio-config'),
    toggleDiscordRPC: (enabled) => ipcRenderer.send('toggle-discord-rpc', enabled),
    getDiscordRPCStatus: () => ipcRenderer.invoke('get-discord-rpc-status'),
    updateHotkeys: (hotkeys) => ipcRenderer.send('update-hotkeys', hotkeys),
    onHotkeyPressed: (callback) => ipcRenderer.on('hotkey-pressed', callback),
    getHotkeysFromStorage: () => ipcRenderer.invoke('get-hotkeys-from-storage'),
    sendMobileStatus: (status) => ipcRenderer.send('mobile-update-status', status),
    onMobileCommand: (callback) => ipcRenderer.on('mobile-command', callback),
    onMobileVolume: (callback) => ipcRenderer.on('mobile-volume', callback),
    onMobileServerStarted: (callback) => ipcRenderer.on('mobile-server-started', callback),
    getLocalIP: () => ipcRenderer.invoke('get-local-ip'),
    getPlugins: () => ipcRenderer.invoke('get-plugins'),
togglePlugin: (id, enabled) => ipcRenderer.invoke('toggle-plugin', id, enabled),
installPlugin: (path) => ipcRenderer.invoke('install-plugin', path),
uninstallPlugin: (id) => ipcRenderer.invoke('uninstall-plugin', id),
openPluginPopup: (id) => ipcRenderer.invoke('open-plugin-popup', id),
onLoadPluginRenderer: (callback) => ipcRenderer.on('load-plugin-renderer', callback),
installPluginFromStore: (id, url) => ipcRenderer.invoke('install-plugin-from-store', id, url),
sendPluginStatus: (status) => ipcRenderer.send('send-plugin-status', status),
onPluginStatus: (callback) => ipcRenderer.on('plugin-status', callback),
getPluginStore: (forceRefresh) => ipcRenderer.invoke('get-plugin-store', forceRefresh),
getCustomStores: () => ipcRenderer.invoke('get-custom-stores'),
addCustomStore: (url) => ipcRenderer.invoke('add-custom-store', url),
removeCustomStore: (index) => ipcRenderer.invoke('remove-custom-store', index),

    
    // AI команды
    parseAICommand: (text) => ipcRenderer.invoke('parse-ai-command', text),
    executeAICommand: (command) => ipcRenderer.invoke('execute-ai-command', command),

    // Страница запуска
    setStartupPage: (page) => ipcRenderer.send('set-startup-page', page),
    getStartupPage: () => ipcRenderer.invoke('get-startup-page'),
    onInitStartupPage: (callback) => ipcRenderer.on('init-startup-page', callback),
    
    // Громкость MusicHub
    setMusicHubVolume: (volume) => {
        return fetch('http://localhost:9876/set-volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume: volume })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log(`✅ Громкость MusicHub изменена на ${volume * 100}%`);
            }
            return data.success;
        })
        .catch(error => {
            console.error('❌ Ошибка при изменении громкости:', error);
            return false;
        });
    },

    // ========== FALLBACK ДЛЯ ГОРЯЧИХ КЛАВИШ ==========
    on: (channel, callback) => {
        const validChannels = ['register-fallback-hotkey'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(event, ...args));
        }
    },
    
    send: (channel, ...args) => {
        const validChannels = ['fallback-hotkey-pressed'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    },
    
    fallbackHotkeyPressed: (action) => {
        ipcRenderer.send('fallback-hotkey-pressed', action);
    }
};

// ОДИН РАЗ экспортируем API
contextBridge.exposeInMainWorld('electronAPI', api);