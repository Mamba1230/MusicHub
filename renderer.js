 // renderer.js
        let audioContext = null;
        let analyser = null;
        let source = null;
        let animationFrame = null;
        let mediaStream = null;
        let vizSensitivity = 1;
        let currentDeviceId = '';
        let useFakeVisualizer = true;
        let currentVizMode = 'bars';
        let currentBtnEffect = 'pulse';

        let audioMode = 0;

        let soundEnabled = true;
        let soundType = 'beep1';
        
        let isFullscreen = false;
        let fullscreenAnimationFrame = null;
        
        let particleBackground = null;

        let globalUpdateStatsUI = null;
        globalUpdateStatsUI = updateStatsUI;

        let lastActiveBeforeTemp = null;
        
        let tempWebviewOpened = false;

        let globalSaveTrackToHistory = null;
        let globalShowHomePage = null;

        let scriptProcessorNode = null;
        let audioQueue = [];
        let queueProcessorActive = false;
        let sharedSampleRate = 48000;
        let sharedChannels = 2;

        let isMediaPlaying = false;
        let currentMediaVolume = 100;
        let mediaStatusInterval = null;


        let lastMentionedArtist = null; // Хранит последнего упомянутого исполнителя
let chatHistory = []; // История диалога для контекста
const MAX_HISTORY = 10; // Сколько последних сообщений хранить

        const services = [
            { id: 'yandex', name: 'Яндекс Музыка', url: 'https://music.yandex.ru', icon: 'Y' },
            { id: 'youtube', name: 'YouTube Music', url: 'https://music.youtube.com', icon: 'YT' },
            { id: 'soundcloud', name: 'SoundCloud', url: 'https://soundcloud.com/stream', icon: 'SC' },
            { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', icon: 'S' },
            { id: 'vk', name: 'VK Music', url: 'https://vk.com/audio', icon: 'VK' }
        ];
        
        let activeServices = ['yandex', 'youtube'];

        let premiumStatus = null;

        let globalHideHomePage = null;

        let globalIsOnHomePage = false;

let aiRequestCount = 0;
const PREMIUM_WORKER = 'https://premium-api.170610maksim.workers.dev';

openExternal: (url) => ipcRenderer.invoke('open-external', url)

// В renderer.js, добавляем глобальную функцию для тестирования
window.testStartupPage = function(page) {
    console.log(`🧪 Тест: устанавливаю startupPage = ${page}`);
    saveStartupPageSetting(page);
    showToast(`🧪 Установлено: ${page === 'last' ? 'Последний сервис' : 'Домашняя страница'}`, 'info');
    
    // Проверяем сохранение
    setTimeout(() => {
        const saved = localStorage.getItem('startupPage');
        console.log(`📋 В localStorage: ${saved}`);
    }, 500);
};

// Проверка при загрузке
console.log('📋 Текущая startupPage в localStorage:', localStorage.getItem('startupPage'));

window.debugBindings = function() {
    console.log('=== ОТЛАДКА БИНДОВ ===');
    console.log('electronAPI:', window.electronAPI);
    console.log('updateTabBinding функция:', window.electronAPI?.updateTabBinding);
    
    const savedBinding = localStorage.getItem('tabBinding');
    const savedEnabled = localStorage.getItem('tabBindingEnabled');
    console.log('Сохраненное сочетание:', savedBinding);
    console.log('Сохраненное включение:', savedEnabled);
    
    // Отправляем принудительно
    if (window.electronAPI && window.electronAPI.updateTabBinding) {
        window.electronAPI.updateTabBinding({ 
            enabled: savedEnabled !== 'false', 
            binding: savedBinding || 'Control+Tab' 
        });
        console.log('✅ Отправлено в main');
    }
};

// Вызов через 2 секунды после загрузки
setTimeout(() => {
    window.debugBindings();
}, 2000);


const COMMAND_CODES = {
    PLAY: '🎵[CMD:PLAY]',
    PAUSE: '🎵[CMD:PAUSE]',
    STOP: '🎵[CMD:STOP]',
    NEXT: '🎵[CMD:NEXT]',
    PREV: '🎵[CMD:PREV]',
    VOLUME_UP: '🎵[CMD:VOLUP]',
    VOLUME_DOWN: '🎵[CMD:VOLDOWN]',
    VOLUME_SET: '🎵[CMD:VOLSET:',
    MUTE: '🎵[CMD:MUTE]',
    UNMUTE: '🎵[CMD:UNMUTE]',
    TOGGLE: '🎵[CMD:TOGGLE]',
};

// Отправка команд в VolumeController
async function sendMediaCommand(command) {
    try {
        let result;
        switch(command) {
            case 'playpause': 
                result = await window.electronAPI.mediaPlayPause(); 
                break;
            case 'stop': 
                result = await window.electronAPI.mediaStop(); 
                break;
            case 'next': 
                result = await window.electronAPI.mediaNext(); 
                break;
            case 'previous': 
                result = await window.electronAPI.mediaPrevious(); 
                break;
            default: return false;
        }
        return result;
    } catch (err) {
        console.error('Ошибка отправки команды:', err);
        return false;
    }
}

// Установка громкости
async function setMediaVolume(percent) {
    const volume = Math.max(0, Math.min(1, percent / 100));
    currentMediaVolume = percent;
    
    try {
        const response = await fetch('http://localhost:9876/set-volume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume })
        });
        const data = await response.json();
        if (data.success) {
            syncVolumeUI(percent);
        }
        return data.success;
    } catch (err) {
        console.error('Ошибка установки громкости:', err);
        return false;
    }
}


// Обновление UI громкости
function updateVolumeUI(percent) {
    const slider = document.getElementById('homeVolumeSlider');
    const display = document.getElementById('homeVolumeDisplay');
    if (slider) slider.value = percent;
    if (display) display.textContent = `${percent}%`;
    currentMediaVolume = percent;
}

// Обновление кнопки Play/Pause
function updatePlayButton(isPlayingState) {
    const playBtn = document.getElementById('mediaPlayBtn');
    const playIcon = document.getElementById('playIcon');
    const playLabel = document.getElementById('playLabel');
    const statusEl = document.getElementById('mediaStatus');
    
    isMediaPlaying = isPlayingState;
    
    if (!playBtn || !playIcon || !playLabel) return;
    
    if (isPlayingState) {
        playIcon.textContent = '⏸';
        playLabel.textContent = 'Пауза';
        playBtn.classList.add('playing');
        if (statusEl) {
            statusEl.textContent = '▶️ Воспроизводится';
            statusEl.className = 'media-status-playing';
        }
    } else {
        playIcon.textContent = '▶';
        playLabel.textContent = 'Воспроизвести';
        playBtn.classList.remove('playing');
        if (statusEl) {
            statusEl.textContent = '⏸ На паузе';
            statusEl.className = 'media-status-paused';
        }
    }
}

// ========== ОСНОВНЫЕ ДЕЙСТВИЯ ==========

async function handlePlayPause() {
    const success = await sendMediaCommand('playpause');
    if (success) {
        updatePlayButton(!isMediaPlaying);
        if (typeof showToast === 'function') {
            showToast(isMediaPlaying ? '⏸ Пауза' : '▶️ Воспроизведение', 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('❌ Не удалось переключить воспроизведение', 'error');
        }
    }
    return success;
}

async function handleStop() {
    const success = await sendMediaCommand('stop');
    if (success) {
        updatePlayButton(false);
        const statusEl = document.getElementById('mediaStatus');
        if (statusEl) {
            statusEl.textContent = '⏹ Остановлено';
            statusEl.className = 'media-status-stopped';
        }
        if (typeof showToast === 'function') {
            showToast('⏹ Воспроизведение полностью остановлено', 'info');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('❌ Не удалось остановить', 'error');
        }
    }
    return success;
}

async function handleNext() {
    const success = await sendMediaCommand('next');
    if (success) {
        if (typeof showToast === 'function') {
            showToast('⏭ Следующий трек', 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('❌ Не удалось переключить', 'error');
        }
    }
    return success;
}

async function handlePrevious() {
    const success = await sendMediaCommand('previous');
    if (success) {
        if (typeof showToast === 'function') {
            showToast('⏮ Предыдущий трек', 'success');
        }
    } else {
        if (typeof showToast === 'function') {
            showToast('❌ Не удалось переключить', 'error');
        }
    }
    return success;
}

// ========== ПАРСИНГ КОМАНД ==========

function parseAICommand(text) {
    if (!text) return [];
    
    const commands = [];
    
    if (text.includes(COMMAND_CODES.PLAY)) commands.push({ command: 'play', raw: COMMAND_CODES.PLAY });
    if (text.includes(COMMAND_CODES.PAUSE)) commands.push({ command: 'pause', raw: COMMAND_CODES.PAUSE });
    if (text.includes(COMMAND_CODES.STOP)) commands.push({ command: 'stop', raw: COMMAND_CODES.STOP });
    if (text.includes(COMMAND_CODES.NEXT)) commands.push({ command: 'next', raw: COMMAND_CODES.NEXT });
    if (text.includes(COMMAND_CODES.PREV)) commands.push({ command: 'prev', raw: COMMAND_CODES.PREV });
    if (text.includes(COMMAND_CODES.VOLUME_UP)) commands.push({ command: 'volume_up', raw: COMMAND_CODES.VOLUME_UP });
    if (text.includes(COMMAND_CODES.VOLUME_DOWN)) commands.push({ command: 'volume_down', raw: COMMAND_CODES.VOLUME_DOWN });
    if (text.includes(COMMAND_CODES.MUTE)) commands.push({ command: 'mute', raw: COMMAND_CODES.MUTE });
    if (text.includes(COMMAND_CODES.UNMUTE)) commands.push({ command: 'unmute', raw: COMMAND_CODES.UNMUTE });
    if (text.includes(COMMAND_CODES.TOGGLE)) commands.push({ command: 'toggle', raw: COMMAND_CODES.TOGGLE });
    
    const volMatch = text.match(/🎵\[CMD:VOLSET:(\d+)\]/);
    if (volMatch) {
        const vol = parseInt(volMatch[1]);
        if (!isNaN(vol) && vol >= 0 && vol <= 100) {
            commands.push({ command: 'volume_set', value: vol, raw: volMatch[0] });
        }
    }
    
    return commands;
}

// Выполнение команд из нейросети
async function executeAICommands(commands) {
    if (!commands || commands.length === 0) return [];
    
    const results = [];
    for (const cmd of commands) {
        try {
            let result = false;
            
            switch(cmd.command) {
                case 'play':
                    if (!isMediaPlaying) result = await handlePlayPause();
                    else result = true;
                    break;
                case 'pause':
                    if (isMediaPlaying) result = await handlePlayPause();
                    else result = true;
                    break;
                case 'stop':
                    result = await handleStop();
                    break;
                case 'next':
                    result = await handleNext();
                    break;
                case 'prev':
                    result = await handlePrevious();
                    break;
                case 'volume_up':
                    const volUp = Math.min(100, currentMediaVolume + 10);
                    result = await setMediaVolume(volUp);
                    updateVolumeUI(volUp);
                    break;
                case 'volume_down':
                    const volDown = Math.max(0, currentMediaVolume - 10);
                    result = await setMediaVolume(volDown);
                    updateVolumeUI(volDown);
                    break;
                case 'volume_set':
                    result = await setMediaVolume(cmd.value);
                    updateVolumeUI(cmd.value);
                    break;
                case 'mute':
                    result = await setMediaVolume(0);
                    updateVolumeUI(0);
                    break;
                case 'unmute':
                    const savedVol = parseInt(localStorage.getItem('mediaVolume')) || 50;
                    result = await setMediaVolume(savedVol);
                    updateVolumeUI(savedVol);
                    break;
                case 'toggle':
                    result = await handlePlayPause();
                    break;
                default:
                    console.log('Неизвестная команда:', cmd.command);
            }
            
            results.push({ command: cmd.command, success: result });
        } catch (err) {
            console.error('Ошибка выполнения команды:', cmd.command, err);
            results.push({ command: cmd.command, success: false, error: err.message });
        }
    }
    return results;
}

// Обработчик ответа нейросети
function handleAIResponse(responseText) {
    if (!responseText) return { text: '', commands: [] };
    
    const commands = parseAICommand(responseText);
    
    if (commands && commands.length > 0) {
        executeAICommands(commands).then(results => {
            console.log('📊 Результаты выполнения команд:', results);
        });
        
        let cleanText = responseText;
        for (const cmd of commands) {
            cleanText = cleanText.replace(cmd.raw, '');
        }
        cleanText = cleanText.replace(/\s+/g, ' ').trim();
        
        return {
            text: cleanText || '✅ Команда выполнена!',
            commands: commands
        };
    }
    
    return { text: responseText, commands: [] };
}

// Обработчик команд из чата
async function handleChatAICommand(message) {
    const commands = parseAICommand(message);
    
    if (commands && commands.length > 0) {
        const results = await executeAICommands(commands);
        const cleanText = message.replace(/🎵\[CMD:[^\]]+\]/g, '').trim();
        return {
            text: cleanText || '✅ Команда выполнена!',
            results: results
        };
    }
    
    return null;
}

// ========== ИНИЦИАЛИЗАЦИЯ МЕДИА-УПРАВЛЕНИЯ ==========

function initMediaControls() {
    const playBtn = document.getElementById('mediaPlayBtn');
    const stopBtn = document.getElementById('mediaStopBtn');
    const nextBtn = document.getElementById('mediaNextBtn');
    const prevBtn = document.getElementById('mediaPrevBtn');
    const volumeSlider = document.getElementById('homeVolumeSlider');
    const aiInput = document.getElementById('aiCommandInput');
    const aiBtn = document.getElementById('aiCommandBtn');

    if (playBtn) playBtn.onclick = handlePlayPause;
    if (stopBtn) stopBtn.onclick = handleStop;
    if (nextBtn) nextBtn.onclick = handleNext;
    if (prevBtn) prevBtn.onclick = handlePrevious;

    if (volumeSlider) {
        volumeSlider.oninput = async (e) => {
            const val = parseInt(e.target.value);
            await setMediaVolume(val);
            syncVolumeUI(val);
        };
        const savedVol = parseInt(localStorage.getItem('mediaVolume')) || 100;
        volumeSlider.value = savedVol;
        const display = document.getElementById('homeVolumeDisplay');
        if (display) display.textContent = `${savedVol}%`;
    }

    if (aiBtn && aiInput) {
        aiBtn.onclick = () => {
            const text = aiInput.value.trim();
            if (text) {
                const commands = parseAICommand(text);
                if (commands.length > 0) {
                    executeAICommands(commands);
                    const resultDiv = document.getElementById('aiCommandResult');
                    if (resultDiv) {
                        resultDiv.textContent = `✅ Выполнено: ${commands.map(c => c.command).join(', ')}`;
                    }
                } else {
                    if (typeof askGigaChat === 'function') {
                        askGigaChat(text);
                    }
                }
                aiInput.value = '';
            }
        };
        aiInput.onkeypress = (e) => {
            if (e.key === 'Enter') aiBtn.click();
        };
    }

    document.querySelectorAll('.quick-ai-btn').forEach(btn => {
        btn.onclick = async () => {
            const command = btn.dataset.command;
            const commands = [{ command: command, raw: '' }];
            await executeAICommands(commands);
            const resultDiv = document.getElementById('aiCommandResult');
            if (resultDiv) {
                resultDiv.textContent = `✅ Выполнено: "${command}"`;
            }
        };
    });

    console.log('🎵 Медиа-управление инициализировано');
    console.log('🎮 Горячие клавиши управляются через настройки');
}

// Обработчик горячих клавиш
if (window.electronAPI && window.electronAPI.onHotkeyPressed) {
    window.electronAPI.onHotkeyPressed((event, action) => {
        console.log(`🎯 Получена горячая клавиша из main: ${action}`);
        
        switch(action) {
            case 'playpause':
                handlePlayPause();
                break;
            case 'next':
                handleNext();
                break;
            case 'prev':
                handlePrevious();
                break;
            case 'stop':
                handleStop();
                break;
            case 'volumeup':
                const sliderUp = document.getElementById('homeVolumeSlider');
                if (sliderUp) {
                    const newVal = Math.min(100, parseInt(sliderUp.value) + 10);
                    sliderUp.value = newVal;
                    sliderUp.dispatchEvent(new Event('input'));
                    showToast(`🔊 Громкость: ${newVal}%`, 'info');
                }
                break;
            case 'volumedown':
                const sliderDown = document.getElementById('homeVolumeSlider');
                if (sliderDown) {
                    const newVal = Math.max(0, parseInt(sliderDown.value) - 10);
                    sliderDown.value = newVal;
                    sliderDown.dispatchEvent(new Event('input'));
                    showToast(`🔉 Громкость: ${newVal}%`, 'info');
                }
                break;
            default:
                console.log(`⚠️ Неизвестное действие: ${action}`);
        }
    });
}

console.log('🎮 Обработчик горячих клавиш из main зарегистрирован');

function getKeyName(key) {
    // === СПЕЦИАЛЬНЫЕ КЛАВИШИ ===
    const specialKeys = {
        ' ': 'Space',
        'Tab': 'Tab',
        'Escape': 'Escape',
        'Enter': 'Enter',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Insert': 'Insert',
        'Home': 'Home',
        'End': 'End',
        'PageUp': 'PageUp',
        'PageDown': 'PageDown',
        'ArrowUp': 'ArrowUp',
        'ArrowDown': 'ArrowDown',
        'ArrowLeft': 'ArrowLeft',
        'ArrowRight': 'ArrowRight',
        'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
        'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
        'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
        'MediaTrackNext': 'MediaTrackNext',
        'MediaTrackPrevious': 'MediaTrackPrevious',
        'MediaPlayPause': 'MediaPlayPause',
        'MediaStop': 'MediaStop',
        'VolumeUp': 'VolumeUp',
        'VolumeDown': 'VolumeDown',
        'VolumeMute': 'VolumeMute',
        'NumLock': 'NumLock',
        'CapsLock': 'CapsLock',
        'ScrollLock': 'ScrollLock',
        'PrintScreen': 'PrintScreen',
        'Pause': 'Pause',
        'ContextMenu': 'ContextMenu',
    };
    
    // === NUMPAD КЛАВИШИ ===
    // Клавиши с Numpad имеют свойство key: "1", "2", "3" и т.д.
    // Но чтобы их отличить от верхнего ряда, нужно проверить location === 3 (DOM_KEY_LOCATION_NUMPAD)
    // Однако в событии keydown мы получаем просто "1", "2"... 
    // Поэтому определяем по коду клавиши (code)
    const numpadMap = {
        'Numpad0': 'Numpad0',
        'Numpad1': 'Numpad1',
        'Numpad2': 'Numpad2',
        'Numpad3': 'Numpad3',
        'Numpad4': 'Numpad4',
        'Numpad5': 'Numpad5',
        'Numpad6': 'Numpad6',
        'Numpad7': 'Numpad7',
        'Numpad8': 'Numpad8',
        'Numpad9': 'Numpad9',
        'NumpadAdd': 'NumpadAdd',
        'NumpadSubtract': 'NumpadSubtract',
        'NumpadMultiply': 'NumpadMultiply',
        'NumpadDivide': 'NumpadDivide',
        'NumpadDecimal': 'NumpadDecimal',
        'NumpadEnter': 'NumpadEnter',
    };
    
    // Проверяем специальные клавиши
    if (specialKeys[key]) return specialKeys[key];
    
    // Проверяем Numpad (по коду, а не по key)
    // В событии keydown можно получить code через event.code
    // Мы передаём key, но в коде ниже мы будем использовать event.code
    
    // Цифры и буквы (1 символ) — возвращаем в верхнем регистре
    if (key.length === 1) {
        // Проверяем, не является ли это цифрой с Numpad (через event.code)
        // Но мы не можем проверить code здесь, поэтому делаем отдельную обработку в событии
        return key.toUpperCase();
    }
    
    // Если ничего не подошло — возвращаем как есть
    return key;
}

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ КОНСОЛИ ==========

window.mediaControls = {
    play: handlePlayPause,
    stop: handleStop,
    next: handleNext,
    prev: handlePrevious,
    volume: (percent) => {
        setMediaVolume(percent);
        updateVolumeUI(percent);
    },
    ai: (command) => {
        const commands = parseAICommand(command);
        if (commands.length > 0) {
            executeAICommands(commands);
        } else if (typeof askGigaChat === 'function') {
            askGigaChat(command);
        }
    },
    parseCommand: parseAICommand
};

console.log('🎮 Доступно: mediaControls.play(), .stop(), .next(), .prev(), .volume(50), .ai("команда")');

// ========== АВТОЗАПУСК МЕДИА-УПРАВЛЕНИЯ ==========

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initMediaControls, 500);
    });
} else {
    setTimeout(initMediaControls, 500);
}


function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
}

function getTopArtistsByTime(limit = 5) {
    const artistStats = JSON.parse(localStorage.getItem('artistListenTimeSeconds') || '{}');
    return Object.entries(artistStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, seconds]) => ({ 
            name, 
            seconds,
            minutes: Math.floor(seconds / 60),
            formatted: formatTime(seconds)
        }));
}

function getDetailedStatsForLastDays(days = 7) {
    const dailyTime = JSON.parse(localStorage.getItem('dailyListenTimeSeconds') || '{}');
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('ru', { weekday: 'short' });
        const seconds = dailyTime[dateStr] || 0;
        result.push({
            date: dateStr,
            dayName: dayName,
            seconds: seconds,
            formatted: formatTime(seconds)
        });
    }
    return result;
}

function getTotalListenTime() {
    const seconds = parseInt(localStorage.getItem('totalListenTimeSeconds') || '0');
    return {
        seconds: seconds,
        minutes: Math.floor(seconds / 60),
        hours: Math.floor(seconds / 3600),
        formatted: formatTime(seconds)
    };
}

// Добавление времени исполнителю (только если >= 30 секунд)
function addListenTimeToArtist(artist, seconds) {
    if (!artist || artist === 'Неизвестен') return;
    if (seconds < 30) {
        console.log(`⏭️ Пропущено ${seconds} сек (меньше 30) для ${artist}`);
        return;
    }
    
    let artistStats = JSON.parse(localStorage.getItem('artistListenTimeSeconds') || '{}');
    artistStats[artist] = (artistStats[artist] || 0) + seconds;
    
    const sorted = Object.entries(artistStats).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 50) {
        const toKeep = Object.fromEntries(sorted.slice(0, 50));
        localStorage.setItem('artistListenTimeSeconds', JSON.stringify(toKeep));
    } else {
        localStorage.setItem('artistListenTimeSeconds', JSON.stringify(artistStats));
    }
    
    // Обновляем дневную статистику
    updateDailyStats(seconds);
    
    console.log(`📊 +${seconds} сек (${Math.floor(seconds/60)} мин) для ${artist}`);
}

function addTotalListenTime(seconds) {
    if (seconds < 30) return;
    const total = parseInt(localStorage.getItem('totalListenTimeSeconds') || '0');
    localStorage.setItem('totalListenTimeSeconds', total + seconds);
}

function updateDailyStats(seconds) {
    const today = new Date().toISOString().split('T')[0];
    const dailyTime = JSON.parse(localStorage.getItem('dailyListenTimeSeconds') || '{}');
    dailyTime[today] = (dailyTime[today] || 0) + seconds;
    localStorage.setItem('dailyListenTimeSeconds', JSON.stringify(dailyTime));
}



async function getDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = crypto.randomUUID ? crypto.randomUUID() : 'device_' + Math.random().toString(36).substr(2, 16);
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
}

async function checkPremiumStatus() {
    try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${PREMIUM_WORKER}/status`, {
            headers: { 'X-Device-Id': deviceId }
        });
        premiumStatus = await response.json();
        localStorage.setItem('premium_status', JSON.stringify(premiumStatus));
        updatePremiumUI();
        return premiumStatus;
    } catch (err) {
        console.error('Premium check error:', err);
        const cached = localStorage.getItem('premium_status');
        if (cached) premiumStatus = JSON.parse(cached);
        return premiumStatus || { isPremium: true, daysLeft: 7 };
    }
}

async function checkAILimit() {
    try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${PREMIUM_WORKER}/ai-count`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Device-Id': deviceId 
            },
            body: JSON.stringify({ action: 'check' })
        });
        const data = await response.json();
        aiRequestCount = data.count;
        return data;
    } catch (err) {
        console.error('AI limit check error:', err);
        return { canUse: true, remaining: 10 };
    }
}

async function incrementAICount() {
    try {
        const deviceId = await getDeviceId();
        const response = await fetch(`${PREMIUM_WORKER}/ai-count`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Device-Id': deviceId 
            },
            body: JSON.stringify({ action: 'increment' })
        });
        const data = await response.json();
        aiRequestCount = data.count;
        return data;
    } catch (err) {
        console.error('AI increment error:', err);
        return { canUse: true };
    }
}

function hasFeature(feature) {
    if (!premiumStatus) return true;
    if (premiumStatus.isPremium) return true;
    
    const freeFeatures = {
        'basic_viz': true,       
        'chat': true,
        'basic_services': true,
        'custom_sites': false,
        'full_viz': false,
        'ai': false,
        'screenshot': false,
        'gif_viz': false
    };
    
    return freeFeatures[feature] === true;
}

function updatePremiumUI() {
    const isPremium = premiumStatus?.isPremium || true; // По умолчанию true для гостя
    
    if (isPremium) {
        premiumStatusDiv.innerHTML = `⭐ Premium активен (Гостевой режим)`;
        premiumStatusDiv.style.color = 'gold';
    } else {
        premiumStatusDiv.innerHTML = `🎵 Бесплатная версия`;
    }
    
    // Убрать кнопку выхода
    document.getElementById('logoutHeaderBtn')?.remove();
}

function closePremiumModal() {
    document.getElementById('premiumModal').style.display = 'none';
}



        
         
        class ParticleBackground {
            constructor() {
                this.canvas = document.createElement('canvas');
                this.canvas.id = 'particle-bg';
                this.ctx = this.canvas.getContext('2d');
                document.body.insertBefore(this.canvas, document.body.firstChild);
                this.particles = [];
                this.colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9'];
                this.init();
                this.animate();
                window.addEventListener('resize', () => this.resize());
            }
            
            init() {
                this.resize();
                for(let i = 0; i < 150; i++) {
                    this.particles.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        radius: Math.random() * 4 + 1,
                        alpha: Math.random() * 0.5,
                        speedX: (Math.random() - 0.5) * 0.3,
                        speedY: (Math.random() - 0.5) * 0.2,
                        color: this.colors[Math.floor(Math.random() * this.colors.length)]
                    });
                }
            }
            
            resize() {
                this.width = window.innerWidth;
                this.height = window.innerHeight;
                this.canvas.width = this.width;
                this.canvas.height = this.height;
            }
            
            animate() {
                this.ctx.clearRect(0, 0, this.width, this.height);
                this.particles.forEach(p => {
                    p.x += p.speedX;
                    p.y += p.speedY;
                    if(p.x < -50) p.x = this.width + 50;
                    if(p.x > this.width + 50) p.x = -50;
                    if(p.y < -50) p.y = this.height + 50;
                    if(p.y > this.height + 50) p.y = -50;
                    
                    this.ctx.beginPath();
                    this.ctx.fillStyle = p.color;
                    this.ctx.globalAlpha = p.alpha * 0.4;
                    this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                     
                    this.particles.forEach(p2 => {
                        const dx = p.x - p2.x;
                        const dy = p.y - p2.y;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        if(dist < 100) {
                            this.ctx.beginPath();
                            this.ctx.strokeStyle = p.color;
                            this.ctx.globalAlpha = 0.1 * (1 - dist/100);
                            this.ctx.lineWidth = 0.5;
                            this.ctx.moveTo(p.x, p.y);
                            this.ctx.lineTo(p2.x, p2.y);
                            this.ctx.stroke();
                        }
                    });
                });
                requestAnimationFrame(() => this.animate());
            }
        }

         
function showToast(message, type = 'info', playSound = false) {
    if (playSound && notifySoundEnabled) {
        playNotificationSound();
    }
    
    if (!showNotifications) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '🎵';
    toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-message">${message}</div>
        <div class="toast-progress"></div>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }, 10);
}

         
        let isPlaying = false;
        
function doMusicAction(action) {
    const webview = document.querySelector('webview.active');
    if (!webview) {
        console.log('❌ Нет активного webview');
        showToast('❌ Нет активного сервиса', 'error');
        return;
    }
    
    console.log('🎮 Выполняем действие:', action, 'в', webview.id);
    
     
    const selectors = {
         
        youtube: {
            playpause: [
                '.ytp-play-button',
                '[aria-label="Play"]',
                '[aria-label="Воспроизвести"]',
                '[aria-label="Pause"]',
                '[aria-label="Пауза"]'
            ],
            next: ['.ytp-next-button', '[aria-label="Next"]', '[aria-label="Следующий"]'],
            previous: ['.ytp-prev-button', '[aria-label="Previous"]', '[aria-label="Предыдущий"]']
        },
         
        yandex: {
            playpause: [
                '.player-controls__btn_play',
                '.player-controls__btn_pause',
                '[data-testid="play-button"]',
                '[data-testid="pause-button"]'
            ],
            next: ['.player-controls__btn_next', '[data-testid="next-button"]'],
            previous: ['.player-controls__btn_prev', '[data-testid="previous-button"]']
        },
         
        spotify: {
            playpause: [
                '[data-testid="play-button"]',
                '[data-testid="pause-button"]',
                '[aria-label="Play"]',
                '[aria-label="Pause"]'
            ],
            next: ['[data-testid="next-button"]', '[aria-label="Next"]'],
            previous: ['[data-testid="previous-button"]', '[aria-label="Previous"]']
        },
         
        soundcloud: {
            playpause: ['.playControl', '.playbackControl'],
            next: ['.skipControl__next', '.nextButton'],
            previous: ['.skipControl__previous', '.prevButton']
        },
         
        vk: {
            playpause: ['.audio_play', '.audio_pause', '.play_btn'],
            next: ['.audio_next', '.next_btn'],
            previous: ['.audio_prev', '.prev_btn']
        }
    };
    
     
    let service = webview.id;
    if (!selectors[service]) {
         
        service = 'yandex';
    }
    
    const actionSelectors = selectors[service]?.[action];
    if (!actionSelectors || actionSelectors.length === 0) {
        console.log('❌ Нет селекторов для', action);
        return;
    }
    
     
    const jsCode = `
        (function() {
            const selectors = ${JSON.stringify(actionSelectors)};
            
             
            for (let selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    console.log('✅ Нажата кнопка:', selector);
                    return { success: true, selector: selector };
                }
            }
            
             
            const allButtons = document.querySelectorAll('button, [role="button"], .player-controls__btn, .ytp-button');
            for (let btn of allButtons) {
                const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
                if (action === 'playpause' && (label.includes('play') || label.includes('пауз') || label.includes('воспроиз') || label === 'play' || label === 'pause')) {
                    btn.click();
                    return { success: true, method: 'label', label: label };
                }
                if (action === 'next' && (label.includes('next') || label.includes('след') || label === 'next')) {
                    btn.click();
                    return { success: true, method: 'label', label: label };
                }
                if (action === 'previous' && (label.includes('previous') || label.includes('пред') || label === 'previous')) {
                    btn.click();
                    return { success: true, method: 'label', label: label };
                }
            }
            
            return { success: false };
        })();
    `;
}  


         
        function captureVisualizer() {
    if (!hasFeature('screenshot')) {
        showToast('⭐ Скриншоты доступны в Premium версии', 'info');
        return;
    }
    
    const canvas = isFullscreen ? 
        document.getElementById('viz-fullscreen-canvas') : 
        document.getElementById('visualizer');
    
    if(canvas) {
        const link = document.createElement('a');
        link.download = `visualizer-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
        showToast('📸 Скриншот сохранен!', 'success');
    }
}

         
        function changeThemeWithAnimation(theme) {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: ${theme === 'dark' ? '#000' : '#fff'};
                z-index: 9999;
                pointer-events: none;
                animation: themeFlash 0.4s ease-out;
            `;
            document.body.appendChild(overlay);
            
            setTimeout(() => {
                changeTheme(theme);
                setTimeout(() => overlay.remove(), 400);
            }, 200);
            showToast(`🌓 Тема изменена на ${theme === 'dark' ? 'темную' : 'светлую'}`, 'info');
        }
        
        function changeTheme(theme) {
            document.body.className = theme + '-theme';
            localStorage.setItem('theme', theme);
        }

         
        function createGlobalRipple(e) {
             
            if(e.target.closest('button') || e.target.closest('.nav-btn') || e.target.closest('.util-btn')) {
                return;
            }
            const ripple = document.createElement('div');
            ripple.className = 'global-ripple';
            ripple.style.left = (e.clientX - 50) + 'px';
            ripple.style.top = (e.clientY - 50) + 'px';
            ripple.style.width = '100px';
            ripple.style.height = '100px';
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }

         
function playTone(ctx, freq, duration) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playNoise(ctx, duration) {
    const bufferSize = 4096;
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    noise.buffer = buffer;
    const gain = ctx.createGain();
    noise.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    noise.start();
    noise.stop(ctx.currentTime + duration);
}

function playSweep(ctx, startFreq, endFreq, duration) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

        let lastSoundTime = 0;
const SOUND_COOLDOWN = 200;

function playSwitchSound() {
    if (!soundEnabled) return;
    
    const now = Date.now();
    if (now - lastSoundTime < SOUND_COOLDOWN) return;
    lastSoundTime = now;
    
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        switch(soundType) {
            case 'beep1':
                playTone(audioCtx, 600, 0.05);
                break;
            case 'beep2':
                playTone(audioCtx, 800, 0.03);
                setTimeout(() => playTone(audioCtx, 1000, 0.03), 50);
                break;
            case 'click':
                playNoise(audioCtx, 0.02);
                break;
            case 'whoosh':
                playSweep(audioCtx, 200, 800, 0.1);
                break;
            default:
                playTone(audioCtx, 600, 0.05);
        }
    } catch (e) {
        console.log('Аудио эффекты не поддерживаются');
    }
}


         
        function loadSettings() {
            const savedColor = localStorage.getItem('hubC') || '#1DB954';
            const autoColorEnabled = localStorage.getItem('autoColorFromArtwork') === 'true';
            const savedZoom = localStorage.getItem('hubZoom') || '1.0';
            const savedSensitivity = localStorage.getItem('vizSensitivity') || '1';
            const savedVizMode = localStorage.getItem('vizMode') || 'bars';
            const savedBtnEffect = localStorage.getItem('btnEffect') || 'pulse';
            const savedTheme = localStorage.getItem('theme') || 'dark';
            const savedServices = localStorage.getItem('activeServices');
            const savedSound = localStorage.getItem('switchSound') || 'beep1';
            const savedNotifySound = localStorage.getItem('notifySound') || 'beep1';
            const savedShowNotifications = localStorage.getItem('showNotifications') !== 'false';
            
            if (savedServices) {
                activeServices = JSON.parse(savedServices);
            }
            
            changeAccentColor(savedColor);
            document.getElementById('autoColorFromArtwork').checked = autoColorEnabled;
            document.getElementById('cp').value = savedColor;
            document.getElementById('zoom-select').value = savedZoom;
            document.getElementById('viz-sensitivity').value = savedSensitivity;
            document.getElementById('viz-mode').value = savedVizMode;
            document.getElementById('btn-effect').value = savedBtnEffect;
            document.getElementById('theme-select').value = savedTheme;
            document.getElementById('sound-select').value = savedSound;
            document.getElementById('notify-sound-select').value = savedNotifySound;
            document.getElementById('showNotificationsCheckbox').checked = savedShowNotifications;
            
            vizSensitivity = parseFloat(savedSensitivity);
            currentVizMode = savedVizMode;
            currentBtnEffect = savedBtnEffect;

            notifySoundType = savedNotifySound;
            notifySoundEnabled = savedNotifySound !== 'off';
            showNotifications = savedShowNotifications;
            
            soundType = savedSound;
            soundEnabled = savedSound !== 'off';
        const savedUserColor = localStorage.getItem('hubC') || '#1DB954';
    originalAccentColor = savedUserColor;
    
    // Загружаем настройки градиента и авто-цвета
    initSimpleGradient();
    loadAutoColorSetting();
            
            changeTheme(savedTheme);
            
            setTimeout(() => {
                const activeBtn = document.querySelector('.nav-btn.active');
                if (activeBtn) {
                    activeBtn.setAttribute('data-effect', currentBtnEffect);
                }
            }, 100);
        }

         
function initSidebarResizer() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
     
    const oldResizer = document.querySelector('.sidebar-resizer');
    if (oldResizer) oldResizer.remove();
    
     
    const resizer = document.createElement('div');
    resizer.className = 'sidebar-resizer';
    sidebar.appendChild(resizer);
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let overlay = null;
    
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'ew-resize';
        overlay.style.backgroundColor = 'transparent';
        document.body.appendChild(overlay);
        return overlay;
    }
    
    function removeOverlay() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    }
    
    function onMouseDown(e) {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        sidebar.classList.add('resizing');
        
        createOverlay();
        overlay.addEventListener('mousemove', onMouseMove);
        overlay.addEventListener('mouseup', onMouseUp);
        
        e.preventDefault();
        e.stopPropagation();
    }
    
    function onMouseMove(e) {
        if (!isResizing) return;
        
        let delta = e.clientX - startX;
        let newWidth = startWidth + delta;
        
         
        newWidth = Math.min(280, Math.max(50, newWidth));
        
        sidebar.style.width = newWidth + 'px';
        
         
        localStorage.setItem('sidebarWidth', newWidth);
    }
    
    function onMouseUp(e) {
        if (!isResizing) return;
        
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        sidebar.classList.remove('resizing');
        
        removeOverlay();
        
         
        const finalWidth = sidebar.offsetWidth;
        localStorage.setItem('sidebarWidth', finalWidth);
        
        e.preventDefault();
    }
    
     
    resizer.addEventListener('mousedown', onMouseDown);
    
     
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) {
        const width = parseInt(savedWidth);
        if (!isNaN(width) && width >= 50 && width <= 280) {
            sidebar.style.width = width + 'px';
        } else {
            sidebar.style.width = '60px';
        }
    } else {
        sidebar.style.width = '60px';
    }
}

         
        async function loadAudioDevices() {
            try {
                const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                tempStream.getTracks().forEach(track => track.stop());
                
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                
                const select = document.getElementById('audio-device');
                select.innerHTML = '<option value="">🔇 Выключено</option>';
                
                audioInputs.forEach(device => {
                    const option = document.createElement('option');
                    option.value = device.deviceId;
                    let label = device.label || 'Микрофон';
                    if (label.toLowerCase().includes('cable') || label.toLowerCase().includes('vb-audio')) {
                        label = '🎵 ' + label;
                    }
                    option.textContent = label;
                    select.appendChild(option);
                });
                
                const savedDevice = localStorage.getItem('audioDevice');
                if (savedDevice) {
                    select.value = savedDevice;
                    await selectAudioDevice(savedDevice);
                }
                
            } catch (error) {
                console.log('Нет доступа к микрофону');
            }
        }

         
async function selectAudioDevice(deviceId) {
    // Если мы в Modern-режиме – полностью игнорируем выбор микрофона
    if (audioMode !== 0) return;

    try {
        if (!deviceId) {
            useFakeVisualizer = true;
            if (analyser) analyser = null;
            startVisualizer();
            updateAudioStatus();
            return;
        }

        // Сохраняем только в localStorage
        localStorage.setItem('selectedMicDeviceId', deviceId);

        // НЕ отправляем fetch – конфиг обновляется только при смене режима

        // Создаём поток из микрофона
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        if (!modernAudioCtx) {
            modernAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        const micAnalyser = modernAudioCtx.createAnalyser();
        micAnalyser.fftSize = 1024;
        micAnalyser.smoothingTimeConstant = 0.4;
        const source = modernAudioCtx.createMediaStreamSource(stream);
        source.connect(micAnalyser);

        analyser = micAnalyser;
        useFakeVisualizer = false;
        startVisualizer();
        updateAudioStatus();

    } catch (err) {
        console.error('❌ Ошибка выбора микрофона:', err);
        useFakeVisualizer = true;
        analyser = null;
        startVisualizer();
    }
}

         
        function initTitlebarEqualizer() {
            const eqBars = document.querySelectorAll('.eq-bar');
            function updateEq() {
                if(analyser && !useFakeVisualizer && eqBars.length) {
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(data);
                    for(let i = 0; i < eqBars.length; i++) {
                        const height = (data[i * 4] / 255) * 20;
                        eqBars[i].style.height = Math.max(3, height) + 'px';
                    }
                } else {
                    for(let i = 0; i < eqBars.length; i++) {
                        const height = Math.sin(Date.now() * 0.005 + i) * 10 + 12;
                        eqBars[i].style.height = Math.max(3, height) + 'px';
                    }
                }
                requestAnimationFrame(updateEq);
            }
            updateEq();
        }

         
function drawVisualization(ctx, width, height, accentColor, dataArray, isFullscreenMode = false) {
    const sensitivity = vizSensitivity * (isFullscreenMode ? 1.5 : 1);
    const time = Date.now() * 0.005;
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2 - 20;

    if (currentVizMode !== 'gif') {
        const gifOverlay = document.getElementById('gifOverlay');
        if (gifOverlay) gifOverlay.style.display = 'none';
    }

    let avgVolume = 0.5;
    if (dataArray) {
        let sum = 0;
        for (let i = 0; i < Math.min(dataArray.length, 64); i++) sum += dataArray[i];
        avgVolume = (sum / 64 / 255) * sensitivity;
        avgVolume = Math.min(1, Math.max(0.1, avgVolume));
    } else {
        avgVolume = (Math.sin(time) * 0.5 + 0.5) * sensitivity;
    }

    // Функция для получения hue из акцентного цвета (приблизительно)
    function getHueFromAccent() {
        let r, g, b;
        if (accentColor.startsWith('#')) {
            r = parseInt(accentColor.slice(1,3), 16);
            g = parseInt(accentColor.slice(3,5), 16);
            b = parseInt(accentColor.slice(5,7), 16);
        } else if (accentColor.startsWith('rgb')) {
            const match = accentColor.match(/\d+/g);
            r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2]);
        } else {
            return 120;
        }
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let hue = 0;
        if (max === min) hue = 0;
        else if (max === r) hue = 60 * ((g - b) / (max - min));
        else if (max === g) hue = 60 * (2 + (b - r) / (max - min));
        else hue = 60 * (4 + (r - g) / (max - min));
        if (hue < 0) hue += 360;
        return hue;
    }
    const baseHue = getHueFromAccent();

    switch(currentVizMode) {
        case 'gif':
            const gifOverlay = document.getElementById('gifOverlay');
            if (!currentGifUrl || !gifOverlay.src || currentGifUrl === 'undefined') {
                ctx.fillStyle = accentColor;
                ctx.font = '12px monospace';
                ctx.fillText('Выберите GIF в настройках', 10, 30);
                if (gifOverlay) gifOverlay.style.display = 'none';
                break;
            }
            gifOverlay.style.display = 'block';
            let gifIntensity = 0.5;
            if (dataArray) {
                let sum = 0;
                for (let i = 0; i < Math.min(dataArray.length, 32); i++) sum += dataArray[i];
                gifIntensity = Math.min(1, Math.max(0.05, (sum / 32 / 255) * sensitivity));
            } else {
                gifIntensity = (Math.sin(time) * 0.5 + 0.5) * sensitivity;
            }
            let scale, rotation, opacity;
            if (gifIntensity < 0.05) { scale = 0.02; opacity = 0.02; rotation = 0; }
            else {
                let t = (gifIntensity - 0.05) / 0.95;
                scale = 0.02 + Math.pow(t, 0.6) * 1.18;
                rotation = (gifIntensity - 0.5) * 2.5;
                opacity = 0.05 + Math.pow(t, 0.7) * 0.9;
            }
            gifOverlay.style.transform = `scale(${scale}) rotate(${rotation}rad)`;
            gifOverlay.style.filter = `drop-shadow(0 0 ${gifIntensity * 30}px ${accentColor})`;
            gifOverlay.style.opacity = opacity;
            ctx.clearRect(0, 0, width, height);
            break;

case 'galaxy':
    const galaxyStars = isFullscreenMode ? 200 : 100;
    for (let i = 0; i < galaxyStars; i++) {
        let intensity;
        if (dataArray) intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
        else intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
        const angle = i * 137.5 * Math.PI / 180;
        const radius = (maxRadius * 0.3) + intensity * maxRadius * 0.7;
        const x = centerX + Math.cos(angle + time) * radius;
        const y = centerY + Math.sin(angle + time) * radius;
        const size = 1 + intensity * 3;
        ctx.beginPath();
        // Просто используем accentColor как в других визуализациях
        ctx.fillStyle = accentColor;
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }
    break;

case 'aurora':
    for (let i = 0; i < width; i += 3) {
        let intensity;
        if (dataArray) {
            const dataIndex = Math.floor((i / width) * dataArray.length);
            intensity = (dataArray[dataIndex] / 255) * sensitivity;
        } else {
            intensity = (Math.sin(time + i * 0.03) * 0.5 + 0.5) * sensitivity;
        }
        const waveY = centerY - (intensity * height * 0.4) + Math.sin(i * 0.03 + time * 2) * 20;
        ctx.beginPath();
        const gradient = ctx.createLinearGradient(0, waveY - 20, 0, waveY + 20);
        // Просто используем accentColor с разной прозрачностью
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, `rgba(0, 0, 0, 0.3)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(i, waveY - 15, 2, 30);
    }
    break;

case 'vortex':
    const vortexPoints = isFullscreenMode ? 360 : 180;
    for (let i = 0; i < vortexPoints; i++) {
        let intensity;
        if (dataArray) intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
        else intensity = (Math.sin(time * 2 + i * 0.05) * 0.5 + 0.5) * sensitivity;
        const angle = (i / vortexPoints) * Math.PI * 2 + time * 2;
        const radius = maxRadius * (0.2 + intensity * 0.8);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;
        
        // Смешиваем акцентный цвет с чёрным в зависимости от радиуса
        const t = radius / maxRadius; // от 0 до 1
        let r, g, b;
        if (accentColor.startsWith('#')) {
            r = parseInt(accentColor.slice(1,3), 16);
            g = parseInt(accentColor.slice(3,5), 16);
            b = parseInt(accentColor.slice(5,7), 16);
        } else {
            r = 29; g = 185; b = 84;
        }
        const gradR = Math.floor(r * (1 - t) + 0 * t);
        const gradG = Math.floor(g * (1 - t) + 0 * t);
        const gradB = Math.floor(b * (1 - t) + 0 * t);
        ctx.beginPath();
        ctx.fillStyle = `rgb(${gradR}, ${gradG}, ${gradB})`;
        ctx.arc(x, y, 2 + intensity * 5, 0, Math.PI * 2);
        ctx.fill();
    }
    break;

case 'starburst':
    const rays = isFullscreenMode ? 48 : 32;
    for (let i = 0; i < rays; i++) {
        let intensity;
        if (dataArray) intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
        else intensity = (Math.sin(time * 3 + i) * 0.5 + 0.5) * sensitivity;
        const angle = (i / rays) * Math.PI * 2;
        const rayLength = maxRadius * (0.3 + intensity * 0.7);
        const x2 = centerX + Math.cos(angle) * rayLength;
        const y2 = centerY + Math.sin(angle) * rayLength;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(x2, y2);
        
        // Создаём тёмный оттенок акцентного цвета
        let r, g, b;
        if (accentColor.startsWith('#')) {
            r = parseInt(accentColor.slice(1,3), 16);
            g = parseInt(accentColor.slice(3,5), 16);
            b = parseInt(accentColor.slice(5,7), 16);
        } else if (accentColor.startsWith('rgb')) {
            const match = accentColor.match(/\d+/g);
            r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2]);
        } else {
            r = 29; g = 185; b = 84;
        }
        const darkAccent = `rgba(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)}, 0.9)`;
        
        const grad = ctx.createLinearGradient(centerX, centerY, x2, y2);
        grad.addColorStop(0, accentColor);
        grad.addColorStop(1, darkAccent);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2 + intensity * 8;
        ctx.stroke();
    }
    break;

        case 'bars':
            const barCount = isFullscreenMode ? 48 : 16;
            const barWidth = width / barCount;
            for (let i = 0; i < barCount; i++) {
                let value;
                if (dataArray) {
                    const dataIndex = Math.floor((i / barCount) * dataArray.length);
                    value = (dataArray[dataIndex] / 255) * height * sensitivity;
                } else {
                    value = (Math.sin(time + i * 0.3) * 0.5 + 0.5) * height * sensitivity;
                }
                const barHeight = Math.min(height - 10, Math.max(3, value));
                const x = i * barWidth;
                const y = height - barHeight;
                ctx.fillStyle = accentColor;
                ctx.shadowBlur = isFullscreenMode ? 15 : 5;
                ctx.fillRect(x, y, barWidth - 1, barHeight);
            }
            break;

        case 'wave':
            ctx.beginPath();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = isFullscreenMode ? 3 : 2;
            if (dataArray) {
                for (let i = 0; i < dataArray.length; i += 2) {
                    const x = (i / dataArray.length) * width;
                    const y = height / 2 + (dataArray[i] / 255 - 0.5) * height * sensitivity;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            } else {
                for (let i = 0; i < width; i += 5) {
                    const y = height/2 + Math.sin(i * 0.05 + time) * (height * 0.3) * sensitivity;
                    if (i === 0) ctx.moveTo(i, y);
                    else ctx.lineTo(i, y);
                }
            }
            ctx.stroke();
            break;

        case 'circle':
            ctx.beginPath();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = isFullscreenMode ? 4 : 2;
            for (let i = 0; i < 32; i++) {
                let value;
                if (dataArray) value = dataArray[i * 2] / 255;
                else value = (Math.sin(time + i * 0.2) + 1) / 2;
                const angle = (i / 32) * Math.PI * 2;
                const radius = maxRadius * (0.3 + value * 0.7 * sensitivity);
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            break;

        case 'dots':
            const dotCount = isFullscreenMode ? 16 : 8;
            for (let i = 0; i < dotCount; i++) {
                let value;
                if (dataArray) value = dataArray[i * 8] / 255;
                else value = (Math.sin(time + i) * 0.5 + 0.5);
                const x = isFullscreenMode ? 30 + (i * (width - 60) / dotCount) : 20 + (i * 15);
                const y = height / 2 + (dataArray ? 0 : Math.sin(time * 2 + i) * 10);
                ctx.beginPath();
                ctx.fillStyle = accentColor;
                ctx.arc(x, y, (isFullscreenMode ? 6 : 3) + value * (isFullscreenMode ? 15 : 8), 0, Math.PI * 2);
                ctx.fill();
            }
            break;

        case 'particles':
            const particleCount = isFullscreenMode ? 50 : 25;
            for (let i = 0; i < particleCount; i++) {
                let intensity;
                if (dataArray) {
                    const dataIndex = Math.floor((i / particleCount) * dataArray.length);
                    intensity = (dataArray[dataIndex] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
                }
                if (intensity > 0.1) {
                    const angle = (i / particleCount) * Math.PI * 2 + time;
                    const radius = 20 + intensity * 40;
                    const x = centerX + Math.cos(angle) * radius;
                    const y = centerY + Math.sin(angle) * radius;
                    ctx.beginPath();
                    ctx.fillStyle = accentColor;
                    ctx.arc(x, y, 2 + intensity * 6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            break;

        case 'radial':
            let avg = avgVolume;
            const pulseRadius = maxRadius * (0.3 + avg * 0.7);
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulseRadius * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 12; i++) {
                let intensity;
                if (dataArray) intensity = (dataArray[i * 4] / 255) * sensitivity;
                else intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
                const angle = (i / 12) * Math.PI * 2;
                const spokeLength = intensity * maxRadius * 0.5;
                const x1 = centerX + Math.cos(angle) * pulseRadius * 0.8;
                const y1 = centerY + Math.sin(angle) * pulseRadius * 0.8;
                const x2 = centerX + Math.cos(angle) * (pulseRadius + spokeLength);
                const y2 = centerY + Math.sin(angle) * (pulseRadius + spokeLength);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            break;

        default:
            // fallback на bars
            const fallbackBars = isFullscreenMode ? 32 : 12;
            const fw = width / fallbackBars;
            for (let i = 0; i < fallbackBars; i++) {
                let val = dataArray ? (dataArray[i*2] / 255) * height * sensitivity : (Math.sin(time + i) * 0.5 + 0.5) * height * sensitivity;
                ctx.fillStyle = accentColor;
                ctx.fillRect(i * fw, height - val, fw - 1, val);
            }
    }
    ctx.shadowBlur = 0;
}

        function startVisualizer() {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            
            const canvas = document.getElementById('visualizer');
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            function draw() {
                if (isFullscreen) return;
                ctx.clearRect(0, 0, width, height);
                const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#1DB954';
                
                if (analyser && !useFakeVisualizer) {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(dataArray);
                    drawVisualization(ctx, width, height, accentColor, dataArray, false);
                } else {
                    drawVisualization(ctx, width, height, accentColor, null, false);
                }
                animationFrame = requestAnimationFrame(draw);
            }
            draw();
        }

        function stopAudioCapture() {
            if (mediaStream) {
                mediaStream.getTracks().forEach(t => t.stop());
                mediaStream = null;
            }
            if (source) {
                source.disconnect();
                source = null;
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
            analyser = null;
        }

         
        function expandVisualizer() {
            if (isFullscreen) return;
            
            const overlay = document.createElement('div');
            overlay.className = 'viz-fullscreen-overlay';
            
            const canvas = document.createElement('canvas');
            canvas.className = 'viz-fullscreen-canvas';
            const size = Math.min(window.innerWidth, window.innerHeight) * 0.8;
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = '80vmin';
            canvas.style.height = '80vmin';
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.className = 'viz-fullscreen-btn';
            closeBtn.onclick = () => closeFullscreen();
            
            const modeBtn = document.createElement('button');
            modeBtn.textContent = '🎨';
            modeBtn.className = 'viz-mode-btn';
            modeBtn.onclick = () => {
                const modes = ['bars', 'wave', 'circle', 'dots', 'particles', 'radial', 'galaxy', 'aurora', 'vortex', 'starburst', 'gif'];
                const currentIndex = modes.indexOf(currentVizMode);
                const nextMode = modes[(currentIndex + 1) % modes.length];
                changeVizMode(nextMode);
                document.getElementById('viz-mode').value = nextMode;
                showToast(`🎨 Режим: ${nextMode}`, 'info');
            };
            
            overlay.appendChild(canvas);
            overlay.appendChild(closeBtn);
            overlay.appendChild(modeBtn);
            document.body.appendChild(overlay);
            
            isFullscreen = true;
            startFullscreenVisualizer(canvas);
            showToast('✨ Полноэкранный режим', 'success');
        }

        function closeFullscreen() {
    if (!isFullscreen) return;
    if (fullscreenAnimationFrame) cancelAnimationFrame(fullscreenAnimationFrame);
    const overlay = document.querySelector('.viz-fullscreen-overlay');
    if (overlay) overlay.remove();
    isFullscreen = false;
    startVisualizer();
}

        function startFullscreenVisualizer(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
     
    const mainGifOverlay = document.getElementById('gifOverlay');
    if (mainGifOverlay) mainGifOverlay.style.display = 'none';
    
     
    let fullscreenGif = null;
if (currentGifUrl && currentVizMode === 'gif') {
    fullscreenGif = document.createElement('img');
    fullscreenGif.src = currentGifUrl;
    fullscreenGif.style.position = 'absolute';
    fullscreenGif.style.top = '50%';
    fullscreenGif.style.left = '50%';
    fullscreenGif.style.transform = 'translate(-50%, -50%)';
    fullscreenGif.style.maxWidth = '90%';
    fullscreenGif.style.maxHeight = '90%';
    fullscreenGif.style.minWidth = '300px';
    fullscreenGif.style.minHeight = '300px';
    fullscreenGif.style.width = 'auto';
    fullscreenGif.style.height = 'auto';
    fullscreenGif.style.objectFit = 'contain';
    fullscreenGif.style.borderRadius = '20px';
    document.querySelector('.viz-fullscreen-overlay').appendChild(fullscreenGif);
}
    
    function draw() {
        if (!isFullscreen) return;
        ctx.clearRect(0, 0, width, height);
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#1DB954';
        
        if (currentVizMode === 'gif' && fullscreenGif) {
             
            let gifIntensity = 0.5;
            if (analyser && !useFakeVisualizer) {
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < Math.min(dataArray.length, 32); i++) sum += dataArray[i];
                gifIntensity = Math.min(1, Math.max(0.05, (sum / 32 / 255) * vizSensitivity));
            }
            
            let scale, rotation, opacity;
            if (gifIntensity < 0.05) {
                 
                scale = 0.5;
                rotation = 0;
                opacity = 0;
            } else {
                 
                scale = 0.6 + gifIntensity * 0.6;
                rotation = (gifIntensity - 0.5) * 0.4;
                opacity = 0.8 + gifIntensity * 0.2;
            }
            
             
            fullscreenGif.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rotation}rad)`;
            fullscreenGif.style.filter = `drop-shadow(0 0 ${gifIntensity * 25}px ${accentColor})`;
            fullscreenGif.style.opacity = opacity;
            
        } else if (analyser && !useFakeVisualizer) {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            drawVisualization(ctx, width, height, accentColor, dataArray, true);
        } else {
            drawVisualization(ctx, width, height, accentColor, null, true);
        }
        
        fullscreenAnimationFrame = requestAnimationFrame(draw);
    }
    draw();
}

         
        function renderServicesList() {
    const list = document.getElementById('services-list');
    if (!list) return;
    list.innerHTML = '';
    
     
    services.forEach(service => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = service.id;
        checkbox.checked = activeServices.includes(service.id);
        checkbox.addEventListener('change', (e) => toggleService(service.id, e.target));
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' ' + service.name));
        list.appendChild(label);
    });
    
     
    customSites.forEach((site, i) => {
        const customId = `custom_${i}`;
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = customId;
        checkbox.checked = activeServices.includes(customId);
        checkbox.addEventListener('change', (e) => toggleService(customId, e.target));
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` 🌐 ${site.name || 'Новый сайт'}`));
        list.appendChild(label);
    });
}

        function toggleService(serviceId, checkboxEl) {
    const isCustom = serviceId.startsWith('custom_');
    
    if (activeServices.includes(serviceId)) {
        if (activeServices.length <= 1) {
            alert('Должен остаться хотя бы один сервис');
            checkboxEl.checked = true;
            return;
        }
        activeServices = activeServices.filter(id => id !== serviceId);
    } else {
        if (activeServices.length >= 2) {
            alert('Можно выбрать только 2 сервиса');
            checkboxEl.checked = false;
            return;
        }
        activeServices.push(serviceId);
    }
    localStorage.setItem('activeServices', JSON.stringify(activeServices));
    
    renderServices();
    
     
    if (isCustom && activeServices.includes(serviceId)) {
        const customIndex = parseInt(serviceId.split('_')[1]);
        const customSite = customSites[customIndex];
        if (customSite && !document.getElementById(serviceId)) {
            const wv = document.createElement('webview');
            wv.id = serviceId;
            wv.src = customSite.url;
            wv.partition = 'persist:custom';
            document.getElementById('content').appendChild(wv);
        }
    }
    
    showToast('📱 Сервисы обновлены', 'info');
}

function renderServices() {
    const container = document.getElementById('services-container');
    if (!container) return;
    container.innerHTML = '';
    
    activeServices.forEach(serviceId => {
        if (serviceId.startsWith('custom_')) {
            const customIndex = parseInt(serviceId.split('_')[1]);
            const site = customSites[customIndex];
            if (site && site.name) {
                addServiceButton(serviceId, '🌐', site.name);
            }
        } else {
            const service = services.find(s => s.id === serviceId);
            if (service) {
                addServiceButton(serviceId, service.icon, service.name);
            }
        }
    });
    
    createWebviews();
}

function createWebviews() {
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = '';
    
    activeServices.forEach((serviceId, index) => {
        let wv = null;
        
        if (serviceId.startsWith('custom_')) {
            const customIndex = parseInt(serviceId.split('_')[1]);
            const site = customSites[customIndex];
            if (site && site.url) {
                wv = document.createElement('webview');
                wv.id = serviceId;
                wv.src = site.url;
                wv.partition = 'persist:custom';
                wv.className = index === 0 ? 'active' : '';
                
                // Добавляем инжект скрипта для контроля громкости
                wv.addEventListener('dom-ready', () => {
                    wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
                });
            }
        } else {
            const service = services.find(s => s.id === serviceId);
            if (service) {
                wv = document.createElement('webview');
                wv.id = serviceId;
                wv.src = service.url;
                wv.partition = 'persist:music';
                wv.className = index === 0 ? 'active' : '';
                
                wv.addEventListener('dom-ready', () => {
                    wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
                });
            }
        }
        
        if (wv) {
            content.appendChild(wv);
        }
    });
}

async function forceSetVolume(volume) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const webviews = document.querySelectorAll('webview');
    
    console.log(`🔊 Устанавливаю громкость ${Math.round(clampedVolume * 100)}% на ${webviews.length} webview`);
    
    for (const webview of webviews) {
        try {
            // Проверяем, активен ли webview (не скрыт)
            const isVisible = webview.classList.contains('active') || 
                             window.getComputedStyle(webview).display !== 'none';
            
            // Применяем ко всем, но лог только для активных
            await webview.executeJavaScript(`
                (function() {
                    let changed = 0;
                    document.querySelectorAll('audio, video').forEach(media => {
                        if (Math.abs(media.volume - ${clampedVolume}) > 0.01) {
                            media.volume = ${clampedVolume};
                            changed++;
                        }
                    });
                    return changed;
                })();
            `).catch(e => console.log('JS error:', e));
            
            try { webview.setAudioVolume(clampedVolume); } catch(e) {}
            
        } catch(e) {
            console.log('Webview error:', e);
        }
    }
    
    currentVolume = clampedVolume;
    
    const volDisplay = document.getElementById('currentVolumeDisplay');
    if (volDisplay) volDisplay.textContent = Math.round(clampedVolume * 100);
}

// Функция изменения громкости во всех webview (РАБОЧАЯ)
function setAllWebviewVolume(volume) {
    forceSetVolume(volume);
    currentVolume = volume;
    
    const volDisplay = document.getElementById('currentVolumeDisplay');
    if (volDisplay) volDisplay.textContent = Math.round(volume * 100);
}

// Обновляем applyVolumeToAllMedia
function applyVolumeToAllMedia(volume) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    currentVolume = clampedVolume;
    setAllWebviewVolume(clampedVolume);
    
    const volDisplay = document.getElementById('currentVolumeDisplay');
    if (volDisplay) volDisplay.textContent = Math.round(clampedVolume * 100);
}


function sw(id, btn) {
    if (globalIsOnHomePage && typeof hideHomePage === 'function') hideHomePage();
    if (tempWebviewOpened) closeTempWebview();
    if (globalHideHomePage) globalHideHomePage();
    
    // Закрываем временный webview если открыт
    if (tempWebviewOpened) {
        closeTempWebview();
    }

    localStorage.setItem('lastActiveService', id);
     
    if (id.startsWith('custom_')) {
        const customIndex = parseInt(id.split('_')[1]);
        const site = customSites[customIndex];
        if (site && !document.getElementById(id)) {
            createCustomWebview(id, site.url);
        }
    }
        if (globalHideHomePage) globalHideHomePage();
    


    
    document.querySelectorAll('webview').forEach(v => {
        if (v.classList.contains('active') && v.id !== id) {
            v.classList.add('exiting-left');
            setTimeout(() => v.classList.remove('exiting-left'), 400);
        }
    });
    document.querySelectorAll('webview').forEach(v => {
        if (v.id !== id) {
            freezeWebview(v);
            v.classList.remove('active');
        } else {
            unfreezeWebview(v);
            v.classList.add('active');
        }
    });
    document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.remove('active');
        const effectLayer = b.querySelector('.effect-layer');
        if (effectLayer) effectLayer.className = 'effect-layer none';
    });
    btn.classList.add('active');
    const activeEffectLayer = btn.querySelector('.effect-layer');
    if (activeEffectLayer) activeEffectLayer.className = `effect-layer ${currentBtnEffect}`;
    if (soundEnabled) setTimeout(() => playSwitchSound(), 50);
    createRipple(btn);
    showToast(`🎵 ${services.find(s => s.id === id)?.name || btn.title || 'Кастомный сайт'}`, 'success');
   
   
    setTimeout(() => {
        updateUrlBar();
    }, 500);
}

        function rs(id) {
    const wv = document.getElementById(id);
    if (wv) {
        wv.reload();
        showToast(`🔄 Сервис обновлён`, 'success');
    }
}

        function reloadPage() {
            const activeWv = document.querySelector('webview.active');
            if (activeWv) activeWv.reload();
            showToast('🔄 Страница обновлена', 'success');
        }

        function createRipple(btn) {
            const ripple = document.createElement('div');
            ripple.className = 'ripple';
            const rect = btn.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = (rect.width / 2 - size / 2) + 'px';
            ripple.style.top = (rect.height / 2 - size / 2) + 'px';
            btn.style.position = 'relative';
            btn.appendChild(ripple);
            setTimeout(() => ripple.remove(), 600);
        }

function freezeWebview(webview) {
    if (!webview) return;
    webview.setAudioMuted(true);
    webview.executeJavaScript(`document.querySelectorAll('audio, video').forEach(m => m.pause());`).catch(() => {});
}

function unfreezeWebview(webview) {
    if (!webview) return;
    webview.setAudioMuted(false);
}

         
let isAnimating = false;
let pendingColor = null;

function changeAccentColor(color, animate = true) {
    const currentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#1DB954';
    
    if (!animate || currentColor === color) {
        document.documentElement.style.setProperty('--accent-color', color);
        localStorage.setItem('hubC', color);
        return;
    }
    
    if (isAnimating) {
        pendingColor = color;
        return;
    }
    
    isAnimating = true;
    animateColorChange(currentColor, color, 400).then(() => {
        isAnimating = false;
        localStorage.setItem('hubC', color);
        
        if (pendingColor) {
            const nextColor = pendingColor;
            pendingColor = null;
            changeAccentColor(nextColor, true);
        }
    });
}

        function setZoom(value) {
            document.querySelectorAll('webview').forEach(w => { try { w.setZoomFactor(parseFloat(value)); } catch(e) {} });
            localStorage.setItem('hubZoom', value);
        }

function changeVizMode(mode) {
    const premiumModes = ['galaxy', 'aurora', 'vortex', 'starburst']; // премиум-режимы
    if (premiumModes.includes(mode) && !hasFeature('full_viz')) {
        showToast('⭐ Этот режим визуализации доступен в Premium версии', 'info');
        if (premiumModes.includes(currentVizMode)) {
            currentVizMode = 'bars';
            document.getElementById('viz-mode').value = 'bars';
            localStorage.setItem('vizMode', 'bars');
        }
        return;
    }
    currentVizMode = mode;
    localStorage.setItem('vizMode', mode);
}

        function changeBtnEffect(effect) {
            currentBtnEffect = effect;
            localStorage.setItem('btnEffect', effect);
            document.querySelectorAll('.effect-layer').forEach(el => {
                el.classList.remove('pulse', 'glow', 'none');
                el.classList.add(effect);
            });
        }

        function setSensitivity(value) {
            vizSensitivity = parseFloat(value);
            localStorage.setItem('vizSensitivity', value);
        }

let savedBounds = null;

function toggleMini(btn) {
    const isActive = btn.classList.toggle('active-util');
    console.log('📱 toggleMini вызвана, состояние:', isActive);
    window.electronAPI.toggleMini(isActive);
    showToast(isActive ? '📱 Мини-режим' : '🖥️ Полный режим', 'info');
}

function toggleSettings() {
    const settings = document.getElementById('settings-panel');
    const chatPanel = document.getElementById('chat-panel');
    
    if (chatPanel && chatPanel.classList.contains('visible')) {
        chatPanel.classList.remove('visible');
    }
    
    settings.classList.toggle('visible');
    
    // Обновляем UI аудио при открытии
    if (settings.classList.contains('visible')) {
        setupAudioUI();
        loadModernDevices(); // Перезагружаем устройства
    }
}




        function changeSound(value) {
    const wasEnabled = soundEnabled;
    const oldType = soundType;
    
    soundType = value;
    soundEnabled = value !== 'off';
    localStorage.setItem('switchSound', value);
    
     
    if (soundEnabled && (!wasEnabled || oldType !== value)) {
        setTimeout(() => playSwitchSound(), 50);
    }
}

document.getElementById('resetServicesBtn')?.addEventListener('click', () => {
     
    const defaultServices = ['yandex', 'youtube'];
    
     
    activeServices = [...defaultServices];
    localStorage.setItem('activeServices', JSON.stringify(activeServices));
    

    customSites = [];
localStorage.setItem('customSites', JSON.stringify(customSites));
renderCustomSites();

     
    renderServicesList();   
    renderServices();        
    createWebviews();        
    resetServicesToDefault();
    
     
    document.querySelectorAll('webview[id^="custom_"]').forEach(wv => wv.remove());
    
    showToast('✅ Сервисы сброшены до стандартных (Яндекс Музыка + YouTube Music)', 'success');
});

async function testPremiumExpired() {
    const deviceId = await getDeviceId();
    const response = await fetch('https://premium-api.170610maksim.workers.dev/test-expire', {
        method: 'POST',
        headers: { 'X-Device-Id': deviceId }
    });
    const data = await response.json();
    if (data.success) {
        premiumStatus = { isPremium: false, daysLeft: 0 };
        localStorage.setItem('premium_status', JSON.stringify(premiumStatus));
        updatePremiumUI();
        
         
        if (!hasFeature('full_viz') && currentVizMode !== 'bars') {
            currentVizMode = 'bars';
            document.getElementById('viz-mode').value = 'bars';
            localStorage.setItem('vizMode', 'bars');
        }
        
         
        if (!hasFeature('custom_sites')) {
            customSites = [];
            localStorage.setItem('customSites', JSON.stringify(customSites));
            renderCustomSites();
            renderServices();
        }
        
        showToast('⭐ Premium отключён (тестовый режим)', 'info');
    }
}

function resetServicesToDefault() {
    const defaultServices = ['yandex', 'youtube'];
    
    activeServices = [...defaultServices];
    localStorage.setItem('activeServices', JSON.stringify(activeServices));
    
    customSites = [];
    localStorage.setItem('customSites', JSON.stringify(customSites));
    renderCustomSites();
    
    renderServicesList();
    renderServices();
    createWebviews();
    
    document.querySelectorAll('webview[id^="custom_"]').forEach(wv => wv.remove());
    
    showToast('✅ Сервисы сброшены до стандартных (Яндекс Музыка + YouTube Music)', 'success');
}

document.getElementById('premiumInfoBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('premiumModal');
    if (modal) modal.style.display = 'flex';
});

document.getElementById('premiumModalClose')?.addEventListener('click', () => {
    const modal = document.getElementById('premiumModal');
    if (modal) modal.style.display = 'none';
});

 


document.getElementById('premiumRequestCodeBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('premiumEmail').value;
    if (!email || !email.includes('@')) {
        showToast('Введите корректный email', 'error');
        return;
    }
    
    const deviceId = await getDeviceId();
    
    try {
        const response = await fetch(`${PREMIUM_WORKER}/request-activation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, deviceId })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Код отправлен на почту!', 'success');
            document.getElementById('premiumStep1').style.display = 'none';
            document.getElementById('premiumStep2').style.display = 'block';
        } else {
            showToast(data.error || 'Ошибка', 'error');
        }
    } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
    }
});

document.getElementById('premiumActivateBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('premiumCode').value;
    const email = document.getElementById('premiumEmail').value;
    const deviceId = await getDeviceId();
    
    if (!code || code.length !== 6) {
        showToast('Введите 6-значный код', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${PREMIUM_WORKER}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, email, deviceId })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Premium активирован! Перезагружаем...', 'success');
            localStorage.removeItem('premium_status');
            await checkPremiumStatus();
            document.getElementById('premiumModal').style.display = 'none';
            location.reload();
        } else {
            showToast(data.error || 'Ошибка активации', 'error');
        }
    } catch (err) {
        showToast('Ошибка: ' + err.message, 'error');
    }
});

const premiumInfoBtn = document.getElementById('premiumInfoBtn');
if (premiumInfoBtn) {
    premiumInfoBtn.addEventListener('click', () => {
        const modal = document.getElementById('premiumModal');
        if (modal) {
            modal.style.display = 'flex';
            document.getElementById('premiumStep1').style.display = 'block';
            document.getElementById('premiumStep2').style.display = 'none';
            document.getElementById('premiumEmail').value = '';
            document.getElementById('premiumCode').value = '';
        }
    });
}

 
const premiumModalClose = document.getElementById('premiumModalClose');
if (premiumModalClose) {
    premiumModalClose.addEventListener('click', () => {
        document.getElementById('premiumModal').style.display = 'none';
    });
}

 
const premiumModal = document.getElementById('premiumModal');
if (premiumModal) {
    premiumModal.addEventListener('click', (e) => {
        if (e.target === premiumModal) premiumModal.style.display = 'none';
    });
}

 


const premiumRequestCodeBtn = document.getElementById('premiumRequestCodeBtn');
if (premiumRequestCodeBtn) {
    premiumRequestCodeBtn.addEventListener('click', async () => {
        const email = document.getElementById('premiumEmail').value;
        if (!email || !email.includes('@') || !email.includes('.')) {
            showToast('❌ Введите корректный email', 'error');
            return;
        }
        
        const deviceId = await getDeviceId();
        showToast('📧 Отправляем код...', 'info');
        
        try {
            const response = await fetch(`${PREMIUM_WORKER}/request-activation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, deviceId })
            });
            const data = await response.json();
            
            if (data.success) {
                showToast('✅ Код отправлен на почту!', 'success');
                document.getElementById('premiumEmailDisplay').textContent = email;
                document.getElementById('premiumStep1').style.display = 'none';
                document.getElementById('premiumStep2').style.display = 'block';
            } else {
                showToast(data.error || '❌ Ошибка', 'error');
            }
        } catch (err) {
            showToast('❌ Ошибка соединения с сервером', 'error');
        }
    });
}

 
const premiumActivateBtn = document.getElementById('premiumActivateBtn');
if (premiumActivateBtn) {
    premiumActivateBtn.addEventListener('click', async () => {
        const code = document.getElementById('premiumCode').value;
        const email = document.getElementById('premiumEmail').value;
        const deviceId = await getDeviceId();
        
        if (!code || code.length !== 6) {
            showToast('❌ Введите 6-значный код из письма', 'error');
            return;
        }
        
        showToast('🔍 Проверяем код...', 'info');
        
        try {
            const response = await fetch(`${PREMIUM_WORKER}/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, email, deviceId })
            });
            const data = await response.json();
            
            if (data.success) {
                showToast('✨ Premium активирован! Перезагружаем...', 'success');
                localStorage.removeItem('premium_status');
                await checkPremiumStatus();
                document.getElementById('premiumModal').style.display = 'none';
                location.reload();
            } else {
                showToast(data.error || '❌ Неверный код или код истёк', 'error');
            }
        } catch (err) {
            showToast('❌ Ошибка соединения с сервером', 'error');
        }
    });
}










// ========== УМНАЯ СТАТИСТИКА ==========
let currentTrackStartTime = null;
let currentTrackInfo = null;
let isSoundPlaying = false;
let accumulatedTime = 0;
let soundCheckInterval = null;
let totalListenTime = 0;
let lastSoundCheckTime = null;

// Проверка, играет ли звук
async function isSoundActuallyPlaying() {
    if (!analyser || useFakeVisualizer) return false;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < Math.min(dataArray.length, 32); i++) {
        sum += dataArray[i];
    }
    const avg = sum / 32;
    return avg > 8; // порог наличия звука
}

function saveAccumulatedTime() {
    if (accumulatedTime >= 30 && currentTrackInfo) {
        addListenTimeToArtist(currentTrackInfo.artist, accumulatedTime);
        addTotalListenTime(accumulatedTime);
        console.log(`✅ Засчитано ${accumulatedTime} сек (${Math.floor(accumulatedTime/60)} мин) для ${currentTrackInfo.artist}`);
    } else if (accumulatedTime > 0 && currentTrackInfo) {
        console.log(`⏭️ Не засчитано ${accumulatedTime} сек (меньше 30) для ${currentTrackInfo.artist}`);
    }
    accumulatedTime = 0;
}

// Обновление статистики при смене трека
async function onTrackChanged(title, artist, service) {
    // Сохраняем накопленное время предыдущего трека
    saveAccumulatedTime();
    
    // Начинаем новый трек
    currentTrackInfo = { title, artist, service };
    currentTrackStartTime = Date.now();
    isSoundPlaying = false;
    accumulatedTime = 0;
    
    // Проверяем звук через 2 секунды
    setTimeout(async () => {
        if (currentTrackInfo?.title === title) {
            isSoundPlaying = await isSoundActuallyPlaying();
            if (isSoundPlaying) {
                console.log(`🎵 Реально играет: ${artist} - ${title}`);
                currentTrackStartTime = Date.now();
            } else {
                console.log(`⚠️ Трек не играет (тихо): ${artist} - ${title}`);
            }
        }
    }, 2000);
}

function checkArtistMilestone(artist) {
    const artistStats = JSON.parse(localStorage.getItem('artistListenTime') || '{}');
    const time = artistStats[artist] || 0;
    const hours = Math.floor(time / 3600);
    
    if (hours === 1 || hours === 5 || hours === 10 || hours === 25 || hours === 50 || hours === 100) {
        showToast(`🏆 Достижение! Ты прослушал ${artist} ${hours} ${getHoursWord(hours)}!`, 'success', true);
        if (typeof addChatMessage === 'function') {
            addChatMessage(`🏆 Достижение! Ты прослушал ${artist} ${hours} ${getHoursWord(hours)}!`, false, 'system');
        }
    }
}

function getHoursWord(hours) {
    if (hours % 10 === 1 && hours % 100 !== 11) return 'час';
    if ([2,3,4].includes(hours % 10) && ![12,13,14].includes(hours % 100)) return 'часа';
    return 'часов';
}









// Модифицируем addListenTimeToArtist, чтобы обновляла дневную статистику
const originalAddListenTime = addListenTimeToArtist;
addListenTimeToArtist = function(artist, seconds) {
    originalAddListenTime(artist, seconds);
    updateDailyStats(seconds);
};

// Мониторинг паузы/продолжения трека
function startSoundMonitoring() {
    if (soundCheckInterval) clearInterval(soundCheckInterval);
    
    soundCheckInterval = setInterval(async () => {
        if (!currentTrackInfo) return;
        
        const nowPlaying = await isSoundActuallyPlaying();
        const now = Date.now();
        
        // Звук был, а теперь пропал - пауза (сохраняем накопленное время)
        if (isSoundPlaying && !nowPlaying) {
            const elapsed = Math.floor((now - currentTrackStartTime) / 1000);
            if (elapsed > 0) {
                accumulatedTime += elapsed;
                console.log(`⏸️ Пауза. Накоплено ${accumulatedTime} сек (добавлено ${elapsed} сек)`);
            }
            currentTrackStartTime = null;
        }
        
        // Звука не было, а теперь появился - продолжение того же трека
        if (!isSoundPlaying && nowPlaying && currentTrackStartTime === null && currentTrackInfo) {
            console.log(`▶️ Продолжение: ${currentTrackInfo.artist} - ${currentTrackInfo.title}`);
            currentTrackStartTime = now;
        }
        
        // Звук есть и таймер идёт - просто обновляем (ничего не делаем)
        
        isSoundPlaying = nowPlaying;
    }, 1000);
}

// Инициализация статистики при загрузке
function initSmartStats() {
    startSoundMonitoring();
    loadTrackHistory();
}

// Обновлённая функция saveTrackToHistory (используем умную)
function saveTrackToHistory(title, artist, service) {
    // Сохраняем для истории
    const now = new Date();
    trackHistory.unshift({
        title: title,
        artist: artist,
        timestamp: now.toISOString(),
        service: service
    });
    if (trackHistory.length > 200) trackHistory.pop();
    localStorage.setItem('trackHistory', JSON.stringify(trackHistory));
    
    // Вызываем обработчик смены трека
    onTrackChanged(title, artist, service);
}

// При закрытии приложения сохраняем всё
window.addEventListener('beforeunload', () => {
    if (currentTrackInfo && currentTrackStartTime && isSoundPlaying) {
        const elapsed = Math.floor((Date.now() - currentTrackStartTime) / 1000);
        if (elapsed > 0) {
            accumulatedTime += elapsed;
        }
    }
    saveAccumulatedTime();
    console.log('💾 Статистика сохранена при закрытии');
});















// ========== СТАТИСТИКА И ИСТОРИЯ ==========
let trackHistory = []; // Массив { title, artist, timestamp, service }
let dailyStats = {}; // { "2024-01-01": 15, "2024-01-02": 23 }

// Загрузка истории из localStorage
function loadTrackHistory() {
    const saved = localStorage.getItem('trackHistory');
    if (saved) trackHistory = JSON.parse(saved);
    const savedStats = localStorage.getItem('dailyStats');
    if (savedStats) dailyStats = JSON.parse(savedStats);
}


// Получить топ исполнителей
function getTopArtists(limit = 5) {
    const artistCount = {};
    trackHistory.forEach(track => {
        if (track.artist && track.artist !== 'Неизвестен') {
            artistCount[track.artist] = (artistCount[track.artist] || 0) + 1;
        }
    });
    return Object.entries(artistCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
}

// Получить статистику за последние N дней
function getStatsForLastDays(days = 7) {
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('ru', { weekday: 'short' });
        result.push({
            date: dateStr,
            dayName: dayName,
            count: dailyStats[dateStr] || 0
        });
    }
    return result;
}

// Получить AI-комментарий к статистике
async function getAICommentary() {
    const weekStats = getDetailedStatsForLastDays(7);
    const totalMinutes = weekStats.reduce((sum, d) => sum + Math.floor(d.seconds / 60), 0);
    const avgMinutes = Math.round(totalMinutes / 7);
    const topArtists = getTopArtistsByTime(3);
    
    const todayMinutes = Math.floor(weekStats[weekStats.length - 1]?.seconds / 60) || 0;
    const yesterdayMinutes = Math.floor(weekStats[weekStats.length - 2]?.seconds / 60) || 0;
    const trend = todayMinutes > yesterdayMinutes ? '📈 сегодня слушаешь больше!' : todayMinutes < yesterdayMinutes ? '📉 сегодня немного меньше' : '📊 держишь ритм';
    
    const prompt = `Ты — креативный музыкальный эксперт. Напиши короткий комментарий (2 предложения) о статистике:
🎧 За неделю: ${totalMinutes} минут музыки (${avgMinutes} мин/день)
🏆 Любимые исполнители: ${topArtists.map(a => `${a.name} (${a.minutes} мин)`).join(', ') || 'пока не определились'}
${trend}

Будь остроумным, используй эмодзи. Пиши как человек.`;
    
    
    try {
        const limit = await checkAILimit();
        const isPremium = premiumStatus?.isPremium || false;
        
        if (!isPremium && limit.count >= 10) {
            return getFallbackCommentary(total, topArtists, trend);
        }
        
        const keyResponse = await fetch(`${WORKER_URL}/key`, { headers: { 'X-App-Key': APP_KEY } });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        const authKey = keyData.authKey;
        
        const tokenResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': crypto.randomUUID(), 'Authorization': `Basic ${authKey}` },
            body: 'scope=GIGACHAT_API_PERS',
        });
        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;
        
        const aiResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'GigaChat', messages: [{ role: 'user', content: prompt }], temperature: 0.9, max_tokens: 150 })
        });
        const data = await aiResponse.json();
        await incrementAICount();
        return data.choices?.[0]?.message?.content || getFallbackCommentary(total, topArtists, trend);
    } catch(err) {
        console.log('AI ошибка:', err);
        return getFallbackCommentary(total, topArtists, trend);
    }
}

function getFallbackCommentary(total, topArtists, trend) {
    const funnyMessages = [
        `🎵 ${total} треков за неделю! ${topArtists[0]?.name ? `Ты и ${topArtists[0].name} — не разлей вода!` : 'Музыкальное сердце бьётся в ритме!'} ${trend}`,
        `🔥 ${total} треков — это мощно! ${topArtists[0]?.name ? `${topArtists[0].name} уже в твоём сердечке 🫶` : 'Открываешь что-то новое?'}`,
        `🎧 Вау! ${total} треков за 7 дней. ${topArtists[0]?.name ? `${topArtists[0].name} — твой музыкальный наркотик? 😄` : 'Новый музыкальный рекорд!'}`,
        `💿 ${total} треков! ${trend} ${topArtists[1]?.name ? `И ${topArtists[1].name} тоже в твоём плейлисте 🎸` : ''}`,
        `🎸 Крутой вкус! ${topArtists[0]?.name ? `${topArtists[0].name} явно твой фаворит (${topArtists[0].count} раз!)` : `${total} треков за неделю — ты музыкальный маньяк!`}`
    ];
    return funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
}


function closeTempWebview() {
    if (currentTempWebview && !currentTempWebview.isDestroyed) {
        currentTempWebview.remove();
        currentTempWebview = null;
    }
    
    const closeBtn = document.getElementById('tempCloseBtn');
    if (closeBtn) closeBtn.remove();
    
    tempWebviewOpened = false;
    
    // Восстанавливаем URL бар
    if (globalIsOnHomePage) {
        updateUrlBarForHomePage();
    } else {
        updateUrlBar();
    }
    
    // Возвращаем основные webview
    const webviews = document.querySelectorAll('webview:not(#tempWebview)');
    webviews.forEach(wv => {
        wv.style.opacity = '1';
        wv.style.pointerEvents = 'auto';
    });
}


// Обработчик открытия home page извне
if (window.electronAPI.onOpenHomePage) {
    window.electronAPI.onOpenHomePage(() => {
        console.log('🏠 Получена команда open-home-page');
        if (globalShowHomePage) {
            globalShowHomePage();
        }
    });
}

// Обработчик внешних URL (один, правильный)
// Самый первый обработчик для musichub://
if (window.electronAPI.onOpenExternalUrl) {
    window.electronAPI.onOpenExternalUrl((event, url) => {
        console.log('🔗 RENDERER получил RAW URL:', url);
        
        // Нормализуем URL
        let cleanUrl = normalizeUrl(url);
        
        // Игнорируем пустые
        if (!cleanUrl || cleanUrl === 'home' || cleanUrl === 'home/') {
            if (cleanUrl === 'home' || cleanUrl === 'home/') {
                if (globalShowHomePage) globalShowHomePage();
            }
            return;
        }
        
        // Проверяем, что URL валидный
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            console.log('🚫 Невалидный URL после нормализации:', cleanUrl);
            showToast('❌ Некорректная ссылка', 'error');
            return;
        }
        
        console.log('✅ Открываю URL:', cleanUrl);
        openExternalUrl(cleanUrl);
    });
}

function normalizeUrl(inputUrl) {
    if (!inputUrl) return '';
    
    let url = inputUrl;
    
    // Удаляем musichub:// префикс
    if (url.startsWith('musichub://')) {
        url = url.replace('musichub://', '');
    }
    
    // Исправляем двойные протоколы
    if (url.startsWith('https://https://')) {
        url = url.replace('https://https://', 'https://');
    }
    if (url.startsWith('http://http://')) {
        url = url.replace('http://http://', 'http://');
    }
    if (url.startsWith('https://http://')) {
        url = url.replace('https://http://', 'http://');
    }
    if (url.startsWith('http://https://')) {
        url = url.replace('http://https://', 'https://');
    }
    
    // Исправляем https// (без двоеточия)
    if (url.startsWith('https//')) {
        url = url.replace('https//', 'https://');
    }
    if (url.startsWith('http//')) {
        url = url.replace('http//', 'http://');
    }
    
    // Удаляем лишние слеши после протокола
    url = url.replace(/(https?:\/)[\/]+/g, '$1/');
    
    // Если нет протокола, добавляем https://
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && url.includes('.')) {
        url = 'https://' + url;
    }
    
    console.log('🔄 Нормализация URL:', inputUrl, '→', url);
    return url;
}









// Функция применения страницы запуска
function applyStartupPage(page) {
    startupPage = page;
    localStorage.setItem('startupPage', page);
    
    // Обновляем UI
    const select = document.getElementById('startupPage');
    if (select) select.value = page;
    
    console.log(`📌 Страница запуска: ${page === 'last' ? 'Последний сервис' : 'Домашняя страница'}`);
}

// Функция перехода на стартовую страницу
function goToStartupPage() {
    const page = localStorage.getItem('startupPage') || 'last';
    console.log(`🚀 Переход на страницу запуска: ${page}`);
    
    // Если выбрана домашняя страница
    if (page === 'home') {
        // Проверяем, существует ли homePage в DOM
        let homePage = document.getElementById('homePage');
        
        // Если нет - создаём
        if (!homePage) {
            console.log('🏠 Создаю homePage...');
            createHomePage();
            homePage = document.getElementById('homePage');
        }
        
        // Показываем домашнюю страницу
        if (homePage) {
            // Скрываем все webview
            document.querySelectorAll('webview').forEach(wv => {
                wv.style.opacity = '0';
                wv.style.pointerEvents = 'none';
            });
            
            homePage.style.display = 'block';
            globalIsOnHomePage = true;
            
            // Убираем активные классы с кнопок
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
                const effectLayer = btn.querySelector('.effect-layer');
                if (effectLayer) effectLayer.className = 'effect-layer none';
            });
            
            // Обновляем контент (с проверкой на существование функции)
            if (typeof updateHomeContent === 'function') {
                updateHomeContent();
            } else {
                console.warn('⚠️ updateHomeContent не определена');
            }
            
            updateUrlBarForHomePage();
            
            if (typeof updateStatsUI === 'function') {
                updateStatsUI();
            }
            
            // Инициализируем медиа-управление
            setTimeout(() => {
                initMediaControls();
            }, 100);
            
            console.log('✅ Открыта домашняя страница');
        } else {
            console.error('❌ Не удалось создать homePage');
        }
    } else {
        // Открываем последний активный сервис
        const lastService = localStorage.getItem('lastActiveService') || activeServices[0] || 'yandex';
        console.log(`📱 Открываю последний сервис: ${lastService}`);
        
        // Сначала скрываем homePage если она видна
        const homePage = document.getElementById('homePage');
        if (homePage) {
            homePage.style.display = 'none';
            globalIsOnHomePage = false;
        }
        
        // Показываем webview
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.opacity = '1';
            wv.style.pointerEvents = 'auto';
        });
        
        const btn = document.getElementById(`btn-${lastService}`);
        if (btn && typeof sw === 'function') {
            sw(lastService, btn);
        } else {
            // Если кнопка не найдена, открываем первый сервис
            const firstService = activeServices[0] || 'yandex';
            const firstBtn = document.getElementById(`btn-${firstService}`);
            if (firstBtn && typeof sw === 'function') {
                sw(firstService, firstBtn);
            } else {
                console.warn('⚠️ Не найден ни один сервис');
            }
        }
    }
}

function forceSaveStartupPage(page) {
    // Сохраняем в localStorage
    localStorage.setItem('startupPage', page);
    startupPage = page;
    
    // Обновляем UI
    const select = document.getElementById('startupPage');
    if (select) select.value = page;
    
    // Отправляем в main
    if (window.electronAPI && window.electronAPI.setStartupPage) {
        window.electronAPI.setStartupPage(page);
    }
    
    // Дополнительная проверка - сохраняем в sessionStorage как резерв
    sessionStorage.setItem('startupPage', page);
    
    console.log(`💾 Принудительно сохранена страница запуска: ${page}`);
    console.log(`📋 localStorage: ${localStorage.getItem('startupPage')}`);
    console.log(`📋 sessionStorage: ${sessionStorage.getItem('startupPage')}`);
    
    // Показываем уведомление
    showToast(`📌 Страница запуска: ${page === 'last' ? 'Последний сервис' : 'Домашняя страница'}`, 'success');
}

// Переопределяем функцию saveStartupPageSetting
function saveStartupPageSetting(page) {
    forceSaveStartupPage(page);
}

// Переопределяем testStartupPage
window.testStartupPage = function(page) {
    console.log(`🧪 Тест: устанавливаю startupPage = ${page}`);
    forceSaveStartupPage(page);
    
    // Проверяем сохранение
    setTimeout(() => {
        const saved = localStorage.getItem('startupPage');
        console.log(`📋 В localStorage: ${saved}`);
        console.log(`📋 В sessionStorage: ${sessionStorage.getItem('startupPage')}`);
        
        // Проверяем select
        const select = document.getElementById('startupPage');
        if (select) {
            console.log(`📋 В select: ${select.value}`);
        }
    }, 500);
};

// ========== ОБРАБОТЧИКИ НАСТРОЕК ==========

// Обработчик изменения страницы запуска
document.getElementById('startupPage')?.addEventListener('change', (e) => {
    const page = e.target.value;
    applyStartupPage(page);
    
    // Отправляем в main для сохранения
    if (window.electronAPI && window.electronAPI.setStartupPage) {
        window.electronAPI.setStartupPage(page);
    }
    
    showToast(`📌 Страница запуска: ${page === 'last' ? 'Последний сервис' : 'Домашняя страница'}`, 'info');
});

let startupPageFromMain = null;

// Обработчик из main для инициализации
if (window.electronAPI && window.electronAPI.onInitStartupPage) {
    window.electronAPI.onInitStartupPage((event, page) => {
        console.log(`📥 Получена startupPage из main: ${page}`);
        if (page) {
            startupPageFromMain = page;
            localStorage.setItem('startupPage', page);
            startupPage = page;
            const select = document.getElementById('startupPage');
            if (select) select.value = page;
        }
    });
}
document.addEventListener('DOMContentLoaded', function() {
    // Если еще не пришло из main, берем из localStorage
    if (startupPageFromMain === null) {
        loadStartupPageSetting();
    }

});



let startupPage = 'last';
let isFirstStart = true;

// Загрузка настройки из localStorage
function loadStartupPageSetting() {
    const saved = localStorage.getItem('startupPage');
    if (saved) {
        startupPage = saved;
    } else {
        startupPage = 'last';
        localStorage.setItem('startupPage', 'last');
    }
    
    // Обновляем UI
    const select = document.getElementById('startupPage');
    if (select) {
        select.value = startupPage;
    }
    
    console.log(`📌 Загружена настройка startupPage: ${startupPage}`);
    return startupPage;
}

// Принудительное сохранение (с синхронизацией с main)
function forceSaveStartupPage(page) {
    // Сохраняем в localStorage
    localStorage.setItem('startupPage', page);
    startupPage = page;
    
    // Обновляем UI
    const select = document.getElementById('startupPage');
    if (select) select.value = page;
    
    // Отправляем в main для сохранения в config.json
    if (window.electronAPI && window.electronAPI.setStartupPage) {
        window.electronAPI.setStartupPage(page);
        console.log(`📤 Отправлено в main: ${page}`);
    }
    
    // Дополнительная проверка - сохраняем в sessionStorage как резерв
    sessionStorage.setItem('startupPage', page);
    
    console.log(`💾 Принудительно сохранена страница запуска: ${page}`);
    console.log(`📋 localStorage: ${localStorage.getItem('startupPage')}`);
    
    // Показываем уведомление
    if (typeof showToast === 'function') {
        showToast(`📌 Страница запуска: ${page === 'last' ? 'Последний сервис' : 'Домашняя страница'}`, 'success');
    }
}

// Загружаем настройку при старте
loadStartupPageSetting();

// Обработчик изменения select (гарантированно один)
document.addEventListener('DOMContentLoaded', function() {
    const startupSelect = document.getElementById('startupPage');
    if (startupSelect) {
        // Удаляем старые обработчики, чтобы избежать дублирования
        const newSelect = startupSelect.cloneNode(true);
        startupSelect.parentNode.replaceChild(newSelect, startupSelect);
        
        // Устанавливаем значение из localStorage
        const savedPage = localStorage.getItem('startupPage') || 'last';
        newSelect.value = savedPage;
        console.log(`📌 Select установлен на: ${savedPage}`);
        
        // Обработчик изменения
        newSelect.addEventListener('change', function(e) {
            const page = e.target.value;
            console.log(`🔄 Изменён select на: ${page}`);
            forceSaveStartupPage(page);
        });
    }
});

// Обработчик из main для инициализации (при старте)
if (window.electronAPI && window.electronAPI.onInitStartupPage) {
    window.electronAPI.onInitStartupPage((event, page) => {
        console.log(`📥 Получена startupPage из main: ${page}`);
        if (page) {
            localStorage.setItem('startupPage', page);
            startupPage = page;
            const select = document.getElementById('startupPage');
            if (select) select.value = page;
        }
    });
}

// Тестовая функция для консоли
window.testStartupPage = function(page) {
    console.log(`🧪 Тест: устанавливаю startupPage = ${page}`);
    forceSaveStartupPage(page);
    
    setTimeout(() => {
        const saved = localStorage.getItem('startupPage');
        console.log(`📋 В localStorage: ${saved}`);
        // Проверяем select
        const select = document.getElementById('startupPage');
        if (select) {
            console.log(`📋 В select: ${select.value}`);
        }
    }, 500);
};







































// Обработчики форм
document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    await login(email, password);
});

document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('regEmail').value;
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    
    if (password !== confirm) {
        showToast('Пароли не совпадают', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Пароль должен быть минимум 6 символов', 'error');
        return;
    }
    
    await register(email, password, username);
});

document.getElementById('guestBtn')?.addEventListener('click', async () => {
    await guestLogin();
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await logout();
});

// Обновление UI Premium
function updatePremiumUI() {
    const premiumStatusDiv = document.getElementById('premiumStatus');
    const premiumBuyBtn = document.getElementById('premiumBuyBtn');
    
    if (premiumStatusDiv) {
        if (currentUser?.isPremium) {
            premiumStatusDiv.innerHTML = `⭐ Premium активен (${currentUser.isGuest ? 'Гостевой режим' : currentUser.username})`;
            premiumStatusDiv.style.color = 'gold';
        } else {
            premiumStatusDiv.innerHTML = `🎵 Бесплатная версия. Зарегистрируйтесь!`;
            premiumStatusDiv.style.color = '#888';
        }
    }
    
    // Меняем кнопку "Купить Premium" на "Зарегистрироваться" для гостей
    if (premiumBuyBtn) {
        if (currentUser?.isGuest) {
            premiumBuyBtn.textContent = '📝 Зарегистрироваться';
            premiumBuyBtn.onclick = () => showAuthModal();
        } else if (currentUser) {
            premiumBuyBtn.textContent = '👤 Мой аккаунт';
            premiumBuyBtn.onclick = () => showAuthModal();
        } else {
            premiumBuyBtn.textContent = '🔓 Войти';
            premiumBuyBtn.onclick = () => showAuthModal();
        }
    }
    
    // Показываем/скрываем кнопку выхода
    const logoutBtn = document.getElementById('logoutHeaderBtn');
    if (logoutBtn) {
        logoutBtn.style.display = currentUser && !currentUser.isGuest ? 'block' : 'none';
    }
}



// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = { isGuest: true, username: 'Гость', isPremium: true };
    updatePremiumUI();

    await initAudioSettings();
    
    // Добавляем кнопку выхода в настройки
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel && !document.getElementById('logoutHeaderBtn')) {
        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutHeaderBtn';
        logoutBtn.textContent = '🚪 Выйти из аккаунта';
        logoutBtn.style.cssText = 'background: #ff4444; color: white; margin-top: 10px;';
        logoutBtn.onclick = async () => {
            await logout();
            closeAuthModal();
        };
        logoutBtn.style.display = 'none';
        settingsPanel.appendChild(logoutBtn);
    }

// Логотип M - ждём загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    const homeLogo = document.getElementById('homeLogo');
    if (homeLogo) {
        console.log('✅ Логотип M найден, добавляем обработчик');
        homeLogo.addEventListener('click', () => {
            console.log('🖱️ Клик по логотипу M, globalIsOnHomePage  =', globalIsOnHomePage );
            if (globalIsOnHomePage) {
                hideHomePage();
            } else {
                showHomePage();
            }
        });
    } else {
        console.error('❌ Логотип M не найден в DOM!');
    }
    
    // Также проверяем наличие homePage
    const homePage = document.getElementById('homePage');
    if (homePage) {
        console.log('✅ homePage найдена в DOM');
    } else {
        console.error('❌ homePage не найдена в DOM!');
    }
});


const urlBar = document.querySelector('.url-bar');
if (urlBar) {
    urlBar.style.cursor = 'pointer';
    
    let shiftPressed = false;
    
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') shiftPressed = true;
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') shiftPressed = false;
    });
    
    urlBar.addEventListener('click', async () => {
        let urlToCopy = window.currentUrl;
        
        // Если на домашней странице - копируем musichub://home
        if (globalIsOnHomePage) {
            urlToCopy = 'musichub://home';
        } 
        // Если нет сохранённого URL - пытаемся получить из активного webview
        else if (!urlToCopy || urlToCopy === 'musichub://home') {
            const activeWv = document.querySelector('webview.active');
            if (activeWv) {
                try {
                    urlToCopy = await activeWv.executeJavaScript('window.location.href');
                } catch(e) {
                    const urlText = document.getElementById('urlText')?.innerText;
                    if (urlText) urlToCopy = urlText;
                }
            }
        }
        
        if (urlToCopy && urlToCopy !== 'musichub://home') {
            if (shiftPressed) {
                const musichubUrl = `musichub://${urlToCopy}`;
                await navigator.clipboard.writeText(musichubUrl);
                showToast('🔗 Musichub ссылка скопирована!', 'success');
            } else {
                await navigator.clipboard.writeText(urlToCopy);
                showToast('🔗 Ссылка скопирована', 'success');
            }
        } else if (globalIsOnHomePage) {
            await navigator.clipboard.writeText('musichub://home');
            showToast('🏠 Ссылка на домашнюю страницу скопирована', 'success');
        }
    });
}

});

window.electronAPI.onOpenHomePage(() => {
    if (typeof showHomePage === 'function') {
        showHomePage();
    } else if (typeof globalShowHomePage === 'function') {
        globalShowHomePage();
    }
});


document.getElementById('githubFooterLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    const url = 'https://github.com/Mamba1230/MusicHub';
    if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
});

function playNotificationSound() {
    if (!notifySoundEnabled) return;
    
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        switch(notifySoundType) {
            case 'beep1':
                playTone(audioCtx, 880, 0.1);
                break;
            case 'beep2':
                playTone(audioCtx, 880, 0.08);
                setTimeout(() => playTone(audioCtx, 660, 0.08), 100);
                break;
            case 'click':
                playNoise(audioCtx, 0.03);
                break;
            case 'whoosh':
                playSweep(audioCtx, 400, 1200, 0.12);
                break;
            default:
                playTone(audioCtx, 880, 0.1);
        }
    } catch(e) {
        console.log('Звук уведомлений не поддерживается');
    }
}


// ========== ИНИЦИАЛИЗАЦИЯ ГОРЯЧИХ КЛАВИШ ==========
(function initHotkeys() {
    console.log('🎮 Инициализация горячих клавиш (renderer)...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotkeys);
        return;
    }
    
    let savedBinding = localStorage.getItem('tabBinding');
    let savedEnabled = localStorage.getItem('tabBindingEnabled');
    
    if (!savedBinding || savedBinding === '1' || savedBinding === 'null' || savedBinding === 'undefined') {
        savedBinding = 'Control+Tab';
        localStorage.setItem('tabBinding', 'Control+Tab');
    }
    if (savedEnabled === null || savedEnabled === '1') {
        savedEnabled = 'true';
        localStorage.setItem('tabBindingEnabled', 'true');
    }
    
    const bindingInput = document.getElementById('tabBindingKey');
    const enableCheck = document.getElementById('enableTabBinding');
    
    if (bindingInput) bindingInput.value = savedBinding;
    if (enableCheck) enableCheck.checked = savedEnabled === 'true';
    
    if (window.electronAPI && window.electronAPI.updateTabBinding) {
        window.electronAPI.updateTabBinding({ 
            enabled: savedEnabled === 'true', 
            binding: savedBinding 
        });
    }
    
    // Обработчик смены
    const changeBtn = document.getElementById('changeTabBindingBtn');
if (changeBtn) {
    changeBtn.onclick = () => {
        const input = document.getElementById('tabBindingKey');
        if (!input) return;
        
        input.value = '🎹 Нажми и отпусти...';
        input.style.opacity = '0.6';
        
        // Храним нажатые клавиши
        let pressedKeys = new Set();
        
const onKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Игнорируем одиночные модификаторы
    if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') {
        return;
    }
    
    let keys = [];
    
    // Модификаторы
    if (e.ctrlKey) keys.push('Control');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Meta');
    
    // === ОСНОВНАЯ КЛАВИША (используем e.code для Numpad) ===
    let mainKey = '';
    
    // Сначала проверяем Numpad по e.code
    const numpadCodes = [
        'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
        'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
        'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 
        'NumpadDivide', 'NumpadDecimal', 'NumpadEnter'
    ];
    
    if (numpadCodes.includes(e.code)) {
        mainKey = e.code; // Например: "Numpad1", "NumpadAdd"
    }
    // Стрелки и специальные клавиши
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        mainKey = e.code;
    }
    else if (['Space', 'Tab', 'Escape', 'Enter', 'Backspace', 'Delete', 'Insert',
              'Home', 'End', 'PageUp', 'PageDown', 'CapsLock', 'NumLock', 
              'ScrollLock', 'PrintScreen', 'Pause', 'ContextMenu'].includes(e.code)) {
        mainKey = e.code;
    }
    // F-клавиши
    else if (e.code.startsWith('F') && e.code.length <= 3) {
        mainKey = e.code; // F1-F12
    }
    // Медиа-клавиши
    else if (e.code.startsWith('Media')) {
        mainKey = e.code;
    }
    // Volume
    else if (e.code === 'VolumeUp' || e.code === 'VolumeDown' || e.code === 'VolumeMute') {
        mainKey = e.code;
    }
    // Буквы и цифры (обычные)
    else if (e.key.length === 1) {
        mainKey = e.key.toUpperCase();
    }
    // Если ничего не подошло
    else if (e.key && e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Meta') {
        mainKey = e.key;
    }
    
    if (mainKey) {
        keys.push(mainKey);
    }
    
    // Если только модификаторы — ничего не делаем
    if (keys.length <= 1 && (keys[0] === 'Control' || keys[0] === 'Alt' || keys[0] === 'Shift' || keys[0] === 'Meta')) {
        return;
    }
    
    // Сортируем модификаторы для консистентности
    const mods = [];
    const nonMods = [];
    for (const k of keys) {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) {
            mods.push(k);
        } else {
            nonMods.push(k);
        }
    }
    // Сортируем модификаторы: Control > Alt > Shift > Meta
    mods.sort((a, b) => {
        const order = { 'Control': 0, 'Alt': 1, 'Shift': 2, 'Meta': 3 };
        return (order[a] || 99) - (order[b] || 99);
    });
    
    const binding = [...mods, ...nonMods].join('+');
    
    if (binding && binding !== 'Control' && binding !== 'Alt' && binding !== 'Shift' && binding !== 'Meta') {
        input.value = binding;
        console.log(`🎹 Текущая комбинация: ${binding}`);
    }
};

const onKeyUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Собираем финальную комбинацию
    let keys = [];
    
    if (e.ctrlKey) keys.push('Control');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Meta');
    
    // Основная клавиша (аналогично onKeyDown)
    let mainKey = '';
    const numpadCodes = ['Numpad0','Numpad1','Numpad2','Numpad3','Numpad4',
                         'Numpad5','Numpad6','Numpad7','Numpad8','Numpad9',
                         'NumpadAdd','NumpadSubtract','NumpadMultiply',
                         'NumpadDivide','NumpadDecimal','NumpadEnter'];
    
    if (numpadCodes.includes(e.code)) {
        mainKey = e.code;
    } else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab','Escape',
                'Enter','Backspace','Delete','Insert','Home','End','PageUp','PageDown'].includes(e.code)) {
        mainKey = e.code;
    } else if (e.code.startsWith('F') && e.code.length <= 3) {
        mainKey = e.code;
    } else if (e.key.length === 1) {
        mainKey = e.key.toUpperCase();
    } else if (e.key && !['Control','Alt','Shift','Meta'].includes(e.key)) {
        mainKey = e.key;
    }
    
    if (mainKey) keys.push(mainKey);
    
    // Сортируем модификаторы
    const mods = [];
    const nonMods = [];
    for (const k of keys) {
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) {
            mods.push(k);
        } else {
            nonMods.push(k);
        }
    }
    mods.sort((a, b) => {
        const order = { 'Control': 0, 'Alt': 1, 'Shift': 2, 'Meta': 3 };
        return (order[a] || 99) - (order[b] || 99);
    });
    
    let binding = [...mods, ...nonMods].join('+');
    
    // Если ничего не выбрано — ставим дефолтное значение
    if (!binding || binding === 'Control' || binding === 'Alt' || binding === 'Shift' || binding === 'Meta') {
        binding = DEFAULT_HOTKEYS[action] || 'Control+Tab';
    }
    
    input.value = binding;
    input.style.opacity = '1';
    input.style.color = '';
    
    // Сохраняем
    saveHotkey(action, binding);
    showToast(`✅ ${action}: ${binding}`, 'success');
    
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
};
        
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        // Таймаут на случай, если пользователь передумал
        setTimeout(() => {
            if (input.style.opacity === '0.6') {
                input.value = localStorage.getItem('tabBinding') || 'Control+Tab';
                input.style.opacity = '1';
                document.removeEventListener('keydown', onKeyDown);
                document.removeEventListener('keyup', onKeyUp);
                pressedKeys.clear();
            }
        }, 5000);
    };
}
    
    // Кнопка сброса
    const resetBtn = document.getElementById('resetTabBindingBtn');
    if (resetBtn) {
        resetBtn.onclick = () => {
            localStorage.setItem('tabBinding', 'Control+Tab');
            localStorage.setItem('tabBindingEnabled', 'true');
            if (bindingInput) bindingInput.value = 'Control+Tab';
            if (enableCheck) enableCheck.checked = true;
            if (window.electronAPI && window.electronAPI.updateTabBinding) {
                window.electronAPI.updateTabBinding({ enabled: true, binding: 'Control+Tab' });
            }
            showToast('🔄 Сброшено на Ctrl+Tab', 'info');
        };
    }
    
    // Чекбокс
    if (enableCheck) {
        enableCheck.onchange = () => {
            const enabled = enableCheck.checked;
            localStorage.setItem('tabBindingEnabled', enabled);
            const binding = localStorage.getItem('tabBinding') || 'Control+Tab';
            if (window.electronAPI && window.electronAPI.updateTabBinding) {
                window.electronAPI.updateTabBinding({ enabled: enabled, binding: binding });
            }
        };
    }
    
    console.log('✅ Горячие клавиши инициализированы');
})();


// Сохраняем ручной цвет пользователя
let manualAccentColor = localStorage.getItem('manualAccentColor') || '#1DB954';

// Функция применения цвета (универсальная)
function applyAccentColor(color, saveAsManual = false) {
    document.documentElement.style.setProperty('--accent-color', color);
    
    if (saveAsManual) {
        manualAccentColor = color;
        localStorage.setItem('manualAccentColor', color);
        localStorage.setItem('hubC', color);
    }
}

// Обработчик ручного выбора цвета
document.getElementById('manualAccentColor')?.addEventListener('input', (e) => {
    const color = e.target.value;
    autoColorEnabled = false;
    localStorage.setItem('autoColorFromArtwork', 'false');
    document.getElementById('autoColorFromArtwork').checked = false;
    applyAccentColor(color, true);
});

// Обновленный обработчик авто-цвета
document.getElementById('autoColorFromArtwork')?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    localStorage.setItem('autoColorFromArtwork', isEnabled);
    
    if (!isEnabled) {
        // Возвращаем цвет из палитры (cp)
        const manualColor = document.getElementById('cp').value;
        changeAccentColor(manualColor);
    } else {
        // Применяем цвет из обложки
        const artwork = document.getElementById('panelArtwork')?.src;
        if (artwork && artwork !== '') {
            const color = await getDominantColorFromImage(artwork);
            if (color && color !== '#000000') {
                changeAccentColor(color);
            }
        }
    }
});


let currentGradientColors = ['#1DB954', '#0a0a0a'];

function animateGradient(colors, duration = 1000) {
    if (gradientAnimation) {
        cancelAnimationFrame(gradientAnimation);
    }
    
    const startColors = [...currentGradientColors];
    const endColors = colors;
    const startTime = performance.now();
    
    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        
        // Интерполируем каждый цвет
        const r1 = hexToRgb(startColors[0]);
        const g1 = hexToRgb(startColors[1]);
        const r2 = hexToRgb(endColors[0]);
        const g2 = hexToRgb(endColors[1]);
        
        if (r1 && r2 && g1 && g2) {
            const r = Math.floor(r1.r + (r2.r - r1.r) * progress);
            const gr = Math.floor(r1.g + (r2.g - r1.g) * progress);
            const b = Math.floor(r1.b + (r2.b - r1.b) * progress);
            
            const r2c = Math.floor(g1.r + (g2.r - g1.r) * progress);
            const g2c = Math.floor(g1.g + (g2.g - g1.g) * progress);
            const b2c = Math.floor(g1.b + (g2.b - g1.b) * progress);
            
            const color1 = `rgb(${r}, ${gr}, ${b})`;
            const color2 = `rgb(${r2c}, ${g2c}, ${b2c})`;
            
            document.body.style.background = `radial-gradient(circle at 30% 40%, ${color1}, ${color2})`;
        }
        
        if (progress < 1) {
            gradientAnimation = requestAnimationFrame(step);
        } else {
            document.body.style.background = `radial-gradient(circle at 30% 40%, ${endColors[0]}, ${endColors[1]})`;
            currentGradientColors = [...endColors];
            gradientAnimation = null;
        }
    }
    
    gradientAnimation = requestAnimationFrame(step);
}

// Обработчик открытия URL из внешней ссылки
if (window.electronAPI.onOpenUrl) {
    window.electronAPI.onOpenUrl((event, url) => {
        console.log('🔗 Открываем URL из musichub://', url);
        
        // Определяем, какой сервис подходит под URL
        let targetService = null;
        
        if (url.includes('music.yandex.ru')) targetService = 'yandex';
        else if (url.includes('music.youtube.com') || url.includes('youtube.com')) targetService = 'youtube';
        else if (url.includes('soundcloud.com')) targetService = 'soundcloud';
        else if (url.includes('spotify.com')) targetService = 'spotify';
        else if (url.includes('vk.com')) targetService = 'vk';
        
        if (targetService && activeServices.includes(targetService)) {
            // Переключаемся на нужный сервис
            const btn = document.getElementById(`btn-${targetService}`);
            if (btn) {
                sw(targetService, btn);
                // Открываем URL
                setTimeout(() => {
                    const wv = document.querySelector('webview.active');
                    if (wv) wv.loadURL(url);
                }, 500);
            }
        } else if (targetService && !activeServices.includes(targetService)) {
            showToast(`❌ Сервис ${targetService} не активен. Выберите его в настройках`, 'error');
        } else {
            // Если не определили сервис, просто открываем в текущем
            const wv = document.querySelector('webview.active');
            if (wv) wv.loadURL(url);
        }
    });
}


let tempWebviews = [];
let currentTempWebview = null;

// Открытие внешней ссылки (не из активных сервисов)
function openExternalUrl(url) {
    // Нормализуем URL
    let cleanUrl = normalizeUrl(url);
    
    console.log('🌐 openExternalUrl с:', cleanUrl);
    
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
        console.log('🚫 Некорректный URL:', cleanUrl);
        showToast('❌ Некорректная ссылка', 'error');
        return;
    }
    
    // Проверяем, соответствует ли URL одному из активных сервисов
    const matchedService = checkUrlMatchesService(cleanUrl);
    
    if (matchedService && activeServices.includes(matchedService.id)) {
        if (globalIsOnHomePage && typeof hideHomePage === 'function') hideHomePage();
        if (tempWebviewOpened) closeTempWebview();
        
        const btn = document.getElementById(`btn-${matchedService.id}`);
        if (btn) {
            sw(matchedService.id, btn);
            setTimeout(() => {
                const wv = document.querySelector('webview.active');
                if (wv) {
                    console.log('📄 Загружаю URL:', cleanUrl);
                    wv.loadURL(cleanUrl).catch(e => console.log('Load error:', e));
                }
            }, 500);
        }
    } else {
        openInTempWebview(cleanUrl);
    }
}

// Проверка, соответствует ли URL какому-то сервису
function checkUrlMatchesService(url) {
    // Защита от пустых URL
    if (!url || url === 'home') return null;
    
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        const serviceDomains = {
            yandex: ['music.yandex.ru', 'yandex.ru'],
            youtube: ['music.youtube.com', 'youtube.com', 'youtu.be'],
            soundcloud: ['soundcloud.com'],
            spotify: ['open.spotify.com', 'spotify.com'],
            vk: ['vk.com', 'vk.ru']
        };
        
        for (const service of services) {
            const domains = serviceDomains[service.id] || [];
            for (const domain of domains) {
                if (hostname.includes(domain) || url.includes(domain)) {
                    return service;
                }
            }
        }
        
        // Проверка кастомных сайтов
        for (let i = 0; i < customSites.length; i++) {
            const site = customSites[i];
            if (site.url) {
                try {
                    const siteHost = new URL(site.url).hostname;
                    if (hostname.includes(siteHost)) {
                        return { id: `custom_${i}`, name: site.name };
                    }
                } catch(e) {}
            }
        }
    } catch(e) {
        // Если не удалось распарсить URL, пробуем простое совпадение
        for (const service of services) {
            if (url.includes(service.id)) return service;
        }
    }
    
    return null;
}

// Открытие во временном webview
function openInTempWebview(url) {
    let cleanUrl = normalizeUrl(url);
    
    if (!cleanUrl || !cleanUrl.startsWith('http')) {
        console.log('🚫 Невалидный URL для temp webview:', cleanUrl);
        showToast('❌ Некорректная ссылка', 'error');
        return;
    }
    
    console.log('🌐 Открываем временный webview:', cleanUrl);
    
    if (globalIsOnHomePage && typeof hideHomePage === 'function') {
        hideHomePage();
    }
    
    const activeWv = document.querySelector('webview.active');
    if (activeWv && !tempWebviewOpened) {
        lastActiveBeforeTemp = activeWv.id;
    }
    
    const webviews = document.querySelectorAll('webview:not(#tempWebview)');
    webviews.forEach(wv => {
        wv.style.opacity = '0';
        wv.style.pointerEvents = 'none';
    });
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        const effectLayer = btn.querySelector('.effect-layer');
        if (effectLayer) effectLayer.className = 'effect-layer none';
    });
    
    if (currentTempWebview && !currentTempWebview.isDestroyed) {
        currentTempWebview.remove();
    }
    
    currentTempWebview = document.createElement('webview');
    currentTempWebview.id = 'tempWebview';
    currentTempWebview.src = cleanUrl;
    currentTempWebview.partition = 'persist:temp';
    currentTempWebview.style.cssText = 'width: 100%; height: 100%; opacity: 1; pointer-events: auto;';
    currentTempWebview.classList.add('active');
    
    currentTempWebview.addEventListener('did-fail-load', (e) => {
        console.error('❌ Ошибка загрузки:', e.errorDescription, 'URL:', cleanUrl);
        showToast(`❌ Не удалось загрузить: ${e.errorDescription}`, 'error');
    });
    
    updateUrlBarForTempWebview(cleanUrl);
    
    currentTempWebview.addEventListener('did-navigate', (e) => {
        updateUrlBarForTempWebview(e.url);
    });
    currentTempWebview.addEventListener('did-navigate-in-page', (e) => {
        updateUrlBarForTempWebview(e.url);
    });
    
    document.getElementById('content').appendChild(currentTempWebview);
    tempWebviewOpened = true;
    addTempWebviewCloseButton();
    
    try {
        const hostname = new URL(cleanUrl).hostname;
        showToast(`🌐 Открыто: ${hostname}`, 'info');
    } catch(e) {
        showToast(`🌐 Открыто`, 'info');
    }
}

// Добавление кнопки закрытия для временного webview
function addTempWebviewCloseButton() {
    const oldBtn = document.getElementById('tempCloseBtn');
    if (oldBtn) oldBtn.remove();
    
    const closeBtn = document.createElement('button');
    closeBtn.id = 'tempCloseBtn';
    closeBtn.innerHTML = '✕ Закрыть вкладку';
    closeBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--accent-color);
        color: white;
        border: none;
        border-radius: 20px;
        padding: 8px 16px;
        cursor: pointer;
        z-index: 1000;
        font-size: 12px;
        opacity: 0.9;
        transition: opacity 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.9';
    closeBtn.onclick = () => {
        closeTempWebview();
        
        // Восстанавливаем последний активный сервис
        if (lastActiveBeforeTemp) {
            const lastWv = document.getElementById(lastActiveBeforeTemp);
            if (lastWv) {
                lastWv.classList.add('active');
            }
            const activeBtn = document.getElementById(`btn-${lastActiveBeforeTemp}`);
            if (activeBtn) {
                activeBtn.classList.add('active');
                const effectLayer = activeBtn.querySelector('.effect-layer');
                if (effectLayer) effectLayer.className = `effect-layer ${currentBtnEffect}`;
            }
            lastActiveBeforeTemp = null;
        } else if (activeServices[0]) {
            const btn = document.getElementById(`btn-${activeServices[0]}`);
            if (btn) sw(activeServices[0], btn);
        }
        
        showToast('🔙 Возврат к основным сервисам', 'info');
    };
    
    document.body.appendChild(closeBtn);
}


function updateUrlBarForTempWebview(url) {
    const urlText = document.getElementById('urlText');
    const urlFavicon = document.getElementById('urlFavicon');
    
    if (urlText) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const path = urlObj.pathname + urlObj.search + urlObj.hash;
            urlText.innerHTML = `<span class="url-domain">🌐 ${domain}</span><span class="url-path">${path}</span>`;
        } catch(e) {
            urlText.innerHTML = `<span class="url-domain">🌐 ${url}</span><span class="url-path"></span>`;
        }
    }
    if (urlFavicon) {
        urlFavicon.style.display = 'none';
    }
    
    window.currentUrl = url;
}




let qrCodeInstance = null;

// Получение локального IP (только 192.168.x.x)
async function getLocalIP() {
    if (window.electronAPI && window.electronAPI.getLocalIP) {
        return await window.electronAPI.getLocalIP();
    }
    
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        
        let foundIP = null;
        pc.onicecandidate = (e) => {
            if (!e.candidate) {
                resolve(foundIP || 'localhost');
                pc.close();
                return;
            }
            const ip = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1];
            if (!ip) return;
            
            if (ip.startsWith('192.168.')) {
                foundIP = ip;
                resolve(ip);
                pc.close();
                return;
            }
            if (!foundIP && !ip.startsWith('127.')) {
                foundIP = ip;
            }
        };
        setTimeout(() => {
            pc.close();
            resolve(foundIP || 'localhost');
        }, 3000);
    });
}

// Показать QR-код
async function showQRCode() {
    const ip = await getLocalIP();
    const url = `http://${ip}:3457`;
    
    if (document.getElementById('qrModal')) {
        document.getElementById('qrModal').style.display = 'flex';
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(10px);
        z-index: 99998;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
        <div style="
            background: var(--bg-secondary, #1a1a1a);
            border-radius: 24px;
            padding: 30px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            border: 1px solid var(--border-color, #333);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h2 style="font-size: 20px; font-weight: 700; color: var(--text-primary, #fff);">
                    📱 Подключи телефон
                </h2>
                <button id="qrCloseBtn" style="
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 8px;
                    transition: color 0.2s;
                " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#666'">✕</button>
            </div>
            
            <div style="
                background: #fff;
                border-radius: 16px;
                padding: 16px;
                margin: 12px 0;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 220px;
            ">
                <div id="qrContainer" style="width: 200px; height: 200px;"></div>
            </div>
            
            <div style="
                background: rgba(255,255,255,0.05);
                border-radius: 10px;
                padding: 12px;
                margin: 12px 0;
            ">
                <p style="font-size: 13px; color: var(--text-secondary, #999);">
                    Или введите в браузере телефона:
                </p>
                <p style="font-size: 16px; font-weight: 600; color: var(--accent, #1DB954); word-break: break-all;">
                    ${url}
                </p>
            </div>
            
            <button id="copyUrlBtn" style="
                background: rgba(255,255,255,0.08);
                border: 1px solid var(--border-color, #333);
                color: var(--text-secondary, #999);
                padding: 10px 20px;
                border-radius: 10px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
                width: 100%;
                margin-top: 4px;
            " onmouseover="this.style.background='rgba(255,255,255,0.15)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">
                📋 Скопировать ссылку
            </button>
            
            <p style="font-size: 11px; color: #555; margin-top: 12px;">
                💡 Убедитесь, что телефон и компьютер в одной сети Wi-Fi
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Генерируем QR-код
    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
        script.onload = () => {
            const container = document.getElementById('qrContainer');
            if (container && typeof QRCode !== 'undefined') {
                qrCodeInstance = new QRCode(container, {
                    text: url,
                    width: 200,
                    height: 200,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        };
        document.head.appendChild(script);
    } catch (e) {
        const container = document.getElementById('qrContainer');
        if (container) {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%;color:#000;">
                    <div style="font-size:48px;margin-bottom:8px;">📱</div>
                    <div style="font-size:14px;word-break:break-all;max-width:180px;">${url}</div>
                </div>
            `;
        }
    }
    
    // Обработчики
    document.getElementById('qrCloseBtn').addEventListener('click', () => modal.remove());
    document.getElementById('copyUrlBtn').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(url);
            showToast('🔗 Ссылка скопирована!', 'success');
        } catch (e) {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            showToast('🔗 Ссылка скопирована!', 'success');
        }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// === ОБРАБОТЧИК КНОПКИ ===
document.addEventListener('DOMContentLoaded', () => {
    const qrBtn = document.getElementById('qrSettingsBtn');
    if (qrBtn) {
        qrBtn.addEventListener('click', showQRCode);
    }
});

// === КОМАНДА ДЛЯ КОНСОЛИ ===
window.showQR = showQRCode;

console.log('📱 QR-код: showQR()');





// ============================================================
// МАГАЗИН ПЛАГИНОВ (RENDERER) — ИСПРАВЛЕННАЯ ВЕРСИЯ
// ============================================================

let pluginsList = [];
let pluginStoreModal = null;
let pluginStoreData = null;

// ============================================================
// КАСТОМНЫЕ МАГАЗИНЫ
// ============================================================

const DEFAULT_PLUGIN_STORE = 'https://raw.githubusercontent.com/Mamba1230/musichub-plugins/refs/heads/main/plugins.json';

function loadCustomPluginStores() {
    try {
        const saved = localStorage.getItem('customPluginStores');
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {}
    return [];
}

function saveCustomPluginStores(stores) {
    localStorage.setItem('customPluginStores', JSON.stringify(stores));
}

function getAllPluginStores() {
    const custom = loadCustomPluginStores();
    // ВАЖНО: официальный магазин ДОЛЖЕН быть первым
    return [DEFAULT_PLUGIN_STORE, ...custom];
}

function renderCustomPluginStores() {
    const container = document.getElementById('customPluginStoresList');
    if (!container) return;
    
    const stores = loadCustomPluginStores();
    
    if (stores.length === 0) {
        container.innerHTML = `
            <div style="padding: 8px 12px; color: var(--text-secondary); font-size: 13px; opacity: 0.6;">
                Нет добавленных магазинов
            </div>
        `;
        return;
    }
    
    container.innerHTML = stores.map((url, index) => `
        <div class="custom-store-item" style="
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            margin-bottom: 4px;
        ">
            <span style="font-size: 12px; color: #666;">${index + 1}.</span>
            <span style="font-size: 12px; color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${url}
            </span>
            <button class="remove-store-btn" data-index="${index}" style="
                background: none;
                border: none;
                color: #666;
                cursor: pointer;
                font-size: 14px;
                padding: 2px 6px;
                border-radius: 4px;
                transition: all 0.2s;
            " onmouseover="this.style.color='#ff4444'" onmouseout="this.style.color='#666'">
                ✕
            </button>
        </div>
    `).join('');
    
    container.querySelectorAll('.remove-store-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            const stores = loadCustomPluginStores();
            stores.splice(index, 1);
            saveCustomPluginStores(stores);
            renderCustomPluginStores();
            showToast('🗑️ Магазин удалён', 'info');
        });
    });
}

function addCustomPluginStore() {
    const input = document.getElementById('newStoreUrl');
    const url = input.value.trim();
    
    if (!url) {
        showToast('❌ Введите ссылку', 'error');
        return;
    }
    
    if (!url.includes('raw.githubusercontent.com') && !url.includes('raw.')) {
        showToast('❌ Используйте raw-ссылку на GitHub', 'error');
        return;
    }
    
    if (!url.endsWith('.json')) {
        showToast('❌ Ссылка должна заканчиваться на .json', 'error');
        return;
    }
    
    const stores = loadCustomPluginStores();
    if (stores.includes(url)) {
        showToast('⚠️ Такой магазин уже добавлен', 'warning');
        return;
    }
    
    stores.push(url);
    saveCustomPluginStores(stores);
    renderCustomPluginStores();
    input.value = '';
    showToast('✅ Магазин добавлен!', 'success');
}

// ============================================================
// ЗАГРУЗКА ПЛАГИНОВ ИЗ ВСЕХ МАГАЗИНОВ
// ============================================================

async function loadAllPluginStores() {
    const stores = getAllPluginStores(); // ← ТУТ ВСЕ МАГАЗИНЫ + ОФИЦИАЛЬНЫЙ
    const allPlugins = [];
    const errors = [];
    
    for (const storeUrl of stores) {
        try {
            console.log(`📥 Загрузка магазина: ${storeUrl}`);
            const response = await fetch(storeUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                }
            });
            if (!response.ok) {
                errors.push(`❌ ${storeUrl}: ${response.status}`);
                continue;
            }
            const data = await response.json();
            if (data.plugins && Array.isArray(data.plugins)) {
                data.plugins.forEach(p => {
                    p.source = storeUrl;
                });
                allPlugins.push(...data.plugins);
                console.log(`✅ Загружено ${data.plugins.length} плагинов из ${storeUrl}`);
            }
        } catch (err) {
            errors.push(`❌ ${storeUrl}: ${err.message}`);
            console.error(`Ошибка загрузки ${storeUrl}:`, err);
        }
    }
    
    if (errors.length > 0) {
        console.warn('Ошибки загрузки магазинов:', errors);
    }
    
    // Убираем дубликаты по id (оставляем первый попавшийся)
    const uniquePlugins = [];
    const seenIds = new Set();
    for (const p of allPlugins) {
        if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            uniquePlugins.push(p);
        }
    }
    
    console.log(`📦 Всего уникальных плагинов: ${uniquePlugins.length}`);
    return { plugins: uniquePlugins, errors };
}

// ============================================================
// ОСНОВНЫЕ ФУНКЦИИ МАГАЗИНА
// ============================================================

async function loadPluginStore(forceRefresh = false) {
    try {
        showToast(forceRefresh ? '🔄 Обновление магазинов...' : '🔄 Загрузка магазинов...', 'info');
        
        if (forceRefresh) {
            localStorage.removeItem('pluginStoreCache');
            localStorage.removeItem('pluginStoreCacheTime');
        }
        
        const data = await loadAllPluginStores();
        
        if (data.errors.length > 0 && data.plugins.length === 0) {
            showToast('❌ Не удалось загрузить плагины', 'error');
            return { plugins: [], error: data.errors.join('\n') };
        }
        
        // Добавляем кеш-бастер для иконок
        if (data.plugins) {
            data.plugins.forEach(p => {
                if (p.icon && p.icon.includes('raw.githubusercontent.com')) {
                    p.icon = p.icon + '?t=' + Date.now();
                }
            });
        }
        
        pluginStoreData = data;
        renderPluginStore(data);
        
        if (forceRefresh) {
            showToast(`✅ Магазины обновлены! ${data.plugins?.length || 0} плагинов`, 'success');
        }
        
        return data;
    } catch (err) {
        console.error('❌ Ошибка загрузки магазинов:', err);
        showToast('❌ Не удалось загрузить магазины', 'error');
        return { plugins: [], error: err.message };
    }
}

function renderPluginStore(data) {
    const container = document.getElementById('pluginStoreList');
    if (!container) return;
    
    if (!data.plugins || data.plugins.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #666;">
                <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
                <div style="font-size: 16px; font-weight: 600;">Нет доступных плагинов</div>
                <div style="font-size: 13px; color: #888; margin-top: 4px;">Загляните позже — новые плагины появляются регулярно</div>
            </div>
        `;
        return;
    }
    
    const categories = {};
    data.plugins.forEach(plugin => {
        const cat = plugin.category || 'other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(plugin);
    });
    
    const categoryNames = {
        'utils': '🛠️ Утилиты',
        'visualization': '🎨 Визуализации',
        'music': '🎵 Музыка',
        'other': '📦 Другое'
    };
    
    let html = '';
    
    for (const [cat, plugins] of Object.entries(categories)) {
        html += `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; font-weight: 600; color: var(--text-secondary, #999); margin-bottom: 8px; padding-left: 4px;">
                    ${categoryNames[cat] || cat}
                </div>
        `;
        
        plugins.forEach(plugin => {
            const isInstalled = checkPluginInstalled(plugin.id);
            
            html += `
                <div class="plugin-store-item" style="
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 10px 14px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 10px;
                    margin-bottom: 6px;
                    border: 1px solid ${isInstalled ? 'var(--accent-color, #1DB954)' : 'rgba(255,255,255,0.05)'};
                    transition: all 0.2s;
                    cursor: ${isInstalled ? 'default' : 'pointer'};
                ">
                    
                    <!-- Иконка с обработкой ошибок -->
                    <div style="
                        width: 40px;
                        height: 40px;
                        border-radius: 8px;
                        overflow: hidden;
                        flex-shrink: 0;
                        background: rgba(255,255,255,0.05);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 20px;
                    ">
                        ${plugin.icon ? 
                            `<img src="${plugin.icon}" style="width:100%;height:100%;object-fit:cover;" 
                                 onerror="this.style.display='none';this.parentElement.textContent='🧩'">` 
                            : '🧩'}
                    </div>
                    
                    <!-- Информация -->
                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 14px; font-weight: 600; color: var(--text-primary, #fff);">
                                ${plugin.name}
                            </span>
                            <span style="font-size: 10px; color: #666;">v${plugin.version}</span>
                            ${isInstalled ? `<span style="font-size: 10px; color: var(--accent-color, #1DB954); font-weight: 600;">✅ Установлен</span>` : ''}
                            ${plugin.source ? `<span style="font-size: 9px; color: #444;">📦 ${plugin.source.replace(/^https?:\/\/[^\/]+/, '')}</span>` : ''}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary, #999); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${plugin.description || 'Нет описания'} 
                            ${plugin.author ? `• ${plugin.author}` : ''}
                        </div>
                    </div>
                    
                    <!-- Кнопка установки -->
                    ${!isInstalled ? `
                        <button class="install-plugin-btn" data-id="${plugin.id}" data-url="${plugin.download}" style="
                            background: var(--accent-color, #1DB954);
                            color: #000;
                            border: none;
                            border-radius: 8px;
                            padding: 6px 14px;
                            cursor: pointer;
                            font-size: 12px;
                            font-weight: 600;
                            transition: all 0.2s;
                            flex-shrink: 0;
                        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" onmousedown="this.style.transform='scale(0.95)'" onmouseup="this.style.transform='scale(1)'">
                            📥 Установить
                        </button>
                    ` : `
                        <button style="
                            background: rgba(255,255,255,0.05);
                            color: #666;
                            border: 1px solid rgba(255,255,255,0.05);
                            border-radius: 8px;
                            padding: 6px 14px;
                            cursor: default;
                            font-size: 12px;
                            font-weight: 600;
                            flex-shrink: 0;
                        ">
                            ✅ Установлен
                        </button>
                    `}
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    container.innerHTML = html;
    
    container.querySelectorAll('.install-plugin-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const url = btn.dataset.url;
            
            btn.textContent = '⏳ Установка...';
            btn.disabled = true;
            btn.style.opacity = '0.6';
            
            try {
                const result = await window.electronAPI.installPluginFromStore(id, url);
                if (result.success) {
                    showToast(`✅ Плагин "${result.manifest.name}" установлен!`, 'success');
                    await loadPluginStore(true);
                    await loadPluginsList();
                } else {
                    showToast('❌ ' + result.error, 'error');
                    btn.textContent = '📥 Установить';
                    btn.disabled = false;
                    btn.style.opacity = '1';
                }
            } catch (err) {
                showToast('❌ ' + err.message, 'error');
                btn.textContent = '📥 Установить';
                btn.disabled = false;
                btn.style.opacity = '1';
            }
        });
    });
}

function checkPluginInstalled(pluginId) {
    if (!pluginsList || pluginsList.length === 0) return false;
    return pluginsList.some(p => p.id === pluginId);
}

// ============================================================
// ЗАГРУЗКА СПИСКА УСТАНОВЛЕННЫХ ПЛАГИНОВ
// ============================================================

async function loadPluginsList() {
    const container = document.getElementById('extensionsList');
    if (!container) return;
    
    try {
        const plugins = await window.electronAPI.getPlugins();
        pluginsList = plugins || [];
        
        if (!plugins || plugins.length === 0) {
            container.innerHTML = `
                <div class="empty-plugins">
                    <span class="empty-icon">🔌</span>
                    Нет установленных плагинов<br>
                    <span style="font-size: 11px; color: #666;">Нажмите "Магазин плагинов" чтобы установить</span>
                </div>
            `;
            return;
        }
        
        container.innerHTML = plugins.map(p => `
            <div class="extension-item" data-id="${p.id}">
                <div class="extension-icon">${p.icon ? `<img src="file://${p.icon}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">` : '🧩'}</div>
                <div class="extension-info">
                    <div class="extension-name">
                        ${p.name}
                        <span class="extension-version">v${p.version}</span>
                    </div>
                    ${p.description ? `<div class="extension-desc">${p.description}</div>` : ''}
                </div>
                <button class="extension-delete" data-id="${p.id}" title="Удалить плагин">🗑️</button>
            </div>
        `).join('');
        
        container.querySelectorAll('.extension-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const plugin = plugins.find(p => p.id === id);
                if (!confirm(`Удалить плагин "${plugin?.name || id}"?`)) return;
                
                try {
                    await window.electronAPI.uninstallPlugin(id);
                    showToast(`🗑️ Плагин "${plugin?.name || id}" удалён`, 'info');
                    loadPluginsList();
                } catch (err) {
                    showToast('❌ ' + err.message, 'error');
                }
            });
        });
        
        container.querySelectorAll('.extension-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                if (e.target.closest('.extension-delete')) return;
                const id = item.dataset.id;
                try {
                    await window.electronAPI.openPluginPopup(id);
                } catch (err) {
                    ('❌ ' + err.message, 'error');
                }
            });
        });
        
    } catch (err) {
        console.error('Ошибка загрузки плагинов:', err);
        container.innerHTML = `
            <div class="empty-plugins" style="color: #ff6666;">
                <span class="empty-icon">❌</span>
                Ошибка загрузки плагинов<br>
                <span style="font-size: 11px; color: #666;">${err.message}</span>
            </div>
        `;
    }
}

// ============================================================
// ОТКРЫТИЕ МАГАЗИНА ПЛАГИНОВ
// ============================================================

function openPluginStore() {
    if (document.getElementById('pluginStoreModal')) {
        const modal = document.getElementById('pluginStoreModal');
        modal.style.display = 'flex';
        loadPluginStore(true);
        return;
    }
    
    const modal = document.createElement('div');
    modal.id = 'pluginStoreModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        backdrop-filter: blur(10px);
        z-index: 99997;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
        <div style="
            background: var(--bg-secondary, #1a1a1a);
            border-radius: 20px;
            padding: 24px;
            max-width: 560px;
            width: 90%;
            max-height: 80vh;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            border: 1px solid var(--border-color, #333);
            display: flex;
            flex-direction: column;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-shrink: 0;">
                <h2 style="font-size: 20px; font-weight: 700; color: var(--text-primary, #fff);">
                    🛒 Магазин плагинов
                </h2>
                <button id="pluginStoreClose" style="
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 4px 8px;
                    border-radius: 8px;
                    transition: color 0.2s;
                " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#666'">✕</button>
            </div>
            
            <div id="pluginStoreList" style="flex: 1; overflow-y: auto; padding-right: 4px;">
                <div style="text-align: center; padding: 20px; color: #666;">
                    ⏳ Загрузка магазина...
                </div>
            </div>
            
            <div style="display: flex; gap: 10px; margin-top: 16px; flex-shrink: 0;">
                <button id="refreshStoreBtn" style="
                    background: rgba(255,255,255,0.05);
                    border: 1px solid #333;
                    color: #888;
                    border-radius: 10px;
                    padding: 10px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                    flex: 1;
                " onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    🔄 Обновить
                </button>
                <button id="pluginStoreCloseBtn" style="
                    background: var(--accent-color, #1DB954);
                    color: #000;
                    border: none;
                    border-radius: 10px;
                    padding: 10px 20px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.2s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    Закрыть
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    pluginStoreModal = modal;
    
    document.getElementById('pluginStoreClose').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    document.getElementById('pluginStoreCloseBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    document.getElementById('refreshStoreBtn').addEventListener('click', async () => {
        const btn = document.getElementById('refreshStoreBtn');
        const originalText = btn.textContent;
        btn.textContent = '⏳ ...';
        btn.disabled = true;
        btn.style.opacity = '0.6';
        
        await loadPluginStore(true);
        if (typeof loadPluginsList === 'function') {
            await loadPluginsList();
        }
        
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    loadPluginStore(true);
}

// ============================================================
// ПЕРЕДАЧА СТАТУСА В ПЛАГИНЫ
// ============================================================

let lastSentStatusToPlugins = '';

function broadcastStatusToPlugins() {
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim() || '#1DB954';
    
    const titleEl = document.getElementById('homeTrackTitle');
    const artistEl = document.getElementById('homeTrackArtist');
    const artworkEl = document.getElementById('homeArtwork');
    
    const status = {
        isPlaying: isMediaPlaying || false,
        volume: currentMediaVolume || 0,
        title: titleEl?.textContent || 'Не играет',
        artist: artistEl?.textContent || '—',
        artwork: artworkEl?.src || '',
        accentColor: accentColor
    };
    
    const statusStr = JSON.stringify(status);
    if (statusStr !== lastSentStatusToPlugins) {
        lastSentStatusToPlugins = statusStr;
        if (window.electronAPI && window.electronAPI.sendPluginStatus) {
            window.electronAPI.sendPluginStatus(status);
        }
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // === КНОПКА ОТКРЫТИЯ ПАНЕЛИ ===
    const extBtn = document.getElementById('extensionsPanelBtn');
    const panel = document.getElementById('extensionsPanel');
    const closeBtn = document.getElementById('closeExtensionsPanelBtn');
    
    if (extBtn && panel) {
        extBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('show');
            if (panel.classList.contains('show')) {
                panel.style.display = 'block';
                loadPluginsList();
            } else {
                panel.style.display = 'none';
            }
        });
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.classList.remove('show');
                panel.style.display = 'none';
            });
        }
        
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('show') && 
                !panel.contains(e.target) && 
                e.target !== extBtn) {
                panel.classList.remove('show');
                panel.style.display = 'none';
            }
        });
    }
    
    // === КНОПКА МАГАЗИНА ===
    const storeBtn = document.getElementById('pluginStoreBtn');
    if (storeBtn) {
        storeBtn.addEventListener('click', () => {
            if (panel) {
                panel.classList.remove('show');
                panel.style.display = 'none';
            }
            openPluginStore();
        });
    }
    
    // === КАСТОМНЫЕ МАГАЗИНЫ ===
    renderCustomPluginStores();
    
    document.getElementById('addCustomStoreBtn')?.addEventListener('click', addCustomPluginStore);
    
    document.getElementById('newStoreUrl')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomPluginStore();
    });
    
    document.getElementById('refreshPluginStoresBtn')?.addEventListener('click', async () => {
        await loadPluginStore(true);
        if (typeof loadPluginsList === 'function') {
            await loadPluginsList();
        }
        showToast('🔄 Магазины обновлены!', 'success');
    });
});

// === ЗАПУСК ОТПРАВКИ СТАТУСА ===
setInterval(broadcastStatusToPlugins, 1000);

// Перехват изменения Play/Pause
const originalUpdatePlayButton = window.updatePlayButton;
if (originalUpdatePlayButton) {
    window.updatePlayButton = function(isPlayingState) {
        originalUpdatePlayButton(isPlayingState);
        setTimeout(broadcastStatusToPlugins, 100);
    };
}

// Перехват изменения цвета
const originalChangeAccentColor = window.changeAccentColor;
if (originalChangeAccentColor) {
    window.changeAccentColor = function(color) {
        originalChangeAccentColor(color);
        setTimeout(broadcastStatusToPlugins, 100);
    };
}

// === ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ КОНСОЛИ ===
window.openPluginStore = openPluginStore;
window.loadPluginsList = loadPluginsList;
window.loadPluginStore = loadPluginStore;

console.log('🔌 Система плагинов готова!');
console.log('📋 Команды: loadPluginsList(), openPluginStore(), loadPluginStore(true)');
console.log('🛒 Магазин плагинов готов! Команда: openPluginStore()');

















































































        

         
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MusicHub v3.2.0');
    particleBackground = new ParticleBackground();
    loadSettings();
    loadCustomSites();  
    loadCustomSound();  
    renderServicesList();
    initSmartStats();
    loadTrackHistory();
    updateStatsUI();
    renderServices();
    await loadAudioDevices();
    initSidebarResizer();
    startVisualizer();
    initTitlebarEqualizer();
    await checkPremiumStatus();
    document.body.addEventListener('click', createGlobalRipple);
    showToast('🎵 Добро пожаловать в MusicHub! 3.2.0', 'success');
    
    const chatBtn = document.getElementById('chatBtn');
    if (chatBtn) {
        chatBtn.addEventListener('click', toggleChat);
    }
    
    const vizSelect = document.getElementById('viz-mode');
    if (vizSelect) {
        const allowedModes = ['bars', 'wave', 'circle', 'dots', 'particles', 'radial', 'galaxy', 'aurora', 'vortex', 'starburst', 'gif'];
        for (let opt of vizSelect.options) {
            if (!allowedModes.includes(opt.value)) opt.style.display = 'none';
        }
        if (!allowedModes.includes(currentVizMode)) {
            currentVizMode = 'bars';
            vizSelect.value = 'bars';
            localStorage.setItem('vizMode', 'bars');
        }
    }

    const currentMinimized = await window.electronAPI.getStartMinimized();
    document.getElementById('startMinimized').checked = currentMinimized;
    localStorage.setItem('startMinimized', currentMinimized);

    const startMinimized = localStorage.getItem('startMinimized') === 'true';
    window.electronAPI.setStartMinimized(startMinimized);
    
    // ========== ЗАГРУЗКА НАСТРОЙКИ СТРАНИЦЫ ЗАПУСКА ==========
    loadStartupPageSetting();
    
    // Обработчик изменения select
const startupSelect = document.getElementById('startupPage');
if (startupSelect) {
    // Удаляем старые обработчики
    const newSelect = startupSelect.cloneNode(true);
    startupSelect.parentNode.replaceChild(newSelect, startupSelect);
    
    // Устанавливаем значение из localStorage
    const savedPage = localStorage.getItem('startupPage') || 'last';
    newSelect.value = savedPage;
    console.log(`📌 Select установлен на: ${savedPage}`);
    
    // Обработчик изменения
    newSelect.addEventListener('change', function(e) {
        const page = e.target.value;
        console.log(`🔄 Изменён select на: ${page}`);
        forceSaveStartupPage(page);
    });
}
    
    // ========== ПЕРЕХОД НА СТРАНИЦУ ЗАПУСКА ==========
    // Ждём загрузки всех сервисов
    setTimeout(() => {
        goToStartupPage();
    }, 1500);
     
    // Обработчики из main
    window.electronAPI.onInitActiveTab((event, tabId) => {
        const btn = document.getElementById(`btn-${tabId}`);
        if (btn) sw(tabId, btn);
    });

    window.electronAPI.onInitStartMinimized?.((event, minimized) => {
        if (minimized) {
            setTimeout(() => {
                window.electronAPI.windowCtrl('min');
            }, 500);
        }
    });
    
    window.electronAPI.onInitTheme((event, theme) => {
        changeTheme(theme);
        document.getElementById('theme-select').value = theme;
    });
    
    window.electronAPI.onOptimizeWebviews(() => {
        document.querySelectorAll('webview').forEach(wv => {
            wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
        });
    });
    
    window.electronAPI.onAppBlur(() => {});
    window.electronAPI.onAppFocus(() => {});
    window.electronAPI.onAppHidden(() => {});
    window.electronAPI.onAppShown(() => {});
});


 document.getElementById('settingsBtn')?.addEventListener('click', toggleSettings);

         
window.electronAPI.onGlobalSwitch(() => {
    if (activeServices.length === 0) return;
    const currentId = document.querySelector('webview.active')?.id || activeServices[0];
    const currentIndex = activeServices.indexOf(currentId);
    const nextIndex = (currentIndex + 1) % activeServices.length;
    const btn = document.getElementById(`btn-${activeServices[nextIndex]}`);
    if (btn) sw(activeServices[nextIndex], btn);
});

window.addEventListener('beforeunload', () => {
    if (currentTrackInfo && currentTrackStartTime && isSoundPlaying) {
        const listenTime = Math.floor((Date.now() - currentTrackStartTime) / 1000);
        if (listenTime >= 3) {
            addListenTimeToArtist(currentTrackInfo.artist, listenTime);
            addTotalListenTime(listenTime);
            console.log(`💾 Сохранено ${listenTime} сек при закрытии`);
        }
    }
});



 
let customSoundBuffer = null;
let audioContextGlobal = null;

document.getElementById('customSoundFile')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    console.log('📁 Выбран файл:', file.name, file.size, file.type);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        customSoundBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
         
        const reader = new FileReader();
        reader.onload = () => {
            localStorage.setItem('customSound', reader.result);
            document.getElementById('customSoundStatus').textContent = '✅ Звук загружен!';
            console.log('💾 Звук сохранён в localStorage');
        };
        reader.readAsDataURL(file);
        
        console.log('✅ Звук успешно декодирован');
    } catch (err) {
        console.error('❌ Ошибка загрузки звука:', err);
        document.getElementById('customSoundStatus').textContent = '❌ Ошибка: неподдерживаемый формат';
    }
});

document.getElementById('testCustomSoundBtn')?.addEventListener('click', () => {
    if (customSoundBuffer) {
        playCustomSound();
    } else {
        playSwitchSound();  
    }
});

function playCustomSound() {
    if (!customSoundBuffer) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createBufferSource();
    source.buffer = customSoundBuffer;
    source.connect(ctx.destination);
    source.start();
}

 
function loadCustomSound() {
    const saved = localStorage.getItem('customSound');
    if (saved) {
        fetch(saved)
            .then(res => res.arrayBuffer())
            .then(buffer => {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                ctx.decodeAudioData(buffer, (decoded) => {
                    customSoundBuffer = decoded;
                    document.getElementById('customSoundStatus').textContent = '✅ Звук загружен';
                });
            });
    }
}



const startWithSystem = localStorage.getItem('startWithSystem') === 'true';
const startMinimized = localStorage.getItem('startMinimized') === 'true';
document.getElementById('startWithSystem').checked = startWithSystem;
document.getElementById('startMinimized').checked = startMinimized;

 
document.getElementById('startWithSystem').addEventListener('change', (e) => {
    localStorage.setItem('startWithSystem', e.target.checked);
    window.electronAPI.setAutostart(e.target.checked);
});

document.getElementById('notify-sound-select')?.addEventListener('change', (e) => {
    changeNotifySound(e.target.value);
});

document.getElementById('showNotificationsCheckbox')?.addEventListener('change', (e) => {
    showNotifications = e.target.checked;
    localStorage.setItem('showNotifications', showNotifications);
});

document.getElementById('startMinimized').addEventListener('change', (e) => {
    localStorage.setItem('startMinimized', e.target.checked);
     
});

function addServiceButton(id, icon, name, url) {
    const container = document.getElementById('services-container');
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (id === activeServices[0] ? ' active' : '');
    btn.id = `btn-${id}`;
    btn.innerHTML = `<span>${icon}</span><div class="effect-layer ${id === activeServices[0] ? currentBtnEffect : 'none'}"></div>`;
    btn.title = name;
    
    btn.onclick = () => {
        if (typeof hideHomePage === 'function') hideHomePage();
        if (id.startsWith('custom_')) {
            const customSite = customSites[parseInt(id.split('_')[1])];
            if (customSite) {
                let wv = document.getElementById(id);
                if (!wv) {
                    wv = document.createElement('webview');
                    wv.id = id;
                    wv.src = customSite.url;
                    wv.partition = 'persist:custom';
                    document.getElementById('content').appendChild(wv);
                }
                sw(id, btn);
            }
        } else {
            sw(id, btn);
        }
    };
    
    // Двойной клик - на домашнюю страницу
    btn.ondblclick = () => {
        const wv = document.getElementById(id);
        if (wv) {
            const homeUrl = getServiceHomeUrl(id);
            if (homeUrl) {
                wv.loadURL(homeUrl);
                showToast(`🏠 Переход на главную ${name}`, 'info');
            } else {
                wv.reload();
                showToast(`🔄 ${name} перезагружен`, 'info');
            }
        } else {
            showToast(`❌ Сервис ${name} не найден`, 'error');
        }
    };
    
    container.appendChild(btn);
}

function createCustomWebview(siteId, url) {
    const existingWv = document.getElementById(siteId);
    if (existingWv) return existingWv;
    
    const wv = document.createElement('webview');
    wv.id = siteId;
    wv.src = url;
    wv.partition = 'persist:custom';
    wv.className = '';
    wv.addEventListener('dom-ready', () => {
        wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
        console.log(`✅ Загружен кастомный сайт: ${siteId}`);
    });
    wv.addEventListener('did-fail-load', (e) => {
        console.error(`❌ Ошибка загрузки ${siteId}:`, e);
        addChatMessage(`⚠️ Не удалось загрузить сайт: ${url}`, false, 'system');
    });
    document.getElementById('content').appendChild(wv);
    return wv;
}

document.getElementById('addCustomSiteBtn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('newSiteName');
    const urlInput = document.getElementById('newSiteUrl');
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    
    if (!name || !url) {
        alert('Введите название и URL сайта');
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
        if (!hasFeature('custom_sites')) {
        showToast('⭐ Кастомные сайты доступны в Premium версии', 'info');
        return;
    }

    if (customSites.length >= 5) {
        alert('Максимум 5 кастомных сайтов');
        return;
    }
    
    customSites.push({ name: name, url: url });
    localStorage.setItem('customSites', JSON.stringify(customSites));
    
     
    nameInput.value = '';
    urlInput.value = '';
    
     
    renderCustomSites();
    renderServicesList();
    renderServices();
    showToast(`✅ Добавлен сайт: ${name}`, 'success');
});

function loadCustomSiteWebview(customId, url) {
    let wv = document.getElementById(customId);
    if (wv) return wv;
    
    wv = document.createElement('webview');
    wv.id = customId;
    wv.src = url;
    wv.partition = 'persist:custom';
    wv.style.width = '100%';
    wv.style.height = '100%';
    wv.style.position = 'absolute';
    
    wv.addEventListener('dom-ready', () => {
        wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
        console.log(`✅ Загружен: ${customId}`);
    });
    
    wv.addEventListener('did-fail-load', (e) => {
        console.error(`❌ Ошибка ${customId}:`, e);
        addChatMessage(`⚠️ Не удалось загрузить сайт: ${url}`, false, 'system');
    });
    
    document.getElementById('content').appendChild(wv);
    return wv;
}

function addServiceButton(id, icon, name) {
    const container = document.getElementById('services-container');
    if (!container) return;
    
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (id === activeServices[0] ? ' active' : '');
    btn.id = `btn-${id}`;
    btn.innerHTML = `<span>${icon}</span><div class="effect-layer ${id === activeServices[0] ? currentBtnEffect : 'none'}"></div>`;
    btn.title = name;
    
    btn.onclick = () => {
        if (id.startsWith('custom_')) {
            const customIndex = parseInt(id.split('_')[1]);
            const customSite = customSites[customIndex];
            if (customSite && customSite.url) {
                let wv = document.getElementById(id);
                if (!wv) {
                    wv = document.createElement('webview');
                    wv.id = id;
                    wv.src = customSite.url;
                    wv.partition = 'persist:custom';
                    document.getElementById('content').appendChild(wv);
                }
                sw(id, btn);
            }
        } else {
            sw(id, btn);
        }
    };
    
    // ИЗМЕНЯЕМ ДВОЙНОЙ КЛИК: вместо обновления - переход на домашнюю страницу сервиса
    btn.ondblclick = () => {
        const serviceUrl = getServiceHomeUrl(id);
        if (serviceUrl) {
            const wv = document.getElementById(id);
            if (wv) {
                wv.loadURL(serviceUrl);
                showToast(`🏠 Переход на главную ${name}`, 'info');
            } else {
                showToast(`❌ Сервис ${name} не найден`, 'error');
            }
        } else {
            // Если нет домашнего URL, просто перезагружаем
            const wv = document.getElementById(id);
            if (wv) {
                wv.reload();
                showToast(`🔄 ${name} перезагружен`, 'info');
            }
        }
    };
    
    container.appendChild(btn);
}

function getServiceHomeUrl(serviceId) {
    const homeUrls = {
        'yandex': 'https://music.yandex.ru/home',
        'youtube': 'https://music.youtube.com',
        'soundcloud': 'https://soundcloud.com/stream',
        'spotify': 'https://open.spotify.com',
        'vk': 'https://vk.com/audio'
    };
    
    // Если кастомный сайт - возвращаем его URL
    if (serviceId.startsWith('custom_')) {
        const customIndex = parseInt(serviceId.split('_')[1]);
        const site = customSites[customIndex];
        if (site && site.url) {
            return site.url;
        }
    }
    
    return homeUrls[serviceId] || null;
}

// Глобальные переменные
let notifySoundEnabled = true;
let notifySoundType = 'beep1';
let showNotifications = true;

function changeNotifySound(value) {
    notifySoundType = value;
    notifySoundEnabled = value !== 'off';
    localStorage.setItem('notifySound', value);
    
    // Тестовый звук при смене (если включено)
    if (notifySoundEnabled) {
        playNotifySound();
    }
}

function playNotifySound() {
    if (!notifySoundEnabled) return;
    
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        switch(notifySoundType) {
            case 'beep1':
                playTone(audioCtx, 880, 0.1);
                break;
            case 'beep2':
                playTone(audioCtx, 880, 0.08);
                setTimeout(() => playTone(audioCtx, 660, 0.08), 100);
                break;
            case 'click':
                playNoise(audioCtx, 0.03);
                break;
            case 'whoosh':
                playSweep(audioCtx, 400, 1200, 0.12);
                break;
            default:
                playTone(audioCtx, 880, 0.1);
        }
    } catch(e) {
        console.log('Звук уведомлений не поддерживается');
    }
}



async function testPremiumExpire() {
    const deviceId = await getDeviceId();
    const response = await fetch('https://premium-api.170610maksim.workers.dev/test-expire', {
        method: 'POST',
        headers: { 'X-Device-Id': deviceId }
    });
    const data = await response.json();
    if (data.success) {
         
        localStorage.removeItem('premium_status');
         
        await checkPremiumStatus();
        
         
        updatePremiumUI();
        
         
        if (!hasFeature('full_viz') && currentVizMode !== 'bars') {
            currentVizMode = 'bars';
            document.getElementById('viz-mode').value = 'bars';
            localStorage.setItem('vizMode', 'bars');
        }
        
         
        if (!hasFeature('custom_sites') && customSites.length > 0) {
            customSites = [];
            localStorage.setItem('customSites', JSON.stringify(customSites));
            renderCustomSites();
            renderServices();
        }
        
        addChatMessage(`⭐ Premium отключён (тестовый режим)`, false, 'system');
    }
}

 
async function testPremiumRestore() {
    const deviceId = await getDeviceId();
    const response = await fetch('https://premium-api.170610maksim.workers.dev/test-restore', {
        method: 'POST',
        headers: { 'X-Device-Id': deviceId }
    });
    const data = await response.json();
    if (data.success) {
         
        localStorage.removeItem('premium_status');
         
        await checkPremiumStatus();
        updatePremiumUI();
        addChatMessage(`⭐ Premium восстановлен!`, false, 'system');
    }
}

 
async function testPremiumReset() {
    const deviceId = await getDeviceId();
    const response = await fetch('https://premium-api.170610maksim.workers.dev/test-reset', {
        method: 'POST',
        headers: { 'X-Device-Id': deviceId }
    });
    const data = await response.json();
    if (data.success) {
        localStorage.removeItem('premium_status');
        await checkPremiumStatus();
        updatePremiumUI();
        addChatMessage(`⭐ Premium сброшен. Пробный период начался заново.`, false, 'system');
    }
}

async function generatePremiumKey(type) {
    const response = await fetch('https://premium-api.170610maksim.workers.dev/generate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            secret: 'твой-секретный-ключ-из-wrangler',
            type: type
        })
    });
    const data = await response.json();
    return data.key;
}





    // ---------- КНОПКИ ОКНА (WIN/MAC), URL, РАСШИРЕНИЯ ----------
   function renderWindowButtons() {
    const style = localStorage.getItem('windowButtonsStyle') || 'win';
    const container = document.getElementById('window-controls-dynamic');
    if (!container) return;
    
    if (style === 'mac') {
        container.innerHTML = `
            <div class="mac-buttons">
                <div class="mac-dot red" data-action="close"></div>
                <div class="mac-dot yellow" data-action="min"></div>
                <div class="mac-dot green" data-action="max"></div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="win-buttons">
                <div class="win-btn" data-action="min">_</div>
                <div class="win-btn" data-action="max">▢</div>
                <div class="win-btn close" data-action="close">✕</div>
            </div>
        `;
    }
    
    // ПРОСТОЙ ОБРАБОТЧИК – через onclick
    const redBtn = container.querySelector('.mac-dot.red, .win-btn.close');
    const yellowBtn = container.querySelector('.mac-dot.yellow, .win-btn[data-action="min"]');
    const greenBtn = container.querySelector('.mac-dot.green, .win-btn[data-action="max"]');
    
    if (redBtn) redBtn.onclick = () => window.electronAPI.windowCtrl('close');
    if (yellowBtn) yellowBtn.onclick = () => window.electronAPI.windowCtrl('min');
    if (greenBtn) greenBtn.onclick = () => window.electronAPI.windowCtrl('max');
}

function applyButtonsPosition() {
    const position = localStorage.getItem('windowButtonsPosition') || 'right';
    const controls = document.getElementById('window-controls-dynamic');
    const dragRegion = document.getElementById('drag-region');
    if (!controls || !dragRegion) return;
    
    if (position === 'left') {
        controls.style.order = '-1';
        dragRegion.style.justifyContent = 'flex-start';
    } else {
        controls.style.order = '2';
        dragRegion.style.justifyContent = 'space-between';
    }
}

window.changeWindowButtonsStyle = function(style) {
    localStorage.setItem('windowButtonsStyle', style);
    renderWindowButtons();
    applyButtonsPosition();
};

window.changeWindowButtonsPosition = function(position) {
    localStorage.setItem('windowButtonsPosition', position);
    applyButtonsPosition();
};

// Инициализация кнопок при загрузке
setTimeout(() => {
    renderWindowButtons();
    applyButtonsPosition();
}, 500);

    // динамический URL
let currentUrl = '';
let urlTrackingInterval = null;

function updateUrlBar() {
    // Если открыта домашняя страница - показываем специальный URL
    if (globalIsOnHomePage) {
        const urlText = document.getElementById('urlText');
        const urlFavicon = document.getElementById('urlFavicon');
        if (urlText) {
            urlText.innerHTML = '<span class="url-domain">🏠 Home</span><span class="url-path"></span>';
        }
        if (urlFavicon) urlFavicon.style.display = 'none';
        window.currentUrl = 'musichub://home';
        return;
    }
    
    // Иначе - нормальный URL из активного webview
    const wv = document.querySelector('webview.active');
    if (!wv) return;
    
    wv.executeJavaScript('window.location.href')
        .then(url => {
            if (!url) return;
            window.currentUrl = url;  // Сохраняем реальный URL
            let domain = '', path = '';
            try {
                const u = new URL(url);
                domain = u.hostname;
                path = u.pathname + u.search + u.hash;
            } catch(e) {
                domain = url;
            }
            const urlText = document.getElementById('urlText');
            if (urlText) urlText.innerHTML = `<span class="url-domain">${domain}</span><span class="url-path">${path}</span>`;
            
            // Обновляем favicon
            wv.executeJavaScript(`(function(){const l=document.querySelector("link[rel*='icon']");return l?l.href:null;})()`)
                .then(fav => {
                    const img = document.getElementById('urlFavicon');
                    if (img && fav) {
                        img.src = fav;
                        img.style.display = 'inline';
                    }
                })
                .catch(() => {});
        })
        .catch(() => {});
}

function initUrlTracking() {
    // Очищаем старый интервал
    if (urlTrackingInterval) {
        clearInterval(urlTrackingInterval);
    }
    
    const wv = document.querySelector('webview.active');
    if (!wv) return;
    
    // Обновляем сразу
    updateUrlBar();
    
    // Добавляем слушатели событий webview
    const events = ['did-navigate', 'did-navigate-in-page', 'dom-ready', 'did-frame-finish-load'];
    events.forEach(ev => {
        try {
            wv.removeEventListener(ev, updateUrlBar);
            wv.addEventListener(ev, updateUrlBar);
        } catch(e) {}
    });
    
    // Запасной вариант - обновляем каждые 2 секунды (если события не срабатывают)
    urlTrackingInterval = setInterval(() => {
        const activeWv = document.querySelector('webview.active');
        if (activeWv && activeWv === wv) {
            updateUrlBar();
        }
    }, 2000);
}

// При переключении вкладок
const originalSw = window.sw;
if (originalSw) {
    window.sw = function(id, btn) {
        originalSw(id, btn);
        setTimeout(initUrlTracking, 500);
    };
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initUrlTracking, 1000);
});
// ---------- Панель расширений ----------
(function() {
    const extBtn = document.getElementById('extensionsPanelBtn');
    const panel = document.getElementById('extensionsPanel');
    const closePanelBtn = document.getElementById('closeExtensionsPanelBtn');
    const installBtn = document.getElementById('installExtensionBtn');
    
    if (!extBtn || !panel) {
        console.warn('Элементы панели расширений не найдены');
        return;
    }
    
    function togglePanel() {
        const isVisible = panel.classList.contains('show');
        if (isVisible) {
            panel.classList.remove('show');
            setTimeout(() => { panel.style.display = 'none'; }, 200);
        } else {
            panel.style.display = 'block';
            setTimeout(() => panel.classList.add('show'), 10);
            loadExtensionsList();
        }
    }
    
    function closePanel() {
        panel.classList.remove('show');
        setTimeout(() => { panel.style.display = 'none'; }, 200);
    }
    
    async function loadExtensionsList() {
        const listContainer = document.getElementById('extensionsList');
        if (!listContainer) return;
        try {
            const extensions = await window.electronAPI.getExtensions();
            if (!extensions.length) {
                listContainer.innerHTML = '<div style="padding: 12px; text-align: center; opacity: 0.6;">Нет установленных расширений</div>';
                return;
            }
            listContainer.innerHTML = extensions.map(ext => `
                <div class="extension-item" data-id="${ext.id}">
                    ${ext.icon ? `<img class="extension-icon" src="file://${ext.icon}" onerror="this.style.display='none'">` : '<div class="extension-icon" style="background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;">🧩</div>'}
                    <span class="extension-name" title="${ext.name}">${ext.name}</span>
                    <button class="extension-delete" data-id="${ext.id}" title="Удалить">🗑️</button>
                </div>
            `).join('');
            
            // Обработчики удаления
            document.querySelectorAll('.extension-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const extId = btn.dataset.id;
                    if (confirm(`Удалить расширение "${extId}"?`)) {
                        await window.electronAPI.uninstallExtension(extId);
                        loadExtensionsList();
                    }
                });
            });
            
            // Обработчики клика по расширению (можно открыть попап)
            document.querySelectorAll('.extension-item').forEach(item => {
item.addEventListener('click', async (e) => {
    if (e.target.classList.contains('extension-delete')) return;
    const extId = item.dataset.id;
    try {
        await window.electronAPI.openExtensionPopup(extId);
    } catch (err) {
        showToast('Ошибка открытия: ' + err.message, 'error');
    }
});
            });
        } catch (err) {
            console.error('Ошибка загрузки расширений:', err);
            listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: #ff8888;">Ошибка загрузки</div>';
        }
    }
    
    async function installExtensionFlow() {
    const choice = confirm('Установить расширение?    99% не будут работать.\n\n"OK" — ввести ID из Chrome Web Store\n"Отмена" — выбрать папку с расширением');
    if (choice) {
        // Показываем модальное окно для ввода ID
        const modal = document.getElementById('extensionIdModal');
        const input = document.getElementById('extensionIdInputField');
        const okBtn = document.getElementById('extIdOkBtn');
        const cancelBtn = document.getElementById('extIdCancelBtn');
        
        modal.style.display = 'flex';
        input.value = '';
        
        const onOk = async () => {
            const extId = input.value.trim();
            modal.style.display = 'none';
            if (!extId) return;
            
            const statusDiv = document.getElementById('extensionInstallStatus') || (() => {
                const div = document.createElement('div');
                div.id = 'extensionInstallStatus';
                div.style.position = 'fixed';
                div.style.bottom = '20px';
                div.style.right = '20px';
                div.style.background = 'rgba(0,0,0,0.8)';
                div.style.color = '#fff';
                div.style.padding = '8px 16px';
                div.style.borderRadius = '8px';
                div.style.zIndex = '10002';
                document.body.appendChild(div);
                return div;
            })();
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = '⏳ Установка...';
            try {
                const result = await window.electronAPI.installFromChrome(extId);
                if (result.success) {
                    statusDiv.innerHTML = '✅ Установлено! Перезагрузите приложение.';
                    setTimeout(() => statusDiv.style.display = 'none', 3000);
                    loadExtensionsList();
                } else {
                    statusDiv.innerHTML = `❌ ${result.error}`;
                }
            } catch(e) {
                statusDiv.innerHTML = `❌ ${e.message}`;
            }
            clean();
        };
        
        const onCancel = () => {
            modal.style.display = 'none';
            clean();
        };
        
        const clean = () => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
        };
        
        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        
    } else {
        // Установка из папки
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.onchange = async (e) => {
            const path = e.target.files[0]?.path;
            if (path) {
                const result = await window.electronAPI.installExtension(path);
                if (result.success) {
                    showToast('✅ Расширение установлено!', 'success');
                    loadExtensionsList();
                } else {
                    showToast('❌ Ошибка: ' + result.error, 'error');
                }
            }
        };
        input.click();
    }
}
    
    extBtn.addEventListener('click', togglePanel);
    if (closePanelBtn) closePanelBtn.addEventListener('click', closePanel);
    if (installBtn) installBtn.addEventListener('click', installExtensionFlow);
    
    // Закрыть при клике вне панели
    document.addEventListener('click', (e) => {
        if (panel.classList.contains('show') && !panel.contains(e.target) && e.target !== extBtn) {
            closePanel();
        }
    });
})();



window.changeWindowButtonsStyle = function(style) {
    localStorage.setItem('windowButtonsStyle', style);
    if (typeof renderWindowButtons === 'function') renderWindowButtons();
    if (typeof applyButtonsPosition === 'function') applyButtonsPosition();
};
window.changeWindowButtonsPosition = function(pos) {
    localStorage.setItem('windowButtonsPosition', pos);
    if (typeof applyButtonsPosition === 'function') applyButtonsPosition();
};

async function updateNowPlayingArtwork(url) {
    let container = document.getElementById('nowPlayingArtwork');
    if (!container) {
        container = document.createElement('div');
        container.id = 'nowPlayingArtwork';
        container.style.cssText = `
            position: fixed;
            bottom: 0px;
            right: 0px;
            width: 0px;
            height: 0px;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            cursor: pointer;
            z-index: 1000;
            transition: transform 0.2s;
        `;
        container.onclick = () => {
            const img = container.querySelector('img');
            if (img && img.src) {
                const win = window.open();
                win.document.write(`<img src="${img.src}" style="max-width: 100%; background: #000;">`);
            }
        };
        document.body.appendChild(container);
    }
    
    container.innerHTML = `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">`;
    container.style.display = 'block';
    container.style.transform = 'scale(0.9)';
    setTimeout(() => { container.style.transform = 'scale(1)'; }, 50);
    
    clearTimeout(window.artworkTimeout);
    window.artworkTimeout = setTimeout(() => {
        if (container) container.style.display = 'none';
    }, 5000);
}

let lastWindowsTrackKey = '';

function animateColorChange(fromColor, toColor, duration = 500) {
    return new Promise((resolve) => {
        // Парсим цвета
        const from = hexToRgb(fromColor);
        const to = hexToRgb(toColor);
        
        if (!from || !to) {
            document.documentElement.style.setProperty('--accent-color', toColor);
            resolve();
            return;
        }
        
        const startTime = performance.now();
        
        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            // Интерполяция
            const r = Math.floor(from.r + (to.r - from.r) * progress);
            const g = Math.floor(from.g + (to.g - from.g) * progress);
            const b = Math.floor(from.b + (to.b - from.b) * progress);
            const currentColor = `rgb(${r}, ${g}, ${b})`;
            
            document.documentElement.style.setProperty('--accent-color', currentColor);
            
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                document.documentElement.style.setProperty('--accent-color', toColor);
                resolve();
            }
        }
        
        requestAnimationFrame(step);
    });
}

// Конвертер HEX в RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}



async function pollCurrentTrack() {
    try {
        console.log('🔍 Запрашиваем медиа-информацию...');
        const mediaInfo = await window.electronAPI.getWindowsMediaInfo();
        console.log('📦 Получено:', mediaInfo);
        
        if (mediaInfo && mediaInfo.title) {
            const trackKey = `${mediaInfo.artist}|${mediaInfo.title}`;
            console.log('🎵 Трек:', trackKey);
            
            if (trackKey !== lastWindowsTrackKey) {
                lastWindowsTrackKey = trackKey;
                
                if (mediaInfo.artwork_base64) {
                    console.log('🖼️ Есть обложка, длина base64:', mediaInfo.artwork_base64.length);
                    const artworkUrl = `data:image/jpeg;base64,${mediaInfo.artwork_base64}`;
                    updateNowPlayingArtwork(artworkUrl);
                    updatePanelArtwork(artworkUrl);
                } else {
                    console.log('❌ Нет обложки в mediaInfo');
                }
            }
        } else {
            console.log('❌ Нет медиа-информации');
        }
    } catch (err) {
        console.log('Ошибка:', err);
    }
}

// Запускаем раз в секунду
setInterval(pollCurrentTrack, 1000);



// Функция получения названия трека и исполнителя
async function getCurrentTrackInfo() {
    const webview = document.querySelector('webview.active');
    if (!webview) return null;
    
    const jsCode = `
        (function() {
            // YouTube Music
            const ytTitle = document.querySelector('yt-formatted-string.title');
            const ytArtist = document.querySelector('yt-formatted-string.byline');
            if (ytTitle) return { title: ytTitle.innerText, artist: ytArtist?.innerText || '' };
            
            // Яндекс Музыка
            const yaTitle = document.querySelector('.track__title, [class*="track__title"]');
            const yaArtist = document.querySelector('.track__artists, [class*="artists"]');
            if (yaTitle) return { title: yaTitle.innerText, artist: yaArtist?.innerText || '' };
            
            // SoundCloud
            const scTitle = document.querySelector('.playbackSoundBadge__titleLink, .soundTitle__title');
            const scArtist = document.querySelector('.playbackSoundBadge__lightLink, .soundTitle__username');
            if (scTitle) return { title: scTitle.innerText, artist: scArtist?.innerText || '' };
            
            // Spotify
            const spTitle = document.querySelector('[data-testid="context-item-info-title"], [data-testid="now-playing-widget"] [dir="auto"]');
            const spArtist = document.querySelector('[data-testid="context-item-info-artist"], [data-testid="now-playing-widget"] a');
            if (spTitle) return { title: spTitle.innerText, artist: spArtist?.innerText || '' };
            
            return null;
        })();
    `;
    
    try {
        return await webview.executeJavaScript(jsCode);
    } catch(e) {
        return null;
    }
}


async function pollCurrentTrack() {
    const webview = document.querySelector('webview.active');
    if (!webview) return;
    
    await getCurrentTrackInfo();

}

document.getElementById('openArtworkLinkBtn')?.addEventListener('click', () => {
    // Открываем страницу с обложкой (не картинку напрямую)
    const url = 'http://127.0.0.1:3456/';
    window.electronAPI.openExternal(url);
    showToast('🌐 Открыто в браузере', 'info');
});

// Обновляем отображение ссылки
document.getElementById('artworkUrlDisplay').textContent = 'http://127.0.0.1:3456/';

async function updateCurrentArtworkInMain() {
    const mediaInfo = await window.electronAPI.getMediaFromFiles();
    if (mediaInfo && mediaInfo.artwork_base64) {
        // Отправляем свежую обложку в main
        window.electronAPI.updateArtworkForTray(`data:image/jpeg;base64,${mediaInfo.artwork_base64}`);
    }
}

// Функция получения доминирующего цвета из изображения
async function getDominantColorFromImage(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, img.width, img.height);
            
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            
            // Сначала проверяем, черно-белая ли обложка
            let isBlackWhite = true;
            let colorSamples = [];
            
            for (let i = 0; i < data.length; i += 40) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const diff = Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
                if (diff > 30) {
                    isBlackWhite = false;
                    break;
                }
                colorSamples.push((r + g + b) / 3);
            }
            
            // Если черно-белая обложка
            if (isBlackWhite) {
                // Находим среднюю яркость (не слишком темную)
                let avgBrightness = colorSamples.reduce((a, b) => a + b, 0) / colorSamples.length;
                // Берем яркость не ниже 100
                const targetBrightness = Math.max(avgBrightness, 120);
                // Возвращаем серый цвет
                const grayValue = Math.floor(targetBrightness);
                const hex = '#' + ((1 << 24) + (grayValue << 16) + (grayValue << 8) + grayValue).toString(16).slice(1);
                resolve(hex);
                return;
            }
            
            // Для цветных обложек - старая логика
            let bestColor = null;
            let bestScore = -1;
            
            for (let i = 0; i < data.length; i += 20) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                const brightness = (r + g + b) / 3;
                if (brightness < 30) continue;
                
                const avg = (r + g + b) / 3;
                const saturation = Math.abs(r - avg) + Math.abs(g - avg) + Math.abs(b - avg);
                
                let frequency = 1;
                for (let j = 0; j < data.length; j += 20) {
                    if (Math.abs(data[j] - r) < 30 && 
                        Math.abs(data[j+1] - g) < 30 && 
                        Math.abs(data[j+2] - b) < 30) {
                        frequency++;
                    }
                }
                
                let score = saturation * Math.sqrt(frequency) * (brightness / 100);
                
                if (r > g + 30 && r > b + 30) score *= 1.5;
                if (g > r + 30 && g > b + 30) score *= 1.5;
                if (b > r + 30 && b > g + 30) score *= 1.5;
                
                if (score > bestScore) {
                    bestScore = score;
                    bestColor = `rgb(${r}, ${g}, ${b})`;
                }
            }
            
            if (bestColor) {
                const rgb = bestColor.match(/\d+/g);
                const hex = '#' + ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1);
                resolve(hex);
            } else {
                const savedColor = document.getElementById('cp')?.value || '#1DB954';
                resolve(savedColor);
            }
        };
        
        img.onerror = () => {
            const savedColor = document.getElementById('cp')?.value || '#1DB954';
            resolve(savedColor);
        };
        img.src = imageUrl;
    });
}

// Авто-цвет из обложки
let autoColorEnabled = false;
let originalAccentColor = '#1DB954';

function loadAutoColorSetting() {
    autoColorEnabled = localStorage.getItem('autoColorFromArtwork') === 'true';
    const checkbox = document.getElementById('autoColorFromArtwork');
    if (checkbox) checkbox.checked = autoColorEnabled;
}

async function applyColorFromArtwork(artworkUrl) {
    if (!autoColorEnabled || !artworkUrl || artworkUrl === 'null') return;
    
    try {
        const color = await getDominantColorFromImage(artworkUrl);
        if (color && color !== '#000000') {
            changeAccentColor(color, true); // true = анимировать
        }
    } catch (err) {
        console.log('Ошибка получения цвета из обложки:', err);
    }
}

// Сохраняем оригинальный цвет при выключении
function resetToOriginalColor() {
    if (!autoColorEnabled) {
        // Возвращаем СОХРАНЕННЫЙ цвет пользователя
        const savedColor = localStorage.getItem('hubC') || '#1DB954';
        changeAccentColor(savedColor);
    }
}




document.getElementById('autoColorFromArtwork')?.addEventListener('change', async (e) => {
    autoColorEnabled = e.target.checked;
    localStorage.setItem('autoColorFromArtwork', autoColorEnabled);
    
    if (!autoColorEnabled) {
        // Возвращаем цвет пользователя
        const savedColor = localStorage.getItem('hubC') || '#1DB954';
        changeAccentColor(savedColor);
    } else {
        // Если включили - сразу применить цвет из текущей обложки
        const artwork = document.getElementById('panelArtwork')?.src;
        if (artwork && artwork !== '') {
            const color = await getDominantColorFromImage(artwork);
            if (color) changeAccentColor(color);
        }
    }
});

function changeAccentColor(color) {
    document.documentElement.style.setProperty('--accent-color', color);
    localStorage.setItem('hubC', color);
    
    // Если авто-цвет выключен - сохраняем как пользовательский
    if (!autoColorEnabled) {
        localStorage.setItem('userAccentColor', color);
    }
}


// ========== ПРОСТОЙ ГРАДИЕНТ ==========
let simpleGradientEnabled = false;

function initSimpleGradient() {
    simpleGradientEnabled = localStorage.getItem('simpleGradientEnabled') === 'true';
    const checkbox = document.getElementById('simpleGradientCheckbox');
    if (checkbox) checkbox.checked = simpleGradientEnabled;
    
    // НЕ ПРИМЕНЯЕМ ГРАДИЕНТ ПРИ ЗАГРУЗКЕ, ТОЛЬКО ЕСЛИ ВКЛЮЧЕН
    if (simpleGradientEnabled) {
        const artwork = document.getElementById('panelArtwork')?.src;
        if (artwork && artwork !== '') {
            updateSimpleGradient(artwork);
        }
    } else {
        removeSimpleGradient();
    }
}

function applySimpleGradient(color) {
    if (!window.originalBodyBg) {
        window.originalBodyBg = document.body.style.background;
    }
    
    const darkColor = '#0a0a0a';
    animateGradient([color, darkColor], 800);
}

function removeSimpleGradient() {
    // Возвращаем стандартный темный фон (не #000000, а #0a0a0a)
    const theme = document.body.classList.contains('dark-theme') ? '#0a0a0a' : '#f5f5f5';
    document.body.style.background = theme;
}

async function getColorFromArtworkSimple(artworkUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 30;
            canvas.height = 30;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 30, 30);
            
            const pixel = ctx.getImageData(15, 15, 1, 1).data;
            const r = Math.floor(pixel[0] * 0.5);
            const g = Math.floor(pixel[1] * 0.5);
            const b = Math.floor(pixel[2] * 0.5);
            
            resolve(`rgb(${r}, ${g}, ${b})`);
        };
        img.onerror = () => resolve('#000000');
        img.src = artworkUrl;
    });
}

async function updateSimpleGradient(artworkUrl) {
    if (!simpleGradientEnabled || !artworkUrl || artworkUrl === 'null') return;
    
    const color = await getColorFromArtworkSimple(artworkUrl);
    
    // Добавляем fade эффект
    const bg = document.body;
    bg.style.transition = 'background 0.8s ease-in-out';
    bg.style.background = `radial-gradient(circle at 30% 40%, ${color}, #0a0a0a)`;
    
    // Сбрасываем transition
    setTimeout(() => {
        bg.style.transition = '';
    }, 800);
}



// Обработчик
document.getElementById('simpleGradientCheckbox')?.addEventListener('change', (e) => {
    simpleGradientEnabled = e.target.checked;
    localStorage.setItem('simpleGradientEnabled', simpleGradientEnabled);
    
    if (simpleGradientEnabled) {
        // Берем цвет из текущей обложки
        const artwork = document.getElementById('panelArtwork')?.src;
        if (artwork && artwork !== '') {
            updateSimpleGradient(artwork);
        } else {
            applySimpleGradient('#1DB954');
        }
    } else {
        removeSimpleGradient();
    }
});


function updateUrlBarForHomePage() {
    const urlText = document.getElementById('urlText');
    const urlFavicon = document.getElementById('urlFavicon');
    
    if (urlText) {
        urlText.innerHTML = '<span class="url-domain">🏠 Home</span><span class="url-path"></span>';
    }
    if (urlFavicon) {
        urlFavicon.style.display = 'none';
    }
    
    // Устанавливаем специальный URL для копирования
    window.currentUrl = 'musichub://home';
}



// ========== НОВАЯ СИСТЕМА ОБЛОЖЕК ЧЕРЕЗ ФАЙЛЫ ==========
let lastTrackKey = '';

async function pollMediaFiles() {
    try {
        const mediaInfo = await window.electronAPI.getMediaFromFiles();
        
        if (mediaInfo && mediaInfo.title) {
            const trackKey = `${mediaInfo.artist}|${mediaInfo.title}`;
            
            if (trackKey !== lastTrackKey) {
                lastTrackKey = trackKey;
                console.log('🎵 Трек:', mediaInfo.artist, '-', mediaInfo.title);
                
                // Сохраняем в историю

                
        const activeService = document.querySelector('webview.active')?.id || 'unknown';
        saveTrackToHistory(mediaInfo.title, mediaInfo.artist || 'Неизвестен', activeService);
                
                // Обновляем UI домашней страницы если она открыта
                if (typeof globalIsOnHomePage !== 'undefined' && globalIsOnHomePage && typeof updateStatsUI === 'function') {
                    updateStatsUI();
                }
                
                // Получаем обложку из MAIN
                const artworkBase64 = await window.electronAPI.getArtworkFromServer();
                
                if (artworkBase64) {
                    const artworkUrl = `data:image/jpeg;base64,${artworkBase64}`;
                    updateNowPlayingArtwork(artworkUrl);
                    updatePanelArtwork(artworkUrl);
                    
                    if (window.electronAPI.updateArtworkForTray) {
                        window.electronAPI.updateArtworkForTray(artworkUrl);
                    }
                    
                    if (simpleGradientEnabled) await updateSimpleGradient(artworkUrl);
                    await applyColorFromArtwork(artworkUrl);
                }
            }
        }
    } catch (err) {
        console.log('Ошибка:', err);
    }
}

// Новая функция получения обложки через сервер
async function getArtworkFromServer() {
    try {
        const response = await fetch('http://127.0.0.1:3456/artwork');
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch(err) {
        console.log('Server artwork error:', err);
        return null;
    }
}
// Запускаем проверку каждую секунду
setInterval(pollMediaFiles, 1000);

function isSoundPlayingFromAnalyser() {
    if (!analyser || useFakeVisualizer) return false;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    
    // Проверяем, есть ли хоть какой-то уровень громкости
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    
    // Если средний уровень выше порога - звук есть
    return avg > 5; // порог можно настроить
}

// ========== ИНИЦИАЛИЗАЦИЯ ДОМАШНЕЙ СТРАНИЦЫ (В КОНЦЕ ФАЙЛА) ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация домашней страницы');


    globalIsOnHomePage = false;
    globalUpdateStatsUI = updateStatsUI;
    globalSaveTrackToHistory = saveTrackToHistory;
    let lastActiveWebview = null;
    let bgWebview = null;
    let bgServiceActive = false;
    let mixActive = false;
    let currentPlayingService = null;
    let yandexWebview = null;
    let youtubeWebview = null;
    let lastTrackTitle = '';
    let trackChangeTimeout = null;
    let lastActiveBeforeTemp = null;
    let tempWebviewOpened = false;
    
    // ========== ФУНКЦИИ ДОМАШНЕЙ СТРАНИЦЫ ==========
    
    function createHomePage() {
    if (document.getElementById('homePage')) return;
    
    const content = document.getElementById('content');
    if (!content) {
        console.error('❌ Контейнер content не найден');
        return;
    }
    
    const homePage = document.createElement('div');
    homePage.id = 'homePage';
    homePage.style.cssText = 'display: none; width: 100%; height: 100%; overflow-y: auto; background: var(--bg-primary);';
    homePage.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto; padding: 20px;">
            
            <!-- Сейчас играет -->
            <div class="home-card">
                <h3>🎵 Сейчас играет</h3>
                <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                    <img id="homeArtwork" src="" style="width: 120px; height: 120px; border-radius: 16px; object-fit: cover; background: var(--bg-secondary); box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <div style="flex: 1; min-width: 150px;">
                        <div id="homeTrackTitle" style="font-size: 20px; font-weight: 700; margin-bottom: 4px;">-</div>
                        <div id="homeTrackArtist" style="color: var(--text-secondary); font-size: 14px; margin-bottom: 8px;">-</div>
                        <div id="homeService" style="font-size: 12px; color: var(--accent-color);"></div>
                    </div>
                </div>
            </div>

            <!-- МЕДИА-УПРАВЛЕНИЕ (ВМЕСТО ФОНОВЫХ ПЛЕЕРОВ) -->
            <div class="home-card" style="background: var(--bg-secondary); border: 1px solid var(--border-color);">
                <h3 style="margin-bottom: 16px;">🎮 Управление воспроизведением</h3>
                
                <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; align-items: center;">
                    <!-- Предыдущий -->
                    <button id="mediaPrevBtn" class="media-control-btn" title="Предыдущий трек (Ctrl+Shift+←)">
                        <span style="font-size: 28px;">⏮</span>
                        <span style="font-size: 10px; margin-top: 4px;">Назад</span>
                    </button>
                    
                    <!-- Play/Pause -->
                    <button id="mediaPlayBtn" class="media-control-btn primary" title="Play/Pause (Ctrl+Shift+Space)">
                        <span style="font-size: 40px;" id="playIcon">▶</span>
                        <span style="font-size: 10px; margin-top: 4px;" id="playLabel">Воспроизвести</span>
                    </button>
                    
                    <!-- Стоп (полная остановка) -->
                    <button id="mediaStopBtn" class="media-control-btn stop" title="Полная остановка (Ctrl+Shift+.)">
                        <span style="font-size: 28px;">⏹</span>
                        <span style="font-size: 10px; margin-top: 4px;">Стоп</span>
                    </button>
                    
                    <!-- Следующий -->
                    <button id="mediaNextBtn" class="media-control-btn" title="Следующий трек (Ctrl+Shift+→)">
                        <span style="font-size: 28px;">⏭</span>
                        <span style="font-size: 10px; margin-top: 4px;">Вперед</span>
                    </button>
                </div>

                <!-- Статус -->
                <div id="mediaStatus" style="text-align: center; margin-top: 12px; font-size: 12px; color: var(--text-secondary);">
                    🎵 Готов к управлению
                </div>

                <!-- Индикатор громкости -->
                <div style="margin-top: 12px; display: flex; align-items: center; gap: 12px; justify-content: center;">
                    <span style="font-size: 14px;">🔊</span>
                    <input type="range" id="homeVolumeSlider" min="0" max="100" value="100" 
                           style="flex: 1; max-width: 200px; height: 4px; -webkit-appearance: none; background: #444; border-radius: 2px;">
                    <span id="homeVolumeDisplay" style="font-size: 12px; min-width: 40px;">100%</span>
                </div>
            </div>

            <!-- Умное управление (нейросеть) -->
            <div class="home-card" style="border: 2px solid var(--accent-color); background: rgba(29,185,84,0.05);">
                <h3>🧠 Умное управление (AI)</h3>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <input type="text" id="aiCommandInput" placeholder='Например: "включи следующий трек" или "сделай погромче"' 
                           style="flex: 1; min-width: 200px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-primary); color: var(--text-primary);">
                    <button id="aiCommandBtn" class="btn-primary" style="padding: 10px 20px;">🚀 Выполнить</button>
                </div>
                <div id="aiCommandResult" style="margin-top: 10px; font-size: 13px; color: var(--text-secondary); min-height: 20px;"></div>
                
                <!-- Быстрые команды -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px;">
                    <button class="quick-ai-btn" data-command="play">▶ Включить</button>
                    <button class="quick-ai-btn" data-command="pause">⏸ Пауза</button>
                    <button class="quick-ai-btn" data-command="next">⏭ Следующий</button>
                    <button class="quick-ai-btn" data-command="prev">⏮ Предыдущий</button>
                    <button class="quick-ai-btn" data-command="stop">⏹ Стоп</button>
                    <button class="quick-ai-btn" data-command="volume_up">🔊 Громче</button>
                    <button class="quick-ai-btn" data-command="volume_down">🔉 Тише</button>
                </div>
            </div>

            <!-- Статистика -->
            <div class="home-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0;">📊 Твоя статистика</h3>
                    <button id="clearStatsBtn" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 16px;" title="Очистить статистику">🗑️</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div>
                        <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">🏆 Топ исполнители</div>
                        <div id="topArtistsContainer" style="font-size: 13px;">Загрузка...</div>
                    </div>
                    <div>
                        <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">🤖 AI комментарий</div>
                        <div id="aiStatus" style="font-size: 10px; opacity: 0.6;">✨ креативный режим</div>
                        <div id="aiCommentary" style="font-size: 13px; font-style: italic; padding: 8px; background: var(--bg-secondary); border-radius: 10px; min-height: 80px;">
                            💭 Загрузка...
                        </div>
                    </div>
                </div>
                <div style="margin-top: 16px;">
                    <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">📈 Активность за неделю</div>
                    <div id="statsContainer"></div>
                </div>
            </div>
        </div>
    `;
    
    content.appendChild(homePage);
    console.log('✅ homePage создана динамически с медиа-управлением');
}
    
function showHomePage() {
    console.log('🏠 showHomePage вызвана');
    
    if (!document.getElementById('homePage')) {
        createHomePage();
    }

        if (tempWebviewOpened) {
        closeTempWebview();
    }
    
    const homePage = document.getElementById('homePage');
    const webviews = document.querySelectorAll('webview');
    
    if (!homePage) {
        console.error('❌ homePage не найдена');
        return;
    }
    
    // Принудительно показываем home page
    homePage.style.display = 'block';
    globalIsOnHomePage = true;
    
    // Скрываем webview
    webviews.forEach(wv => {
        wv.style.opacity = '0';
        wv.style.pointerEvents = 'none';
    });
    
    homePage.style.display = 'block';
    globalIsOnHomePage = true;
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        const effectLayer = btn.querySelector('.effect-layer');
        if (effectLayer) effectLayer.className = 'effect-layer none';
    });
    
    updateHomeContent();
    
    // ✅ Обновляем URL bar для домашней страницы
    updateUrlBarForHomePage();
    
    if (typeof updateStatsUI === 'function') {
        updateStatsUI();
    }
    
    if (window.homeUpdateInterval) clearInterval(window.homeUpdateInterval);
    window.homeUpdateInterval = setInterval(updateHomeContent, 5000);
}

globalShowHomePage = showHomePage;
    
function hideHomePage() {
    console.log('🏠 hideHomePage вызвана');
    
    const homePage = document.getElementById('homePage');
    const webviews = document.querySelectorAll('webview');
    
    if (!homePage) return;
    
    homePage.style.display = 'none';
    
    webviews.forEach(wv => {
        unfreezeWebview(wv);
        wv.style.opacity = '1';
        wv.style.pointerEvents = 'auto';
    });
    
    if (lastActiveWebview) {
        const activeBtn = document.getElementById(`btn-${lastActiveWebview}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
            const effectLayer = activeBtn.querySelector('.effect-layer');
            if (effectLayer) effectLayer.className = `effect-layer ${currentBtnEffect}`;
        }
    }
    
    globalIsOnHomePage = false;
    
    // Обновляем URL после закрытия homePage
    setTimeout(() => {
        updateUrlBar();
    }, 200);
    
    if (window.homeUpdateInterval) {
        clearInterval(window.homeUpdateInterval);
        window.homeUpdateInterval = null;
    }
}

// Делаем функцию глобальной
globalHideHomePage = hideHomePage;
    

    


    async function updateHomeContent() {
    try {
        // Получаем информацию о текущем треке
        const mediaInfo = await window.electronAPI.getMediaFromFiles();
        
        if (mediaInfo && mediaInfo.title) {
            const titleEl = document.getElementById('homeTrackTitle');
            const artistEl = document.getElementById('homeTrackArtist');
            const artworkEl = document.getElementById('homeArtwork');
            const serviceEl = document.getElementById('homeService');
            
            if (titleEl) titleEl.textContent = mediaInfo.title;
            if (artistEl) artistEl.textContent = mediaInfo.artist || 'Неизвестен';
            
            if (artworkEl && mediaInfo.artwork_base64) {
                artworkEl.src = `data:image/jpeg;base64,${mediaInfo.artwork_base64}`;
            }
            
            if (serviceEl) {
                const activeWv = document.querySelector('webview.active');
                const serviceName = activeWv?.id || 'unknown';
                const service = services.find(s => s.id === serviceName);
                serviceEl.textContent = service ? service.name : serviceName;
            }
        }
    } catch(e) {
        console.log('Ошибка получения трека:', e);
    }
    
    // Обновляем список сервисов на домашней странице
    const homeServicesDiv = document.getElementById('homeServices');
    if (homeServicesDiv && activeServices) {
        homeServicesDiv.innerHTML = '';
        activeServices.forEach(serviceId => {
            let icon = '🌐', name = '';
            if (serviceId.startsWith('custom_')) {
                const idx = parseInt(serviceId.split('_')[1]);
                name = customSites[idx]?.name || 'Сайт';
            } else {
                const service = services.find(s => s.id === serviceId);
                if (service) {
                    icon = service.icon;
                    name = service.name;
                }
            }
            const btn = document.createElement('button');
            btn.className = 'home-service-btn';
            btn.innerHTML = `${icon} ${name}`;
            btn.onclick = () => {
                const targetBtn = document.getElementById(`btn-${serviceId}`);
                if (targetBtn) {
                    sw(serviceId, targetBtn);
                    hideHomePage();
                }
            };
            homeServicesDiv.appendChild(btn);
        });
    }
}
    
    // Функции фонового плеера
async function startBackgroundPlayer(service, url, clickSelector) {
    const bgStatus = document.getElementById('bgStatus');
    if (!bgStatus) return;
    
    if (bgWebview && !bgWebview.isDestroyed) {
        bgWebview.remove();
        bgWebview = null;
    }
    
    bgStatus.innerHTML = '⏳ Запуск фонового плеера...';
    bgStatus.style.color = 'orange';
    
    let loadAttempts = 0;
    let isPlayingStarted = false;
    
    bgWebview = document.createElement('webview');
    bgWebview.id = 'bgWebview';
    bgWebview.style.cssText = 'position: absolute; top: -9999px; left: -9999px; width: 1px; height: 1px; visibility: hidden;';
    bgWebview.partition = 'persist:music';
    
    document.getElementById('content').appendChild(bgWebview);
    
bgWebview.addEventListener('dom-ready', () => {
    try {
        bgWebview.setAudioMuted(false);
        
        // Специально для YouTube - пытаемся запустить видео
        if (service === 'YouTube Музыка') {
            bgWebview.executeJavaScript(`
                // Ждём загрузки плеера
                setTimeout(() => {
                    const video = document.querySelector('video');
                    if (video) {
                        video.volume = 1;
                        video.play().catch(e => console.log('Автоплей заблокирован'));
                    }
                    const playBtn = document.querySelector('ytmusic-player-bar #play-pause-button');
                    if (playBtn && playBtn.getAttribute('play-button-state') === 'paused') {
                        playBtn.click();
                    }
                }, 3000);
            `);
        }
        
    } catch(e) {}
});
    
    // Функция для поиска кнопки Play на Яндекс Музыке
    const findYandexPlayButton = async () => {
        const jsCode = `
            (function() {
                // Все возможные варианты кнопки Play на Яндекс Музыке
                const possibleButtons = [
                    '.player-controls__btn_play',
                    '[data-testid="play-button"]',
                    'button[aria-label="Воспроизвести"]',
                    '.play-button',
                    'div.player-controls__btn_play',
                    'button[class*="play"]',
                    '.track__play-button',
                    '[class*="play_btn"]'
                ];
                
                for (const selector of possibleButtons) {
                    const btn = document.querySelector(selector);
                    if (btn && btn.offsetParent !== null) {
                        return selector;
                    }
                }
                
                // Поиск по тексту или aria-label
                const allButtons = document.querySelectorAll('button');
                for (const btn of allButtons) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const title = (btn.getAttribute('title') || '').toLowerCase();
                    if (label.includes('play') || label.includes('воспроиз') || title.includes('play')) {
                        return 'button[aria-label*="play"], button[title*="play"]';
                    }
                }
                
                return null;
            })();
        `;
        
        try {
            const selector = await bgWebview.executeJavaScript(jsCode);
            if (selector) {
                await bgWebview.executeJavaScript(`
                    const btn = document.querySelector('${selector}');
                    if (btn) btn.click();
                `);
                return true;
            }
        } catch(e) {
            console.log('Ошибка поиска кнопки:', e);
        }
        return false;
    };
    
    // Функция для YouTube
const findYoutubePlayButton = async () => {
    const jsCode = `
        (function() {
            // Все возможные селекторы для кнопки воспроизведения
            const selectors = [
                '#action-buttons ytmusic-play-button-renderer',
                '#action-buttons > ytmusic-play-button-renderer',
                'ytmusic-responsive-header-renderer #action-buttons ytmusic-play-button-renderer',
                'ytmusic-play-button-renderer[aria-label*="воспроизвести" i]',
                'ytmusic-play-button-renderer[aria-label*="Play" i]',
                '#action-buttons ytmusic-play-button-renderer[state="default"]',
                'ytmusic-responsive-header-renderer #action-buttons ytmusic-play-button-renderer[state="default"]'
            ];
            
            let clicked = false;
            
            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn) {
                    // Серия событий для гарантии клика
                    btn.focus();
                    
                    // Отправляем разные типы событий
                    const events = ['click', 'mousedown', 'mouseup'];
                    events.forEach(eventType => {
                        btn.dispatchEvent(new MouseEvent(eventType, {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        }));
                    });
                    
                    // Обычный клик
                    btn.click();
                    
                    console.log('✅ Клик по селектору:', selector);
                    clicked = true;
                    break;
                }
            }
            
            // Если не нашли по селекторам, ищем любую кнопку play
            if (!clicked) {
                const allPlayButtons = document.querySelectorAll('[class*="play-button"], [class*="PlayButton"], ytmusic-play-button-renderer');
                for (const btn of allPlayButtons) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    if (label.includes('воспроизвести') || label.includes('play')) {
                        btn.click();
                        console.log('✅ Клик по найденной кнопке, label:', label);
                        clicked = true;
                        break;
                    }
                }
            }
            
            return { clicked: clicked, url: window.location.href };
        })();
    `;
    
    try {
        const result = await bgWebview.executeJavaScript(jsCode);
        console.log('📊 Результат клика:', result);
        
        if (result && result.clicked) {
            bgStatus.innerHTML = `🎵 ${service}: Воспроизведение запущено!`;
            bgStatus.style.color = '#1DB954';
            bgServiceActive = true;
            return true;
        }
    } catch(e) {
        console.log('Ошибка YouTube:', e);
    }
    return false;
};
    
bgWebview.addEventListener('did-finish-load', async () => {
    loadAttempts++;
    
    // Получаем текущий URL для отладки
    const currentUrl = await bgWebview.executeJavaScript('window.location.href');
    console.log(`✅ Фоновый ${service} загружен (попытка ${loadAttempts})`);
    console.log(`📍 Текущий URL: ${currentUrl}`);
    console.log(`✅ Фоновый ${service} загружен (попытка ${loadAttempts})`);
    
    if (isPlayingStarted) return;
    
    // Увеличиваем задержку до 5 секунд для полной загрузки плейлиста
    setTimeout(async () => {
        let success = false;
        
        if (service === 'Яндекс Музыка') {
            success = await findYandexPlayButton();
        } else if (service === 'YouTube Музыка') {
            success = await findYoutubePlayButton();
            // Если не нашли, пробуем ещё раз через 3 секунды
            if (!success) {
                setTimeout(async () => {
                    const retry = await findYoutubePlayButton();
                    if (retry) {
                        isPlayingStarted = true;
                        bgServiceActive = true;
                        bgStatus.innerHTML = `🎵 ${service}: Воспроизведение запущено!`;
                        bgStatus.style.color = '#1DB954';
                    }
                }, 3000);
            }
        }
        
        if (success) {
            isPlayingStarted = true;
            bgServiceActive = true;
            bgStatus.innerHTML = `🎵 ${service}: Воспроизведение запущено!`;
            bgStatus.style.color = '#1DB954';
            console.log(`✅ ${service} успешно запущен`);
        } else if (loadAttempts < 3) {
            bgStatus.innerHTML = `🔄 ${service}: Повторная попытка...`;
        } else {
            bgStatus.innerHTML = `⚠️ ${service}: Не удалось запустить. Возможно, нужно войти в аккаунт.`;
        }
    }, 5000); // 5 секунд
});
    
    bgWebview.addEventListener('did-fail-load', (e) => {
        if (e.errorCode === -3) return;
        console.log('❌ Ошибка:', e.errorCode);
        if (!isPlayingStarted && loadAttempts < 3) {
            setTimeout(() => {
                if (bgWebview && !bgWebview.isDestroyed) {
                    bgWebview.loadURL(url);
                }
            }, 2000);
        }
    });
    
    // Для Яндекс Музыки сразу грузим радио
    if (service === 'Яндекс Музыка') {
        bgWebview.src = 'https://music.yandex.ru/radio';
    } else {
        bgWebview.src = url;
    }
    
    setTimeout(() => {
        if (!isPlayingStarted) {
            bgStatus.innerHTML = `⚠️ ${service}: Автозапуск не удался. Войдите в аккаунт в основном окне.`;
        }
    }, 20000);
}
    
function stopBackgroundPlayer() {
    // Если микс активен, останавливаем его
    if (mixActive) {
        mixActive = false;
        stopMixMonitoring();
        const mixBtn = document.getElementById('bgMixBtn');
        if (mixBtn) {
            mixBtn.style.background = '#9b59b6';
            mixBtn.textContent = '🔄 Микс (Яндекс + YouTube)';
        }
    }
    
    if (bgWebview && !bgWebview.isDestroyed) {
        try {
            bgWebview.executeJavaScript(`
                const audio = document.querySelector('audio');
                const video = document.querySelector('video');
                if (audio) audio.pause();
                if (video) video.pause();
            `);
        } catch(e) {}
        bgWebview.remove();
        bgWebview = null;
    }
    bgServiceActive = false;
    const bgStatus = document.getElementById('bgStatus');
    if (bgStatus) {
        bgStatus.innerHTML = '⏹️ Фоновый плеер остановлен';
        bgStatus.style.color = 'var(--text-secondary)';
    }
}
    
    // Инициализация
    createHomePage();
    
    // Логотип M
    const homeLogo = document.getElementById('homeLogo');
    if (homeLogo) {
        homeLogo.addEventListener('click', () => {
            if (globalIsOnHomePage ) {
                hideHomePage();
            } else {
                showHomePage();
            }
        });
    }
    
    // Кнопки фонового плеера
setTimeout(() => {
    const yandexBtn = document.getElementById('bgYandexBtn');
    const youtubeBtn = document.getElementById('bgYoutubeBtn');
    const stopBtn = document.getElementById('stopBgBtn');
    const mixBtn = document.getElementById('bgMixBtn');

    const youtubeRecUrl = 'https://music.youtube.com/watch?v=4n7sCQvOV5Q&list=RDTMAK5uy_n_5IN6hzAOwdCnM8D8rzrs3vDl12UcZpA&autoplay=1';
    
    if (yandexBtn) {
        yandexBtn.onclick = () => startBackgroundPlayer('Яндекс Музыка', 'https://music.yandex.ru', 'yandex-play');
    }
    if (youtubeBtn) {
        youtubeBtn.onclick = () => {
            const playlistUrl = 'https://music.youtube.com/playlist?list=RDTMAK5uy_n_5IN6hzAOwdCnM8D8rzrs3vDl12UcZpA&nocache=' + Date.now();
            startBackgroundPlayer('YouTube Музыка', playlistUrl, 'ytmusic-play-button-renderer');
        };
    }
    if (stopBtn) {
        stopBtn.onclick = () => stopBackgroundPlayer();
    }

const clearStatsBtn = document.getElementById('clearStatsBtn');
if (clearStatsBtn) {
    clearStatsBtn.onclick = () => {
        if (confirm('🗑️ Точно очистить всю статистику? Это действие необратимо.')) {
            // Очищаем всё!
            localStorage.removeItem('artistListenTime');
            localStorage.removeItem('totalListenTime');
            localStorage.removeItem('dailyListenTime');
            localStorage.removeItem('trackHistory');
            localStorage.removeItem('artistListenTimeSeconds');
            localStorage.removeItem('dailyListenTimeSeconds');
            localStorage.removeItem('totalListenTimeSeconds');
            
            // Очищаем глобальные переменные
            trackHistory = [];
            currentTrackInfo = null;
            currentTrackStartTime = null;
            
            // Сбрасываем накопленное время
            accumulatedTime = 0;
            
            // Сбрасываем счётчики AI
            window.lastAICommentaryTime = null;
            window.tracksSinceLastComment = 0;
            
            // Обновляем UI статистики
            if (typeof updateStatsUI === 'function') {
                updateStatsUI();
            }
            
            // Если home page открыта, обновляем её
            if (globalIsOnHomePage && typeof updateHomeContent === 'function') {
                updateHomeContent();
            }
            
            showToast('📊 Вся статистика очищена!', 'success');
        }
    };
}
    
   


}, 500);
});


async function updateStatsUI() {
    if (typeof getTopArtistsByTime !== 'function') {
        console.log('⏳ Функции статистики ещё не загружены');
        return;
    }
    
    // Проверяем существование элементов
    const topArtistsContainer = document.getElementById('topArtistsContainer');
    const statsContainer = document.getElementById('statsContainer');
    const commentaryContainer = document.getElementById('aiCommentary');
    
    if (!topArtistsContainer && !statsContainer && !commentaryContainer) {
        console.log('⏳ Элементы статистики ещё не созданы');
        return;
    }
    
    const topArtists = getTopArtistsByTime(3);
    const total = getTotalListenTime();
    
    if (topArtistsContainer) {
        const topArtistsHtml = topArtists.length > 0 
            ? `<div style="display: flex; flex-direction: column; gap: 6px;">
                ${topArtists.map((a, i) => `
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between;">
                        <span style="font-size: 16px;">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>${escapeHtml(a.name)}</strong></span>
                        <span style="color: var(--accent-color); font-size: 12px;">${a.formatted}</span>
                    </div>
                `).join('')}
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); text-align: center; font-size: 12px;">
                    🎵 Всего: ${total.formatted} (${total.minutes} мин)
                </div>
               </div>`
            : `<div style="text-align: center; opacity: 0.6; padding: 10px;">🎵 Слушай музыку (от 30 секунд), чтобы появилась статистика!</div>`;
        
        topArtistsContainer.innerHTML = topArtistsHtml;
    }
    
    if (statsContainer) {
        const weekStats = getDetailedStatsForLastDays(7);
        const maxMinutes = Math.max(...weekStats.map(s => Math.floor(s.seconds / 60)), 1);
        
        const statsHtml = `
            <div style="display: flex; justify-content: space-between; align-items: flex-end; height: 60px; gap: 6px;">
                ${weekStats.map(day => {
                    const minutes = Math.floor(day.seconds / 60);
                    return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;">
                        <div style="width: 100%; background: var(--accent-color); height: ${(minutes / maxMinutes) * 50}px; border-radius: 6px; transition: height 0.3s;"></div>
                        <span style="font-size: 10px;">${day.dayName}</span>
                        <span style="font-size: 9px; opacity: 0.7;">${minutes} мин</span>
                    </div>`;
                }).join('')}
            </div>
        `;
        
        statsContainer.innerHTML = statsHtml;
    }
    
    // AI комментарий (обновляем при открытии homePage)
    if (commentaryContainer && globalIsOnHomePage) {
        const commentary = await getAICommentary();
        commentaryContainer.innerHTML = `💭 ${commentary}`;
    }
}






















let globalAudioContext = null;
let globalGainNode = null;
let isVolumeControlled = false;
let currentGlobalVolume = 1.0;

// Создаём AudioContext и перехватываем все аудиопотоки
async function initGlobalAudioControl() {
    if (globalAudioContext) return;
    
    try {
        // Создаём контекст
        globalAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        await globalAudioContext.resume();
        
        // Создаём главный усилитель
        globalGainNode = globalAudioContext.createGain();
        globalGainNode.gain.value = currentGlobalVolume;
        globalGainNode.connect(globalAudioContext.destination);
        
        // Перехватываем создание новых аудиоконтекстов
        const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
        
        // Подменяем конструктор AudioContext
        window.AudioContext = function() {
            const ctx = new OriginalAudioContext();
            
            // Создаём свой узел для этого контекста
            const gainNode = ctx.createGain();
            gainNode.gain.value = currentGlobalVolume;
            gainNode.connect(ctx.destination);
            
            // Перехватываем connect
            const originalConnect = gainNode.connect.bind(gainNode);
            gainNode.connect = function(dest) {
                if (dest === ctx.destination) {
                    return originalConnect(gainNode);
                }
                return originalConnect(dest);
            };
            
            // Сохраняем оригинальный метод
            const originalCreateMediaElementSource = ctx.createMediaElementSource.bind(ctx);
            ctx.createMediaElementSource = function(element) {
                const source = originalCreateMediaElementSource(element);
                source.connect(gainNode);
                return source;
            };
            
            return ctx;
        };
        
        console.log('✅ AudioContext перехвачен, громкость под контролем');
        
        // Обработчик изменения громкости из main
        window.electronAPI?.onVolumeChange?.((event, volume) => {
            if (globalGainNode) {
                globalGainNode.gain.value = volume;
                console.log(`🔊 Громкость изменена на: ${Math.round(volume * 100)}%`);
            }
        });
        
        isVolumeControlled = true;
        
    } catch (err) {
        console.log('AudioContext контроль не удался:', err);
        // Fallback на старый метод
        fallbackVolumeControl();
    }
}

// Фолбэк через медиа-элементы
function fallbackVolumeControl() {
    console.log('🔄 Использую фолбэк контроль громкости');
    
    setInterval(() => {
        if (adaptiveVolumeEnabled) {
            document.querySelectorAll('webview').forEach(webview => {
                webview.executeJavaScript(`
                    document.querySelectorAll('audio, video').forEach(media => {
                        media.volume = ${currentGlobalVolume};
                    });
                `).catch(() => {});
            });
        }
    }, 200);
}

// Установка громкости
function setGlobalVolume(volume) {
    currentGlobalVolume = Math.max(0, Math.min(1, volume));
    
    if (globalGainNode && isVolumeControlled) {
        globalGainNode.gain.value = currentGlobalVolume;
    }
    
    // Отправляем в main для синхронизации
    window.electronAPI?.setMasterVolume?.(currentGlobalVolume);
    
    // Обновляем UI
    const volDisplay = document.getElementById('currentVolumeDisplay');
    if (volDisplay) volDisplay.textContent = Math.round(currentGlobalVolume * 100);
}

// Функция для адаптивной громкости
function adaptiveVolumeUpdate(targetVolume) {
    if (!adaptiveVolumeEnabled) return;
    
    const startVolume = currentGlobalVolume;
    const endVolume = targetVolume;
    const startTime = performance.now();
    const duration = volumeSmoothing * 1000;
    
    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const easeProgress = 1 - Math.pow(1 - progress, 2);
        const newVolume = startVolume + (endVolume - startVolume) * easeProgress;
        
        setGlobalVolume(newVolume);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    
    requestAnimationFrame(animate);
}

// Инициализация при загрузке приложения
setTimeout(() => {
    initGlobalAudioControl();
    
    // Включаем пользовательский жест для AudioContext
    document.body.addEventListener('click', () => {
        if (globalAudioContext && globalAudioContext.state === 'suspended') {
            globalAudioContext.resume();
        }
    }, { once: true });
}, 1000);








// ========== АУДИО-СТРИМИНГ (ПРЯМОЕ УПРАВЛЕНИЕ) ==========

let modernAudioCtx = null;
let modernAnalyser = null;
let modernWs = null;
let modernNextTime = 0;
let modernFirstBuffer = false;
let modernSampleRate = 48000;
let modernChannels = 2;
let audioStreamActive = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ========== API ФУНКЦИИ ==========

// Запуск захвата на сервере
async function startServerCapture(deviceId = '') {
    try {
        console.log(`📤 Запуск захвата: DeviceId=${deviceId}`);
        const resp = await fetch('http://localhost:9876/start-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ DeviceId: deviceId })  // <-- исправлено
        });
        const result = await resp.json();
        console.log('✅ Сервер ответил:', result);
        return result.success;
    } catch (e) {
        console.error('❌ Ошибка запуска захвата:', e);
        return false;
    }
}

// Остановка захвата
async function stopServerCapture() {
    try {
        const resp = await fetch('http://localhost:9876/stop-capture', {
            method: 'POST'
        });
        const result = await resp.json();
        return result.success;
    } catch (e) {
        console.error('❌ Ошибка остановки:', e);
        return false;
    }
}

// Проверка статуса захвата
async function checkCaptureStatus() {
    try {
        const resp = await fetch('http://localhost:9876/capture-status');
        if (!resp.ok) return null;
        return await resp.json();
    } catch (e) {
        return null;
    }
}

// Ожидание запуска захвата
async function waitForCaptureReady(timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        const status = await checkCaptureStatus();
        
        if (status && status.isActive) {
            console.log(`✅ Захват активен (${status.sampleRate}Hz, ${status.channels}ch)`);
            return true;
        }
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`⏳ Ожидание захвата... (${elapsed}с)`);
        await new Promise(r => setTimeout(r, 500));
    }
    
    console.error('❌ Таймаут ожидания захвата');
    return false;
}

// Сохранение настроек на сервере (вызывается только при выходе)
async function saveServerSettings() {
    try {
        await fetch('http://localhost:9876/save-settings', { method: 'POST' });
    } catch (e) {}
}


// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function initAudioSettings() {
    try {
        console.log('🎵 Инициализация аудио-системы...');

        // 1. Режим из localStorage
        const savedMode = localStorage.getItem('audioCaptureMode');
        audioMode = savedMode !== null ? parseInt(savedMode) : 0;

        // 2. ID устройств
        const savedModernDeviceId = localStorage.getItem('audioCaptureDeviceId') || '';
        const savedMicDeviceId = localStorage.getItem('selectedMicDeviceId') || '';

        // 3. Загрузка списков
        await loadModernDevices();
        await loadMicrophoneDevices();

        // 4. UI
        setupAudioUI();

        // 5. Запуск нужного режима
        if (audioMode === 1) {
            console.log('🎤 Modern режим: запуск захвата...');
            
            // ПРЯМОЙ ЗАПУСК
            const started = await startServerCapture(savedModernDeviceId);
            if (!started) {
                console.error('❌ Не удалось запустить захват');
                showToast('❌ Ошибка запуска захвата', 'error');
                return;
            }
            
            // ЖДЁМ ГОТОВНОСТИ
            const ready = await waitForCaptureReady();
            if (!ready) {
                showToast('❌ Захват не запустился', 'error');
                return;
            }
            
            // ПОДКЛЮЧАЕМСЯ
            await initModernAudio();
            
        } else {
            // Классический режим
            if (savedMicDeviceId) {
                const micSelect = document.getElementById('audio-device');
                if (micSelect) micSelect.value = savedMicDeviceId;
                await activateMicrophone(savedMicDeviceId);
            } else {
                useFakeVisualizer = true;
                analyser = null;
                startVisualizer();
            }
        }

        console.log('✅ Аудио-система готова');
    } catch (err) {
        console.error('❌ initAudioSettings:', err);
    }
}

// ========== ЗАГРУЗКА УСТРОЙСТВ (БЕЗ ИЗМЕНЕНИЙ) ==========

async function loadModernDevices() {
    const select = document.getElementById('audioCaptureDevice');
    if (!select) return;
    select.innerHTML = '<option value="">Загрузка...</option>';
    try {
        const devices = await window.electronAPI.getAudioDevices();
        select.innerHTML = '<option value="">По умолчанию</option>';
        devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.Id;
            opt.textContent = d.Name + (d.IsDefault ? ' (по умолчанию)' : '');
            select.appendChild(opt);
        });
        const saved = localStorage.getItem('audioCaptureDeviceId');
        if (saved) select.value = saved;
    } catch (e) {
        console.error('Ошибка загрузки устройств:', e);
        select.innerHTML = '<option value="">Ошибка</option>';
    }
}

async function loadMicrophoneDevices() {
    const select = document.getElementById('audio-device');
    if (!select) return;
    select.innerHTML = '<option value="">🔇 Выключено</option><option value="loading">Загрузка...</option>';
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        select.innerHTML = '<option value="">🔇 Выключено</option>';
        inputs.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            opt.textContent = d.label || 'Микрофон ' + select.options.length;
            select.appendChild(opt);
        });
        const saved = localStorage.getItem('selectedMicDeviceId');
        if (saved && select.querySelector(`option[value="${saved}"]`)) {
            select.value = saved;
        }
    } catch (e) {
        console.error('Ошибка загрузки микрофонов:', e);
        select.innerHTML = '<option value="">Ошибка</option>';
    }
}

// ========== АКТИВАЦИЯ МИКРОФОНА (БЕЗ ИЗМЕНЕНИЙ) ==========

async function activateMicrophone(deviceId) {
    if (!deviceId) {
        useFakeVisualizer = true;
        analyser = null;
        startVisualizer();
        updateAudioStatus();
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        if (!modernAudioCtx) {
            modernAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const micAnalyser = modernAudioCtx.createAnalyser();
        micAnalyser.fftSize = 1024;
        micAnalyser.smoothingTimeConstant = 0.4;
        const source = modernAudioCtx.createMediaStreamSource(stream);
        source.connect(micAnalyser);

        analyser = micAnalyser;
        useFakeVisualizer = false;
        startVisualizer();
        console.log('✅ Микрофон активирован');
    } catch (e) {
        console.error('❌ Ошибка микрофона:', e);
        useFakeVisualizer = true;
        analyser = null;
        startVisualizer();
    }
    updateAudioStatus();
}

function selectAudioDevice(deviceId) {
    localStorage.setItem('selectedMicDeviceId', deviceId);
    if (audioMode === 0) {
        activateMicrophone(deviceId);
    }
}

// ========== НАСТРОЙКА UI ==========

function setupAudioUI() {
    const modeSelect = document.getElementById('audioCaptureMode');
    const classicCont = document.getElementById('classicDeviceContainer');
    const modernCont = document.getElementById('modernDeviceContainer');

    if (!modeSelect) return;

    modeSelect.value = audioMode;
    if (classicCont) classicCont.style.display = audioMode === 0 ? 'block' : 'none';
    if (modernCont) modernCont.style.display = audioMode === 1 ? 'block' : 'none';

    updateAudioStatus();

    // Обработчик смены режима
    modeSelect.removeEventListener('change', modeSelect._listener);
    const listener = async function() {
        const mode = parseInt(this.value);
        audioMode = mode;
        localStorage.setItem('audioCaptureMode', mode);

        if (classicCont) classicCont.style.display = mode === 0 ? 'block' : 'none';
        if (modernCont) modernCont.style.display = mode === 1 ? 'block' : 'none';

        console.log(`🔄 Смена режима на ${mode === 0 ? 'Классический' : 'Modern'}`);

        if (mode === 0) {
            // Останавливаем захват
            closeModernAudio();
            await stopServerCapture();
            
            // Активируем микрофон
            const micSelect = document.getElementById('audio-device');
            const micId = micSelect?.value || '';
            localStorage.setItem('selectedMicDeviceId', micId);
            await activateMicrophone(micId);
            
        } else {
            // Запускаем Modern
            const deviceId = document.getElementById('audioCaptureDevice')?.value ||
                           localStorage.getItem('audioCaptureDeviceId') || '';
            
            const started = await startServerCapture(deviceId);
            if (started) {
                const ready = await waitForCaptureReady();
                if (ready) {
                    await initModernAudio();
                } else {
                    showToast('❌ Захват не запустился', 'error');
                }
            }
        }
        updateAudioStatus();
    };
    modeSelect.addEventListener('change', listener);
    modeSelect._listener = listener;

    // Обработчик смены устройства Modern
    const modernDevice = document.getElementById('audioCaptureDevice');
if (modernDevice) {
    modernDevice.removeEventListener('change', modernDevice._listener);
    const devListener = async function() {
        const deviceId = this.value;
        localStorage.setItem('audioCaptureDeviceId', deviceId);
        console.log(`💾 Сохранено: ${deviceId}`);

        if (audioMode === 1) {
            console.log('🔄 Переключение устройства...');
            closeModernAudio();
            
            const started = await startServerCapture(deviceId);
            if (started) {
                const ready = await waitForCaptureReady();
                if (ready) {
                    await initModernAudio();
                }
            }
        }
    };
    modernDevice.addEventListener('change', devListener);
    modernDevice._listener = devListener;
}
}

// ========== СТАТУС (БЕЗ ИЗМЕНЕНИЙ) ==========

function updateAudioStatus() {
    const div = document.getElementById('audioStatus');
    if (!div) return;

    if (audioMode === 0) {
        div.textContent = useFakeVisualizer ? '🎤 Классический (выкл)' : '🎤 Микрофон';
        div.style.color = useFakeVisualizer ? 'var(--text-secondary)' : '#1DB954';
    } else {
        div.textContent = audioStreamActive ? '✅ Захват активен' : '⏳ Подключение...';
        div.style.color = audioStreamActive ? '#1DB954' : '#ffaa00';
    }
}

// ========== MODERN AUDIO (БЕЗ ИЗМЕНЕНИЙ) ==========

async function initModernAudio() {
    console.log('🟢 initModernAudio');

    if (modernWs) {
        try { modernWs.close(); } catch(e) {}
        modernWs = null;
    }

    audioStreamActive = false;
    modernFirstBuffer = false;
    reconnectAttempts = 0;
    updateAudioStatus();

    if (!modernAudioCtx) {
        modernAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await modernAudioCtx.resume();
    }
    if (!modernAnalyser) {
        modernAnalyser = modernAudioCtx.createAnalyser();
        modernAnalyser.fftSize = 1024;
        modernAnalyser.smoothingTimeConstant = 0.4;
        modernAnalyser.minDecibels = -90;
        modernAnalyser.maxDecibels = -10;
    }

    modernWs = new WebSocket('ws://localhost:9876/audio-stream');
    modernWs.binaryType = 'arraybuffer';

    let timeout = setTimeout(() => {
        if (modernWs && modernWs.readyState !== WebSocket.OPEN) {
            console.error('❌ Таймаут WebSocket');
            try { modernWs.close(); } catch(e) {}
            modernWs = null;
            audioStreamActive = false;
            updateAudioStatus();
        }
    }, 5000);

    modernWs.onopen = () => {
        clearTimeout(timeout);
        console.log('✅ WebSocket подключен');
        audioStreamActive = true;
        modernFirstBuffer = false;
        modernNextTime = modernAudioCtx.currentTime + 0.1;
        updateAudioStatus();
        analyser = modernAnalyser;
        useFakeVisualizer = false;
        if (typeof startVisualizer === 'function') startVisualizer();
    };

    modernWs.onmessage = (event) => {
        if (typeof event.data === 'string') {
            if (event.data.startsWith('FORMAT:')) {
                try {
                    const fmt = JSON.parse(event.data.substring(7));
                    modernSampleRate = fmt.sampleRate || 48000;
                    modernChannels = fmt.channels || 2;
                    console.log(`🎵 Формат: ${modernSampleRate}Hz, ${modernChannels}ch`);
                } catch (e) {}
            } else if (event.data.startsWith('INFO:Capture not active')) {
                console.warn('⚠️ Захват не активен (не должно быть!)');
                audioStreamActive = false;
                updateAudioStatus();
            }
            return;
        }

        const buffer = event.data;
        if (!buffer || buffer.byteLength <= 4) return;
        try {
            const dataView = new DataView(buffer);
            const pcmLen = dataView.getInt32(0, true);
            if (pcmLen <= 0 || pcmLen > buffer.byteLength - 4) return;

            const floatData = new Float32Array(buffer, 4, pcmLen / 4);
            const samplesPerChannel = (pcmLen / 4) / modernChannels;
            if (samplesPerChannel <= 0) return;
            const duration = samplesPerChannel / modernSampleRate;

            if (!modernFirstBuffer) {
                modernFirstBuffer = true;
                modernNextTime = modernAudioCtx.currentTime + 0.1;
                console.log('🎵 Первый буфер');
            }

            const audioBuffer = modernAudioCtx.createBuffer(modernChannels, samplesPerChannel, modernSampleRate);
            for (let ch = 0; ch < modernChannels; ch++) {
                const chData = audioBuffer.getChannelData(ch);
                for (let i = 0; i < samplesPerChannel; i++) {
                    chData[i] = floatData[i * modernChannels + ch];
                }
            }
            const source = modernAudioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(modernAnalyser);
            source.start(modernNextTime);
            source.onended = () => source.disconnect();
            modernNextTime += duration;
        } catch (e) {
            console.error('Ошибка обработки аудио:', e);
        }
    };

    modernWs.onerror = (err) => {
        clearTimeout(timeout);
        console.error('❌ WebSocket ошибка:', err);
        audioStreamActive = false;
        updateAudioStatus();
    };

    modernWs.onclose = (event) => {
        clearTimeout(timeout);
        console.log(`🔌 WebSocket закрыт (${event.code})`);
        audioStreamActive = false;
        updateAudioStatus();

        if (audioMode === 1 && !window._manualClose && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`🔄 Переподключение ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
            setTimeout(() => { if (audioMode === 1) initModernAudio(); }, 3000);
        }
        window._manualClose = false;
    };
}

function closeModernAudio() {
    window._manualClose = true;
    if (modernWs) {
        try { modernWs.close(); } catch(e) {}
        modernWs = null;
    }
    audioStreamActive = false;
    modernFirstBuffer = false;
    updateAudioStatus();
}

// ========== СОХРАНЕНИЕ ПРИ ВЫХОДЕ ==========

window.addEventListener('beforeunload', () => {
    saveServerSettings();
});

// ========== ОТЛАДКА ==========

window.audioDebug = {
    mode: () => audioMode,
    active: () => audioStreamActive,
    status: async () => {
        const s = await checkCaptureStatus();
        return { mode: audioMode, active: audioStreamActive, server: s };
    },
    restart: async () => {
        closeModernAudio();
        const deviceId = localStorage.getItem('audioCaptureDeviceId') || '';
        await startServerCapture(deviceId);
        const ready = await waitForCaptureReady();
        if (ready) await initModernAudio();
    }
};

console.log('🎵 Аудио-система готова (прямое управление)');




// ============================================================
// ЗАГРУЗКА ГОРЯЧИХ КЛАВИШ ПРИ СТАРТЕ (RENDERER)
// ============================================================

async function loadHotkeysFromMain() {
    try {
        // Запрашиваем сохранённые клавиши из main
        if (window.electronAPI && window.electronAPI.getHotkeysFromStorage) {
            const saved = await window.electronAPI.getHotkeysFromStorage();
            if (saved) {
                console.log('📥 Получены горячие клавиши из main:', saved);
                
                // Обновляем локальные hotkeys
                hotkeys = saved;
                localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
                
                // Обновляем UI
                const mapping = {
                    playpause: 'hotkeyPlayPause',
                    next: 'hotkeyNext',
                    prev: 'hotkeyPrev',
                    stop: 'hotkeyStop',
                    volumeup: 'hotkeyVolumeup',
                    volumedown: 'hotkeyVolumedown'
                };
                
                for (const [action, inputId] of Object.entries(mapping)) {
                    const input = document.getElementById(inputId);
                    if (input && hotkeys[action]) {
                        input.value = hotkeys[action];
                    }
                }
                
                return hotkeys;
            }
        }
        
        // Если не получили из main - загружаем из localStorage
        return loadHotkeys();
    } catch (err) {
        console.error('❌ Ошибка загрузки hotkeys из main:', err);
        return loadHotkeys();
    }
}

// Обработчик из main для загрузки клавиш
if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('load-hotkeys', (event, hotkeysData) => {
        console.log('📥 Получены hotkeys из main (событие):', hotkeysData);
        if (hotkeysData) {
            hotkeys = hotkeysData;
            localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
            
            // Обновляем UI
            const mapping = {
                playpause: 'hotkeyPlayPause',
                next: 'hotkeyNext',
                prev: 'hotkeyPrev',
                stop: 'hotkeyStop',
                volumeup: 'hotkeyVolumeup',
                volumedown: 'hotkeyVolumedown'
            };
            
            for (const [action, inputId] of Object.entries(mapping)) {
                const input = document.getElementById(inputId);
                if (input && hotkeys[action]) {
                    input.value = hotkeys[action];
                }
            }
        }
    });
}


















































// ============================================================
// ТАЙМЕР ПРОГРЕССА ТРЕКА
// ============================================================

let trackProgressSeconds = 0;
let trackProgressTimer = null;
let currentTrackTitle = '';
let currentTrackArtist = '';

// Запуск/остановка таймера
function updateTrackTimer(isPlaying) {
    if (isPlaying) {
        if (!trackProgressTimer) {
            trackProgressTimer = setInterval(() => {
                trackProgressSeconds++;
                sendProgressToMain();
            }, 1000);
            console.log('⏱️ Таймер прогресса запущен');
        }
    } else {
        if (trackProgressTimer) {
            clearInterval(trackProgressTimer);
            trackProgressTimer = null;
            console.log('⏱️ Таймер прогресса остановлен');
        }
    }
}

// Сброс прогресса
function resetTrackProgress() {
    trackProgressSeconds = 0;
    if (trackProgressTimer) {
        clearInterval(trackProgressTimer);
        trackProgressTimer = null;
    }
    sendProgressToMain();
    console.log('🔄 Прогресс сброшен');
}

// Отправка прогресса в main
function sendProgressToMain() {
    if (window.electronAPI && window.electronAPI.sendMobileStatus) {
        window.electronAPI.sendMobileStatus({
            progress: trackProgressSeconds,
            isPlaying: isMediaPlaying || false
        });
    }
}

// ============================================================
// ПЕРЕХВАТ СОБЫТИЙ
// ============================================================

// Перехват смены трека
const originalSaveTrack = window.saveTrackToHistory;
if (originalSaveTrack) {
    window.saveTrackToHistory = function(title, artist, service) {
        originalSaveTrack(title, artist, service);
        
        // Сбрасываем прогресс
        resetTrackProgress();
        currentTrackTitle = title || 'Не играет';
        currentTrackArtist = artist || '—';
        
        // === ОТПРАВЛЯЕМ ПОЛНЫЙ СТАТУС ===
        if (window.electronAPI && window.electronAPI.sendMobileStatus) {
            // Получаем акцентный цвет
            const accentColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--accent-color').trim() || '#1DB954';
            
            // Получаем обложку
            const artworkEl = document.getElementById('homeArtwork') || document.getElementById('panelArtwork');
            const artwork = artworkEl?.src || '';
            
            window.electronAPI.sendMobileStatus({
                title: title || 'Не играет',
                artist: artist || '—',
                artwork: artwork,
                service: service || 'unknown',
                accentColor: accentColor,
                isPlaying: isMediaPlaying || false,
                progress: 0 // Сбрасываем прогресс
            });
        }
        
        // Если трек играет — запускаем таймер
        if (isMediaPlaying) {
            updateTrackTimer(true);
        }
    };
}

// Перехват Play/Pause
const originalUpdatePlay = window.updatePlayButton;
if (originalUpdatePlay) {
    window.updatePlayButton = function(isPlayingState) {
        originalUpdatePlay(isPlayingState);
        updateTrackTimer(isPlayingState);
    };
}

// Получение прогресса из вне (для отладки)
window.getTrackProgress = function() {
    return {
        seconds: trackProgressSeconds,
        isPlaying: isMediaPlaying || false,
        title: currentTrackTitle,
        artist: currentTrackArtist
    };
};

console.log('⏱️ Таймер прогресса инициализирован');






































































































// ============================================================
// ПОЛНАЯ СИСТЕМА ГОРЯЧИХ КЛАВИШ (РАБОТАЕТ СО ВСЕМИ КЛАВИШАМИ)
// ============================================================

// Хранилище
let hotkeys = {};
let rendererHotkeys = {}; // Клавиши, обрабатываемые в renderer
let pressedKeys = new Set();

// Дефолтные клавиши
const DEFAULT_HOTKEYS = {
    playpause: 'Control+Shift+Space',
    next: 'Control+Shift+ArrowRight',
    prev: 'Control+Shift+ArrowLeft',
    stop: 'Control+Shift+Period',
    volumeup: 'Control+Shift+ArrowUp',
    volumedown: 'Control+Shift+ArrowDown'
};

// ============================================================
// НОРМАЛИЗАЦИЯ КЛАВИШ
// ============================================================

function normalizeKeyForBinding(event) {
    const code = event.code;
    const key = event.key;
    
    // Numpad
    if (code.startsWith('Numpad')) return code;
    
    // Стрелки и специальные
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
         'Space', 'Tab', 'Escape', 'Enter', 'Backspace',
         'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
         'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen',
         'Pause', 'ContextMenu'].includes(code)) {
        return code;
    }
    
    // F-клавиши
    if (code.startsWith('F') && code.length <= 3) return code;
    
    // Медиа-клавиши
    if (code.startsWith('Media')) return code;
    
    // Volume
    if (['VolumeUp', 'VolumeDown', 'VolumeMute'].includes(code)) return code;
    
    // Буквы и цифры
    if (key && key.length === 1) {
        if (/[a-zA-Z0-9]/.test(key)) return key.toUpperCase();
        return key;
    }
    
    return key || code;
}

function getBindingFromEvent(event) {
    const keys = [];
    
    if (event.ctrlKey) keys.push('Control');
    if (event.altKey) keys.push('Alt');
    if (event.shiftKey) keys.push('Shift');
    if (event.metaKey) keys.push('Meta');
    
    const mainKey = normalizeKeyForBinding(event);
    if (mainKey && !['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) {
        keys.push(mainKey);
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
    
    return keys.join('+');
}

// ============================================================
// ПРОВЕРКА КОМБИНАЦИИ
// ============================================================

function checkBinding(binding) {
    if (!binding) return false;
    
    const parts = binding.split('+');
    const currentKeys = Array.from(pressedKeys);
    
    // Проверяем модификаторы
    const mods = ['Control', 'Alt', 'Shift', 'Meta'];
    for (const mod of mods) {
        const hasMod = parts.includes(mod);
        const isPressed = currentKeys.includes(mod);
        if (hasMod !== isPressed) return false;
    }
    
    // Проверяем основную клавишу
    const mainKeys = parts.filter(p => !mods.includes(p));
    if (mainKeys.length === 0) return false;
    
    // Проверяем все основные клавиши
    for (const mainKey of mainKeys) {
        if (!currentKeys.includes(mainKey)) return false;
    }
    
    return true;
}

// ============================================================
// ОБРАБОТЧИКИ СОБЫТИЙ
// ============================================================

document.addEventListener('keydown', (e) => {
    // Игнорируем если ввод в поле
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
        return;
    }
    
    // Получаем комбинацию
    const keys = [];
    if (e.ctrlKey) keys.push('Control');
    if (e.altKey) keys.push('Alt');
    if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Meta');
    
    let mainKey = e.key;
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
    if (mainKey.length === 1 && /[a-zA-Z0-9]/.test(mainKey)) {
        mainKey = mainKey.toUpperCase();
    }
    
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(mainKey)) {
        keys.push(mainKey);
    }
    
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
    
    // Проверяем наши hotkeys
    if (window._rendererHotkeys) {
        for (const [action, hotkeyBinding] of Object.entries(window._rendererHotkeys)) {
            if (hotkeyBinding === binding) {
                console.log(`🔔 Renderer клавиша: ${action} (${binding})`);
                e.preventDefault();
                e.stopPropagation();
                
                // Вызываем обработчик
                if (window._hotkeyActions && window._hotkeyActions[action]) {
                    window._hotkeyActions[action]();
                }
                
                // Отправляем в main
                if (window.electronAPI && window.electronAPI.sendHotkeyAction) {
                    window.electronAPI.sendHotkeyAction(action);
                }
                break;
            }
        }
    }
});

window._rendererHotkeys = {};

document.addEventListener('keyup', (e) => {
    const keyName = normalizeKeyForBinding(e);
    pressedKeys.delete(keyName);
    if (!e.ctrlKey) pressedKeys.delete('Control');
    if (!e.altKey) pressedKeys.delete('Alt');
    if (!e.shiftKey) pressedKeys.delete('Shift');
    if (!e.metaKey) pressedKeys.delete('Meta');
});

// ============================================================
// РЕГИСТРАЦИЯ КЛАВИШ
// ============================================================

function registerRendererHotkey(action, binding) {
    if (!binding || binding === '') return;
    console.log(`📥 Регистрация в renderer: ${action} → ${binding}`);
    window._rendererHotkeys[action] = binding;
}


function loadHotkeys() {
    const saved = localStorage.getItem('hotkeys');
    if (saved) {
        try {
            hotkeys = JSON.parse(saved);
            for (const [key, value] of Object.entries(DEFAULT_HOTKEYS)) {
                if (!hotkeys[key]) hotkeys[key] = value;
            }
        } catch (e) {
            hotkeys = { ...DEFAULT_HOTKEYS };
        }
    } else {
        hotkeys = { ...DEFAULT_HOTKEYS };
    }
    localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
    
    // Регистрируем ВСЕ клавиши в renderer (включая поддерживаемые)
    for (const [action, binding] of Object.entries(hotkeys)) {
        registerRendererHotkey(action, binding);
    }
    
    // Отправляем в main
    if (window.electronAPI && window.electronAPI.updateHotkeys) {
        window.electronAPI.updateHotkeys(hotkeys);
    }
    
    return hotkeys;
}

function saveHotkey(action, binding) {
    hotkeys[action] = binding;
    localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
    
    // Регистрируем в renderer
    registerRendererHotkey(action, binding);
    
    // Отправляем в main
    if (window.electronAPI && window.electronAPI.updateHotkeys) {
        window.electronAPI.updateHotkeys(hotkeys);
    }
    
    // Обновляем UI
    updateHotkeysUI();
}

// ============================================================
// UI
// ============================================================

function updateHotkeysUI() {
    const mapping = {
        playpause: 'hotkeyPlayPause',
        next: 'hotkeyNext',
        prev: 'hotkeyPrev',
        stop: 'hotkeyStop',
        volumeup: 'hotkeyVolumeup',
        volumedown: 'hotkeyVolumedown'
    };
    
    for (const [action, inputId] of Object.entries(mapping)) {
        const input = document.getElementById(inputId);
        if (input && hotkeys[action]) {
            input.value = hotkeys[action];
            input.readOnly = true;
        }
    }
}

async function startKeyCapture(action, inputElement) {
    inputElement.value = '🎹 Нажми...';
    inputElement.style.opacity = '0.6';
    inputElement.style.color = 'var(--accent-color)';
    inputElement.focus();
    
    return new Promise((resolve) => {
        let captured = false;
        let timer = null;
        let lastBinding = '';
        
        const onKeyDown = (e) => {
            if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            
            const binding = getBindingFromEvent(e);
            if (binding) {
                lastBinding = binding;
                inputElement.value = binding;
            }
        };
        
        const onKeyUp = (e) => {
            if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift' || e.key === 'Meta') {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            
            let binding = getBindingFromEvent(e);
            if (!binding) binding = lastBinding;
            if (!binding) binding = 'Control+Space';
            
            cleanup();
            resolve(binding);
        };
        
        const cleanup = () => {
            if (timer) clearTimeout(timer);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            captured = true;
        };
        
        timer = setTimeout(() => {
            if (!captured) {
                cleanup();
                resolve(lastBinding || hotkeys[action] || DEFAULT_HOTKEYS[action]);
            }
        }, 5000);
        
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
    });
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function initHotkeysUI() {
    console.log('🎮 Инициализация горячих клавиш...');
    
    loadHotkeys();
    updateHotkeysUI();
    
    // Обработчики кнопок
    document.querySelectorAll('.hotkey-change-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const action = this.dataset.action;
            const mapping = {
                playpause: 'hotkeyPlayPause',
                next: 'hotkeyNext',
                prev: 'hotkeyPrev',
                stop: 'hotkeyStop',
                volumeup: 'hotkeyVolumeup',
                volumedown: 'hotkeyVolumedown'
            };
            
            const input = document.getElementById(mapping[action]);
            if (!input) return;
            
            const binding = await startKeyCapture(action, input);
            input.value = binding;
            input.style.opacity = '1';
            input.style.color = '';
            
            saveHotkey(action, binding);
            showToast(`✅ ${action}: ${binding}`, 'success');
        });
    });
    
    // Кнопка сброса
    document.getElementById('resetHotkeysBtn')?.addEventListener('click', () => {
        for (const [action, value] of Object.entries(DEFAULT_HOTKEYS)) {
            hotkeys[action] = value;
            registerRendererHotkey(action, value);
        }
        localStorage.setItem('hotkeys', JSON.stringify(hotkeys));
        updateHotkeysUI();
        
        if (window.electronAPI && window.electronAPI.updateHotkeys) {
            window.electronAPI.updateHotkeys(hotkeys);
        }
        
        showToast('🔄 Горячие клавиши сброшены', 'success');
    });
}

// ============================================================
// ОБРАБОТЧИК ИЗ MAIN ДЛЯ RENDERER КЛАВИШ
// ============================================================

if (window.electronAPI && window.electronAPI.on) {
    window.electronAPI.on('register-fallback-hotkey', (event, data) => {
        console.log(`📥 Получена fallback клавиша: ${data.action} → ${data.binding}`);
        registerRendererHotkey(data.action, data.binding);
    });
    
    window.electronAPI.on('load-hotkeys', (event, hotkeys) => {
        console.log('📥 Загружены hotkeys из main:', hotkeys);
        for (const [action, binding] of Object.entries(hotkeys)) {
            registerRendererHotkey(action, binding);
        }
    });
}

// ============================================================
// ЗАПУСК
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initHotkeysUI, 500);
});

console.log('🎮 Система горячих клавиш (renderer) инициализирована');
console.log('🎮 Поддерживаются: стрелки, Numpad, медиа-клавиши, Volume');


























// ============================================================
// ПРОВЕРКА ОБНОВЛЕНИЙ (С УМНЫМ ИГНОРИРОВАНИЕМ)
// ============================================================

const WORKER_URL_1 = 'https://tips-proxy.170610maksim.workers.dev';
const APP_VERSION = '3.2.0'; // Текущая версия

// Функция получения игнорируемой версии
function getIgnoredUpdateVersion() {
    return localStorage.getItem('ignoredUpdateVersion') || null;
}

// Функция сохранения игнорируемой версии
function setIgnoredUpdateVersion(version) {
    if (version) {
        localStorage.setItem('ignoredUpdateVersion', version);
    } else {
        localStorage.removeItem('ignoredUpdateVersion');
    }
}

// Функция проверки, нужно ли игнорировать это обновление
function shouldIgnoreUpdate(latestVersion) {
    const ignoredVersion = getIgnoredUpdateVersion();
    if (!ignoredVersion) return false;
    
    // Игнорируем ТОЛЬКО если версия совпадает с той, которую пользователь проигнорировал
    return ignoredVersion === latestVersion;
}

async function checkForUpdates() {
    // Проверяем наличие игнорируемой версии
    const ignoredVersion = getIgnoredUpdateVersion();
    
    try {
        const response = await fetch(`${WORKER_URL_1}/check-update?version=${APP_VERSION}`);
        const data = await response.json();
        
        if (data.updateAvailable) {
            const latestVersion = data.latestVersion;
            
            // Если пользователь проигнорировал ЭТУ конкретную версию — не показываем
            if (shouldIgnoreUpdate(latestVersion)) {
                console.log(`🔇 Версия ${latestVersion} проигнорирована пользователем`);
                return;
            }
            
            console.log(`🆕 Доступна новая версия: ${latestVersion} (текущая: ${APP_VERSION})`);
            showUpdateModal(data);
        } else {
            console.log(`✅ У вас актуальная версия (${APP_VERSION})`);
        }
    } catch (err) {
        console.log('⚠️ Ошибка проверки обновлений:', err);
    }
}

// === МОДАЛЬНОЕ ОКНО (ИСПРАВЛЕННОЕ) ===
function showUpdateModal(data) {
    if (document.getElementById('updateModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'updateModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        z-index: 99999;
        display: flex;
        justify-content: center;
        align-items: center;
        animation: fadeIn 0.3s ease;
    `;
    
    modal.innerHTML = `
        <div style="
            background: var(--bg-secondary, #1a1a1a);
            border-radius: 20px;
            padding: 30px;
            max-width: 420px;
            width: 90%;
            position: relative;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            border: 1px solid var(--border-color, #333);
        ">
            <button id="updateModalClose" style="
                position: absolute;
                top: 12px;
                right: 16px;
                background: none;
                border: none;
                color: #666;
                font-size: 24px;
                cursor: pointer;
                transition: color 0.2s;
                padding: 4px 8px;
                border-radius: 8px;
            " onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#666'">✕</button>
            
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 48px; margin-bottom: 8px;">🆕</div>
                <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary, #fff);">
                    Доступно обновление!
                </h2>
                <p style="color: var(--text-secondary, #999); font-size: 14px; margin-top: 4px;">
                    MusicHub v${data.latestVersion}
                </p>
                <p style="color: #666; font-size: 12px; margin-top: 2px;">
                    Выпущено: ${data.releaseDate}
                </p>
            </div>
            
            <div style="
                background: rgba(255,255,255,0.03);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 20px;
                max-height: 200px;
                overflow-y: auto;
            ">
                <p style="font-size: 13px; font-weight: 600; color: var(--text-secondary, #999); margin-bottom: 8px;">
                    📋 Что нового:
                </p>
                ${data.releaseNotes.map(note => `
                    <div style="
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        padding: 4px 0;
                        font-size: 13px;
                        color: var(--text-primary, #fff);
                    ">
                        <span style="color: var(--accent, #1DB954);">•</span>
                        <span>${note}</span>
                    </div>
                `).join('')}
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="updateDownloadBtn" style="
                    display: block;
                    width: 100%;
                    text-align: center;
                    background: var(--accent, #1DB954);
                    color: #000;
                    padding: 14px;
                    border-radius: 12px;
                    border: none;
                    font-weight: 600;
                    font-size: 16px;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    ⬇️ Скачать обновление
                </button>
                
                <button id="updateDontShowBtn" style="
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 13px;
                    cursor: pointer;
                    padding: 8px;
                    transition: color 0.2s;
                " onmouseover="this.style.color='#999'" onmouseout="this.style.color='#666'">
                    🔕 Не напоминать об этой версии
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчики
    document.getElementById('updateModalClose').addEventListener('click', () => {
        modal.remove();
    });
    
    document.getElementById('updateDownloadBtn').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(data.downloadUrl);
        } else {
            window.open(data.downloadUrl, '_blank');
        }
        modal.remove();
    });
    
    // === ИСПРАВЛЕННАЯ КНОПКА "НЕ НАПОМИНАТЬ" ===
    document.getElementById('updateDontShowBtn').addEventListener('click', () => {
        // Сохраняем КОНКРЕТНУЮ версию, которую пользователь проигнорировал
        setIgnoredUpdateVersion(data.latestVersion);
        modal.remove();
        showToast(`🔕 Уведомления о версии ${data.latestVersion} отключены`, 'info');
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// === ЗАПУСК ПРОВЕРКИ ===
setTimeout(() => {
    checkForUpdates();
}, 3000);

// Для консоли
window.checkForUpdates = checkForUpdates;

console.log(`🔄 MusicHub v${APP_VERSION}`);
console.log('📱 Для проверки обновлений: checkForUpdates()');



// Принудительная проверка (сбрасываем игнор, если пользователь хочет проверить вручную)
window.forceCheckUpdates = function() {
    // Если пользователь проверяет вручную — сбрасываем игнор, чтобы он увидел, если что-то вышло
    setIgnoredUpdateVersion(null);
    checkForUpdates();
};










































// ============================================================
// ПОИСК В YOUTUBE MUSIC ЧЕРЕЗ NEUROСЕТЬ
// ============================================================

// Функция поиска (может вызываться из AI или вручную)
function searchYoutubeMusic(query) {
    if (!query || query.trim() === '') {
        showToast('❌ Введите запрос для поиска', 'error');
        return;
    }
    
    const encodedQuery = encodeURIComponent(query.trim());
    const searchUrl = `https://music.youtube.com/search?q=${encodedQuery}`;
    
    console.log(`🔍 Поиск: ${searchUrl}`);
    
    // Проверяем, активен ли YouTube Music
    const activeWv = document.querySelector('webview.active');
    
    if (activeWv && activeWv.id === 'youtube') {
        // Если уже на YouTube - просто загружаем
        activeWv.loadURL(searchUrl);
        showToast(`🔍 Поиск: "${query}"`, 'success');
    } else {
        // Иначе переключаемся на YouTube Music
        const ytBtn = document.getElementById('btn-youtube');
        if (ytBtn) {
            // Переключаемся
            sw('youtube', ytBtn);
            
            // Через секунду загружаем поиск
            setTimeout(() => {
                const wv = document.querySelector('webview.active');
                if (wv && wv.id === 'youtube') {
                    wv.loadURL(searchUrl);
                    showToast(`🔍 Поиск: "${query}"`, 'success');
                }
            }, 500);
        } else {
            // Если YouTube Music не в активных сервисах - открываем во временном webview
            const tempUrl = `musichub://${searchUrl}`;
            if (window.electronAPI && window.electronAPI.openExternalUrl) {
                window.electronAPI.openExternalUrl(tempUrl);
            }
        }
    }
}

// Обработка команд от AI
function parseSearchCommand(text) {
    // Проверяем разные форматы
    const patterns = [
        /🔍\[SEARCH:(.+?)\]/,           // 🔍[SEARCH:запрос]
        /🔍\[SEARCH:(.+?)\]/i,           // 🔍[search:запрос]
        /поищи?\s+["']?(.+?)["']?/i,     // "поищи Shape of You"
        /найди\s+["']?(.+?)["']?/i,      // "найди Shape of You"
        /ищи\s+["']?(.+?)["']?/i,        // "ищи Shape of You"
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const query = match[1].trim();
            if (query) {
                return query;
            }
        }
    }
    
    return null;
}

// Модифицируем обработчик AI ответа
const originalHandleAIResponse = handleAIResponse;
handleAIResponse = function(text) {
    // Проверяем поисковую команду
    const searchQuery = parseSearchCommand(text);
    if (searchQuery) {
        // Выполняем поиск
        searchYoutubeMusic(searchQuery);
        
        // Возвращаем красивый ответ
        return `🔍 Ищу "${searchQuery}" в YouTube Music...`;
    }
    
    // Если нет поиска - используем старую логику
    if (originalHandleAIResponse) {
        return originalHandleAIResponse(text);
    }
    
    return text;
};



// Глобальная функция для консоли
window.searchYoutubeMusic = searchYoutubeMusic;

console.log('🎵 Поиск в YouTube Music через нейросеть готов!');
console.log('📝 Используйте: searchYoutubeMusic("Shape of You")');
console.log('🧠 В чате: "найди Shape of You" или "🔍[SEARCH:Shape of You]"');
































let mediaWs = null;
let mediaStatusConnected = false;

function connectMediaStatus() {
    try {
        mediaWs = new WebSocket('ws://localhost:9876/audio-stream');
        
        mediaWs.onopen = () => {
            console.log('✅ Подключен к статусу плеера (C#)');
            mediaStatusConnected = true;
            
            // Запрашиваем текущий статус
            mediaWs.send(JSON.stringify({ command: 'sync_status' }));
        };
        
        mediaWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'media_status') {
                    // Обновляем UI
                    const titleEl = document.getElementById('homeTrackTitle');
                    const artistEl = document.getElementById('homeTrackArtist');
                    const playBtn = document.getElementById('mediaPlayBtn');
                    
                    if (titleEl) titleEl.textContent = data.data.title || 'Не играет';
                    if (artistEl) artistEl.textContent = data.data.artist || '—';
                    
                    // Обновляем состояние Play/Pause
                    if (data.data.isPlaying !== undefined) {
                        isMediaPlaying = data.data.isPlaying;
                        updatePlayButton(data.data.isPlaying);
                    }
                    
                    // Отправляем статус на мобильный сервер
                    if (window.electronAPI && window.electronAPI.sendMobileStatus) {
                        window.electronAPI.sendMobileStatus({
                            title: data.data.title || 'Не играет',
                            artist: data.data.artist || '—',
                            isPlaying: data.data.isPlaying || false,
                            progress: data.data.progress || 0,
                            duration: data.data.duration || 0
                        });
                    }
                }
            } catch (e) {
                // Игнорируем ошибки парсинга
            }
        };
        
        mediaWs.onclose = () => {
            console.log('❌ Отключен от статуса плеера');
            mediaStatusConnected = false;
            setTimeout(connectMediaStatus, 3000);
        };
        
        mediaWs.onerror = () => {
            // Ошибка соединения
        };
    } catch (e) {
        console.log('⚠️ Ошибка подключения к статусу плеера:', e);
    }
}

// Запускаем подключение
setTimeout(connectMediaStatus, 2000);


// ============================================================
// ОПРЕДЕЛЕНИЕ PLAY/PAUSE ПО АУДИОДАННЫМ ОТ C#
// ============================================================

let audioWs = null;
let audioConnected = false;
let audioPlaying = false;
let silenceCounter = 0;
const SILENCE_THRESHOLD = 5; // 5 тихих пакетов = пауза
let lastAudioTime = Date.now();

function connectToAudioStream() {
    try {
        audioWs = new WebSocket('ws://localhost:9876/audio-stream');
        audioWs.binaryType = 'arraybuffer';
        
        audioWs.onopen = () => {
            console.log('✅ Подключен к аудиопотоку C#');
            audioConnected = true;
            silenceCounter = 0;
        };
        
        audioWs.onmessage = (event) => {
            // === АНАЛИЗИРУЕМ АУДИОДАННЫЕ ===
            if (event.data instanceof ArrayBuffer) {
                // Есть аудиоданные → звук идёт
                const buffer = event.data;
                if (buffer.byteLength > 4) { // Минимальный размер пакета
                    // Проверяем, есть ли реальные данные (не тишина)
                    const dataView = new DataView(buffer);
                    const pcmLen = dataView.getInt32(0, true);
                    
                    if (pcmLen > 4) {
                        // Проверяем громкость (быстрый анализ)
                        const samples = new Int16Array(buffer, 4, Math.min(pcmLen / 2, 100));
                        let maxSample = 0;
                        for (let i = 0; i < samples.length; i++) {
                            const val = Math.abs(samples[i]);
                            if (val > maxSample) maxSample = val;
                        }
                        
                        // Если есть звук (громкость выше порога)
                        if (maxSample > 100) { // Порог тишины
                            silenceCounter = 0;
                            if (!audioPlaying) {
                                audioPlaying = true;
                                onPlayStateChanged(true);
                            }
                            lastAudioTime = Date.now();
                            return;
                        }
                    }
                }
            }
            
            // Если дошли сюда — звука нет или тишина
            silenceCounter++;
            if (silenceCounter >= SILENCE_THRESHOLD && audioPlaying) {
                audioPlaying = false;
                onPlayStateChanged(false);
            }
        };
        
        audioWs.onclose = () => {
            console.log('❌ Отключен от аудиопотока C#');
            audioConnected = false;
            setTimeout(connectToAudioStream, 3000);
        };
        
        audioWs.onerror = () => {
            // Ошибка соединения — пробуем переподключиться
            setTimeout(connectToAudioStream, 5000);
        };
        
    } catch (e) {
        console.log('⚠️ Ошибка подключения к аудиопотоку:', e);
        setTimeout(connectToAudioStream, 5000);
    }
}

// Обработчик изменения состояния Play/Pause
function onPlayStateChanged(isPlaying) {
    if (isPlaying === isMediaPlaying) return; // Не изменилось
    
    isMediaPlaying = isPlaying;
    console.log(`🎵 ${isPlaying ? '▶️ PLAY' : '⏸️ PAUSE'} (определено по звуку)`);
    
    // Обновляем UI
    updatePlayButton(isPlaying);
    
    // Отправляем на мобильный сервер
    if (window.electronAPI && window.electronAPI.sendMobileStatus) {
        window.electronAPI.sendMobileStatus({
            isPlaying: isPlaying
        });
    }
    
    // Обновляем индикатор звука
    updateSoundIndicator(isPlaying);
}

// Индикатор звука в UI
function updateSoundIndicator(isPlaying) {
    const indicator = document.getElementById('soundIndicator');
    const status = document.getElementById('soundStatus');
    
    if (indicator) {
        indicator.style.width = isPlaying ? '100%' : '0%';
        indicator.style.background = isPlaying ? '#1DB954' : '#444';
        indicator.style.transition = 'width 0.3s';
    }
    
    if (status) {
        status.textContent = isPlaying ? '▶' : '⏸';
        status.style.color = isPlaying ? '#1DB954' : '#888';
    }
}



// Подключаемся к аудиопотоку
setTimeout(connectToAudioStream, 2000);

// Переподключение при переключении вкладок
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !audioConnected) {
        console.log('🔄 Вкладка активна, переподключаюсь...');
        connectToAudioStream();
    }
});

// Остановка при закрытии
window.addEventListener('beforeunload', () => {
    if (audioWs) {
        try { audioWs.close(); } catch(e) {}
    }
});

// Для отладки
window.audioDebug = {
    connected: () => audioConnected,
    playing: () => audioPlaying,
    reconnect: connectToAudioStream
};

console.log('🎤 Audio stream listener готов');

// ============================================================
// ОТПРАВКА СТАТУСА В МОБИЛЬНЫЙ СЕРВЕР
// ============================================================

let mobileStatusInterval = null;
let lastSentStatus = '';




function sendMobileStatusUpdate() {
    if (window.electronAPI && window.electronAPI.sendMobileStatus) {
        // Отправляем ТОЛЬКО обновления, а не всё
        const status = {
            // Только если есть название
            ...(currentTrackTitle && currentTrackTitle !== 'Не играет' && { title: currentTrackTitle }),
            ...(currentTrackArtist && currentTrackArtist !== '—' && { artist: currentTrackArtist }),
            ...(currentArtwork && { artwork: currentArtwork }),
            isPlaying: isMediaPlaying || false,
            volume: currentMediaVolume / 100 || 0.5,
            progress: trackProgressSeconds || 0,
            service: document.querySelector('webview.active')?.id || 'unknown',
            accentColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#1DB954'
        };
        
        window.electronAPI.sendMobileStatus(status);
    }
}

function sendMobileStatus() {
    // Получаем информацию из DOM домашней страницы
    const titleEl = document.getElementById('homeTrackTitle');
    const artistEl = document.getElementById('homeTrackArtist');
    const artworkEl = document.getElementById('homeArtwork');
    const serviceEl = document.getElementById('homeService');
    
    // Получаем акцентный цвет
    const accentColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent-color').trim() || '#1DB954';
    
    // Получаем информацию о текущем треке из медиа-инфо
    let trackTitle = titleEl?.textContent || 'Не играет';
    let trackArtist = artistEl?.textContent || '—';
    let artworkUrl = artworkEl?.src || '';
    
    // Если на домашней странице нет информации — пробуем из panelArtwork
    if (trackTitle === 'Не играет' || trackTitle === '-') {
        const panelTitle = document.getElementById('panelTrackTitle');
        const panelArtwork = document.getElementById('panelArtwork');
        if (panelTitle && panelTitle.textContent !== '—') {
            trackTitle = panelTitle.textContent;
        }
        if (panelArtwork && panelArtwork.src && panelArtwork.src !== '') {
            artworkUrl = panelArtwork.src;
        }
    }
    
    // Если всё ещё нет — пробуем из mediaInfo
    if (trackTitle === 'Не играет' || trackTitle === '-') {
        // Используем данные из последнего трека
        if (window.lastTrackInfo) {
            trackTitle = window.lastTrackInfo.title || 'Не играет';
            trackArtist = window.lastTrackInfo.artist || '—';
        }
    }
    
    // Формируем статус
    const status = {
        title: trackTitle,
        artist: trackArtist,
        artwork: artworkUrl,
        isPlaying: isMediaPlaying || false,
        volume: currentMediaVolume / 100,
        service: document.querySelector('webview.active')?.id || 'unknown',
        progress: 0,
        duration: 0,
        accentColor: accentColor // ← Добавляем акцентный цвет
    };
    
    // Отправляем только если изменилось
    const statusStr = JSON.stringify(status);
    if (statusStr !== lastSentStatus) {
        lastSentStatus = statusStr;
        if (window.electronAPI && window.electronAPI.sendMobileStatus) {
            window.electronAPI.sendMobileStatus(status);
        }
    }
}

// Запускаем отправку статуса каждые 2 секунды
function initMobileStatus() {
    if (mobileStatusInterval) clearInterval(mobileStatusInterval);
    mobileStatusInterval = setInterval(sendMobileStatus, 1000);
}

// Запускаем при загрузке
setTimeout(initMobileStatus, 3000);

// Обработчики команд с мобильного
if (window.electronAPI && window.electronAPI.onMobileCommand) {
    window.electronAPI.onMobileCommand((event, command) => {
        console.log('📱 Команда с телефона:', command);
        switch(command) {
            case 'playpause':
                handlePlayPause();
                break;
            case 'next':
                handleNext();
                break;
            case 'prev':
                handlePrevious();
                break;
        }
    });
}

if (window.electronAPI && window.electronAPI.onMobileVolume) {
    window.electronAPI.onMobileVolume((event, volume) => {
        console.log('📱 Громкость с телефона:', volume);
        setMediaVolume(volume * 100);
        syncVolumeUI(volume * 100);
    });
}






























// ========== DISCORD RPC ==========

async function testDiscordRPC() {
    console.log('🧪 Тестируем Discord RPC из renderer...');
    
    try {
        // 1. Проверяем, доступен ли метод
        if (!window.electronAPI || !window.electronAPI.toggleDiscordRPC) {
            console.log('❌ electronAPI.toggleDiscordRPC не доступен');
            return;
        }
        
        console.log('✅ electronAPI.toggleDiscordRPC доступен');
        
        // 2. Включаем RPC
        console.log('📤 Включаем RPC...');
        await window.electronAPI.toggleDiscordRPC(true);
        console.log('✅ Команда отправлена в main');
        
        // 3. Ждём 2 секунды и отправляем тестовый трек
        setTimeout(() => {
            console.log('📤 Отправляем тестовый трек...');
            if (window.electronAPI && window.electronAPI.updateTrackInfo) {
                window.electronAPI.updateTrackInfo({
                    title: 'Тестовый трек из браузера',
                    artist: 'MusicHub Test'
                });
                console.log('✅ Трек отправлен в main');
            }
        }, 2000);
        
        // 4. Проверяем статус через 3 секунды
        setTimeout(async () => {
            try {
                if (window.electronAPI && window.electronAPI.getDiscordRPCStatus) {
                    const status = await window.electronAPI.getDiscordRPCStatus();
                    console.log('📊 Статус RPC в main:', status);
                    if (status) {
                        console.log('✅ Discord RPC включён! Проверьте Discord');
                    } else {
                        console.log('❌ Discord RPC выключен или не инициализирован');
                    }
                }
            } catch (e) {
                console.log('❌ Ошибка получения статуса:', e);
            }
        }, 3000);
        
    } catch (err) {
        console.log('❌ Ошибка:', err);
    }
}

// Делаем функцию глобальной для вызова из консоли
window.testDiscordRPC = testDiscordRPC;

console.log('🎵 Введите testDiscordRPC() в консоль для проверки Discord RPC');

function loadDiscordRPCStatus() {
    const enabled = localStorage.getItem('discordRPCEnabled') === 'true';
    const checkbox = document.getElementById('discordRPCEnabled');
    const statusDiv = document.getElementById('discordRPCStatus');
    
    if (checkbox) {
        checkbox.checked = enabled;
        if (statusDiv) {
            statusDiv.style.display = enabled ? 'block' : 'none';
            statusDiv.innerHTML = enabled ? '✅ Discord RPC активен' : '⏹️ Discord RPC отключён';
            statusDiv.style.color = enabled ? '#1DB954' : 'var(--text-secondary)';
        }
    }
    
    // Отправляем в main
    if (window.electronAPI && window.electronAPI.toggleDiscordRPC) {
        window.electronAPI.toggleDiscordRPC(enabled);
    }
}

// Обработчик переключения
document.addEventListener('DOMContentLoaded', () => {
    const discordCheckbox = document.getElementById('discordRPCEnabled');
    if (discordCheckbox) {
        discordCheckbox.addEventListener('change', function() {
            const enabled = this.checked;
            localStorage.setItem('discordRPCEnabled', enabled);
            loadDiscordRPCStatus();
            showToast(enabled ? '💬 Discord RPC включён' : '🔇 Discord RPC выключён', 'info');
        });
    }
    
    loadDiscordRPCStatus();
});

// Обновляем при смене трека
const originalSaveTrackToHistory = saveTrackToHistory;
saveTrackToHistory = function(title, artist, service) {
    originalSaveTrackToHistory(title, artist, service);
    if (window.electronAPI && window.electronAPI.updateTrackInfo) {
        window.electronAPI.updateTrackInfo({ title, artist });
    }
};

async function forceTestRPC() {
    console.log('🔴 ПРИНУДИТЕЛЬНЫЙ ТЕСТ RPC');
    
    try {
        // 1. Включаем RPC
        console.log('📤 Включаем RPC...');
        await window.electronAPI.toggleDiscordRPC(true);
        
        // 2. Ждём 2 секунды
        await new Promise(r => setTimeout(r, 2000));
        
        // 3. Отправляем тестовый трек с эмодзи
        console.log('📤 Отправляем тестовый трек...');
        window.electronAPI.updateTrackInfo({
            title: '🔴 ТЕСТОВЫЙ ТРЕК',
            artist: 'Discord RPC Проверка'
        });
        
        // 4. Ждём ещё 2 секунды
        await new Promise(r => setTimeout(r, 2000));
        
        // 5. Получаем статус
        const status = await window.electronAPI.getDiscordRPCStatus();
        console.log('📊 Статус RPC:', status);
        
        if (status) {
            console.log('✅ RPC ВКЛЮЧЁН! Статус должен появиться в Discord');
            console.log('📌 Проверьте Discord: нажмите на свою аватарку');
            console.log('🎵 Должен быть статус: "🔴 ТЕСТОВЫЙ ТРЕК - Discord RPC Проверка"');
        } else {
            console.log('❌ RPC ВЫКЛЮЧЕН');
        }
        
        // 6. Ещё раз через 5 секунд отправляем статус с эмодзи
        setTimeout(async () => {
            console.log('🔄 Повторная отправка статуса...');
            window.electronAPI.updateTrackInfo({
                title: '🎵 MusicHub v3.2.0',
                artist: 'Слушаю музыку'
            });
        }, 5000);
        
    } catch (err) {
        console.log('❌ Ошибка:', err);
    }
}

// Делаем глобальным
window.forceTestRPC = forceTestRPC;

console.log('🎵 Введите forceTestRPC() в консоль для теста RPC');
console.log('📌 После этого проверьте Discord -> нажмите на аватарку');

async function sendInitialRPCStatus() {
    console.log('🎵 Отправка начального статуса RPC...');
    
    try {
        // Получаем текущий трек
        const mediaInfo = await window.electronAPI.getMediaFromFiles();
        
        if (mediaInfo && mediaInfo.title) {
            // Если есть трек — отправляем его
            const trackInfo = {
                title: mediaInfo.title,
                artist: mediaInfo.artist || 'Неизвестен'
            };
            
            if (window.electronAPI && window.electronAPI.updateTrackInfo) {
                window.electronAPI.updateTrackInfo(trackInfo);
            }
            console.log('✅ Отправлен статус с текущим треком:', trackInfo);
        } else {
            // Если нет трека — отправляем тестовый статус
            if (window.electronAPI && window.electronAPI.updateTrackInfo) {
                window.electronAPI.updateTrackInfo({
                    title: '🎵 MusicHub',
                    artist: 'Готов к прослушиванию'
                });
            }
            console.log('✅ Отправлен тестовый статус');
        }
    } catch (err) {
        console.log('❌ Ошибка отправки статуса:', err);
    }
}

// Перехватываем включение RPC
const originalToggleRPC = window.electronAPI?.toggleDiscordRPC;
if (window.electronAPI && window.electronAPI.toggleDiscordRPC) {
    // Сохраняем оригинальный метод
    const originalMethod = window.electronAPI.toggleDiscordRPC;
    
    // Переопределяем
    window.electronAPI.toggleDiscordRPC = function(enabled) {
        console.log(`🔄 toggleDiscordRPC(${enabled}) через renderer`);
        
        // Вызываем оригинальный метод
        const result = originalMethod(enabled);
        
        // Если включаем RPC — отправляем статус
        if (enabled) {
            setTimeout(() => {
                sendInitialRPCStatus();
            }, 2000); // Ждём 2 секунды, чтобы RPC инициализировался
        }
        
        return result;
    };
}

// Также добавляем обработчик для кнопки в настройках
document.addEventListener('DOMContentLoaded', () => {
    const discordCheckbox = document.getElementById('discordRPCEnabled');
    if (discordCheckbox) {
        // Сохраняем оригинальный обработчик
        const originalChange = discordCheckbox.onchange;
        
        discordCheckbox.addEventListener('change', function() {
            const enabled = this.checked;
            
            if (enabled) {
                // Если включили RPC — отправляем статус через 2 секунды
                setTimeout(() => {
                    sendInitialRPCStatus();
                }, 2000);
            }
        });
    }
});






























// ========== СИСТЕМА КОМАНДНЫХ КОДОВ ДЛЯ НЕЙРОСЕТИ ==========

// Командные коды - нейросеть отправляет их в тексте



// Парсинг команд из текста нейросети
function parseAICommand(text) {
    if (!text) return [];
    
    const commands = [];
    
    if (text.includes(COMMAND_CODES.PLAY)) commands.push({ command: 'play', raw: COMMAND_CODES.PLAY });
    if (text.includes(COMMAND_CODES.PAUSE)) commands.push({ command: 'pause', raw: COMMAND_CODES.PAUSE });
    if (text.includes(COMMAND_CODES.STOP)) commands.push({ command: 'stop', raw: COMMAND_CODES.STOP });
    if (text.includes(COMMAND_CODES.NEXT)) commands.push({ command: 'next', raw: COMMAND_CODES.NEXT });
    if (text.includes(COMMAND_CODES.PREV)) commands.push({ command: 'prev', raw: COMMAND_CODES.PREV });
    if (text.includes(COMMAND_CODES.VOLUME_UP)) commands.push({ command: 'volume_up', raw: COMMAND_CODES.VOLUME_UP });
    if (text.includes(COMMAND_CODES.VOLUME_DOWN)) commands.push({ command: 'volume_down', raw: COMMAND_CODES.VOLUME_DOWN });
    if (text.includes(COMMAND_CODES.MUTE)) commands.push({ command: 'mute', raw: COMMAND_CODES.MUTE });
    if (text.includes(COMMAND_CODES.UNMUTE)) commands.push({ command: 'unmute', raw: COMMAND_CODES.UNMUTE });
    if (text.includes(COMMAND_CODES.TOGGLE)) commands.push({ command: 'toggle', raw: COMMAND_CODES.TOGGLE });
    
    const volMatch = text.match(/🎵\[CMD:VOLSET:(\d+)\]/);
    if (volMatch) {
        const vol = parseInt(volMatch[1]);
        if (!isNaN(vol) && vol >= 0 && vol <= 100) {
            commands.push({ command: 'volume_set', value: vol, raw: volMatch[0] });
        }
    }
    
    return commands;
}

// Выполнение команд из нейросети
async function executeAICommands(commands) {
    if (!commands || commands.length === 0) return [];
    
    const results = [];
    for (const cmd of commands) {
        try {
            let result = false;
            
            switch(cmd.command) {
                case 'play':
                    if (!isMediaPlaying) result = await handlePlayPause();
                    else result = true;
                    break;
                case 'pause':
                    if (isMediaPlaying) result = await handlePlayPause();
                    else result = true;
                    break;
                case 'stop':
                    result = await handleStop();
                    break;
                case 'next':
                    result = await handleNext();
                    break;
                case 'prev':
                    result = await handlePrevious();
                    break;
                case 'volume_up':
                    const volUp = Math.min(100, currentMediaVolume + 10);
                    result = await setMediaVolume(volUp);
                    updateVolumeUI(volUp);
                    break;
                case 'volume_down':
                    const volDown = Math.max(0, currentMediaVolume - 10);
                    result = await setMediaVolume(volDown);
                    updateVolumeUI(volDown);
                    break;
                case 'volume_set':
                    result = await setMediaVolume(cmd.value);
                    updateVolumeUI(cmd.value);
                    break;
                case 'mute':
                    result = await setMediaVolume(0);
                    updateVolumeUI(0);
                    break;
                case 'unmute':
                    const savedVol = parseInt(localStorage.getItem('mediaVolume')) || 50;
                    result = await setMediaVolume(savedVol);
                    updateVolumeUI(savedVol);
                    break;
                case 'toggle':
                    result = await handlePlayPause();
                    break;
                default:
                    console.log('Неизвестная команда:', cmd.command);
            }
            
            results.push({ command: cmd.command, success: result });
        } catch (err) {
            console.error('Ошибка выполнения команды:', cmd.command, err);
            results.push({ command: cmd.command, success: false, error: err.message });
        }
    }
    return results;
}


function updateVolumeUI(percent) {
    const slider = document.getElementById('homeVolumeSlider');
    const display = document.getElementById('homeVolumeDisplay');
    if (slider) slider.value = percent;
    if (display) display.textContent = `${percent}%`;
    currentMediaVolume = percent;
}

// ========== ОБРАБОТЧИК ОТВЕТОВ НЕЙРОСЕТИ ==========

function handleAIResponse(responseText) {
    if (!responseText) return { text: '', commands: [] };
    
    const commands = parseAICommand(responseText);
    
    if (commands && commands.length > 0) {
        executeAICommands(commands).then(results => {
            console.log('📊 Результаты выполнения команд:', results);
        });
        
        let cleanText = responseText;
        for (const cmd of commands) {
            cleanText = cleanText.replace(cmd.raw, '');
        }
        cleanText = cleanText.replace(/\s+/g, ' ').trim();
        
        return {
            text: cleanText || '✅ Команда выполнена!',
            commands: commands
        };
    }
    
    return { text: responseText, commands: [] };
}

// ========== ФУНКЦИЯ ДЛЯ НЕЙРОСЕТИ (КАК ОНА БУДЕТ ОТПРАВЛЯТЬ КОМАНДЫ) ==========

// Пример того, как нейросеть должна формировать ответ
function generateAICommandResponse(userRequest) {
    // Это пример - реальная нейросеть будет генерировать это сама
    const responses = {
        'включи музыку': `🎵 Включаю музыку! 🎵[CMD:PLAY]`,
        'выключи музыку': `🎵 Выключаю музыку... 🎵[CMD:STOP]`,
        'следующий трек': `🎵 Переключаю на следующий! 🎵[CMD:NEXT]`,
        'предыдущий трек': `🎵 Возвращаю назад! 🎵[CMD:PREV]`,
        'сделай погромче': `🎵 Увеличиваю громкость! 🎵[CMD:VOLUP]`,
        'сделай потише': `🎵 Уменьшаю громкость... 🎵[CMD:VOLDOWN]`,
        'установи громкость 50': `🎵 Устанавливаю 50% 🎵[CMD:VOLSET:50]`,
        'пауза': `🎵 Пауза! 🎵[CMD:PAUSE]`,
        'продолжить': `🎵 Продолжаю! 🎵[CMD:PLAY]`,
        'переключи на предыдущий': `🎵 Назад! 🎵[CMD:PREV]`,
    };
    
    // Ищем похожую команду
    for (const [key, value] of Object.entries(responses)) {
        if (userRequest.toLowerCase().includes(key)) {
            return value;
        }
    }
    
    // Если не нашли - возвращаем обычный ответ
    return `Я не совсем понял команду. Попробуйте: "включи музыку", "следующий трек", "сделай погромче"`;
}

// ========== МОДИФИЦИРОВАННАЯ ФУНКЦИЯ ДЛЯ ЧАТА ==========

// Обновляем функцию обработки сообщений в чате
async function handleChatAICommand(message) {
    // Проверяем, есть ли командный код
    const commands = parseAICommand(message);
    
    if (commands && commands.length > 0) {
        // Это команда от нейросети - выполняем
        const results = await executeAICommands(commands);
        const cleanText = message.replace(/🎵\[CMD:[^\]]+\]/g, '').trim();
        return {
            text: cleanText || '✅ Команда выполнена!',
            results: results
        };
    }
    
    // Если нет команд - обрабатываем как обычный запрос к AI
    return null;
}

// ========== ТЕСТОВЫЕ ФУНКЦИИ ==========

// Для тестирования в консоли
window.testAICommand = function(command) {
    const response = generateAICommandResponse(command);
    console.log('📤 Ответ AI:', response);
    const result = handleAIResponse(response);
    console.log('📥 Результат:', result);
    return result;
};

// Список доступных команд для нейросети
window.getAvailableCommands = function() {
    return {
        '🎵[CMD:PLAY]': 'Включить воспроизведение',
        '🎵[CMD:PAUSE]': 'Поставить на паузу',
        '🎵[CMD:STOP]': 'Полностью остановить',
        '🎵[CMD:NEXT]': 'Следующий трек',
        '🎵[CMD:PREV]': 'Предыдущий трек',
        '🎵[CMD:VOLUP]': 'Увеличить громкость на 10%',
        '🎵[CMD:VOLDOWN]': 'Уменьшить громкость на 10%',
        '🎵[CMD:VOLSET:X]': 'Установить громкость X% (где X от 0 до 100)',
        '🎵[CMD:MUTE]': 'Выключить звук',
        '🎵[CMD:UNMUTE]': 'Включить звук',
        '🎵[CMD:TOGGLE]': 'Переключить Play/Pause'
    };
};

console.log('🎵 Система командных кодов загружена!');
console.log('📋 Доступные команды: window.getAvailableCommands()');
console.log('🧪 Тест: window.testAICommand("включи музыку")');





// ========== АДАПТИВНАЯ ГРОМКОСТЬ (РАБОТАЕТ ЧЕРЕЗ VolumeManager) ==========

let adaptiveOriginalVolume = 1.0;
let adaptiveEnabled = false;
let adaptiveMicStream = null;
let adaptiveAnalyser = null;
let adaptiveAudioCtx = null;
let adaptiveAnimFrame = null;
let adaptiveNoiseLevel = 0;
let adaptiveThreshold = 60;
let adaptiveReducePercent = 30;
let adaptiveRestoreDelay = 3000;
let adaptiveMicId = '';
let adaptiveIsReduced = false;
let adaptiveRestoreTimer = null;
let adaptiveCurrentVol = 1.0;
let adaptiveLastUiUpdate = 0;

// Глобальный экземпляр VolumeManager (будет создан при инициализации)
let volumeManager = null;

// ОСНОВНАЯ ФУНКЦИЯ ИЗМЕНЕНИЯ ГРОМКОСТИ (через VolumeManager)
function adaptiveSetVolume(volume) {
    const vol = Math.max(0, Math.min(1, volume));
    adaptiveCurrentVol = vol;
    
    // ТОЛЬКО ОТПРАВКА, БЕЗ СОХРАНЕНИЯ В localStorage
    if (volumeManager) {
        volumeManager.setVolume(vol * 100).catch(e => console.log('Ошибка:', e));
    }
    
    // Обновляем UI
    const volDisplay = document.getElementById('currentVolumeDisplay');
    if (volDisplay) volDisplay.textContent = Math.round(vol * 100);
    
    const statusDiv = document.getElementById('volumeStatus');
    if (statusDiv) {
        if (adaptiveIsReduced) {
            statusDiv.innerHTML = `🔴 ШУМ - громкость снижена до ${Math.round(vol * 100)}%`;
        } else {
            statusDiv.innerHTML = `✅ НОРМАЛЬНАЯ громкость: ${Math.round(vol * 100)}%`;
        }
    }
    
    console.log(`🎚️ Адаптивная громкость: ${Math.round(vol * 100)}%`);
}

// ПЛАВНОЕ ИЗМЕНЕНИЕ
function adaptiveSmoothChange(targetVol) {
    const startVol = adaptiveCurrentVol;
    const endVol = targetVol;
    const startTime = performance.now();
    const duration = 500;
    
    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        const ease = 1 - Math.pow(1 - progress, 2);
        const newVol = startVol + (endVol - startVol) * ease;
        adaptiveSetVolume(newVol);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            adaptiveSetVolume(endVol);
        }
    }
    requestAnimationFrame(animate);
}

// ЛОГИКА: ШУМ -> ТИХО, ТИШИНА -> ЖДЁМ -> ГРОМКО
function adaptiveUpdateLogic() {
    const isNoisy = adaptiveNoiseLevel > adaptiveThreshold;
    
    if (isNoisy) {
        if (adaptiveRestoreTimer) {
            clearTimeout(adaptiveRestoreTimer);
            adaptiveRestoreTimer = null;
        }
        
        if (!adaptiveIsReduced) {
            adaptiveIsReduced = true;
            const newVol = adaptiveReducePercent / 100;
            console.log(`🔊 ШУМ! -> громкость ${adaptiveReducePercent}%`);
            adaptiveSetVolume(newVol);
        }
        
        const statusDiv = document.getElementById('volumeStatus');
        if (statusDiv) statusDiv.innerHTML = '🔴 ШУМ - громкость снижена';
        
    } else {
        if (adaptiveIsReduced && !adaptiveRestoreTimer) {
            console.log(`🔇 ТИШИНА, жду ${adaptiveRestoreDelay/1000} сек...`);
            const statusDiv = document.getElementById('volumeStatus');
            if (statusDiv) statusDiv.innerHTML = `⏳ ТИХО - восстановление через ${adaptiveRestoreDelay/1000} сек`;
            
            adaptiveRestoreTimer = setTimeout(() => {
                console.log(`🔊 Восстанавливаю громкость до ${Math.round(adaptiveOriginalVolume * 100)}%`);
                adaptiveIsReduced = false;
                adaptiveSetVolume(adaptiveOriginalVolume);
                adaptiveRestoreTimer = null;
                if (statusDiv) statusDiv.innerHTML = '✅ НОРМАЛЬНАЯ громкость';
            }, adaptiveRestoreDelay);
        }
    }
}

// ИЗМЕРЕНИЕ ШУМА
function adaptiveNoiseLoop() {
    if (!adaptiveAnalyser || !adaptiveEnabled) {
        if (adaptiveAnimFrame) cancelAnimationFrame(adaptiveAnimFrame);
        return;
    }
    
    const data = new Uint8Array(adaptiveAnalyser.frequencyBinCount);
    adaptiveAnalyser.getByteFrequencyData(data);
    
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    adaptiveNoiseLevel = Math.round(avg * (200 / 255));
    
    const now = Date.now();
    if (now - adaptiveLastUiUpdate >= 100) {
        const noiseSpan = document.getElementById('currentNoiseLevel');
        if (noiseSpan) noiseSpan.textContent = adaptiveNoiseLevel;
        
        const meter = document.getElementById('noiseMeterBar');
        if (meter) {
            const percent = Math.min(100, (adaptiveNoiseLevel / adaptiveThreshold) * 100);
            meter.style.width = percent + '%';
            meter.style.background = adaptiveNoiseLevel > adaptiveThreshold ? '#ff4444' : '#1DB954';
        }
        
        const thresholdSpan = document.getElementById('thresholdDisplay');
        if (thresholdSpan) thresholdSpan.textContent = adaptiveThreshold;
        
        adaptiveLastUiUpdate = now;
    }
    
    adaptiveUpdateLogic();
    adaptiveAnimFrame = requestAnimationFrame(adaptiveNoiseLoop);
}

// ЗАПУСК МОНИТОРИНГА
async function adaptiveStartMonitor() {
    adaptiveStopMonitor();
    
    if (!adaptiveMicId) {
        console.log('❌ Микрофон не выбран');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: adaptiveMicId } }
        });
        
        adaptiveAudioCtx = new AudioContext();
        await adaptiveAudioCtx.resume();
        
        const source = adaptiveAudioCtx.createMediaStreamSource(stream);
        adaptiveAnalyser = adaptiveAudioCtx.createAnalyser();
        adaptiveAnalyser.fftSize = 256;
        source.connect(adaptiveAnalyser);
        adaptiveMicStream = stream;
        
        adaptiveNoiseLoop();
        console.log('✅ Мониторинг шума запущен');
        
    } catch(err) {
        console.error('❌ Ошибка:', err);
        if (typeof showToast === 'function') showToast('❌ Нет доступа к микрофону', 'error');
    }
}

// ОСТАНОВКА
function adaptiveStopMonitor() {
    if (adaptiveAnimFrame) cancelAnimationFrame(adaptiveAnimFrame);
    if (adaptiveMicStream) adaptiveMicStream.getTracks().forEach(t => t.stop());
    if (adaptiveAudioCtx) adaptiveAudioCtx.close();
    if (adaptiveRestoreTimer) clearTimeout(adaptiveRestoreTimer);
    
    adaptiveAnalyser = null;
    adaptiveMicStream = null;
    adaptiveAudioCtx = null;
    adaptiveIsReduced = false;
    adaptiveAnimFrame = null;
    
    console.log('⏹️ Мониторинг остановлен');
}

// ЗАГРУЗКА МИКРОФОНОВ
async function adaptiveLoadMics() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        
        const select = document.getElementById('noiseMicDevice');
        if (!select) return;
        
        select.innerHTML = '<option value="">-- Выберите микрофон --</option>';
        
        inputs.forEach(device => {
            const isVirtual = device.label.toLowerCase().includes('cable') || 
                             device.label.toLowerCase().includes('vb-audio');
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = (device.label || 'Микрофон') + (isVirtual ? ' 🎛️[ВИРТ]' : ' 🎤');
            if (adaptiveMicId === device.deviceId) option.selected = true;
            select.appendChild(option);
        });
        
        if (!adaptiveMicId && inputs.length) {
            const realMic = inputs.find(d => !d.label.toLowerCase().includes('cable'));
            if (realMic) {
                adaptiveMicId = realMic.deviceId;
                localStorage.setItem('adaptiveMicId', adaptiveMicId);
                select.value = adaptiveMicId;
            }
        }
    } catch(err) {
        console.log('Ошибка загрузки микрофонов:', err);
    }
}

// ИНИЦИАЛИЗАЦИЯ
function adaptiveInit() {
    // Создаём VolumeManager (как в ползунке)
    if (typeof VolumeManager !== 'undefined') {
        volumeManager = new VolumeManager();
    }
    
    adaptiveEnabled = localStorage.getItem('adaptiveEnabled') === 'true';
    adaptiveThreshold = parseInt(localStorage.getItem('adaptiveThreshold')) || 60;
    adaptiveReducePercent = parseInt(localStorage.getItem('adaptiveReducePercent')) || 30;
    adaptiveRestoreDelay = (parseFloat(localStorage.getItem('adaptiveRestoreDelaySec')) || 3) * 1000;
    adaptiveMicId = localStorage.getItem('adaptiveMicId') || '';
    
    // Загружаем сохранённую пользователем громкость (оригинальный уровень)
    const savedVolume = localStorage.getItem('globalVolume');
    if (savedVolume !== null) {
        adaptiveOriginalVolume = parseFloat(savedVolume);
    } else {
        adaptiveOriginalVolume = 1.0;
    }
    
    // Получаем элементы DOM
    const checkbox = document.getElementById('adaptiveVolumeEnabled');
    const thresholdInput = document.getElementById('noiseThreshold');
    const reduceInput = document.getElementById('reducedVolumePercent');
    const restoreInput = document.getElementById('restoreDelaySec');
    const settingsDiv = document.getElementById('adaptiveVolumeSettings');
    
    // Устанавливаем значения из localStorage
    if (checkbox) checkbox.checked = adaptiveEnabled;
    if (thresholdInput) thresholdInput.value = adaptiveThreshold;
    if (reduceInput) reduceInput.value = adaptiveReducePercent;
    if (restoreInput) restoreInput.value = adaptiveRestoreDelay / 1000;
    if (settingsDiv) settingsDiv.style.display = adaptiveEnabled ? 'block' : 'none';
    
    // Загружаем список микрофонов
    adaptiveLoadMics();
    
    // Если адаптивная громкость включена и есть микрофон - запускаем мониторинг
    if (adaptiveEnabled && adaptiveMicId) adaptiveStartMonitor();
    
    // Обработчик чекбокса
    checkbox?.addEventListener('change', (e) => {
        adaptiveEnabled = e.target.checked;
        localStorage.setItem('adaptiveEnabled', adaptiveEnabled);
        if (settingsDiv) settingsDiv.style.display = adaptiveEnabled ? 'block' : 'none';
        
        if (adaptiveEnabled && adaptiveMicId) {
            adaptiveStartMonitor();
        } else {
            adaptiveStopMonitor();
            // Восстанавливаем оригинальную громкость при выключении
            adaptiveSetVolume(adaptiveOriginalVolume);
            adaptiveIsReduced = false;
        }
    });
    
    // Обработчик порога шума
    thresholdInput?.addEventListener('change', (e) => {
        adaptiveThreshold = parseInt(e.target.value);
        localStorage.setItem('adaptiveThreshold', adaptiveThreshold);
    });
    
    // Обработчик процента снижения
    reduceInput?.addEventListener('change', (e) => {
        adaptiveReducePercent = parseInt(e.target.value);
        localStorage.setItem('adaptiveReducePercent', adaptiveReducePercent);
    });
    
    // Обработчик задержки восстановления
    restoreInput?.addEventListener('change', (e) => {
        adaptiveRestoreDelay = parseFloat(e.target.value) * 1000;
        localStorage.setItem('adaptiveRestoreDelaySec', e.target.value);
    });
    
    // Обработчик выбора микрофона
    const micSelect = document.getElementById('noiseMicDevice');
    micSelect?.addEventListener('change', (e) => {
        adaptiveMicId = e.target.value;
        localStorage.setItem('adaptiveMicId', adaptiveMicId);
        if (adaptiveEnabled && adaptiveMicId) {
            adaptiveStartMonitor();
        }
    });
}

// КНОПКА
window.adaptiveToggle = function() {
    const checkbox = document.getElementById('adaptiveVolumeEnabled');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
        
        const btn = document.getElementById('adaptiveVolumeBtn');
        if (btn) {
            btn.style.background = checkbox.checked ? 'var(--accent-color)' : '';
            if (typeof showToast === 'function') {
                showToast(checkbox.checked ? '🎤 Адаптивная громкость ВКЛЮЧЕНА' : '🔇 Адаптивная громкость ВЫКЛЮЧЕНА', 'info');
            }
        }
    }
};

// ТЕСТОВАЯ ФУНКЦИЯ
window.testNoise = function(level) {
    adaptiveNoiseLevel = level;
    adaptiveUpdateLogic();
    console.log(`📊 Тестовый шум: ${level}`);
};

// ЗАПУСК
setTimeout(adaptiveInit, 1000);

function syncAdaptiveButton() {
    const adaptiveEnabled = localStorage.getItem('adaptiveEnabled') === 'true';
    const btn = document.getElementById('adaptiveVolumeBtn');
    if (btn) {
        if (adaptiveEnabled) {
            btn.style.background = 'var(--accent-color)';
            btn.style.boxShadow = '0 0 8px var(--accent-color)';
            btn.style.transition = 'all 0.2s';
        } else {
            btn.style.background = '';
            btn.style.boxShadow = '';
        }
        console.log(`🎤 Кнопка адаптивной громкости: ${adaptiveEnabled ? 'ВКЛ' : 'ВЫКЛ'}`);
    } else {
        console.log('❌ Кнопка adaptiveVolumeBtn не найдена в DOM');
    }
}

// Вызываем после загрузки DOM и после adaptiveInit
setTimeout(() => {
    syncAdaptiveButton();
}, 1500);


function adaptiveToggle() {
    const checkbox = document.getElementById('adaptiveVolumeEnabled');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
        
        const btn = document.getElementById('adaptiveVolumeBtn');
        if (btn) {
            if (checkbox.checked) {
                btn.style.background = 'var(--accent-color)';
                btn.style.boxShadow = '0 0 8px var(--accent-color)';
                if (typeof showToast === 'function') {
                    showToast('🎤 Адаптивная громкость ВКЛЮЧЕНА', 'success');
                }
            } else {
                btn.style.background = '';
                btn.style.boxShadow = '';
                if (typeof showToast === 'function') {
                    showToast('🔇 Адаптивная громкость ВЫКЛЮЧЕНА', 'info');
                }
            }
        }
    }
}

window.adaptiveToggle = function() {
    const checkbox = document.getElementById('adaptiveVolumeEnabled');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
        
        // Сохраняем состояние
        localStorage.setItem('adaptiveEnabled', checkbox.checked);
        
        // Меняем стиль кнопки
        const btn = document.getElementById('adaptiveVolumeBtn');
        if (btn) {
            if (checkbox.checked) {
                btn.style.background = 'var(--accent-color)';
                btn.style.boxShadow = '0 0 8px var(--accent-color)';
                if (typeof showToast === 'function') {
                    showToast('🎤 Адаптивная громкость ВКЛЮЧЕНА', 'success');
                }
            } else {
                btn.style.background = '';
                btn.style.boxShadow = '';
                if (typeof showToast === 'function') {
                    showToast('🔇 Адаптивная громкость ВЫКЛЮЧЕНА', 'info');
                }
            }
        }
    }
};

// Делаем функцию глобальной
window.adaptiveToggle = adaptiveToggle;

// Также добавляем обработчик на кнопку (на случай если onclick не сработает)
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('adaptiveVolumeBtn');
    if (btn) {
        btn.addEventListener('click', adaptiveToggle);
    }
});


// ========== УПРАВЛЕНИЕ ГРОМКОСТЬЮ С АВТО-СКРЫТИЕМ ==========

let volumeHideTimeout = null;
let volumeSliderVisible = false;

// Функция синхронизации громкости между всеми элементами
function syncVolumeUI(percent) {
    // Обновляем слайдер в тайтлбаре
    const titlebarSlider = document.getElementById('volumeSlider');
    const titlebarPercent = document.getElementById('volumePercent');
    const titlebarIcon = document.getElementById('volumeIcon');
    
    if (titlebarSlider) titlebarSlider.value = percent;
    if (titlebarPercent) titlebarPercent.textContent = `${percent}%`;
    
    // Обновляем слайдер на домашней странице
    const homeSlider = document.getElementById('homeVolumeSlider');
    const homeDisplay = document.getElementById('homeVolumeDisplay');
    
    if (homeSlider) homeSlider.value = percent;
    if (homeDisplay) homeDisplay.textContent = `${percent}%`;
    
    // Обновляем иконку
    if (titlebarIcon) {
        if (percent === 0) titlebarIcon.textContent = '🔇';
        else if (percent < 30) titlebarIcon.textContent = '🔈';
        else if (percent < 70) titlebarIcon.textContent = '🔉';
        else titlebarIcon.textContent = '🔊';
    }
    
    currentMediaVolume = percent;
    localStorage.setItem('mediaVolume', percent);
}

// Показать ползунок громкости
function showVolumeSlider() {
    const container = document.getElementById('volumeSliderContainer');
    if (container) {
        container.style.display = 'block';
        volumeSliderVisible = true;
    }
    
    // Сбрасываем таймер скрытия
    if (volumeHideTimeout) {
        clearTimeout(volumeHideTimeout);
        volumeHideTimeout = null;
    }
}

// Скрыть ползунок громкости
function hideVolumeSlider() {
    const container = document.getElementById('volumeSliderContainer');
    if (container) {
        container.style.display = 'none';
        volumeSliderVisible = false;
    }
}

// Запланировать скрытие ползунка
function scheduleVolumeHide(delay = 2000) {
    if (volumeHideTimeout) {
        clearTimeout(volumeHideTimeout);
        volumeHideTimeout = null;
    }
    
    volumeHideTimeout = setTimeout(() => {
        hideVolumeSlider();
        volumeHideTimeout = null;
    }, delay);
}

// Инициализация громкости в тайтлбаре
function initTitlebarVolume() {
    const container = document.getElementById('volumeSliderContainer');
    const icon = document.getElementById('volumeIcon');
    const slider = document.getElementById('volumeSlider');
    
    if (!container || !icon || !slider) return;
    
    // Показываем при наведении на иконку
    icon.onmouseenter = () => {
        showVolumeSlider();
        // Если мышка на иконке - отменяем скрытие
        if (volumeHideTimeout) {
            clearTimeout(volumeHideTimeout);
            volumeHideTimeout = null;
        }
    };
    
    // Показываем при наведении на сам ползунок
    container.onmouseenter = () => {
        showVolumeSlider();
        if (volumeHideTimeout) {
            clearTimeout(volumeHideTimeout);
            volumeHideTimeout = null;
        }
    };
    
    // Скрываем когда мышка уходит с ползунка
    container.onmouseleave = () => {
        scheduleVolumeHide(1500);
    };
    
    // Скрываем когда мышка уходит с иконки (если не на ползунке)
    icon.onmouseleave = () => {
        // Проверяем, не наведена ли мышка на ползунок
        if (!container.matches(':hover')) {
            scheduleVolumeHide(1500);
        }
    };
    
    // Слайдер - синхронизация
    slider.oninput = async (e) => {
        const val = parseInt(e.target.value);
        await setMediaVolume(val);
        syncVolumeUI(val);
        
        // Показываем ползунок при взаимодействии
        showVolumeSlider();
        
        // Запланировать скрытие через 2 секунды после последнего движения
        scheduleVolumeHide(2000);
    };
    
    // Загружаем сохраненную громкость
    const savedVol = parseInt(localStorage.getItem('mediaVolume')) || 100;
    slider.value = savedVol;
    syncVolumeUI(savedVol);
    
    // Скрываем через 3 секунды после загрузки
    setTimeout(() => {
        if (!container.matches(':hover') && !icon.matches(':hover')) {
            hideVolumeSlider();
        }
    }, 3000);
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========

// Вызываем после загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initTitlebarVolume, 500);
    });
} else {
    setTimeout(initTitlebarVolume, 500);
}































        






         
let chatWebSocket = null;
let chatConnected = false;
let currentChatUser = null;
let unreadCount = 0;
let lastNotification = null;

 
let currentOnlineCount = 0;

 
function updateTitlebarOnline(count) {
    const counterEl = document.getElementById('titlebarOnlineCount');
    if (counterEl) {
         
        counterEl.textContent = '1';
    }
}

document.getElementById('titlebarOnline')?.addEventListener('click', () => {
    toggleChat();   
});

let notificationsEnabled = true;

function initNotificationToggle() {
    const toggle = document.getElementById('notificationToggle');
    if (toggle) {
         
        notificationsEnabled = localStorage.getItem('notificationsEnabled') !== 'false';
        toggle.checked = notificationsEnabled;
        
        toggle.addEventListener('change', (e) => {
            notificationsEnabled = e.target.checked;
            localStorage.setItem('notificationsEnabled', notificationsEnabled);
        });
    }
}

let typingTimeout = null;

function sendTyping() {
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        chatWebSocket.send(JSON.stringify({ type: 'typing' }));
    }
}

const APP_KEY = 'musichub-secret-key-2024';
const WORKER_URL = 'https://gigachat-proxy.170610maksim.workers.dev';

 
async function getGigaAuthKey() {
  const response = await fetch(`${WORKER_URL}/key`, {
    headers: { 'X-App-Key': APP_KEY }
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error);
  return data.authKey;
}

 
async function getGigaToken(authKey) {
  const response = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'RqUID': crypto.randomUUID(),
      'Authorization': `Basic ${authKey}`,
    },
    body: 'scope=GIGACHAT_API_PERS',
  });
  
  const data = await response.json();
  return data.access_token;
}

const KNOWLEDGE_URL = 'https://gigachattips.170610maksim.workers.dev/knowledge.txt';
let knowledgeCache = null;

async function loadKnowledge() {
    if (knowledgeCache) return knowledgeCache;
    
    try {
        console.log('📚 Загружаю базу знаний...');
        const response = await fetch(KNOWLEDGE_URL);
        knowledgeCache = await response.text();
        console.log('✅ База знаний загружена');
        return knowledgeCache;
    } catch (err) {
        console.error('❌ Ошибка загрузки базы:', err);
        return null;
    }
}

async function searchKnowledge(query) {
    const knowledge = await loadKnowledge();
    if (!knowledge) return null;
    
    console.log('🔍 Ищем в базе:', query);  // ← Добавь для отладки
    
    const lines = knowledge.split('\n').filter(line => 
        line.trim() && 
        !line.startsWith('===') && 
        !line.startsWith('🎵') &&
        !line.startsWith('---')
    );
    
    // Поиск с транслитерацией
    const lowerQuery = query.toLowerCase().trim();
    
    // Транслитерация
    const translitMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
        'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z', 'и': 'i',
        'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
        'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
        'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
        'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
        'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    
    let translitQuery = lowerQuery;
    for (const [rus, lat] of Object.entries(translitMap)) {
        translitQuery = translitQuery.replace(new RegExp(rus, 'g'), lat);
    }
    
    console.log('🔍 Транслитерация:', translitQuery);  // ← Добавь для отладки
    
    // Ищем
    let results = lines.filter(line => 
        line.toLowerCase().includes(translitQuery) ||
        line.toLowerCase().includes(lowerQuery)
    );
    
    if (results.length === 0) {
        // Поиск по словам
        const words = translitQuery.split(' ');
        for (const word of words) {
            if (word.length > 2) {
                const found = lines.filter(line => line.toLowerCase().includes(word));
                if (found.length > 0) {
                    results = found;
                    break;
                }
            }
        }
    }
    
    if (results.length === 0) {
        console.log('❌ Ничего не найдено');
        return null;
    }
    
    console.log('✅ Найдено:', results[0]);  // ← Добавь для отладки
    return results.slice(0, 3).join('\n');
}

// Функция получения случайного факта
async function getRandomFact() {
    const knowledge = await loadKnowledge();
    if (!knowledge) return '🎵 Музыка — это жизнь!';
    
    const lines = knowledge.split('\n').filter(line => 
        line.trim() && 
        !line.startsWith('=') && 
        !line.startsWith('🎵') &&
        !line.startsWith('===')
    );
    
    return lines[Math.floor(Math.random() * lines.length)] || '🎵 Музыка — это жизнь!';
}

 
async function askGigaChat(question) {
    const limit = await checkAILimit();
    const isPremium = premiumStatus?.isPremium || false;
    
    if (!isPremium && limit.count >= 10) {
        addChatMessage(`❌ Достигнут лимит AI запросов (10/день). Подпишитесь на Premium для неограниченного доступа.`, false, 'system');
        return;
    }
    
    addChatMessage(`🤖 Думаю над: "${question.slice(0, 50)}..."`, false, 'system');
    
    try {
        const keyResponse = await fetch(`${WORKER_URL}/key`, {
            headers: { 'X-App-Key': APP_KEY }
        });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        const authKey = keyData.authKey;
        
        const tokenResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': crypto.randomUUID(),
                'Authorization': `Basic ${authKey}`,
            },
            body: 'scope=GIGACHAT_API_PERS',
        });
        
        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;
        
        const aiResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'GigaChat',
                messages: [
    { 
        role: 'system', 
        content: `Ты — AI-помощник в приложении MusicHub. Отвечай кратко (2-3 предложения), дружелюбно, по делу.

О MusicHub:
MusicHub — это десктопный музыкальный плеер с визуализациями, который объединяет несколько стриминговых сервисов в одном окне.

🔊 МУЗЫКАЛЬНЫЕ СЕРВИСЫ:
- Встроенные сервисы: Яндекс Музыка, YouTube Music, SoundCloud, Spotify, VK Music (одновременно можно выбрать до 2 основных)
- Кастомные сайты: можно добавить до 5 любых музыкальных сайтов (Spotify, Apple Music, SoundCloud и другие)
- Переключение между сервисами: Ctrl+Tab (даже когда окно не активно)

🎨 ВИЗУАЛИЗАЦИИ (10 режимов):
Базовые (бесплатно): Полоски, Волна, Круг, Точки, Частицы, Радиальный, Галактика, Северное сияние, Вихрь, Звездный взрыв, GIF анимация
- Полноэкранный режим визуализации (кнопка ⤢)

🎤 ЗАХВАТ ЗВУКА:
- Можно выбрать устройство захвата (микрофон или Virtual Audio Cable) или использовать modern режим
- Визуализации реагируют на громкость в реальном времени
- Чувствительность регулируется ползунком

🖥️ ИНТЕРФЕЙС И УПРАВЛЕНИЕ:
- Мини-режим (кнопка M) — окно поверх всех окон
- Адаптивная ширина боковой панели (перетаскиванием)
- Настройка масштаба (80%, 100%, 120%)
- Тёмная и светлая тема
- Акцентный цвет (любой на выбор)
- Эффекты кнопок: Пульсация, Свечение, Нет
- Звуки переключения: Короткий писк, Двойной писк, Щелчок, Вжух, Выключен
- Звуки уведомлений (отдельная настройка)
- Всплывающие уведомления (вкл/выкл)

💬 ЧАТ И КОМАНДЫ:
Доступные команды:
/ai [вопрос] — спросить у AI
/clear — очистить чат
/coin — орёл/решка
/help — показать справку

🎮 ДОПОЛНИТЕЛЬНО:
- Запуск с системой (опция)
- Запуск свёрнутым (опция)
- Сброс сервисов до стандартных
- GIF для визуализатора (свой файл)

ВАЖНО: Если пользователь просит найти песню, исполнителя или альбом, ты ОБЯЗАН использовать команду для открытия поиска:

🔍[SEARCH:текст запроса]

Эту команду я обработаю и открою поиск в YouTube Music.

ПРИМЕРЫ ПРАВИЛЬНЫХ ОТВЕТОВ:
- Пользователь: "найди Shape of You"
  Ты: 🔍[SEARCH:Shape of You]
  
- Пользователь: "включи Queen"
  Ты: 🔍[SEARCH:Queen]
  
- Пользователь: "поищи расслабляющую музыку"
  Ты: 🔍[SEARCH:relaxing music]

Команды:
        '🎵[CMD:PLAY]': 'Включить воспроизведение',
        '🎵[CMD:PAUSE]': 'Поставить на паузу',
        '🎵[CMD:STOP]': 'Полностью остановить',
        '🎵[CMD:NEXT]': 'Следующий трек',
        '🎵[CMD:PREV]': 'Предыдущий трек',
        '🎵[CMD:VOLUP]': 'Увеличить громкость на 10%',
        '🎵[CMD:VOLDOWN]': 'Уменьшить громкость на 10%',
        '🎵[CMD:VOLSET:X]': 'Установить громкость X% (где X от 0 до 100)',
        '🎵[CMD:MUTE]': 'Выключить звук',
        '🎵[CMD:UNMUTE]': 'Включить звук',
        '🎵[CMD:TOGGLE]': 'Переключить Play/Pause'

ПРАВИЛА:
1. ВСЕГДА используй 🔍[SEARCH:запрос] когда просят найти музыку
2. НЕ пиши лишнего текста, только команду
3. Запрос должен быть на том же языке, что и просил пользователь

Если запрос не про поиск музыки — отвечай как обычно.

Если спрашивают о возможностях — рассказывай о них. Если спрашивают о Premium — говори, что стоит 50 ₽ и даёт доступ ко всем визуализациям, безлимитному AI и кастомным сайтам.`
    },
    { role: 'user', content: question }
],
                temperature: 0.7,
                max_tokens: 500,
            })
        });
        
        const data = await aiResponse.json();
        const answer = data.choices?.[0]?.message?.content || 'Не удалось получить ответ';
        
        await incrementAICount();
        const processed = await processAIResponse(answer);
        addChatMessage(`🤖 ${processed}`, false, 'AI');
        
    } catch (err) {
        console.error('AI error:', err);
        addChatMessage(`❌ Ошибка: ${err.message}`, false, 'system');
    }
}


     
     
    


let customSites = [];

function loadCustomSites() {
    const saved = localStorage.getItem('customSites');
    if (saved) customSites = JSON.parse(saved);
    renderCustomSites();
    renderServices();  
}

function renderCustomSites() {
    const container = document.getElementById('customSitesList');
    if (!container) return;
    container.innerHTML = '';
    
    customSites.forEach((site, i) => {
        const div = document.createElement('div');
        div.className = 'custom-site-item';
        div.style.display = 'flex';
        div.style.gap = '8px';
        div.style.marginBottom = '8px';
        div.style.alignItems = 'center';
        
        div.innerHTML = `
            <input type="text" value="${escapeHtml(site.name)}" data-idx="${i}" data-field="name" style="flex: 1; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 6px; border-radius: 5px;">
            <input type="url" value="${escapeHtml(site.url)}" data-idx="${i}" data-field="url" style="flex: 2; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border-color); padding: 6px; border-radius: 5px;">
            <button class="remove-site-btn" data-idx="${i}" style="background: #ff4444; border: none; border-radius: 20px; width: 28px; height: 28px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center;">✕</button>
        `;
        container.appendChild(div);
    });
    
     
    document.querySelectorAll('.custom-site-item input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            const field = e.target.dataset.field;
            customSites[idx][field] = e.target.value;
            localStorage.setItem('customSites', JSON.stringify(customSites));
            renderServicesList();
            renderServices();
        });
    });
    
    document.querySelectorAll('.remove-site-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.idx);
        const customId = `custom_${idx}`;
        
         
        const indexInActive = activeServices.indexOf(customId);
        if (indexInActive !== -1) {
            activeServices.splice(indexInActive, 1);
            localStorage.setItem('activeServices', JSON.stringify(activeServices));
        }
        
         
        customSites.splice(idx, 1);
        localStorage.setItem('customSites', JSON.stringify(customSites));
        
         
        const wv = document.getElementById(customId);
        if (wv) wv.remove();
        
         
        renderCustomSites();
        renderServicesList();
        renderServices();
        
        showToast(`🗑️ Сайт удалён`, 'info');
    });
});
}

window.electronAPI.onMinimizeWindow(() => {
     
    setTimeout(() => {
        window.electronAPI.windowCtrl('min');
    }, 100);
});

 
let currentGifUrl = null;
let gifIntensityValue = 0;

 
function loadSavedGif() {
    const savedGif = localStorage.getItem('gifVisualizerUrl');
    if (savedGif && savedGif !== 'undefined' && savedGif !== 'null') {
        currentGifUrl = savedGif;
        const gifOverlay = document.getElementById('gifOverlay');
        gifOverlay.src = savedGif;
        gifOverlay.style.display = 'none';
        showGifPreview(savedGif);
        console.log('✅ GIF загружен из localStorage');
    }
}

 
function showGifPreview(url) {
    const previewDiv = document.getElementById('gifPreview');
    const previewImg = document.getElementById('gifPreviewImg');
    if (url && url !== 'undefined') {
        previewImg.src = url;
        previewDiv.style.display = 'block';
    } else {
        previewDiv.style.display = 'none';
    }
}

 
function pauseGifAnimation(pause) {
    const gifOverlay = document.getElementById('gifOverlay');
    if (!gifOverlay) return;
    
    if (pause) {
         
        if (gifOverlay.src && !gifOverlay.dataset.originalSrc) {
            gifOverlay.dataset.originalSrc = gifOverlay.src;
        }
         
        gifOverlay.style.animationPlayState = 'paused';
         
        if (gifOverlay.src) {
            const currentSrc = gifOverlay.src;
            gifOverlay.src = '';
            gifOverlay.src = currentSrc;
        }
    }
}

 
document.getElementById('gifFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.includes('gif')) {
        showToast('❌ Пожалуйста, выберите GIF файл', 'error');
        return;
    }
    
     
    const reader = new FileReader();
    reader.onload = (event) => {
        const base64 = event.target.result;
        currentGifUrl = base64;
        const gifOverlay = document.getElementById('gifOverlay');
        gifOverlay.src = base64;
        gifOverlay.style.display = 'none';
        localStorage.setItem('gifVisualizerUrl', base64);
        showGifPreview(base64);
        showToast('✅ GIF загружен! Выберите режим "GIF анимация"', 'success');
    };
    reader.readAsDataURL(file);
});

 
document.getElementById('previewGifBtn')?.addEventListener('click', () => {
    if (currentGifUrl && currentGifUrl !== 'undefined') {
        const win = window.open();
        win.document.write(`<img src="${currentGifUrl}" style="max-width: 100%;">`);
    } else {
        showToast('❌ Сначала выберите GIF файл', 'error');
    }
});

 
document.getElementById('clearGifBtn')?.addEventListener('click', () => {
    currentGifUrl = null;
    localStorage.removeItem('gifVisualizerUrl');
    const gifOverlay = document.getElementById('gifOverlay');
    gifOverlay.src = '';
    gifOverlay.style.display = 'none';
    document.getElementById('gifFileInput').value = '';
    document.getElementById('gifPreview').style.display = 'none';
    showToast('🗑️ GIF удалён', 'info');
});

 
loadSavedGif();


let splashInterval;
let splashProgress = 0;

const WORKER_URL_SMS = 'https://tips-proxy.170610maksim.workers.dev';

async function loadSplashContent() {
    try {

        const leftRes = await fetch(`${WORKER_URL_SMS}/left`);
        const leftData = await leftRes.json();
        
        const leftDiv = document.getElementById('splashLeftContent');
        leftDiv.innerHTML = `
            <div style="background: rgba(29,185,84,0.1); border-radius: 16px; padding: 20px; border-left: 3px solid ${leftData.bgColor || '#1DB954'};">
                <div style="font-size: 48px; margin-bottom: 10px;">${leftData.icon || '🎵'}</div>
                <h3 style="color: var(--accent-color); margin-bottom: 10px;">${leftData.title}</h3>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 15px;">${leftData.content}</p>
                <a href="#" onclick="window.electronAPI.openExternal('${leftData.link}'); return false;" style="color: var(--accent-color); text-decoration: none; font-size: 12px;">${leftData.button} →</a>
            </div>
        `;
        

        const rightRes = await fetch(`${WORKER_URL_SMS}/right`);
        const rightData = await rightRes.json();
        
        const rightDiv = document.getElementById('splashRightContent');
        rightDiv.innerHTML = `
            <div style="background: rgba(29,185,84,0.1); border-radius: 16px; padding: 20px; border-right: 3px solid var(--accent-color);">
                <div style="font-size: 48px; margin-bottom: 10px;">${rightData.icon || '👥'}</div>
                <h3 style="color: var(--accent-color); margin-bottom: 10px;">${rightData.title}</h3>
                <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 15px;">${rightData.content}</p>
            </div>
        `;
        
         
        const tipRes = await fetch(`${WORKER_URL_SMS}/tip`);
        const tipData = await tipRes.json();
        document.getElementById('splashTip').textContent = tipData.tip;
        
    } catch (err) {
        console.log('Ошибка загрузки контента:', err);
        document.getElementById('splashTip').textContent = '🎵 Добро пожаловать в MusicHub!';
    }
}

async function showSplash() {
    const splash = document.getElementById('splashScreen');
    const progressBar = document.querySelector('.splash-progress-bar');
    
    await loadSplashContent();
    
    splashProgress = 0;
    splashInterval = setInterval(() => {
        splashProgress += 2;
        if (progressBar) progressBar.style.width = splashProgress + '%';
        if (splashProgress >= 100) {
            clearInterval(splashInterval);
            setTimeout(() => {
                splash.style.opacity = '0';
                setTimeout(() => splash.remove(), 500);
            }, 200);
        }
    }, 100);
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(showSplash, 100);
});

document.getElementById('activatePremiumBtn')?.addEventListener('click', async () => {
    const key = document.getElementById('premiumKey').value.trim().toUpperCase();
    if (!key) {
        showToast('❌ Введите ключ', 'error');
        return;
    }

    const deviceId = await getDeviceId();
    
    try {
        const response = await fetch('https://premium-api.170610maksim.workers.dev/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, deviceId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast(`✨ Premium активирован!`, 'success');
            localStorage.removeItem('premium_status');
            await checkPremiumStatus();
            location.reload();
        } else {
            showToast(data.error || '❌ Неверный ключ', 'error');
        }
    } catch (err) {
        showToast('❌ Ошибка активации', 'error');
    }
});





// ========== ПРОСТОЙ ПОЛЗУНОК ГРОМКОСТИ (ТОЛЬКО ЧЕРЕЗ VolumeController) ==========
(function() {
    let currentVolumePercent = 100;
    let volumeManager = null;
    
    async function initVolumeManager() {
        volumeManager = new VolumeManager();
        
        // Загружаем сохранённую громкость
        const saved = localStorage.getItem('globalVolume');
        let startVolume = 1.0; // по умолчанию 100%
        
        if (saved !== null) {
            startVolume = parseFloat(saved);
            currentVolumePercent = startVolume * 100;
        }
        
        // ОТПРАВЛЯЕМ В MICROSOFT MIXER ПРИ ЗАПУСКЕ
        await volumeManager.setVolume(startVolume * 100);
        
        // Обновляем adaptiveOriginalVolume
        if (typeof adaptiveOriginalVolume !== 'undefined') {
            adaptiveOriginalVolume = startVolume;
            adaptiveCurrentVol = startVolume;
        }
        
        updateIcon(currentVolumePercent);
        
        console.log(`🔊 Установлена громкость при запуске: ${Math.round(startVolume * 100)}%`);
        return currentVolumePercent;
    }
    
    function updateIcon(percent) {
        const icon = document.getElementById('volumeIcon');
        const percentSpan = document.getElementById('volumePercent');
        if (icon) {
            if (percent === 0) icon.textContent = '🔇';
            else if (percent < 30) icon.textContent = '🔈';
            else if (percent < 70) icon.textContent = '🔉';
            else icon.textContent = '🔊';
        }
        if (percentSpan) {
            percentSpan.textContent = `${percent}%`;
        }
    }
    
    async function setVolume(percent) {
        currentVolumePercent = Math.max(0, Math.min(100, percent));
        localStorage.setItem('globalVolumePercent', currentVolumePercent);
        localStorage.setItem('globalVolume', currentVolumePercent / 100);
        
        // Обновляем adaptiveOriginalVolume
        if (typeof adaptiveOriginalVolume !== 'undefined') {
            adaptiveOriginalVolume = currentVolumePercent / 100;
        }
        
        updateIcon(currentVolumePercent);
        
        if (volumeManager) {
            await volumeManager.setVolume(currentVolumePercent);
        }
    }
    
    function createUI() {
        if (document.getElementById('volumeControl')) return;
        const urlBar = document.querySelector('.url-bar-container');
        if (!urlBar) return;
        
        const html = `
            <div id="volumeControl" style="position: relative; display: inline-flex; align-items: center; margin-left: 8px;">
                <div id="volumeIcon" style="font-size: 16px; padding: 4px 8px; cursor: pointer;">🔊</div>
                <div id="volumeSliderContainer" style="position: absolute; top: 100%; left: 0; margin-top: 8px; background: #1e1e1e; border-radius: 8px; padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; display: none; min-width: 130px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="range" id="volumeSlider" min="0" max="100" value="100" style="flex: 1; height: 4px; -webkit-appearance: none; background: #555; border-radius: 2px;">
                        <span id="volumePercent" style="font-size: 11px; min-width: 35px; text-align: right; color: var(--text-secondary);">100%</span>
                    </div>
                </div>
            </div>
        `;
        urlBar.insertAdjacentHTML('afterend', html);
        
        const style = document.createElement('style');
        style.textContent = `#volumeSlider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #1DB954; cursor: pointer; }`;
        document.head.appendChild(style);
    }
    
    function init() {
        createUI();
        
        const container = document.getElementById('volumeSliderContainer');
        const icon = document.getElementById('volumeIcon');
        const slider = document.getElementById('volumeSlider');
        if (!container || !icon || !slider) return;
        
        const parent = container.parentElement;
        if (parent && getComputedStyle(parent).position !== 'relative') {
            parent.style.position = 'relative';
        }
        
        let hideTimeout;
        icon.onmouseenter = () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            container.style.display = 'block';
        };
        container.onmouseenter = () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            container.style.display = 'block';
        };
        container.onmouseleave = () => {
            hideTimeout = setTimeout(() => {
                container.style.display = 'none';
            }, 500);
        };
        
        slider.oninput = (e) => {
            const val = parseInt(e.target.value);
            setVolume(val);
        };
        
        // Загружаем и устанавливаем положение слайдера
        initVolumeManager().then((savedPercent) => {
            slider.value = savedPercent;
            updateIcon(savedPercent);
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();




class VolumeManager {
    constructor(port = 9876) {
        this.baseUrl = `http://localhost:${port}`;
        this.isServerRunning = false;
        this.startPromise = null;
    }
    
    async checkServer() {
        try {
            const response = await fetch(`${this.baseUrl}/ping`, {
                method: 'GET',
                signal: AbortSignal.timeout(500)
            });
            this.isServerRunning = response.ok;
            return this.isServerRunning;
        } catch (error) {
            this.isServerRunning = false;
            return false;
        }
    }
    
    async waitForServer(maxAttempts = 20) {
        for (let i = 0; i < maxAttempts; i++) {
            if (await this.checkServer()) return true;
            await new Promise(r => setTimeout(r, 200));
        }
        return false;
    }
    
    async setVolume(volumePercent) {
        // Ждём или запускаем сервер
        if (!this.isServerRunning) {
            const started = await this.startServer();
            if (started) {
                const ready = await this.waitForServer();
                if (!ready) {
                    console.log('Сервер не ответил');
                    return false;
                }
            }
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/set-volume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volume: volumePercent / 100 })
            });
            const result = await response.json();
            return result.success === true;
        } catch (error) {
            console.error('Ошибка:', error);
            this.isServerRunning = false;
            return false;
        }
    }
    
    async startServer() {
        if (this.startPromise) return this.startPromise;
        
        this.startPromise = (async () => {
            try {
                if (window.require) {
                    const { exec } = window.require('child_process');
                    const path = window.require('path');
                    const exePath = path.join(process.cwd(), 'VolumeController.exe');
                    
                    exec(`"${exePath}"`, { detached: true }, (error) => {
                        if (error) console.error('Ошибка запуска:', error);
                    });
                    
                    await new Promise(r => setTimeout(r, 500));
                    return true;
                }
                return false;
            } catch (error) {
                console.error('Ошибка:', error);
                return false;
            }
        })();
        
        return this.startPromise;
    }
}

// Создаём глобальный экземпляр
const volumeControl = new VolumeManager();

// Функция для удобного вызова
async function setMusicHubVolume(volume) {
    // volume от 0 до 1 (0.5 = 50%)
    const success = await window.electronAPI.setMusicHubVolume(volume);
    

}

// Сделаем функцию глобальной для вызова из консоли и кнопок
window.setMusicHubVolume = setMusicHubVolume;

// Пример: привязываем к существующему ползунку громкости (если есть)
setTimeout(() => {
    const volumeSlider = document.getElementById('volumeSlider');
    if (volumeSlider) {
        // Добавляем обработчик, который будет менять громкость musichub и electron
        volumeSlider.addEventListener('input', (e) => {
            const vol = parseInt(e.target.value, 10) / 100;
            setMusicHubVolume(vol);
        });
    }
}, 1000);


// Примеры использования:
setMusicHubVolume(0.5); // 50%
setMusicHubVolume(0.3); // 30%
setMusicHubVolume(0);   // Выключить звук

// Можно привязать к кнопкам
document.getElementById('musicVolumeUp')?.addEventListener('click', () => {
    setMusicHubVolume(0.7);
});

document.getElementById('musicVolumeDown')?.addEventListener('click', () => {
    setMusicHubVolume(0.3);
});























function initDraggableArtworkPanel() {
    const panel = document.getElementById('extensionsPanel');
    if (!panel) return;
    
    let isDragging = false;
    let dragStartX, dragStartY;
    let panelStartLeft, panelStartTop;
    
    // Получаем границы
    function getBounds() {
        const titlebar = document.getElementById('titlebar');
        const sidebar = document.getElementById('sidebar');
        
        const minX = sidebar ? sidebar.offsetWidth + 10 : 80;
        const minY = titlebar ? titlebar.offsetHeight + 10 : 40;
        const maxX = window.innerWidth - panel.offsetWidth - 10;
        const maxY = window.innerHeight - panel.offsetHeight - 10;
        
        return { minX, minY, maxX, maxY };
    }
    
    let header = panel.querySelector('.ext-panel-header');
    if (header) {
        header.style.cursor = 'grab';
        header.style.userSelect = 'none';
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('#closeExtensionsPanelBtn')) return;
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            const rect = panel.getBoundingClientRect();
            panelStartLeft = rect.left;
            panelStartTop = rect.top;
            
            panel.style.position = 'fixed';
            panel.style.margin = '0';
            panel.style.left = panelStartLeft + 'px';
            panel.style.top = panelStartTop + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            let newLeft = panelStartLeft + deltaX;
            let newTop = panelStartTop + deltaY;
            
            // Применяем границы
            const bounds = getBounds();
            newLeft = Math.max(bounds.minX, Math.min(bounds.maxX, newLeft));
            newTop = Math.max(bounds.minY, Math.min(bounds.maxY, newTop));
            
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                localStorage.setItem('artworkPanelLeft', panel.style.left);
                localStorage.setItem('artworkPanelTop', panel.style.top);
                isDragging = false;
                header.style.cursor = 'grab';
            }
        });
        
        // Восстанавливаем позицию с учётом границ
        const savedLeft = localStorage.getItem('artworkPanelLeft');
        const savedTop = localStorage.getItem('artworkPanelTop');
        if (savedLeft && savedTop) {
            panel.style.position = 'fixed';
            panel.style.left = savedLeft;
            panel.style.top = savedTop;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            
            // Проверяем, не уехала ли за границы
            setTimeout(() => {
                const bounds = getBounds();
                let left = parseFloat(panel.style.left);
                let top = parseFloat(panel.style.top);
                
                if (left < bounds.minX) panel.style.left = bounds.minX + 'px';
                if (left > bounds.maxX) panel.style.left = bounds.maxX + 'px';
                if (top < bounds.minY) panel.style.top = bounds.minY + 'px';
                if (top > bounds.maxY) panel.style.top = bounds.maxY + 'px';
            }, 100);
        }
    }
}

// Вызываем при открытии панели
document.getElementById('extensionsPanelBtn')?.addEventListener('click', () => {
    setTimeout(initDraggableArtworkPanel, 50);
});















function initDraggableTabs() {
    const container = document.getElementById('services-container');
    if (!container) {
        console.log('❌ services-container не найден');
        return;
    }
    
    let draggedItem = null;
    
    // Добавляем CSS
    if (!document.getElementById('drag-tabs-style')) {
        const style = document.createElement('style');
        style.id = 'drag-tabs-style';
        style.textContent = `
            .nav-btn.drag-over {
                border: 2px solid var(--accent-color) !important;
                background: rgba(29, 185, 84, 0.1) !important;
            }
            .nav-btn[draggable="true"] {
                cursor: grab !important;
                user-select: none !important;
            }
            .nav-btn[draggable="true"]:active {
                cursor: grabbing !important;
            }
        `;
        document.head.appendChild(style);
    }
    
    function makeDraggable(btn) {
        if (btn.hasAttribute('draggable')) return;
        
        btn.setAttribute('draggable', 'true');
        
        btn.addEventListener('dragstart', (e) => {
            draggedItem = btn;
            e.dataTransfer.setData('text/plain', btn.id);
            e.dataTransfer.effectAllowed = 'move';
            btn.style.opacity = '0.4';
        });
        
        btn.addEventListener('dragend', (e) => {
            if (draggedItem) draggedItem.style.opacity = '';
            draggedItem = null;
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.remove('drag-over');
            });
        });
        
        btn.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            if (draggedItem === target) return;
            target.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        });
        
        btn.addEventListener('dragleave', (e) => {
            e.currentTarget.classList.remove('drag-over');
        });
        
        btn.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.currentTarget;
            target.classList.remove('drag-over');
            
            if (!draggedItem || draggedItem === target) return;
            
            // Перемещаем в DOM
            const parent = container;
            const children = Array.from(parent.children);
            const fromIndex = children.indexOf(draggedItem);
            const toIndex = children.indexOf(target);
            
            if (fromIndex < toIndex) {
                target.insertAdjacentElement('afterend', draggedItem);
            } else {
                target.insertAdjacentElement('beforebegin', draggedItem);
            }
            
            // Сохраняем порядок
            const newOrder = Array.from(parent.children).map(child => {
                const match = child.id.match(/btn-(.+)/);
                return match ? match[1] : null;
            }).filter(id => id !== null);
            
            localStorage.setItem('tabOrder', JSON.stringify(newOrder));
            
            // Обновляем activeServices
            activeServices = [...newOrder];
            localStorage.setItem('activeServices', JSON.stringify(activeServices));
            
            draggedItem = null;
        });
    }
    
    // Наблюдаем за появлением новых кнопок
    const observer = new MutationObserver(() => {
        const btns = document.querySelectorAll('#services-container .nav-btn');
        btns.forEach(btn => makeDraggable(btn));
        
        // Применяем сохранённый порядок один раз
        if (!window._orderApplied) {
            const savedOrder = localStorage.getItem('tabOrder');
            if (savedOrder) {
                try {
                    const order = JSON.parse(savedOrder);
                    order.forEach(serviceId => {
                        const btn = document.getElementById(`btn-${serviceId}`);
                        if (btn && btn.parentNode === container) {
                            container.appendChild(btn);
                        }
                    });
                } catch(e) {}
            }
            window._orderApplied = true;
        }
    });
    
    observer.observe(container, { childList: true, subtree: true });
    
    // Запускаем для уже существующих кнопок
    document.querySelectorAll('#services-container .nav-btn').forEach(btn => makeDraggable(btn));
}

// Вызываем через 2 секунды после загрузки
setTimeout(initDraggableTabs, 2000);


























 
const CHAT_SERVER_URL = 'wss://withered-limit-f1e2.170610maksim.workers.dev/chat';
const CHAT_ROOM_ID = 'musichub';

 
function toggleChat() {
    const panel = document.getElementById('chat-panel');
    const settings = document.getElementById('settings-panel');
    
     
    if (settings && settings.classList.contains('visible')) {
        settings.classList.remove('visible');
    }
    
     
    panel.classList.toggle('visible');
    
    if (panel.classList.contains('visible') && unreadCount > 0) {
        unreadCount = 0;
        updateChatBadge();
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
     
}

function closeChat() {
    document.getElementById('chat-panel').classList.remove('visible');
}

function updateChatBadge() {
    let badge = document.getElementById('chat-badge');
    const chatBtn = document.getElementById('chatBtn');
    
    if (!badge && chatBtn) {
        badge = document.createElement('div');
        badge.id = 'chat-badge';
        badge.className = 'notification-badge';
        chatBtn.style.position = 'relative';
        chatBtn.appendChild(badge);
    }
    
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function addToHistory(role, content) {
    chatHistory.push({ role, content });
    // Оставляем только последние MAX_HISTORY сообщений
    if (chatHistory.length > MAX_HISTORY) {
        chatHistory = chatHistory.slice(-MAX_HISTORY);
    }
    console.log(`📝 История (${chatHistory.length}):`, chatHistory);
}

// Функция получения истории для контекста
function getHistoryContext() {
    if (chatHistory.length === 0) return '';
    
    let context = '\n=== ИСТОРИЯ ДИАЛОГА ===\n';
    for (const msg of chatHistory) {
        const sender = msg.role === 'user' ? 'Пользователь' : 'Ты (AI)';
        context += `${sender}: ${msg.content}\n`;
    }
    context += '=== КОНЕЦ ИСТОРИИ ===\n';
    return context;
}
 
function addChatMessage(message, isOutgoing = false, sender = null) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const role = isOutgoing ? 'user' : 'assistant';
    // Для системных сообщений не добавляем в историю
    if (sender !== 'system') {
        addToHistory(role, message);
    }
    
    let senderName = sender || (isOutgoing ? 'Вы' : 'Пользователь');
    if (sender === 'system') {
        senderName = '🎵 System';
        messageDiv.style.opacity = '0.7';
        messageDiv.style.fontStyle = 'italic';
    }
    
     
const formattedMessage = formatMessageWithLinks ? formatMessageWithLinks(message) : escapeHtml(message);
    
     
    let html = `
        <div class="message-sender">${escapeHtml(senderName)}</div>
        <div class="message-text">${formattedMessage}</div>
        <div class="message-time">${time}</div>
    `;
    
    messageDiv.innerHTML = html;
    
     
     
    if (!isOutgoing && sender !== 'system') {
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        messageDiv.setAttribute('data-message-id', messageId);
        
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        reactionsDiv.innerHTML = `
            <span class="reaction-btn" onclick="addReaction('${messageId}', '👍')">👍</span>
            <span class="reaction-btn" onclick="addReaction('${messageId}', '❤️')">❤️</span>
            <span class="reaction-btn" onclick="addReaction('${messageId}', '😂')">😂</span>
            <span class="reaction-btn" onclick="addReaction('${messageId}', '🎵')">🎵</span>
        `;
        messageDiv.appendChild(reactionsDiv);
    }
    
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    return messageDiv;
}

 
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

 
function formatMessageWithLinks(text) {
    if (!text) return '';
     
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => {
         
        const safeUrl = url.replace(/'/g, "\\'");
        return `<a href="#" onclick="window.electronAPI.openExternal('${safeUrl}'); return false;" class="message-link">${url}</a>`;
    });
}

 
function openLink(url) {
    console.log('🔗 Открываю ссылку:', url);
    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else if (require && require('electron')) {
        require('electron').shell.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
}

 
function addReaction(messageId, emoji) {
    console.log(`Реакция ${emoji} на сообщение ${messageId}`);
     
    addChatMessage(`✨ ${emoji}`, false, 'system');
}

 

function showChatNotification(message, sender) {
    // Звук всегда играем, если он включен (независимо от уведомлений)
    if (notifySoundEnabled) {
        playNotifySound();
    }
    
    // Если уведомления выключены в настройках — не показываем попап
    if (!showNotifications) return;
    
    if (!notificationsEnabled) return;
    
    const notification = document.createElement('div');
    notification.className = 'chat-notification';
    notification.innerHTML = `
        <div class="notification-icon">💬</div>
        <div class="notification-text">
            <strong>${escapeHtml(sender)}</strong><br>
            ${escapeHtml(message.length > 30 ? message.slice(0, 30) + '...' : message)}
        </div>
        <div class="notification-close">✕</div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    notification.addEventListener('click', (e) => {
        if (!e.target.classList.contains('notification-close')) {
            toggleChat();
            notification.remove();
        }
    });
    
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    });
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

 
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Проверяем команды
    if (message.startsWith('/')) {
        handleCommand(message);
        input.value = '';
        return;
    }
    
    input.value = '';
    
    // Добавляем сообщение пользователя
    addChatMessage(message, true);
    
    // Проверяем, не является ли это командой для нейросети
    const aiResult = await handleChatAICommand(message);
    if (aiResult) {
        // Это была команда
        addChatMessage(aiResult.text, false, 'AI');
        return;
    }
    
    // Обычный запрос к нейросети
    askGigaChat(message);
}

async function askGigaChat(question) {
    const limit = await checkAILimit();
    const isPremium = premiumStatus?.isPremium || false;
    
    if (!isPremium && limit.count >= 10) {
        addChatMessage(`❌ Достигнут лимит AI запросов (10/день). Подпишитесь на Premium для неограниченного доступа.`, false, 'system');
        return;
    }
    
    addChatMessage(`🤖 Думаю над: "${question.slice(0, 50)}..."`, false, 'system');
    
    try {
        const keyResponse = await fetch(`${WORKER_URL}/key`, {
            headers: { 'X-App-Key': APP_KEY }
        });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        const authKey = keyData.authKey;
        
        const tokenResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
                'RqUID': crypto.randomUUID(),
                'Authorization': `Basic ${authKey}`,
            },
            body: 'scope=GIGACHAT_API_PERS',
        });
        
        const tokenData = await tokenResponse.json();
        const token = tokenData.access_token;
        
        // === ПОЛУЧАЕМ ИСТОРИЮ ДЛЯ КОНТЕКСТА ===
        const historyContext = getHistoryContext();
        
        // === ПРОМПТ С ИСТОРИЕЙ ===
        const systemPrompt = `Ты — AI-помощник в MusicHub 3.2.0.

${historyContext}

=== ИНСТРУКЦИИ ===
1. Используй историю диалога, чтобы понимать, о ком идёт речь.
2. Если пользователь говорит "этот исполнитель", "его песни" — вспомни, о ком говорили ранее.
3. Если пользователь спрашивает "а ты помнишь..." — ответь на основе истории.

=== КОМАНДЫ ===
- 📚[KNOWLEDGE:запрос] — когда спрашивают "кто такой ..."
- 🔍[SEARCH:запрос] — когда просят найти песни
        '🎵[CMD:PLAY]': 'Включить воспроизведение',
        '🎵[CMD:PAUSE]': 'Поставить на паузу',
        '🎵[CMD:STOP]': 'Полностью остановить',
        '🎵[CMD:NEXT]': 'Следующий трек', 'дальше', 'вперед'
        '🎵[CMD:PREV]': 'Предыдущий трек', 'назад', 'прошлое значит включить прошлый трек'
        '🎵[CMD:VOLUP]': 'Увеличить громкость на 10%',
        '🎵[CMD:VOLDOWN]': 'Уменьшить громкость на 10%',
        '🎵[CMD:VOLSET:X]': 'Установить громкость X% (где X от 0 до 100)',
        '🎵[CMD:MUTE]': 'Выключить звук',
        '🎵[CMD:UNMUTE]': 'Включить звук',
        '🎵[CMD:TOGGLE]': 'Переключить Play/Pause'
=== ПРИМЕРЫ ===
Пользователь: "кто такой MORGENSHTERN?"
Ты: 📚[KNOWLEDGE:MORGENSHTERN]

Пользователь: "найди песни этого исполнителя"
Ты: 🔍[SEARCH:MORGENSHTERN] (используя историю)

Пользователь: "включи его песни"
Ты: 🎵[CMD:PLAY] 🔍[SEARCH:MORGENSHTERN] (используя историю)

Пользователь: "а ты помнишь что я просил?"
Ты: Да, ты спрашивал о MORGENSHTERN. Хочешь найти его песни?

=== ПРАВИЛА ===
1. Отвечай дружелюбно, используй эмодзи
2. Используй историю для понимания контекста
3. Если не знаешь ответа — честно скажи об этом`;

        const aiResponse = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'GigaChat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: question }
                ],
                temperature: 0.7,
                max_tokens: 500,
            })
        });
        
        const data = await aiResponse.json();
        let answer = data.choices?.[0]?.message?.content || 'Не удалось получить ответ';
        
        console.log('📥 Ответ AI:', answer);
        
        const processed = await processAIResponse(answer);
        addChatMessage(`🤖 ${processed}`, false, 'AI');
        
        await incrementAICount();
        
    } catch (err) {
        console.error('AI error:', err);
        addChatMessage(`❌ Ошибка: ${err.message}`, false, 'system');
    }
}

function clearContext() {
    lastMentionedArtist = null;
    chatHistory = [];
    console.log('🧠 Контекст очищен');
}

async function processAIResponse(text) {
    if (!text) return 'Не понял запрос';
    
    // === 1. ПОИСК В БАЗЕ ЗНАНИЙ ===
    const knowledgeMatch = text.match(/📚\[KNOWLEDGE:(.+?)\]/);
    if (knowledgeMatch) {
        let query = knowledgeMatch[1].trim();
        console.log(`📚 AI запросил базу знаний: "${query}"`);
        
        // Если запрос пустой или "этот" — пытаемся взять из истории
        if (!query || query === 'этот' || query === 'этого') {
            // Ищем последнего исполнителя в истории
            for (let i = chatHistory.length - 1; i >= 0; i--) {
                const msg = chatHistory[i];
                // Ищем упоминание исполнителя в сообщениях пользователя
                if (msg.role === 'user') {
                    const match = msg.content.match(/кто такой\s+([^\s?]+)/i);
                    if (match) {
                        query = match[1];
                        console.log(`🧠 Нашёл в истории: "${query}"`);
                        break;
                    }
                }
            }
        }
        
        const result = await searchKnowledge(query);
        if (result) {
            lastMentionedArtist = query;
            return result;
        } else {
            searchYoutubeMusic(query);
            return `🔍 Ищу "${query}" в YouTube Music... (в базе ничего нет)`;
        }
    }
    
    // === 2. ПОИСК В YOUTUBE ===
    const searchMatch = text.match(/🔍\[SEARCH:(.+?)\]/);
    if (searchMatch) {
        let query = searchMatch[1].trim();
        console.log(`🔍 AI запросил поиск: "${query}"`);
        
        // Если "этого исполнителя" — берём из истории
        if (query.toLowerCase().includes('этого исполнителя') || 
            query === 'его' || 
            query === 'него' ||
            query === '') {
            if (lastMentionedArtist) {
                query = lastMentionedArtist;
                console.log(`🧠 Использую контекст: "${query}"`);
            } else {
                // Ищем в истории
                for (let i = chatHistory.length - 1; i >= 0; i--) {
                    const msg = chatHistory[i];
                    if (msg.role === 'user') {
                        const match = msg.content.match(/кто такой\s+([^\s?]+)/i);
                        if (match) {
                            query = match[1];
                            lastMentionedArtist = query;
                            console.log(`🧠 Нашёл в истории: "${query}"`);
                            break;
                        }
                    }
                }
                if (!lastMentionedArtist) {
                    return '❌ Я не знаю, о ком речь. Скажи имя исполнителя.';
                }
            }
        }
        
        const knowledgeResult = await searchKnowledge(query);
        if (knowledgeResult) {
            searchYoutubeMusic(query);
            return `${knowledgeResult}\n\n🔍 Открываю поиск в YouTube Music...`;
        }
        
        searchYoutubeMusic(query);
        return `🔍 Ищу "${query}" в YouTube Music...`;
    }
    
    // === 3. КОМАНДЫ УПРАВЛЕНИЯ ===
    const cmdMatch = text.match(/🎵\[CMD:[^\]]+\]/);
    if (cmdMatch) {
        if (text.includes('включи') && lastMentionedArtist) {
            searchYoutubeMusic(lastMentionedArtist);
            return `🎵 Включаю "${lastMentionedArtist}" в YouTube Music...`;
        }
        const result = handleAIResponse(text);
        return result.text || '✅ Команда выполнена!';
    }
    
    // === 4. ОБЫЧНЫЙ ОТВЕТ ===
    return text;
}


function searchYoutubeMusic(query) {
    if (!query || query.trim() === '') {
        showToast('❌ Введите запрос для поиска', 'error');
        return;
    }
    
    const encodedQuery = encodeURIComponent(query.trim());
    const searchUrl = `https://music.youtube.com/search?q=${encodedQuery}`;
    
    console.log(`🔍 Открываю поиск: ${searchUrl}`);
    
    // Проверяем, есть ли YouTube Music в активных сервисах
    const activeWv = document.querySelector('webview.active');
    
    if (activeWv && activeWv.id === 'youtube') {
        // Уже на YouTube - просто грузим поиск
        activeWv.loadURL(searchUrl);
        showToast(`🔍 Поиск: "${query}"`, 'success');
        return;
    }
    
    // Ищем кнопку YouTube
    const ytBtn = document.getElementById('btn-youtube');
    if (ytBtn) {
        // Переключаемся на YouTube
        sw('youtube', ytBtn);
        
        // Через секунду грузим поиск
        setTimeout(() => {
            const wv = document.querySelector('webview.active');
            if (wv && wv.id === 'youtube') {
                wv.loadURL(searchUrl);
                showToast(`🔍 Поиск: "${query}"`, 'success');
            }
        }, 500);
    } else {
        // Если YouTube не в сервисах - открываем через musichub://
        const musichubUrl = `musichub://${searchUrl}`;
        if (window.electronAPI && window.electronAPI.openExternalUrl) {
            window.electronAPI.openExternalUrl(musichubUrl);
            showToast(`🔍 Поиск: "${query}"`, 'success');
        } else {
            showToast('❌ YouTube Music не добавлен в сервисы', 'error');
        }
    }
}

// ============================================================
// ДЕЛАЕМ ФУНКЦИИ ГЛОБАЛЬНЫМИ
// ============================================================

window.searchYoutubeMusic = searchYoutubeMusic;
window.processAIResponse = processAIResponse;

console.log('🎵 Поиск в YouTube Music через AI готов!');
console.log('📝 Используйте: searchYoutubeMusic("Shape of You")');
console.log('🧠 В чате: "найди Shape of You"');


document.getElementById('startMinimized')?.addEventListener('change', (e) => {
    const value = e.target.checked;
    localStorage.setItem('startMinimized', value);
    window.electronAPI.setStartMinimized(value);
});




function safeChatSend(data) {
    if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
        try {
            chatWebSocket.send(JSON.stringify(data));
            return true;
        } catch (e) {
            console.log('Ошибка отправки в чат:', e);
            return false;
        }
    }
    return false;
}

// Исправленная функция sendTyping
function sendTyping() {
    safeChatSend({ type: 'typing' });
}

// Исправленный обработчик ввода в чате
document.getElementById('chat-input')?.addEventListener('input', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    safeChatSend({ type: 'typing' });
    typingTimeout = setTimeout(() => {
        safeChatSend({ type: 'typing_stop' });
    }, 1000);
});

async function handleCommand(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    
    // Проверяем, не является ли это кодом
    const aiResult = await handleChatAICommand(command);
    if (aiResult) {
        addChatMessage(aiResult.text, false, 'AI');
        return;
    }
    
    switch(cmd) {
        case '/ai':
            const query = parts.slice(1).join(' ');
            if (query) {
                askGigaChat(query);
            } else {
                addChatMessage('🤖 Использование: /ai [вопрос]', false, 'system');
            }
            break;

            case '/clear_context':
    clearContext();
    addChatMessage('🧠 Контекст очищен', false, 'system');
    break;
            
        case '/play':
            await handlePlayPause();
            addChatMessage('▶️ Play/Pause', false, 'system');
            break;
            
        case '/stop':
            await handleStop();
            addChatMessage('⏹️ Стоп', false, 'system');
            break;
            
        case '/next':
            await handleNext();
            addChatMessage('⏭️ Следующий трек', false, 'system');
            break;
            
        case '/prev':
            await handlePrevious();
            addChatMessage('⏮️ Предыдущий трек', false, 'system');
            break;
            
        case '/vol':
            const vol = parseInt(parts[1]);
            if (!isNaN(vol) && vol >= 0 && vol <= 100) {
                await setMediaVolume(vol);
                updateVolumeUI(vol);
                addChatMessage(`🔊 Громкость: ${vol}%`, false, 'system');
            } else {
                addChatMessage('❌ Использование: /vol [0-100]', false, 'system');
            }
            break;
            
        case '/help':
            addChatMessage(`📋 Доступные команды:
/play - Play/Pause
/stop - Стоп (полная остановка)
/next - Следующий трек
/prev - Предыдущий трек
/vol [0-100] - Установить громкость
/ai [вопрос] - Спросить у AI
/clear - Очистить чат
/coin - Орёл/решка
/clear_context - Очищает историю для ии

💡 Также можно писать AI обычным текстом:
"включи музыку", "следующий трек", "сделай погромче"`, false, 'system');
            break;
            
        case '/clear':
            document.getElementById('chat-messages').innerHTML = '';
            addChatMessage('✨ Чат очищен', false, 'system');
            break;
            
        case '/coin':
            const result = Math.random() < 0.5 ? 'Орёл' : 'Решка';
            addChatMessage(`🪙 Монетка подброшена... ${result}!`, false, 'system');
            break;
            
        default:
            addChatMessage(`❌ Неизвестная команда: ${cmd}. Введите /help`, false, 'system');
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

 
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

 
function connectChat(roomId, userId) {
    const wsUrl = `${CHAT_SERVER_URL}/${roomId}?userId=${encodeURIComponent(userId)}`;
    
    chatWebSocket = new WebSocket(wsUrl);
    const statusEl = document.getElementById('chat-status');
    
chatWebSocket.onopen = () => {
     
    chatWebSocket.send(JSON.stringify({
        type: 'ai_only',
        userId: currentChatUser,
        userName: getUserName()
    }));
};
    
    chatWebSocket.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'message') {
            const isOwn = data.userId === currentChatUser;
            if (!isOwn) {
                addChatMessage(data.text, false, data.userName || 'Пользователь');
                
                const chatPanel = document.getElementById('chat-panel');
                if (!chatPanel.classList.contains('visible')) {
                    unreadCount++;
                    updateChatBadge();
                    showChatNotification(data.text, data.userName || 'Пользователь');
                }
            }
        }

        else if (data.type === 'typing') {
    const typingEl = document.getElementById('chatTyping');
    document.getElementById('typingUser').textContent = data.userName;
    typingEl.style.display = 'block';
    setTimeout(() => typingEl.style.display = 'none', 2000);
}
        
         
        else if (data.type === 'online_list') {
            updateTitlebarOnline(data.count);   
            if (data.users && data.users.length) {
                console.log('👥 Онлайн:', data.users.map(u => u.userName).join(', '));
            }
        }
        

        else if (data.type === 'user_joined') {
            addChatMessage(`${data.userName} присоединился к чату (${data.onlineCount} онлайн)`, false, 'system');
            updateTitlebarOnline(data.onlineCount);
        }
        
        else if (data.type === 'user_left') {
            addChatMessage(`${data.userName} покинул чат (${data.onlineCount} онлайн)`, false, 'system');
            updateTitlebarOnline(data.onlineCount);
        }
        
        else if (data.type === 'user_renamed') {
            addChatMessage(`${data.oldName} → ${data.newName}`, false, 'system');
        }
        
    } catch (e) {
        console.error('Ошибка обработки сообщения:', e);
    }
};
    
    chatWebSocket.onclose = () => {
        console.log('❌ Чат отключен');
        chatConnected = false;
        statusEl.innerHTML = '🔴 Офлайн • Переподключение...';
        statusEl.style.color = '#ff4444';
        

        setTimeout(() => {
            if (!chatConnected) {
                connectChat(roomId, userId);
            }
        }, 5000);
    };
    
    chatWebSocket.onerror = (error) => {
        console.error('WebSocket ошибка:', error);
        statusEl.innerHTML = '⚠️ Ошибка подключения';
    };
}


function getOrCreateUserId() {
    let userId = localStorage.getItem('chat_user_id');
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('chat_user_id', userId);
    }
    return userId;
}





function initChat() {
    currentChatUser = getOrCreateUserId();
    
     
     
    
     
    const statusEl = document.getElementById('chat-status');
    if (statusEl) {
        statusEl.innerHTML = '🤖 AI режим • Команды: /help';
        statusEl.style.color = '#1DB954';
    }
    
     
    updateTitlebarOnline(1);
}


function setChatUserName(newName) {
    if (newName && newName.trim()) {
        localStorage.setItem('chat_user_name', newName.trim());
        addChatMessage(`Вы изменили имя на "${newName}"`, false, 'system');
        
       
        if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
            chatWebSocket.send(JSON.stringify({
                type: 'set_name',
                name: newName.trim()
            }));
        }
    }
}

function updatePanelArtwork(artworkUrl, trackTitle) {
    const panelArtwork = document.getElementById('panelArtwork');
    const panelTitle = document.getElementById('panelTrackTitle');
    
    if (panelArtwork && artworkUrl && artworkUrl !== 'null' && artworkUrl !== 'undefined') {
        panelArtwork.src = artworkUrl;
        panelArtwork.style.display = 'block';
    } else if (panelArtwork) {
        panelArtwork.src = '';
    }
    
    if (panelTitle && trackTitle) {
        panelTitle.textContent = trackTitle;
    }
}

setTimeout(() => {
    initChat();
}, 1000);