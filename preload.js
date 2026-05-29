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
    updateArtworkForTray: (imageData) => ipcRenderer.send('update-artwork-for-tray', imageData),
    getArtworkFromServer: () => ipcRenderer.invoke('get-artwork-from-server'),
    onOpenUrl: (callback) => ipcRenderer.on('open-url', callback),
    onOpenHomePage: (callback) => ipcRenderer.on('open-home-page', callback),
    onOpenExternalUrl: (callback) => ipcRenderer.on('open-external-url', callback),
};


// Экспортируем API (только один раз!)
contextBridge.exposeInMainWorld('electronAPI', api);