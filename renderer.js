 
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
        
        const services = [
            { id: 'yandex', name: 'Яндекс Музыка', url: 'https://music.yandex.ru', icon: 'Y' },
            { id: 'youtube', name: 'YouTube Music', url: 'https://music.youtube.com', icon: 'YT' },
            { id: 'soundcloud', name: 'SoundCloud', url: 'https://soundcloud.com/stream', icon: 'SC' },
            { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com', icon: 'S' },
            { id: 'vk', name: 'VK Music', url: 'https://vk.com/audio', icon: 'VK' }
        ];
        
        let activeServices = ['yandex', 'youtube'];

        let premiumStatus = null;
let aiRequestCount = 0;
const PREMIUM_WORKER = 'https://premium-api.170610maksim.workers.dev';

openExternal: (url) => ipcRenderer.invoke('open-external', url)

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
        'steam_login': true,
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
    if (!premiumStatus) return;
    
    const daysLeft = premiumStatus.daysLeft || 0;
    const isPremium = premiumStatus.isPremium;
    
    const premiumStatusDiv = document.getElementById('premiumStatus');
    if (premiumStatusDiv) {
        if (isPremium) {
            premiumStatusDiv.innerHTML = `⭐ Premium активен (осталось ${daysLeft} дн.)`;
            premiumStatusDiv.style.color = 'gold';
        } else {
            premiumStatusDiv.innerHTML = `🎵 Бесплатная версия. Приобретите Premium!`;
            premiumStatusDiv.style.color = '#888';
        }
    }
    
     
    if (!hasFeature('custom_sites') && customSites.length > 0) {
         
        resetServicesToDefault();
    }
    
     
    if (!hasFeature('full_viz')) {
        const fullModes = ['galaxy', 'aurora', 'meteor', 'lava', 'neon', 'ripple', 'vortex', 'flower', 'fractal', 'pulse', 'equalizer', 'starburst', 'laser', 'glitch', 'plasma', 'tunnel3d', 'cube3d', 'gif'];
        if (fullModes.includes(currentVizMode)) {
            currentVizMode = 'bars';
            document.getElementById('viz-mode').value = 'bars';
            localStorage.setItem('vizMode', 'bars');
        }
        
        const vizSelect = document.getElementById('viz-mode');
        if (vizSelect) {
            for (let option of vizSelect.options) {
                if (fullModes.includes(option.value)) {
                    option.disabled = true;
                    option.textContent = option.textContent.replace(' ⭐Premium', '') + ' ⭐Premium';
                }
            }
        }
    }
    
    if (!hasFeature('screenshot')) {
        const screenshotBtn = document.querySelector('[onclick="captureVisualizer()"]');
        if (screenshotBtn) screenshotBtn.style.opacity = '0.5';
    }
}
        
const APP_KEY_STEAM = 'musichub-secret-key-2024';
const STEAM_WORKER_URL = 'https://steam-proxy.170610maksim.workers.dev';

        
         
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

         
        function showToast(message, type = 'info') {
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
    
     
    let scale, rotation, glow, opacity;
    
if (gifIntensity < 0.05) {
    scale = 0.02;
    opacity = 0.02;
    rotation = 0;
    glow = 0;
} else {
    let t = (gifIntensity - 0.05) / 0.95;
    scale = 0.02 + Math.pow(t, 0.6) * 1.18;
    rotation = (gifIntensity - 0.5) * 2.5;    
    glow = gifIntensity * 30;
    opacity = 0.05 + Math.pow(t, 0.7) * 0.9;
}
    
    gifOverlay.style.transform = `scale(${scale}) rotate(${rotation}rad)`;
    gifOverlay.style.filter = `drop-shadow(0 0 ${glow}px ${accentColor})`;
    gifOverlay.style.opacity = opacity;
    
     
    ctx.clearRect(0, 0, width, height);
    

    break;

        case 'galaxy':  
            const galaxyStars = isFullscreenMode ? 200 : 100;
            for (let i = 0; i < galaxyStars; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
                }
                const angle = i * 137.5 * Math.PI / 180;
                const radius = (maxRadius * 0.3) + intensity * maxRadius * 0.7;
                const x = centerX + Math.cos(angle + time) * radius;
                const y = centerY + Math.sin(angle + time) * radius;
                const size = 1 + intensity * 3;
                ctx.beginPath();
                ctx.fillStyle = `hsl(${200 + intensity * 160}, 100%, ${50 + intensity * 30}%)`;
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
            
        case 'aurora':  
            const auroraHeight = height;
            for (let i = 0; i < width; i += 3) {
                let intensity;
                if (dataArray) {
                    const dataIndex = Math.floor((i / width) * dataArray.length);
                    intensity = (dataArray[dataIndex] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time + i * 0.03) * 0.5 + 0.5) * sensitivity;
                }
                const waveY = centerY - (intensity * auroraHeight * 0.4) + Math.sin(i * 0.03 + time * 2) * 20;
                ctx.beginPath();
                const gradient = ctx.createLinearGradient(0, waveY - 20, 0, waveY + 20);
                gradient.addColorStop(0, `rgba(0, 255, 100, ${intensity * 0.8})`);
                gradient.addColorStop(1, `rgba(0, 100, 255, ${intensity * 0.8})`);
                ctx.fillStyle = gradient;
                ctx.fillRect(i, waveY - 15, 2, 30);
            }
            break;
            
        case 'meteor':  
            const meteors = isFullscreenMode ? 30 : 15;
            for (let i = 0; i < meteors; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i * 4 % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 3 + i) * 0.5 + 0.5) * sensitivity;
                }
                const posX = (i * 37) % width;
                const posY = (time * 200 * intensity + i * 50) % height;
                const trailLength = 10 + intensity * 20;
                for (let t = 0; t < trailLength; t++) {
                    ctx.beginPath();
                    const alpha = (1 - t / trailLength) * intensity;
                    ctx.fillStyle = `rgba(255, ${100 + intensity * 155}, 0, ${alpha})`;
                    ctx.arc(posX - t * 3, posY - t * 2, 2 + intensity * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            break;
            
        case 'lava':  
            for (let y = 0; y < height; y += 4) {
                for (let x = 0; x < width; x += 4) {
                    let intensity;
                    if (dataArray) {
                        intensity = (dataArray[Math.floor((x / width) * dataArray.length)] / 255) * sensitivity;
                    } else {
                        intensity = (Math.sin(x * 0.05 + time) * Math.cos(y * 0.05 + time * 0.7)) * 0.5 + 0.5;
                    }
                    const r = 255;
                    const g = 50 + intensity * 205;
                    const b = 0;
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.7 + intensity * 0.3})`;
                    ctx.fillRect(x, y, 4, 4);
                }
            }
            break;
            
        case 'neon':  
            const gridSize = isFullscreenMode ? 30 : 20;
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            for (let i = 0; i <= gridSize; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i * 2 % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time + i) * 0.5 + 0.5) * sensitivity;
                }
                const x = (i / gridSize) * width;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + Math.sin(time * 2) * intensity * 10, height);
                ctx.stroke();
                
                const y = (i / gridSize) * height;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y + Math.cos(time * 1.5 + i) * intensity * 10);
                ctx.stroke();
            }
            break;
            
        case 'ripple':  
            const rippleResolution = 8;
            for (let i = 0; i < width; i += rippleResolution) {
                for (let j = 0; j < height; j += rippleResolution) {
                    let intensity;
                    if (dataArray) {
                        intensity = (dataArray[Math.floor((i / width) * dataArray.length)] / 255) * sensitivity;
                    } else {
                        const dx = (i - centerX) / width;
                        const dy = (j - centerY) / height;
                        const dist = Math.sqrt(dx*dx + dy*dy);
                        intensity = Math.sin(dist * 20 - time * 5) * 0.5 + 0.5;
                    }
                    const offsetX = Math.sin(time * 3 + j * 0.05) * intensity * 5;
                    const offsetY = Math.cos(time * 2.5 + i * 0.05) * intensity * 5;
                    ctx.fillStyle = `rgba(0, 150, 255, ${intensity * 0.6})`;
                    ctx.fillRect(i + offsetX, j + offsetY, rippleResolution - 1, rippleResolution - 1);
                }
            }
            break;
            
        case 'vortex':  
            const vortexPoints = isFullscreenMode ? 360 : 180;
            for (let i = 0; i < vortexPoints; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 2 + i * 0.05) * 0.5 + 0.5) * sensitivity;
                }
                const angle = (i / vortexPoints) * Math.PI * 2 + time * 2;
                const radius = maxRadius * (0.2 + intensity * 0.8);
                const x = centerX + Math.cos(angle) * radius;
                const y = centerY + Math.sin(angle) * radius;
                ctx.beginPath();
                ctx.fillStyle = `hsl(${angle * 180 / Math.PI}, 100%, 60%)`;
                ctx.arc(x, y, 2 + intensity * 5, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
            
        case 'flower':  
            const petals = isFullscreenMode ? 24 : 16;
            for (let i = 0; i < petals; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i * 2 % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time + i) * 0.5 + 0.5) * sensitivity;
                }
                const angle = (i / petals) * Math.PI * 2;
                const radius = maxRadius * (0.4 + intensity * 0.6);
                const petalX = centerX + Math.cos(angle) * radius;
                const petalY = centerY + Math.sin(angle) * radius;
                
                ctx.beginPath();
                ctx.ellipse(petalX, petalY, radius * 0.3, radius * 0.5, angle, 0, Math.PI * 2);
                ctx.fillStyle = `hsl(${300 + intensity * 60}, 100%, 60%)`;
                ctx.fill();
            }
            break;
            
        case 'fractal':  
            const iterations = 6;
            function drawFractal(x, y, size, depth, intensity) {
                if (depth > iterations) return;
                ctx.beginPath();
                ctx.rect(x - size/2, y - size/2, size, size);
                ctx.fillStyle = `hsl(${depth * 60 + time * 50}, 80%, ${50 + intensity * 30}%)`;
                ctx.fill();
                const newSize = size * 0.6;
                drawFractal(x - size/2, y - size/2, newSize, depth + 1, intensity * 0.7);
                drawFractal(x + size/2, y - size/2, newSize, depth + 1, intensity * 0.7);
                drawFractal(x - size/2, y + size/2, newSize, depth + 1, intensity * 0.7);
                drawFractal(x + size/2, y + size/2, newSize, depth + 1, intensity * 0.7);
            }
            drawFractal(centerX, centerY, maxRadius * 0.6, 0, avgVolume);
            break;
            
        case 'pulse':  
            ctx.beginPath();
            const heartSize = 30 + avgVolume * 50;
            const x1 = centerX - heartSize;
            const y1 = centerY - heartSize;
            ctx.moveTo(centerX, centerY + heartSize);
            ctx.bezierCurveTo(centerX - heartSize, centerY - heartSize, 
                             centerX - heartSize, centerY + heartSize/2, 
                             centerX, centerY);
            ctx.bezierCurveTo(centerX + heartSize, centerY + heartSize/2, 
                             centerX + heartSize, centerY - heartSize, 
                             centerX, centerY + heartSize);
            ctx.fillStyle = `rgba(255, 50, 100, ${0.5 + avgVolume * 0.5})`;
            ctx.fill();
            ctx.shadowBlur = 20 + avgVolume * 30;
            break;
            
        case 'equalizer':  
            const eqBars = isFullscreenMode ? 64 : 32;
            const eqWidth = width / eqBars;
            for (let i = 0; i < eqBars; i++) {
                let intensity;
                if (dataArray) {
                    const dataIndex = Math.floor((i / eqBars) * dataArray.length);
                    intensity = (dataArray[dataIndex] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time + i * 0.2) * 0.5 + 0.5) * sensitivity;
                }
                const barHeight = Math.min(height - 20, Math.max(5, intensity * height * 0.8));
                const x = i * eqWidth;
                const y = height - barHeight;
                ctx.fillStyle = `hsl(${i * 5}, 100%, 60%)`;
                ctx.fillRect(x, y, eqWidth - 1, barHeight);
            }
            break;
            
        case 'starburst':  
            const rays = isFullscreenMode ? 48 : 32;
            for (let i = 0; i < rays; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 3 + i) * 0.5 + 0.5) * sensitivity;
                }
                const angle = (i / rays) * Math.PI * 2;
                const rayLength = maxRadius * (0.3 + intensity * 0.7);
                const x2 = centerX + Math.cos(angle) * rayLength;
                const y2 = centerY + Math.sin(angle) * rayLength;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `hsl(${angle * 180 / Math.PI}, 100%, 60%)`;
                ctx.lineWidth = 2 + intensity * 8;
                ctx.stroke();
            }
            break;
            
        case 'laser':  
            const lasers = isFullscreenMode ? 12 : 8;
            for (let i = 0; i < lasers; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i * 4 % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 4 + i) * 0.5 + 0.5) * sensitivity;
                }
                const angle = (i / lasers) * Math.PI * 2 + time;
                const x2 = centerX + Math.cos(angle) * width;
                const y2 = centerY + Math.sin(angle) * width;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = `rgba(0, 255, 0, ${intensity * 0.8})`;
                ctx.lineWidth = 2 + intensity * 10;
                ctx.stroke();
            }
            break;
            
        case 'glitch':  
            const glitchBlocks = isFullscreenMode ? 30 : 15;
            for (let i = 0; i < glitchBlocks; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = Math.random() * sensitivity;
                }
                const blockX = Math.random() * width;
                const blockY = Math.random() * height;
                const blockW = 30 + intensity * 50;
                const blockH = 10 + intensity * 30;
                const r = Math.random() * 255;
                const g = Math.random() * 255;
                const b = Math.random() * 255;
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${intensity * 0.6})`;
                ctx.fillRect(blockX, blockY, blockW, blockH);
            }
            break;
            
        case 'plasma':  
            for (let x = 0; x < width; x += 4) {
                for (let y = 0; y < height; y += 4) {
                    let intensity;
                    if (dataArray) {
                        const dataIndex = Math.floor(((x + y) / (width + height)) * dataArray.length);
                        intensity = (dataArray[dataIndex] / 255) * sensitivity;
                    } else {
                        const value1 = Math.sin(x * 0.03 + time);
                        const value2 = Math.cos(y * 0.03 + time * 0.7);
                        const value3 = Math.sin((x * 0.02 + y * 0.02) * 2 + time);
                        intensity = (value1 + value2 + value3) / 3 * 0.5 + 0.5;
                    }
                    const hue = (x * 0.5 + y * 0.3 + time * 50) % 360;
                    ctx.fillStyle = `hsl(${hue}, 100%, ${50 + intensity * 30}%)`;
                    ctx.fillRect(x, y, 4, 4);
                }
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
            
        case 'fire':
            const fireCount = isFullscreenMode ? 32 : 16;
            const fireWidth = width / fireCount;
            for (let i = 0; i < fireCount; i++) {
                let intensity;
                if (dataArray) {
                    const dataIndex = Math.floor((i / fireCount) * dataArray.length);
                    intensity = (dataArray[dataIndex] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time + i * 0.3) * 0.5 + 0.5) * sensitivity;
                }
                const barHeight = Math.min(height - 10, Math.max(2, intensity * height * 0.9));
                const x = i * fireWidth;
                const y = height - barHeight;
                const r = 255;
                const g = Math.floor(100 + intensity * 155);
                ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
                ctx.fillRect(x, y, fireWidth - 1, barHeight);
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
                if (dataArray) {
                    value = dataArray[i * 2] / 255;
                } else {
                    value = (Math.sin(time + i * 0.2) + 1) / 2;
                }
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
            
        case 'spectrum':
            const specCount = isFullscreenMode ? 48 : 24;
            const specWidth = width / specCount;
            for (let i = 0; i < specCount; i++) {
                let value;
                if (dataArray) {
                    const dataIndex = Math.floor((i / specCount) * dataArray.length);
                    value = (dataArray[dataIndex] / 255) * height * sensitivity;
                } else {
                    value = (Math.sin(time + i * 0.2) * 0.5 + 0.5) * height * sensitivity;
                }
                const barHeight = Math.min(height - 10, Math.max(2, value));
                const x = i * specWidth;
                const y = height - barHeight;
                const hue = (i / specCount) * 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
                ctx.fillRect(x, y, specWidth - 1, barHeight);
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
                if (dataArray) {
                    intensity = (dataArray[i * 4] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
                }
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
            
        case 'bubble':
            const bubbleCount = isFullscreenMode ? 40 : 20;
            for (let i = 0; i < bubbleCount; i++) {
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[i % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 2 + i) * 0.5 + 0.5) * sensitivity;
                }
                const angle = (i / bubbleCount) * Math.PI * 2;
                const radius = maxRadius * (0.2 + intensity * 0.8);
                const x = centerX + Math.cos(angle + time) * radius;
                const y = centerY + Math.sin(angle + time) * radius;
                ctx.beginPath();
                ctx.fillStyle = `rgba(100, 200, 255, ${0.3 + intensity * 0.5})`;
                ctx.arc(x, y, 3 + intensity * 8, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
            
        case 'tunnel3d':
            const rings = isFullscreenMode ? 40 : 25;
            for (let r = 0; r < rings; r++) {
                const progress = r / rings;
                const radius = maxRadius * (0.1 + progress * 0.9);
                let intensity;
                if (dataArray) {
                    intensity = (dataArray[r % dataArray.length] / 255) * sensitivity;
                } else {
                    intensity = (Math.sin(time * 3 + r * 0.3) * 0.5 + 0.5) * sensitivity;
                }
                ctx.beginPath();
                for (let a = 0; a <= Math.PI * 2; a += 0.05) {
                    const wave = Math.sin(a * 6 + time * 2 + r * 0.5) * (0.2 + intensity * 0.3) * radius;
                    const x = centerX + Math.cos(a) * (radius + wave);
                    const y = centerY + Math.sin(a) * (radius + wave);
                    if (a === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.closePath();
                const hue = (time * 50 + r * 10) % 360;
                ctx.strokeStyle = `hsl(${hue}, 80%, 60%)`;
                ctx.lineWidth = 1 + intensity * 3;
                ctx.stroke();
            }
            break;
            
        case 'cube3d':
            const cubeSize = 20 + avgVolume * 40;
            const rotX = time;
            const rotY = time * 0.7;
            const rotZ = time * 0.5;
            const vertices = [
                [-1, -1, -1], [ 1, -1, -1], [ 1, -1,  1], [-1, -1,  1],
                [-1,  1, -1], [ 1,  1, -1], [ 1,  1,  1], [-1,  1,  1]
            ];
            const edges = [
                [0,1], [1,2], [2,3], [3,0], [4,5], [5,6], [6,7], [7,4], [0,4], [1,5], [2,6], [3,7]
            ];
            function rotate3D(x, y, z, rx, ry, rz) {
                let y1 = y * Math.cos(rx) - z * Math.sin(rx);
                let z1 = y * Math.sin(rx) + z * Math.cos(rx);
                let x2 = x * Math.cos(ry) + z1 * Math.sin(ry);
                let z2 = -x * Math.sin(ry) + z1 * Math.cos(ry);
                let x3 = x2 * Math.cos(rz) - y1 * Math.sin(rz);
                let y3 = x2 * Math.sin(rz) + y1 * Math.cos(rz);
                return [x3, y3, z2];
            }
            edges.forEach(edge => {
                const v1 = vertices[edge[0]];
                const v2 = vertices[edge[1]];
                let p1 = rotate3D(v1[0] * cubeSize, v1[1] * cubeSize, v1[2] * cubeSize, rotX, rotY, rotZ);
                let p2 = rotate3D(v2[0] * cubeSize, v2[1] * cubeSize, v2[2] * cubeSize, rotX, rotY, rotZ);
                const x1 = centerX + p1[0];
                const y1 = centerY + p1[1];
                const x2 = centerX + p2[0];
                const y2 = centerY + p2[1];
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                const hue = (time * 100) % 360;
                ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
                ctx.lineWidth = 2 + avgVolume * 4;
                ctx.stroke();
            });
            vertices.forEach(v => {
                let p = rotate3D(v[0] * (cubeSize + avgVolume * 5), v[1] * (cubeSize + avgVolume * 5), v[2] * (cubeSize + avgVolume * 5), rotX, rotY, rotZ);
                const x = centerX + p[0];
                const y = centerY + p[1];
                ctx.beginPath();
                ctx.fillStyle = `hsl(${time * 100 % 360}, 100%, 60%)`;
                ctx.arc(x, y, 3 + avgVolume * 5, 0, Math.PI * 2);
                ctx.fill();
            });
            break;
            
        default:  
            const dotCount = isFullscreenMode ? 16 : 8;
            for (let i = 0; i < dotCount; i++) {
                let value;
                if (dataArray) {
                    value = dataArray[i * 8] / 255;
                } else {
                    value = (Math.sin(time + i) * 0.5 + 0.5);
                }
                const x = isFullscreenMode ? 30 + (i * (width - 60) / dotCount) : 20 + (i * 15);
                const y = height / 2 + (dataArray ? 0 : Math.sin(time * 2 + i) * 10);
                ctx.beginPath();
                ctx.fillStyle = accentColor;
                ctx.arc(x, y, (isFullscreenMode ? 6 : 3) + value * (isFullscreenMode ? 15 : 8), 0, Math.PI * 2);
                ctx.fill();
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
                const modes = ['bars', 'galaxy', 'aurora', 'plasma', 'wave', 'circle', 'fire', 'spectrum'];
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
        fullscreenGif.style.maxWidth = '80%';
        fullscreenGif.style.maxHeight = '80%';
        fullscreenGif.style.objectFit = 'contain';
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
                wv.addEventListener('dom-ready', () => {
                    wv.setZoomFactor(parseFloat(document.getElementById('zoom-select').value));
                    console.log(`✅ Загружен кастомный сайт: ${site.name}`);
                });
                wv.addEventListener('did-fail-load', (e) => {
                    console.error(`❌ Ошибка загрузки ${site.name}:`, e);
                    addChatMessage(`⚠️ Не удалось загрузить сайт: ${site.url}`, false, 'system');
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


        function sw(id, btn) {
     
    if (id.startsWith('custom_')) {
        const customIndex = parseInt(id.split('_')[1]);
        const site = customSites[customIndex];
        if (site && !document.getElementById(id)) {
            createCustomWebview(id, site.url);
        }
    }
    
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

         
        function changeAccentColor(color) {
            document.documentElement.style.setProperty('--accent-color', color);
            localStorage.setItem('hubC', color);
        }

        function setZoom(value) {
            document.querySelectorAll('webview').forEach(w => { try { w.setZoomFactor(parseFloat(value)); } catch(e) {} });
            localStorage.setItem('hubZoom', value);
        }

        function changeVizMode(mode) {
    const fullModes = ['galaxy', 'aurora', 'meteor', 'lava', 'neon', 'ripple', 'vortex', 'flower', 'fractal', 'pulse', 'equalizer', 'starburst', 'laser', 'glitch', 'plasma', 'tunnel3d', 'cube3d', 'gif'];
    
    if (fullModes.includes(mode) && !hasFeature('full_viz')) {
        showToast('⭐ Этот режим визуализации доступен в Premium версии', 'info');
         
        if (fullModes.includes(currentVizMode)) {
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

 
document.getElementById('premiumBuyBtn')?.addEventListener('click', () => {
    shell.openExternal('https://boosty.to/musichub/posts/c7486330-dd55-4e06-b08b-83fab5eb4f5f?share=post_link');
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

 
const premiumBuyBtn = document.getElementById('premiumBuyBtn');
if (premiumBuyBtn) {
    premiumBuyBtn.addEventListener('click', () => {
         
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal('https://boosty.to/musichub/posts/c7486330-dd55-4e06-b08b-83fab5eb4f5f?share=post_link');
        } else {
             
            window.open('https://boosty.to/musichub/posts/c7486330-dd55-4e06-b08b-83fab5eb4f5f?share=post_link', '_blank');
        }
        showToast('🌐 Открыта страница оплаты. После оплаты вернитесь и активируйте Premium по коду!', 'info');
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

























































































        

         
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 MusicHub v2.4.0');
    particleBackground = new ParticleBackground();
    loadSettings();
    loadCustomSites();  
    loadCustomSound();  
    renderServicesList();
    renderServices();
    await loadAudioDevices();
    initSidebarResizer();
    startVisualizer();
    initTitlebarEqualizer();
    await checkPremiumStatus();
    document.body.addEventListener('click', createGlobalRipple);
    showToast('🎵 Добро пожаловать в MusicHub 2.0!', 'success');
    
    const chatBtn = document.getElementById('chatBtn');
    if (chatBtn) {
        chatBtn.addEventListener('click', toggleChat);
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
            stopAudioCapture();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (fullscreenAnimationFrame) cancelAnimationFrame(fullscreenAnimationFrame);
        });

document.getElementById('steamLoginBtn')?.addEventListener('click', async () => {
     
    const profileUrl = prompt(
        '🎮 Вход через Steam\n\nВведите ссылку на ваш профиль Steam:\n\n' +
        'Примеры:\n' +
        '• https://steamcommunity.com/id/username/\n' +
        '• https://steamcommunity.com/profiles/76561198000000000/\n\n' +
        'Или просто укажите ваш Steam ID (число)'
    );
    
    if (!profileUrl) return;
    
    addChatMessage(`🔍 Ищу профиль...`, false, 'system');
    
    try {
        let steamId = profileUrl.trim();
        
         
        if (steamId.includes('/id/')) {
             
            const match = steamId.match(/\/id\/([^\/]+)/);
            if (match) {
                const vanity = match[1];
                 
                const keyResponse = await fetch(`${STEAM_WORKER_URL}/steam-key`, {
                    headers: { 'X-App-Key': APP_KEY }
                });
                const keyData = await keyResponse.json();
                if (!keyData.success) throw new Error(keyData.error);
                
                const resolveResponse = await fetch(
                    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${keyData.key}&vanityurl=${vanity}`
                );
                const resolveData = await resolveResponse.json();
                if (resolveData.response.success === 1) {
                    steamId = resolveData.response.steamid;
                } else {
                    addChatMessage(`❌ Не найден профиль: ${vanity}`, false, 'system');
                    return;
                }
            }
        } else if (steamId.includes('/profiles/')) {
            const match = steamId.match(/\/profiles\/(\d+)/);
            if (match) steamId = match[1];
        }
        
         
        if (!/^\d+$/.test(steamId)) {
            addChatMessage(`❌ Неверный формат. Введите ссылку или Steam ID`, false, 'system');
            return;
        }
        
         
        const keyResponse = await fetch(`${STEAM_WORKER_URL}/steam-key`, {
            headers: { 'X-App-Key': APP_KEY }
        });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        
        const userResponse = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${keyData.key}&steamids=${steamId}`
        );
        const userData = await userResponse.json();
        const player = userData.response.players[0];
        
        if (player) {
            setChatUserName(player.personaname);
            addChatMessage(`✅ Вошли как ${player.personaname} через Steam!`, false, 'system');
            localStorage.setItem('steam_id', steamId);
            localStorage.setItem('steam_name', player.personaname);
            if (player.avatarfull) localStorage.setItem('steam_avatar', player.avatarfull);
        } else {
            addChatMessage(`❌ Профиль не найден или скрыт`, false, 'system');
        }
        
    } catch (err) {
        console.error('Steam error:', err);
        addChatMessage(`❌ Ошибка: ${err.message}`, false, 'system');
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
    
     
    btn.ondblclick = () => {
        const wv = document.getElementById(id);
        if (wv) {
            wv.reload();
            showToast(`🔄 ${name} перезагружается...`, 'info');
            setTimeout(() => {
                showToast(`✅ ${name} перезагружен`, 'success');
            }, 1000);
        } else {
            showToast(`❌ Сервис ${name} не найден`, 'error');
        }
    };
    
    container.appendChild(btn);
}

let notifySoundEnabled = true;
let notifySoundType = 'beep1';
let showNotifications = true;

function changeNotifySound(value) {
    notifySoundType = value;
    notifySoundEnabled = value !== 'off';
    localStorage.setItem('notifySound', value);
    
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

function isAdmin(userId) {
     
     
    const adminSteamId = localStorage.getItem('steam_id');
    return adminSteamId === 'твой-steam-id-для-админа';
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

let pendingSteamName = null;

async function autoSteamLogin() {
    const savedSteamId = localStorage.getItem('steam_id');
    if (!savedSteamId) {
        console.log('❌ Нет сохранённого Steam ID');
        return false;
    }
    
    console.log('🔄 Авто-вход через Steam...');
    
    try {
        const keyResponse = await fetch(`${STEAM_WORKER_URL}/steam-key`, {
            headers: { 'X-App-Key': APP_KEY_STEAM }
        });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        
        const userResponse = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${keyData.key}&steamids=${savedSteamId}`
        );
        const userData = await userResponse.json();
        const player = userData.response.players[0];
        
        if (player) {
            localStorage.setItem('steam_name', player.personaname);
            setChatUserName(player.personaname);
            pendingSteamName = player.personaname;
            console.log(`✅ Steam имя загружено: ${player.personaname}`);
            return true;
        }
        return false;
    } catch (err) {
        console.error('❌ Ошибка авто-входа:', err);
        return false;
    }
}

function initChat() {
    currentChatUser = getOrCreateUserId();
    
     
     
    
     
    const statusEl = document.getElementById('chat-status');
    if (statusEl) {
        statusEl.innerHTML = '🤖 AI режим • Доступны команды: /help';
        statusEl.style.color = '#1DB954';
    }
    
     
    updateTitlebarOnline(1);
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
    
    if (!showNotifications) return;
        playNotifySound();

    
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

function getUserName() {

    const steamName = localStorage.getItem('steam_name');
    if (steamName) return steamName;
    

    let userName = localStorage.getItem('chat_user_name');
    if (!userName) {
        userName = 'Музыкант_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('chat_user_name', userName);
    }
    return userName;
}

async function syncSteamName() {
    const savedSteamId = localStorage.getItem('steam_id');
    if (!savedSteamId) {
        console.log('❌ Нет сохранённого Steam ID');
        return false;
    }
    
    console.log('🔄 Синхронизация Steam...');
    
    try {
        const keyResponse = await fetch(`${STEAM_WORKER_URL}/steam-key`, {
            headers: { 'X-App-Key': APP_KEY_STEAM }
        });
        const keyData = await keyResponse.json();
        if (!keyData.success) throw new Error(keyData.error);
        
        const userResponse = await fetch(
            `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${keyData.key}&steamids=${savedSteamId}`
        );
        const userData = await userResponse.json();
        const player = userData.response.players[0];
        
        if (player) {
            const currentName = localStorage.getItem('steam_name');
            const newName = player.personaname;

            setChatUserName(newName);
            localStorage.setItem('steam_name', newName);
            
            if (currentName !== newName) {
                console.log(`🔄 Steam ник обновлён: ${currentName} → ${newName}`);
                addChatMessage(`🔄 Steam ник обновлён: ${newName}`, false, 'system');
            } else {
                console.log(`✅ Steam ник актуален: ${newName}`);
            }
            return true;
        }
        return false;
    } catch (err) {
        console.error('❌ Ошибка синхронизации Steam:', err);
        return false;
    }
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

setTimeout(() => {
    initChat();
}, 1000);