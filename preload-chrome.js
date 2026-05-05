// preload-chrome.js – эмуляция минимальных Chrome API, чтобы обмануть магазин
window.chrome = window.chrome || {};
window.chrome.runtime = {
    id: 'fake-extension-id',
    getManifest: () => ({ name: 'MusicHub', version: '1.0' }),
    sendMessage: () => {},
    onMessage: { addListener: () => {} }
};
window.chrome.management = {
    getAll: () => Promise.resolve([]),
    get: () => Promise.resolve(null),
    install: () => Promise.reject('Not allowed'),
    uninstall: () => Promise.reject('Not allowed')
};
// Добавляем фиктивные API, которые может проверять магазин
window.navigator.userAgent = navigator.userAgent + ' Chrome/120.0.0.0';