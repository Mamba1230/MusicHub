const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

  windowCtrl: (cmd) => ipcRenderer.send('window-ctrl', cmd),
  toggleMini: (isMini) => ipcRenderer.send('toggle-mini', isMini),
  setAutostart: (enabled) => ipcRenderer.send('set-autostart', enabled),
  restoreWindow: (bounds) => ipcRenderer.send('restore-window', bounds),


  onMinimizeWindow: (callback) => ipcRenderer.on('minimize-window', callback),
  onGlobalSwitch: (callback) => ipcRenderer.on('global-switch', callback),
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


  steamLogin: () => ipcRenderer.invoke('steam-login'),
  

openExternal: (url) => ipcRenderer.invoke('open-external', url)
});