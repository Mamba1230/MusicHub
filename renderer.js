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

// ========== ФУНКЦИИ СТАТИСТИКИ (ГЛОБАЛЬНЫЕ) ==========

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
            stopAudioCapture();
            
            currentDeviceId = deviceId;
            localStorage.setItem('audioDevice', deviceId);
            
            if (!deviceId) {
                useFakeVisualizer = true;
                startVisualizer();
                return;
            }
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: deviceId,
                        echoCancellation: false,
                        noiseSuppression: false
                    }
                });
                
                mediaStream = stream;
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                await audioContext.resume();
                
                source = audioContext.createMediaStreamSource(stream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                
                source.connect(analyser);
                useFakeVisualizer = false;
                startVisualizer();
                
                showToast('🎤 Микрофон подключен!', 'success');
                
            } catch (error) {
                console.error('Ошибка:', error);
                useFakeVisualizer = true;
                startVisualizer();
                showToast('❌ Ошибка подключения микрофона', 'error');
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
            
            // Добавляем клавишу в набор
            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key === 'Tab') key = 'Tab';
            if (key === 'Escape') key = 'Escape';
            if (key.length === 1) key = key.toUpperCase();
            
            // Модификаторы
            if (e.ctrlKey) pressedKeys.add('Control');
            if (e.altKey) pressedKeys.add('Alt');
            if (e.shiftKey) pressedKeys.add('Shift');
            if (e.metaKey) pressedKeys.add('Meta');
            
            if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
                pressedKeys.add(key);
            }
            
            // Показываем текущую комбинацию
            const currentBinding = Array.from(pressedKeys).join('+');
            if (currentBinding) {
                input.value = currentBinding;
            }
        };
        
        const onKeyUp = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Формируем финальную комбинацию
            let keys = [];
            if (e.ctrlKey) keys.push('Control');
            if (e.altKey) keys.push('Alt');
            if (e.shiftKey) keys.push('Shift');
            if (e.metaKey) keys.push('Meta');
            
            let key = e.key;
            if (key === ' ') key = 'Space';
            if (key === 'Tab') key = 'Tab';
            if (key === 'Escape') key = 'Escape';
            if (key.length === 1) key = key.toUpperCase();
            
            if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
                keys.push(key);
            }
            
            // Если ничего не нажато - используем последнюю комбинацию из pressedKeys
            let binding = keys.join('+');
            if (!binding || binding === 'Control' || binding === 'Alt' || binding === 'Shift') {
                binding = Array.from(pressedKeys).join('+');
            }
            if (!binding || binding === '') {
                binding = 'Control+Tab';
            }
            
            input.value = binding;
            input.style.opacity = '1';
            
            // Сохраняем
            localStorage.setItem('tabBinding', binding);
            const enabled = document.getElementById('enableTabBinding')?.checked ?? true;
            localStorage.setItem('tabBindingEnabled', enabled);
            
            if (window.electronAPI && window.electronAPI.updateTabBinding) {
                window.electronAPI.updateTabBinding({ enabled: enabled, binding: binding });
            }
            
            showToast(`✅ Сочетание: ${binding}`, 'success');
            
            // Убираем обработчики
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            pressedKeys.clear();
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




































































        

         
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MusicHub v2.9.7');
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
    showToast('🎵 Добро пожаловать в MusicHub уже почти 3.0!', 'success');
    
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
    
    window.electronAPI.onAppBlur(() => {
         
    });
    
    window.electronAPI.onAppFocus(() => {
         
    });
    
    window.electronAPI.onAppHidden(() => {
         
    });
    
    window.electronAPI.onAppShown(() => {
         
    });
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
                <div class="home-card">
                    <h3>🎵 Сейчас играет</h3>
                    <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
                        <img id="homeArtwork" src="" style="width: 100px; height: 100px; border-radius: 12px; object-fit: cover; background: var(--bg-secondary);">
                        <div style="flex: 1;">
                            <div id="homeTrackTitle" style="font-size: 18px; font-weight: 600; margin-bottom: 5px;">-</div>
                            <div id="homeTrackArtist" style="color: var(--text-secondary); margin-bottom: 8px;">-</div>
                            <div id="homeService" style="font-size: 12px; color: var(--accent-color);"></div>
                        </div>
                    </div>
                </div>
                <div class="home-card">
                    <h3>🎵 Фоновый плеер</h3>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                        <button id="bgYandexBtn" class="home-service-btn" style="background: var(--accent-color); color: white;">🎧 Яндекс Музыка</button>
                        <button id="bgYoutubeBtn" class="home-service-btn" style="background: var(--accent-color); color: white;">🎧 YouTube Музыка</button>
                        <button id="stopBgBtn" class="home-service-btn" style="background: #ff4444; color: white;">⏹️ Остановить</button>
                    </div>
                    <div id="bgStatus" style="margin-top: 12px; font-size: 12px; color: var(--text-secondary);"></div>
                </div>
            </div>
<div class="home-card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h3 style="margin: 0;">📊 Твоя статистика</h3>
        <button id="clearStatsBtn" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 16px;" title="Очистить статистику">🗑️</button>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <!-- Топ исполнители -->
        <div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">🏆 Топ исполнители</div>
            <div id="topArtistsContainer" style="font-size: 13px;">Загрузка...</div>
        </div>
        <!-- AI комментарий -->
        <div>
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">🤖 AI комментарий</div>
            <div id="aiStatus" style="font-size: 10px; opacity: 0.6;">✨ креативный режим</div>
            <div id="aiCommentary" style="font-size: 13px; font-style: italic; padding: 8px; background: var(--bg-secondary); border-radius: 10px; min-height: 80px;">
                💭 Загрузка...
            </div>
        </div>
    </div>
    <!-- График -->
    <div style="margin-top: 16px;">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">📈 Активность за неделю</div>
        <div id="statsContainer"></div>
    </div>
</div>
        `;
        
        content.appendChild(homePage);
        console.log('✅ homePage создана динамически');
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
            const mediaInfo = await window.electronAPI.getMediaFromFiles();
            if (mediaInfo && mediaInfo.title) {
                const titleEl = document.getElementById('homeTrackTitle');
                const artistEl = document.getElementById('homeTrackArtist');
                const artworkEl = document.getElementById('homeArtwork');
                
                if (titleEl) titleEl.textContent = mediaInfo.title;
                if (artistEl) artistEl.textContent = mediaInfo.artist || 'Неизвестен';
                if (artworkEl && mediaInfo.artwork_base64) {
                    artworkEl.src = `data:image/jpeg;base64,${mediaInfo.artwork_base64}`;
                }
            }
        } catch(e) {
            console.log('Ошибка получения трека:', e);
        }
        
        // Остальной код updateHomeContent...
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
                    stopBackgroundPlayer();
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

🎨 ВИЗУАЛИЗАЦИИ (25+ режимов):
Базовые (бесплатно): Полоски, Волна, Круг, Точки, Огонь, Частицы, Спектр, Радиальный, Пузырьки
Премиум: 3D Туннель, 3D Куб, Галактика, Северное сияние, Метеоритный дождь, Лава, Неоновая сетка, Волны на воде, Вихрь, Цветок, Фрактал, Пульсирующее сердце, Эквалайзер, Звездный взрыв, Лазерное шоу, Глитч-эффект, Плазма, GIF анимация
- Полноэкранный режим визуализации (кнопка ⤢)
- Скриншоты визуализации (📸) — в Premium

🎤 ЗАХВАТ ЗВУКА:
- Можно выбрать устройство захвата (микрофон или Virtual Audio Cable)
- Визуализации реагируют на громкость в реальном времени
- Чувствительность регулируется (0.1-3)

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

💎 PREMIUM (50 ₽/месяц):
Открывает: все визуализации, безлимитный AI, кастомные сайты (до 5), скриншоты

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
        addChatMessage(`🤖 ${answer}`, false, 'AI');
        
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

 
function addChatMessage(message, isOutgoing = false, sender = null) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
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

 
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message) return;
    
     
    if (message.startsWith('/')) {
        handleCommand(message);
        input.value = '';
        return;
    }
    
     
    input.value = '';
    
     
    askGigaChat(message);
}


document.getElementById('startMinimized')?.addEventListener('change', (e) => {
    const value = e.target.checked;
    localStorage.setItem('startMinimized', value);
    window.electronAPI.setStartMinimized(value);
});




document.getElementById('chat-input')?.addEventListener('input', () => {
    if (typingTimeout) clearTimeout(typingTimeout);
    sendTyping();
    typingTimeout = setTimeout(() => {
        chatWebSocket.send(JSON.stringify({ type: 'typing_stop' }));
    }, 1000);
});

async function handleCommand(command) {
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    
    
    switch(cmd) {

case '/premium-status':
    const status = premiumStatus || { isPremium: 'unknown' };
    addChatMessage(`Premium статус: ${JSON.stringify(status)}`, false, 'system');
    break;

        case '/ai':   
            const query = parts.slice(1).join(' ');
            if (query) {
                askGigaChat(query);
            } else {
                addChatMessage('🤖 Использование: /ai [вопрос]\n\nПример: /ai кто написал Bohemian Rhapsody?', false, 'system');
            }
            break;

        case '/clear':
            document.getElementById('chat-messages').innerHTML = '';
            addChatMessage('✨ Чат очищен', false, 'system');
            break;
            
        case '/coin':
            const result = Math.random() < 0.5 ? 'Орёл' : 'Решка';
            addChatMessage(`🪙 Монетка подброшена... ${result}!`, false, 'system');
            break;
                       
case '/help':
    addChatMessage('📋 Доступные команды:\n\n/ai [вопрос] — спросить у AI\n/clear — очистить чат\n/coin — орёл/решка\n/help — показать эту справку', false, 'system');
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