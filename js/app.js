// JAJ Records / Aquerty AQ-NEO — Phase 1 application
const SETTINGS_KEY = 'aquerty_settings_v1';
    const RECENTS_KEY = 'aquerty_recents_v1';
    const STATE_KEY = 'aquerty_state_v1';
    const SESSION_KEY = 'aquerty_session_v1';
    const PLAYER_STATE_KEY = 'aquerty_player_state_v1';
    const MAX_RECENTS = 6;
    const MOBILE_BREAKPOINT = 900;
    const defaultSettings = {
        bootEnabled: true,
        bootSoundEnabled: true,
        crtEnabled: true,
        systemSounds: true,
        masterVolume: 0.6,
        iconAnimations: true,
        snapIconsToGrid: true,
        systemPopups: true,
        ambientHum: false,
        screensaverEnabled: true,
        desktopLanguage: 'fr',
        theme: 'xp',
        globalDark: false,
        clientMode: 'auto',
        liteEnabled: false,
        wallpaper: 'xp-default',
        popupMode: 'mixed',
        popupFrequency: 'normal'
    };
    let appSettings = { ...defaultSettings };
    let recentItems = [];
    let audioCtx = null;
    let popupLoopTimer = null;
    let activePopupTimer = null;
    let ambientOsc = null;
    let ambientGain = null;
    let screensaverTimer = null;
    let bootAudio = null;
    let systemLogs = [];
    let isPoweredOff = false;
    let isRestoringSession = false;
    let isMailI18nReady = false;
    let isApplyingPersistenceSnapshot = false;

    function notifyPersistenceChange(kind) {
        if (isApplyingPersistenceSnapshot) return;
        window.dispatchEvent(new CustomEvent('aq:persistence-changed', {
            detail: { kind, at: Date.now() }
        }));
    }

    function getSystemPopupMessages() {
        if (getCurrentLanguage() === 'en') {
            return [
                { title: 'System Message', text: 'Drive C: is almost full. Consider freeing up space.' },
                { title: 'Network', text: 'Network connection interrupted. Try again in a moment.' },
                { title: 'Printer', text: 'No printer detected on LPT1.' },
                { title: 'Reminder', text: 'Do not forget to save your work regularly.' }
            ];
        }
        return [
            { title: 'System Message', text: 'Le disque C: est presque plein. Pensez a liberer de l espace.' },
            { title: 'Network', text: 'Connexion réseau interrompue. Réessayez dans quelques instants.' },
            { title: 'Printer', text: 'Aucune imprimante detectee sur le port LPT1.' },
            { title: 'Reminder', text: 'N oubliez pas de sauvegarder votre travail regulierement.' }
        ];
    }
    function getContextualPopupMessages() {
        if (getCurrentLanguage() === 'en') {
            return {
                openInternet: [{ title: 'Network', text: 'Connecting to server...' }],
                openPlayer: [{ title: 'Audio', text: 'Audio module initialized in stereo mode.' }],
                openTempus: [{ title: 'Security', text: 'Protected file. Authentication required.' }],
                wrongPassword: [{ title: 'Security', text: 'Access denied. Invalid password.' }],
                unlockTempus: [{ title: 'Security', text: 'Access granted. New path added to Navigator.' }],
                playTrack: [{ title: 'Audio', text: 'Playback in progress. Output level stable.' }]
            };
        }
        return {
            openInternet: [{ title: 'Network', text: 'Connexion au serveur en cours...' }],
            openPlayer: [{ title: 'Audio', text: 'Module audio initialise en mode stereo.' }],
            openTempus: [{ title: 'Security', text: 'Fichier protege. Authentification requise.' }],
            wrongPassword: [{ title: 'Security', text: 'Acces refuse. Mot de passe invalide.' }],
            unlockTempus: [{ title: 'Security', text: 'Acces confirme. Nouveau chemin ajoute a Internet.' }],
            playTrack: [{ title: 'Audio', text: 'Lecture en cours. Niveau de sortie stable.' }]
        };
    }

    const recentConfig = {
        player: { labelKey: 'AQ-Player', action: () => openWindow('win-player', 'task-player') },
        internet: { labelKey: 'AQ-Navigator', action: () => openWindow('win-ie', 'task-ie') },
        tempusFile: { labelKey: 'tempus_perit.exe', action: () => openWindow('win-tempus', 'task-tempus') },
        indexFiles: { labelKey: 'index_files', action: () => { openWindow('win-ie', 'task-ie'); setIEPage('tempus'); } },
        trash: { labelKey: 'trash', action: () => openWindow('win-trash', 'task-trash') },
        settings: { labelKey: 'settings', action: () => openWindow('win-settings', 'task-settings') },
        logs: { labelKey: 'logs', action: () => openWindow('win-logs', 'task-logs') },
        commandCenter: { labelKey: 'AQ-ACC', action: () => openWindow('win-acc', 'task-acc') },
        minesweeper: { labelKey: 'AQ-Mines', action: () => openWindow('win-ms', 'task-ms') },
        mail: { labelKey: 'AQ-Mail', action: () => openWindow('win-mail', 'task-mail') },
        myspace: { labelKey: 'AQ-MySpace', action: () => openWindow('win-myspace', 'task-myspace') }
    };

    function loadPersistedData() {
        try {
            const savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            appSettings = { ...defaultSettings, ...savedSettings };
        } catch (_) {
            appSettings = { ...defaultSettings };
        }
        try {
            const savedRecents = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
            recentItems = Array.isArray(savedRecents) ? savedRecents : [];
        } catch (_) {
            recentItems = [];
        }
    }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
        notifyPersistenceChange('settings');
    }

    function saveRecents() {
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recentItems));
        notifyPersistenceChange('recents');
    }

    function saveState() {
        localStorage.setItem(STATE_KEY, JSON.stringify({ isTempusUnlocked, isPoweredOff }));
        notifyPersistenceChange('state');
    }

    function loadState() {
        try {
            const state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
            return {
                isTempusUnlocked: !!state.isTempusUnlocked,
                isPoweredOff: !!state.isPoweredOff
            };
        } catch (_) {
            return { isTempusUnlocked: false, isPoweredOff: false };
        }
    }

    function saveSessionState() {
        if (isRestoringSession) return;
        const windows = [];
        document.querySelectorAll('.window').forEach((win) => {
            windows.push({
                id: win.id,
                top: win.style.top,
                left: win.style.left,
                width: win.style.width,
                height: win.style.height,
                display: win.style.display || 'none'
            });
        });
        localStorage.setItem(SESSION_KEY, JSON.stringify({ windows, currentIEPage }));
        notifyPersistenceChange('session');
    }

    function restoreSessionState() {
        try {
            const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            if (!saved.windows || !Array.isArray(saved.windows)) return;
            isRestoringSession = true;
            saved.windows.forEach((w) => {
                const el = document.getElementById(w.id);
                if (!el) return;
                if (w.top) el.style.top = w.top;
                if (w.left) el.style.left = w.left;
                if (w.width) el.style.width = w.width;
                if (w.height) el.style.height = w.height;
                if (w.display === 'block') {
                    const taskId = w.id.replace('win-', 'task-');
                    if (document.getElementById(taskId)) {
                        openWindow(w.id, taskId);
                    }
                }
            });
            if (saved.currentIEPage) {
                const restoredPage = pageKeyFromAddress(saved.currentIEPage) || saved.currentIEPage;
                if (['info', 'dual', 'tempus', '__favorites', '__history', '__help', '__about'].includes(restoredPage)) {
                    setIEPage(restoredPage);
                }
            }
            isRestoringSession = false;
        } catch (_) {
            // ignore malformed saved session
            isRestoringSession = false;
        }
    }

    function applyVisualSettings() {
        document.body.classList.toggle('crt-enabled', appSettings.crtEnabled);
        document.body.classList.toggle('theme-win95', appSettings.theme === 'win95');
        document.body.classList.toggle('theme-neo2000', appSettings.theme === 'neo2000');
        document.body.classList.toggle('global-dark', !!appSettings.globalDark);
        document.getElementById('pc-setting-boot').checked = appSettings.bootEnabled;
        document.getElementById('pc-setting-crt').checked = appSettings.crtEnabled;
        document.getElementById('pc-setting-theme').value = appSettings.theme;
        document.getElementById('pc-setting-dark').checked = !!appSettings.globalDark;
        document.getElementById('pc-setting-client-mode').value = appSettings.clientMode || 'auto';
        document.getElementById('pc-setting-lite-enabled').checked = !!appSettings.liteEnabled;
        document.getElementById('pc-setting-wallpaper').value = appSettings.wallpaper || 'xp-default';
        document.getElementById('exp-setting-sounds').checked = appSettings.systemSounds;
        document.getElementById('exp-setting-boot-sound').checked = appSettings.bootSoundEnabled;
        document.getElementById('exp-setting-ambient').checked = appSettings.ambientHum;
        document.getElementById('exp-setting-popups').checked = appSettings.systemPopups;
        document.getElementById('exp-setting-icon-anim').checked = appSettings.iconAnimations;
        document.getElementById('exp-setting-screensaver').checked = appSettings.screensaverEnabled;
        document.getElementById('exp-setting-grid-snap').checked = appSettings.snapIconsToGrid;
        document.getElementById('ui-language-setting').value = appSettings.desktopLanguage || 'fr';
        document.getElementById('exp-setting-popup-mode').value = appSettings.popupMode;
        document.getElementById('exp-setting-popup-frequency').value = appSettings.popupFrequency;
        updateWallpaperUnlockState();
        applyWallpaper();
        applyLanguage(appSettings.desktopLanguage || 'fr');
        syncMobileQuickSettings();
        toggleAmbientHum(appSettings.ambientHum);
        resetScreensaverTimer();
    }

    function updateWallpaperUnlockState() {
        const secretOption = document.getElementById('wallpaper-opt-tempus-secret');
        if (!secretOption) return;
        const unlocked = !!isTempusUnlocked;
        secretOption.disabled = !unlocked;
        if (appSettings.wallpaper === 'tempus-secret' && !unlocked) {
            appSettings.wallpaper = 'xp-default';
            saveSettings();
        }
    }

    function applyWallpaper() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;
        const wallpaperKey = appSettings.wallpaper || 'xp-default';
        let wallpaperImage = 'url("medias/img/backgroundimg.png")';
        if (wallpaperKey === 'teal-grid') {
            wallpaperImage = 'linear-gradient(135deg, #0d3a5a 0%, #0c7084 50%, #0f4f68 100%)';
        } else if (wallpaperKey === 'midnight') {
            wallpaperImage = 'radial-gradient(circle at top right, #3c4462 0%, #171e2f 46%, #080b14 100%)';
        } else if (wallpaperKey === 'sunset-haze') {
            wallpaperImage = 'linear-gradient(145deg, #ffb56b 0%, #f47a7a 35%, #8c5bb8 72%, #385a9f 100%)';
        } else if (wallpaperKey === 'aurora-blue') {
            wallpaperImage = 'radial-gradient(circle at 20% 20%, #6af0d6 0%, #2f76cc 38%, #1d2c66 100%)';
        } else if (wallpaperKey === 'pixel-night') {
            wallpaperImage = 'linear-gradient(120deg, #0b1830 0%, #163158 45%, #284f8f 100%)';
        } else if (wallpaperKey === 'silver-fog') {
            wallpaperImage = 'linear-gradient(150deg, #d9e0ea 0%, #b2c0d4 45%, #8fa2bd 100%)';
        } else if (wallpaperKey === 'tempus-secret' && isTempusUnlocked) {
            wallpaperImage = 'url("medias/img/wallpapertempusperitimg.png"), radial-gradient(circle at 50% 20%, #d2c2ff 0%, #6f63b8 38%, #241b4e 74%, #090610 100%)';
        }
        desktop.style.backgroundImage = wallpaperImage;
        desktop.style.backgroundRepeat = 'no-repeat';
        desktop.style.backgroundPosition = 'center center';
        desktop.style.backgroundAttachment = 'fixed';
        desktop.style.backgroundSize = 'cover';
    }

    function playSystemSound(type = 'click') {
        if (!appSettings.systemSounds) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        let freq = 750;
        let duration = 0.06;
        if (type === 'error') { freq = 220; duration = 0.12; }
        if (type === 'open') { freq = 880; duration = 0.05; }
        if (type === 'close') { freq = 520; duration = 0.05; }
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.value = 0.025 * (appSettings.masterVolume ?? 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const start = audioCtx.currentTime;
        osc.start(start);
        osc.stop(start + duration);
    }

    function addRecentItem(key) {
        if (!recentConfig[key]) return;
        recentItems = recentItems.filter(item => item !== key);
        recentItems.unshift(key);
        recentItems = recentItems.slice(0, MAX_RECENTS);
        saveRecents();
        renderRecents();
    }

    function renderRecents() {
        const container = document.getElementById('recent-list');
        container.innerHTML = '';
        if (recentItems.length === 0) {
            container.innerHTML = '<p class="start-menu-empty">Aucun élément récent</p>';
            return;
        }
        recentItems.forEach((key) => {
            const config = recentConfig[key];
            if (!config) return;
            const btn = document.createElement('button');
            btn.className = 'retro-btn recent-item';
            const recentsMap = getCurrentLanguage() === 'en'
                ? { trash: 'Recycle Bin', settings: 'Control Panel', logs: 'Logs Viewer' }
                : { trash: 'Corbeille', settings: 'Panneau de configuration', logs: 'Visionneur de logs' };
            btn.textContent = recentsMap[config.labelKey] || config.labelKey;
            btn.onclick = () => {
                if (key === 'indexFiles' && !isTempusUnlocked) return;
                config.action();
                toggleStartMenu(false);
            };
            container.appendChild(btn);
        });
    }

    function toggleStartMenu(forceState) {
        if (isPoweredOff) return;
        const menu = document.getElementById('start-menu');
        const startBtn = document.getElementById('start-btn');
        const wasOpen = menu.classList.contains('open');
        const nextState = typeof forceState === 'boolean' ? forceState : !menu.classList.contains('open');
        menu.classList.toggle('open', nextState);
        startBtn?.setAttribute('aria-expanded', String(nextState));
        if (wasOpen !== nextState) playSystemSound('click');
    }

    function renderSystemLogs() {
        const list = document.getElementById('log-list');
        if (!list) return;
        list.innerHTML = '';
        if (systemLogs.length === 0) {
            list.innerHTML = '<div class="log-entry">Aucun log pour le moment.</div>';
            return;
        }
        systemLogs.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'log-entry';
            const levelClass = entry.level === 'warn' || entry.level === 'error' ? entry.level : '';
            row.innerHTML = `<span class="log-time">[${entry.time}]</span> <span class="log-level ${levelClass}">[${entry.level.toUpperCase()}]</span> ${translateLogMessage(entry.message)}`;
            list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
    }

    function addSystemLog(message, level = 'info') {
        const now = new Date();
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        const ss = now.getSeconds().toString().padStart(2, '0');
        systemLogs.push({ time: `${hh}:${mm}:${ss}`, level, message });
        if (systemLogs.length > 120) systemLogs = systemLogs.slice(systemLogs.length - 120);
        renderSystemLogs();
    }

    function clearSystemLogs() {
        systemLogs = [];
        renderSystemLogs();
        addSystemLog('Logs effaces manuellement.');
    }

    function updateSetting(key, value, rerender = true) {
        const previous = appSettings[key];
        appSettings[key] = value;
        saveSettings();
        if (previous !== value) addSystemLog(`Parametre modifie: ${key}=${value}`);
        if (rerender) applyVisualSettings();
    }

    function setupMenuEvents() {
        document.getElementById('start-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleStartMenu();
        });
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('start-menu');
            if (menu.classList.contains('open') && !menu.contains(e.target) && e.target.id !== 'start-btn') {
                toggleStartMenu(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const menu = document.getElementById('start-menu');
            if (menu?.classList.contains('open')) {
                toggleStartMenu(false);
                document.getElementById('start-btn')?.focus();
            }
            document.querySelectorAll('.tray-panel.open').forEach((panel) => panel.classList.remove('open'));
            toggleMobileVolumePanel(false);
        });
        document.getElementById('pc-setting-boot').addEventListener('change', (e) => { updateSetting('bootEnabled', e.target.checked); playSystemSound('click'); });
        document.getElementById('pc-setting-crt').addEventListener('change', (e) => { updateSetting('crtEnabled', e.target.checked); playSystemSound('click'); });
        document.getElementById('pc-setting-theme').addEventListener('change', (e) => { updateSetting('theme', e.target.value); playSystemSound('click'); });
        document.getElementById('pc-setting-dark').addEventListener('change', (e) => { updateSetting('globalDark', e.target.checked); playSystemSound('click'); });
        document.getElementById('pc-setting-client-mode').addEventListener('change', (e) => {
            updateSetting('clientMode', e.target.value);
            applyClientMode();
            playSystemSound('click');
        });
        document.getElementById('pc-setting-lite-enabled').addEventListener('change', (e) => {
            updateSetting('liteEnabled', e.target.checked);
            applyClientMode();
            playSystemSound('click');
        });
        document.getElementById('pc-setting-wallpaper').addEventListener('change', (e) => {
            const value = e.target.value;
            if (value === 'tempus-secret' && !isTempusUnlocked) {
                e.target.value = appSettings.wallpaper || 'xp-default';
                playSystemSound('error');
                return;
            }
            updateSetting('wallpaper', value);
            playSystemSound('click');
        });
        document.getElementById('exp-setting-sounds').addEventListener('change', (e) => { updateSetting('systemSounds', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-setting-boot-sound').addEventListener('change', (e) => { updateSetting('bootSoundEnabled', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-setting-ambient').addEventListener('change', (e) => { updateSetting('ambientHum', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-setting-popups').addEventListener('change', (e) => { updateSetting('systemPopups', e.target.checked); restartPopupLoop(); playSystemSound('click'); });
        document.getElementById('exp-setting-icon-anim').addEventListener('change', (e) => { updateSetting('iconAnimations', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-setting-screensaver').addEventListener('change', (e) => { updateSetting('screensaverEnabled', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-setting-grid-snap').addEventListener('change', (e) => { updateSetting('snapIconsToGrid', e.target.checked); playSystemSound('click'); });
        document.getElementById('exp-arrange-icons-btn').addEventListener('click', () => { arrangeDesktopIcons(); playSystemSound('click'); });
        document.getElementById('ui-language-setting').addEventListener('change', (e) => { updateSetting('desktopLanguage', e.target.value); playSystemSound('click'); });
        document.getElementById('exp-setting-popup-mode').addEventListener('change', (e) => { updateSetting('popupMode', e.target.value); restartPopupLoop(); playSystemSound('click'); });
        document.getElementById('exp-setting-popup-frequency').addEventListener('change', (e) => { updateSetting('popupFrequency', e.target.value); restartPopupLoop(); playSystemSound('click'); });
        document.getElementById('tray-logs-btn').addEventListener('click', () => {
            if (isPoweredOff) return;
            openWindow('win-logs', 'task-logs');
        });

        // Tray panels (sound / network)
        const soundBtn = document.getElementById('tray-sound-btn');
        const netBtn = document.getElementById('tray-net-btn');
        const soundPanel = document.getElementById('tray-sound-panel');
        const netPanel = document.getElementById('tray-net-panel');
        const toggleSystemSounds = document.getElementById('tray-toggle-system-sounds');
        const toggleBootSounds = document.getElementById('tray-toggle-boot-sound');
        const masterVolume = document.getElementById('tray-master-volume');

        function closeTrayPanels() {
            soundPanel.classList.remove('open');
            netPanel.classList.remove('open');
        }
        function togglePanel(panel) {
            const willOpen = !panel.classList.contains('open');
            closeTrayPanels();
            panel.classList.toggle('open', willOpen);
        }
        function refreshTrayControls() {
            toggleSystemSounds.checked = !!appSettings.systemSounds;
            toggleBootSounds.checked = !!appSettings.bootSoundEnabled;
            masterVolume.value = String(appSettings.masterVolume ?? 0.6);
        }

        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isPoweredOff) return;
            refreshTrayControls();
            togglePanel(soundPanel);
            playSystemSound('click');
        });
        netBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isPoweredOff) return;
            document.getElementById('tray-net-ping').innerText = `${8 + Math.floor(Math.random() * 22)}ms`;
            togglePanel(netPanel);
            playSystemSound('click');
        });
        document.addEventListener('click', (e) => {
            if (soundPanel.contains(e.target) || netPanel.contains(e.target)) return;
            if (e.target === soundBtn || e.target === netBtn) return;
            closeTrayPanels();
        });

        toggleSystemSounds.addEventListener('change', (e) => updateSetting('systemSounds', e.target.checked));
        toggleBootSounds.addEventListener('change', (e) => updateSetting('bootSoundEnabled', e.target.checked));
        masterVolume.addEventListener('input', (e) => {
            updateSetting('masterVolume', Number(e.target.value), false);
            saveSettings();
        });
    }

    function stopBootSound() {
        if (!bootAudio) return;
        bootAudio.pause();
        bootAudio.currentTime = 0;
        bootAudio = null;
    }

    async function getBootHideDelayMs() {
        const defaultDelay = 2200;
        if (isMobileDeviceProfile()) return 900;
        if (!appSettings.bootSoundEnabled) return defaultDelay;
        stopBootSound();
        bootAudio = new Audio('medias/musique/startup.mp3');
        bootAudio.preload = 'metadata';
        // Startup is intentionally softer than the rest of AQ-NEO system audio.
        bootAudio.volume = Math.max(0, Math.min(1, (appSettings.masterVolume ?? 0.6) * 0.35));
        const metadataLoaded = await new Promise((resolve) => {
            let settled = false;
            const settle = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            bootAudio.addEventListener('loadedmetadata', () => settle(true), { once: true });
            bootAudio.addEventListener('error', () => settle(false), { once: true });
            setTimeout(() => settle(false), 900);
        });
        const canUseDuration = metadataLoaded && Number.isFinite(bootAudio.duration) && bootAudio.duration > 0;
        const hideDelay = canUseDuration
            ? Math.max(700, Math.floor((bootAudio.duration - 0.3) * 1000))
            : defaultDelay;
        bootAudio.play().catch(() => {});
        return hideDelay;
    }

    function markBootComplete() {
        window.__AQ_BOOT_DONE__ = true;
        window.dispatchEvent(new CustomEvent('aq:boot-complete'));
    }

    async function runBootSequence() {
        window.__AQ_BOOT_DONE__ = false;
        const boot = document.getElementById('boot-screen');
        const progressBar = document.querySelector('.boot-progress-bar');
        if (!appSettings.bootEnabled) {
            stopBootSound();
            boot.style.display = 'none';
            markBootComplete();
            return;
        }
        addSystemLog('Demarrage du systeme.');
        boot.classList.remove('hidden');
        boot.style.display = 'flex';
        const hideDelayMs = await getBootHideDelayMs();
        if (progressBar) {
            progressBar.style.setProperty('--boot-duration', `${hideDelayMs}ms`);
            progressBar.style.animation = 'none';
            void progressBar.offsetWidth;
            progressBar.style.animation = 'bootLoad var(--boot-duration, 2.2s) linear forwards';
        }
        setTimeout(() => boot.classList.add('hidden'), hideDelayMs);
        setTimeout(() => {
            boot.style.display = 'none';
            addSystemLog('Demarrage termine.');
            markBootComplete();
        }, hideDelayMs + 500);
    }

    function toggleAmbientHum(enabled) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (enabled) {
            if (ambientOsc) return;
            ambientOsc = audioCtx.createOscillator();
            ambientGain = audioCtx.createGain();
            ambientOsc.type = 'sine';
            ambientOsc.frequency.value = 58;
            ambientGain.gain.value = 0.008 * (appSettings.masterVolume ?? 0.6);
            ambientOsc.connect(ambientGain);
            ambientGain.connect(audioCtx.destination);
            ambientOsc.start();
            return;
        }
        if (ambientOsc) {
            ambientOsc.stop();
            ambientOsc.disconnect();
            ambientGain.disconnect();
            ambientOsc = null;
            ambientGain = null;
        }
    }

    function hideScreensaver() {
        const overlay = document.getElementById('screensaver-overlay');
        overlay.classList.remove('active');
    }

    function showScreensaver() {
        if (!appSettings.screensaverEnabled || isPoweredOff) return;
        const overlay = document.getElementById('screensaver-overlay');
        overlay.classList.add('active');
    }

    function resetScreensaverTimer() {
        hideScreensaver();
        if (screensaverTimer) clearTimeout(screensaverTimer);
        if (!appSettings.screensaverEnabled || isPoweredOff) return;
        screensaverTimer = setTimeout(showScreensaver, 90000);
    }

    function setupActivityListeners() {
        ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach((evt) => {
            document.addEventListener(evt, resetScreensaverTimer);
        });
    }

    let powerTransitionRunning = false;

    function powerDelay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function setShutdownScreen(title, detail, progress) {
        const overlay = document.getElementById('shutdown-overlay');
        const titleEl = document.getElementById('shutdown-title');
        const detailEl = document.getElementById('shutdown-detail');
        const bar = document.getElementById('shutdown-progress-bar');
        const powerBtn = document.getElementById('power-on-btn');

        if (titleEl) titleEl.textContent = title || '';
        if (detailEl) detailEl.textContent = detail || '';
        if (bar) bar.style.width = Math.max(0, Math.min(100, progress || 0)) + '%';
        if (powerBtn) powerBtn.hidden = true;
        overlay?.classList.add('active', 'closing');
        overlay?.classList.remove('powered-off');
    }

    function showPoweredOffScreen() {
        const overlay = document.getElementById('shutdown-overlay');
        const titleEl = document.getElementById('shutdown-title');
        const detailEl = document.getElementById('shutdown-detail');
        const bar = document.getElementById('shutdown-progress-bar');
        const powerBtn = document.getElementById('power-on-btn');

        overlay?.classList.remove('closing');
        overlay?.classList.add('powered-off', 'active');
        if (titleEl) titleEl.textContent = 'Aquerty AQ-NEO est éteint';
        if (detailEl) detailEl.textContent = 'Vous pouvez maintenant rallumer le système.';
        if (bar) bar.style.width = '100%';
        if (powerBtn) powerBtn.hidden = false;
    }

    async function closeAppsForPowerTransition() {
        const visibleWindows = Array.from(document.querySelectorAll('.window'))
            .filter((win) => win.style.display === 'block');

        if (!visibleWindows.length) {
            setShutdownScreen('Fermeture des applications…', 'Aucune application ouverte.', 45);
            await powerDelay(280);
            return;
        }

        for (let i = 0; i < visibleWindows.length; i += 1) {
            const win = visibleWindows[i];
            const title = win.querySelector('.title-bar > span')?.textContent?.trim() || win.id;
            const progress = 10 + Math.round(((i + 1) / visibleWindows.length) * 42);

            setShutdownScreen('Fermeture des applications…', title, progress);
            stopAudioInWindow(win.id);
            win.classList.add('aq-window-shutting-down');
            await powerDelay(150);

            win.style.display = 'none';
            win.classList.remove('aq-window-shutting-down');

            const taskId = win.id.replace('win-', 'task-');
            const task = document.getElementById(taskId);
            if (task) {
                task.style.display = 'none';
                task.classList.remove('active');
            }

            await powerDelay(90);
        }

        saveSessionState();
    }

    async function runPowerTransition(mode = 'shutdown') {
        if (powerTransitionRunning) return;
        powerTransitionRunning = true;

        toggleStartMenu(false);
        hideScreensaver();
        toggleAmbientHum(false);
        setShutdownScreen(
            mode === 'restart' ? 'Redémarrage d’AQ-NEO…' : 'Arrêt d’AQ-NEO…',
            'Préparation du système…',
            5
        );

        await powerDelay(220);
        await closeAppsForPowerTransition();

        setShutdownScreen(
            mode === 'restart' ? 'Redémarrage d’AQ-NEO…' : 'Arrêt d’AQ-NEO…',
            'Enregistrement de la session…',
            68
        );
        await window.AQCloudSync?.flush?.();
        await powerDelay(320);

        setShutdownScreen(
            mode === 'restart' ? 'Redémarrage d’AQ-NEO…' : 'Arrêt d’AQ-NEO…',
            mode === 'restart' ? 'Relance des services Aquerty…' : 'Fermeture des services Aquerty…',
            88
        );
        await powerDelay(420);

        if (mode === 'restart') {
            addSystemLog('Redémarrage du système.', 'warn');
            localStorage.removeItem(SESSION_KEY);
            setShutdownScreen('Redémarrage…', 'AQ-NEO va redémarrer.', 100);
            await powerDelay(420);
            window.location.reload();
            return;
        }

        isPoweredOff = true;
        saveState();
        addSystemLog('Arrêt du système.', 'warn');

        showPoweredOffScreen();
        powerTransitionRunning = false;
    }

    function shutdownSystem() {
        void runPowerTransition('shutdown');
    }

    function powerOnSystem() {
        if (powerTransitionRunning) return;

        isPoweredOff = false;
        saveState();
        addSystemLog('Power on demandé.');

        const overlay = document.getElementById('shutdown-overlay');
        const powerBtn = document.getElementById('power-on-btn');
        if (powerBtn) powerBtn.hidden = true;
        overlay?.classList.remove('active', 'closing', 'powered-off');

        applyVisualSettings();
        runBootSequence();
        resetScreensaverTimer();
    }

    function restartSystem() {
        void runPowerTransition('restart');
    }

    function bindDesktopIconAnimations() {
        document.querySelectorAll('.desktop-icon').forEach((icon) => {
            icon.addEventListener('click', () => {
                if (!appSettings.iconAnimations) return;
                icon.classList.remove('clicked');
                void icon.offsetWidth;
                icon.classList.add('clicked');
                setTimeout(() => icon.classList.remove('clicked'), 140);
            });
        });
    }

    // --- DESKTOP ICON LAYOUT + SELECTION (Windows-like) ---
    const DESKTOP_LAYOUT_KEY = 'aquerty_desktop_layout_v2';
    const DEFAULT_DESKTOP_LAYOUT = {
        trash: { left: '15px', top: '15px' },
        player: { left: '15px', top: '110px' },
        internet: { left: '15px', top: '205px' },
        tempus: { left: '15px', top: '300px' },
        settings: { left: '110px', top: '15px' },
        acc: { left: '110px', top: '110px' },
        mines: { left: '110px', top: '205px' },
        mail: { left: '110px', top: '300px' },
        myspace: { left: '205px', top: '15px' }
    };
    const ICON_GRID_X = 95;
    const ICON_GRID_Y = 95;
    const ICON_GRID_OFFSET_X = 15;
    const ICON_GRID_OFFSET_Y = 15;
    const desktopIconsRoot = document.getElementById('desktop-icons');
    const marqueeEl = document.getElementById('icon-marquee');
    let isMarqueeSelecting = false;
    let marqueeStart = null;
    let draggingIcon = null;
    let dragOffset = null;
    let draggingIconsGroup = [];
    let draggingIconsStart = [];
    let dragStartClient = null;
    let suppressDesktopClearOnce = false;

    function getDesktopIcons() {
        return Array.from(document.querySelectorAll('#desktop-icons .desktop-icon'));
    }

    function clearIconSelection() {
        getDesktopIcons().forEach((el) => el.classList.remove('selected'));
    }

    function saveDesktopLayout() {
        const layout = {};
        getDesktopIcons().forEach((el) => {
            const key = el.dataset.desktopIcon || el.querySelector('span')?.innerText || el.id;
            layout[key] = { left: el.style.left, top: el.style.top };
        });
        localStorage.setItem(DESKTOP_LAYOUT_KEY, JSON.stringify(layout));
        notifyPersistenceChange('desktop-layout');
    }

    function loadDesktopLayout() {
        try {
            return JSON.parse(localStorage.getItem(DESKTOP_LAYOUT_KEY) || '{}') || {};
        } catch (_) {
            return {};
        }
    }

    function applyDefaultDesktopLayoutIfMissing() {
        const saved = loadDesktopLayout();
        getDesktopIcons().forEach((el) => {
            const key = el.dataset.desktopIcon;
            const pos = saved[key] || DEFAULT_DESKTOP_LAYOUT[key] || { left: el.style.left || '15px', top: el.style.top || '15px' };
            el.style.left = pos.left;
            el.style.top = pos.top;
        });
        if (!localStorage.getItem(DESKTOP_LAYOUT_KEY)) saveDesktopLayout();
    }

    function clampToDesktop(x, y, el) {
        const rootRect = desktopIconsRoot.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const cx = Math.max(0, Math.min(x, rootRect.width - w));
        const cy = Math.max(0, Math.min(y, rootRect.height - h));
        return { x: cx, y: cy };
    }

    function snapToDesktopGrid(x, y, el) {
        if (!appSettings.snapIconsToGrid) return clampToDesktop(x, y, el);
        const snappedX = Math.round((x - ICON_GRID_OFFSET_X) / ICON_GRID_X) * ICON_GRID_X + ICON_GRID_OFFSET_X;
        const snappedY = Math.round((y - ICON_GRID_OFFSET_Y) / ICON_GRID_Y) * ICON_GRID_Y + ICON_GRID_OFFSET_Y;
        return clampToDesktop(snappedX, snappedY, el);
    }

    function arrangeDesktopIcons() {
        const icons = getDesktopIcons();
        const rootRect = desktopIconsRoot.getBoundingClientRect();
        const rowsPerCol = Math.max(1, Math.floor((rootRect.height - ICON_GRID_OFFSET_Y) / ICON_GRID_Y));
        icons.forEach((icon, index) => {
            const col = Math.floor(index / rowsPerCol);
            const row = index % rowsPerCol;
            const x = ICON_GRID_OFFSET_X + (col * ICON_GRID_X);
            const y = ICON_GRID_OFFSET_Y + (row * ICON_GRID_Y);
            const pos = clampToDesktop(x, y, icon);
            icon.style.left = `${pos.x}px`;
            icon.style.top = `${pos.y}px`;
        });
        saveDesktopLayout();
    }

    function rectsIntersect(a, b) {
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    function setMarqueeRect(x1, y1, x2, y2) {
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);
        marqueeEl.style.left = `${left}px`;
        marqueeEl.style.top = `${top}px`;
        marqueeEl.style.width = `${width}px`;
        marqueeEl.style.height = `${height}px`;
    }

    function marqueeSelectUpdate() {
        const rootRect = desktopIconsRoot.getBoundingClientRect();
        const mar = marqueeEl.getBoundingClientRect();
        const icons = getDesktopIcons();
        icons.forEach((icon) => {
            const r = icon.getBoundingClientRect();
            const selected = rectsIntersect(mar, r);
            icon.classList.toggle('selected', selected);
        });
    }

    function startMarquee(e) {
        if (e.button !== 0) return;
        if (e.target.closest('.desktop-icon')) return;
        if (e.target.closest('.window')) return;
        clearIconSelection();
        isMarqueeSelecting = true;
        const rect = desktopIconsRoot.getBoundingClientRect();
        marqueeStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        marqueeEl.style.display = 'block';
        setMarqueeRect(marqueeStart.x, marqueeStart.y, marqueeStart.x, marqueeStart.y);
    }

    function stopMarquee() {
        isMarqueeSelecting = false;
        marqueeStart = null;
        marqueeEl.style.display = 'none';
        marqueeEl.style.width = '0px';
        marqueeEl.style.height = '0px';
    }

    desktopIconsRoot.addEventListener('mousedown', (e) => {
        // icon dragging
        const icon = e.target.closest('.desktop-icon');
        if (icon && e.button === 0) {
            if (!e.ctrlKey && !e.shiftKey && !icon.classList.contains('selected')) {
                clearIconSelection();
                icon.classList.add('selected');
            } else if (e.ctrlKey) {
                icon.classList.toggle('selected');
            }
            draggingIcon = icon;
            draggingIconsGroup = getDesktopIcons().filter((el) => el.classList.contains('selected'));
            if (draggingIconsGroup.length === 0) draggingIconsGroup = [icon];
            draggingIconsStart = draggingIconsGroup.map((el) => ({
                el,
                left: parseFloat(el.style.left) || 0,
                top: parseFloat(el.style.top) || 0
            }));
            dragStartClient = { x: e.clientX, y: e.clientY };
            e.preventDefault();
            return;
        }
        startMarquee(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (draggingIcon && dragStartClient) {
            const deltaX = e.clientX - dragStartClient.x;
            const deltaY = e.clientY - dragStartClient.y;
            draggingIconsStart.forEach((entry) => {
                const clamped = clampToDesktop(entry.left + deltaX, entry.top + deltaY, entry.el);
                entry.el.style.left = `${clamped.x}px`;
                entry.el.style.top = `${clamped.y}px`;
            });
            return;
        }
        if (!isMarqueeSelecting || !marqueeStart) return;
        const rect = desktopIconsRoot.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setMarqueeRect(marqueeStart.x, marqueeStart.y, x, y);
        marqueeSelectUpdate();
    });

    document.addEventListener('mouseup', () => {
        if (draggingIcon) {
            draggingIconsStart.forEach((entry) => {
                const snapped = snapToDesktopGrid(parseFloat(entry.el.style.left) || 0, parseFloat(entry.el.style.top) || 0, entry.el);
                entry.el.style.left = `${snapped.x}px`;
                entry.el.style.top = `${snapped.y}px`;
            });
            draggingIcon = null;
            dragOffset = null;
            draggingIconsGroup = [];
            draggingIconsStart = [];
            dragStartClient = null;
            saveDesktopLayout();
        }
        if (isMarqueeSelecting) {
            suppressDesktopClearOnce = true;
            stopMarquee();
        }
    });

    desktopIconsRoot.addEventListener('click', (e) => {
        if (suppressDesktopClearOnce) {
            suppressDesktopClearOnce = false;
            return;
        }
        if (e.target.closest('.desktop-icon')) return;
        clearIconSelection();
    });

    function setupDesktopIconActivation() {
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
        const clickState = { icon: null, at: 0 };
        getDesktopIcons().forEach((icon) => {
            icon.setAttribute('role', 'button');
            icon.tabIndex = 0;
            icon.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const winId = icon.dataset.openWin;
                const taskId = icon.dataset.openTask;
                if (winId && taskId) openWindow(winId, taskId);
            });
            icon.addEventListener('click', () => {
                const winId = icon.dataset.openWin;
                const taskId = icon.dataset.openTask;
                if (!winId || !taskId) return;
                if (isTouchDevice) {
                    openWindow(winId, taskId);
                    return;
                }
                const now = Date.now();
                if (clickState.icon === icon && (now - clickState.at) < 320) {
                    openWindow(winId, taskId);
                    clickState.icon = null;
                    clickState.at = 0;
                    return;
                }
                clickState.icon = icon;
                clickState.at = now;
            });
        });
    }

    const UI_I18N = {
        fr: {
            bootSubtitle: 'Veuillez patienter',
            menuLabel: 'MENU',
            recents: 'Récents',
            system: 'Système',
            settingsTitle: 'Panneau de configuration',
            settingsPC: 'Paramètres PC',
            settingsExp: 'Paramètres Expérience',
            logsWindow: 'Visionneur de logs',
            trashLabel: 'Corbeille',
            playerTask: 'AQ-Player...',
            playerCfg: 'Réglages',
            playerSettingsTitle: 'Paramètres Player',
            playerSkinLabel: 'Skin:',
            playerNightLabel: 'Mode plein écran nuit',
            playerSettingsHint: 'Astuce: clique hors du panneau pour le fermer.',
            minesTask: 'AQ-Mines',
            logsSession: 'Logs techniques de session',
            clear: 'Vider',
            enableBoot: 'Activer le boot',
            crtEffect: 'Effet CRT',
            theme: 'Thème :',
            systemSounds: 'Sons système',
            bootSound: 'Son de démarrage',
            ambient: 'Bruit de fond',
            popups: 'Popups système',
            iconAnim: 'Animation icônes',
            screensaver: 'Écran de veille',
            snap: 'Aligner les icônes sur la grille',
            arrange: 'Ranger les icônes',
            language: 'Langue:',
            popupMode: 'Mode popup:',
            popupFreq: 'Fréquence :',
            popupModeRandom: 'Aléatoire',
            popupModeContext: 'Contextuel',
            popupModeMixed: 'Mixte',
            popupFreqLow: 'Faible',
            popupFreqNormal: 'Normal',
            popupFreqHigh: 'Relou',
            restart: 'Redémarrer',
            shutdown: 'Éteindre',
            trayLogsTitle: 'Ouvrir les logs',
            trayLogsAlt: 'Logs',
            traySoundTitle: 'Son',
            traySoundAlt: 'Son',
            trayNetworkTitle: 'Réseau',
            trayNetworkAlt: 'Réseau',
            traySoundPanelTitle: 'Son',
            trayNetworkPanelTitle: 'Réseau',
            trayPanelSoundAria: 'Panneau son',
            trayPanelNetworkAria: 'Panneau réseau',
            trayStatus: 'État',
            trayConnected: 'Connecté',
            traySystem: 'Système',
            trayBoot: 'Boot',
            trayVolume: 'Volume',
            trashDeleted: 'Éléments supprimés :',
            trashHint: 'Tu peux éditer cette liste facilement dans la fenêtre Corbeille.',
            msFaceTitle: 'Nouvelle partie',
            msGridAria: 'Grille démineur',
            msHelp: 'Clic droit = drapeau',
            msDiffBeginner: 'Débutant (9x9, 10)',
            msDiffIntermediate: 'Intermédiaire (16x16, 40)',
            msDiffExpert: 'Expert (16x30, 99)',
            ieHome: 'Accueil',
            ieMenu: ['Fichier', 'Édition', 'Affichage', 'Favoris', 'Outils', 'Aide'],
            ieAddress: 'Adresse :',
            tempusTask: 'Sécurité - tempus_pe...',
            settingsTask: 'Panneau de config...',
            mailFoldersTitle: 'Dossiers',
            inbox: 'Inbox',
            sent: 'Sent',
            trash: 'Trash',
            mailNew: 'Nouveau',
            mailReply: 'Répondre',
            mailDelete: 'Supprimer',
            mailSearch: 'Rechercher...',
            mailSelect: 'Sélectionne un mail.',
            mailNoMessages: 'Aucun message.',
            mailComposeTitle: 'Nouveau message',
            mailTo: 'A',
            mailSubject: 'Sujet',
            mailMsg: 'Msg',
            mailSend: 'Envoyer',
            mailFrom: 'De:',
            mailToLabel: 'A:',
            mailDate: 'Date:',
            mailNoSubject: '(sans sujet)',
            ieInfoAddress: 'http://www.jaj-records.com/home.html',
            ieTempusTitle: 'Index of /tempus_perit/index_files/',
            ieVol: 'VOL:',
            wallpaper: 'Fond d’écran :',
            darkTheme: 'Thème noir global',
            tempusUnlockPending: 'Ouverture de la page... Vous avez débloqué un nouveau fond d’écran !',
            secretWallpaperLocked: 'Tempus Secret (verrouillé)',
            secretWallpaperUnlocked: 'Tempus Secret'
        },
        en: {
            bootSubtitle: 'Please wait',
            menuLabel: 'MENU',
            recents: 'Recent',
            system: 'System',
            settingsTitle: 'Control Panel',
            settingsPC: 'PC Settings',
            settingsExp: 'Experience Settings',
            logsWindow: 'Logs Viewer',
            trashLabel: 'Recycle Bin',
            playerTask: 'AQ-Player...',
            playerCfg: 'Settings',
            playerSettingsTitle: 'Player Settings',
            playerSkinLabel: 'Skin:',
            playerNightLabel: 'Night fullscreen mode',
            playerSettingsHint: 'Tip: click outside the panel to close it.',
            minesTask: 'AQ-Mines',
            logsSession: 'Session technical logs',
            clear: 'Clear',
            enableBoot: 'Enable boot screen',
            crtEffect: 'CRT effect',
            theme: 'Theme:',
            systemSounds: 'System sounds',
            bootSound: 'Startup sound',
            ambient: 'Ambient hum',
            popups: 'System popups',
            iconAnim: 'Icon animation',
            screensaver: 'Screensaver',
            snap: 'Snap icons to grid',
            arrange: 'Arrange icons',
            language: 'Language:',
            popupMode: 'Popup mode:',
            popupFreq: 'Frequency:',
            popupModeRandom: 'Random',
            popupModeContext: 'Contextual',
            popupModeMixed: 'Mixed',
            popupFreqLow: 'Low',
            popupFreqNormal: 'Normal',
            popupFreqHigh: 'Annoying',
            restart: 'Restart',
            shutdown: 'Shut down',
            trayLogsTitle: 'Open logs',
            trayLogsAlt: 'Logs',
            traySoundTitle: 'Sound',
            traySoundAlt: 'Sound',
            trayNetworkTitle: 'Network',
            trayNetworkAlt: 'Network',
            traySoundPanelTitle: 'Sound',
            trayNetworkPanelTitle: 'Network',
            trayPanelSoundAria: 'Sound panel',
            trayPanelNetworkAria: 'Network panel',
            trayStatus: 'Status',
            trayConnected: 'Connected',
            traySystem: 'System',
            trayBoot: 'Boot',
            trayVolume: 'Volume',
            trashDeleted: 'Deleted items:',
            trashHint: 'You can edit this list easily in the Recycle Bin window.',
            msFaceTitle: 'New game',
            msGridAria: 'Minesweeper grid',
            msHelp: 'Right click = flag',
            msDiffBeginner: 'Beginner (9x9, 10)',
            msDiffIntermediate: 'Intermediate (16x16, 40)',
            msDiffExpert: 'Expert (16x30, 99)',
            ieHome: 'Home',
            ieMenu: ['File', 'Edit', 'View', 'Favorites', 'Tools', 'Help'],
            ieAddress: 'Address:',
            tempusTask: 'Security - tempus_pe...',
            settingsTask: 'Control panel...',
            mailFoldersTitle: 'Folders',
            inbox: 'Inbox',
            sent: 'Sent',
            trash: 'Trash',
            mailNew: 'New',
            mailReply: 'Reply',
            mailDelete: 'Delete',
            mailSearch: 'Search...',
            mailSelect: 'Select an email.',
            mailNoMessages: 'No messages.',
            mailComposeTitle: 'New message',
            mailTo: 'To',
            mailSubject: 'Subject',
            mailMsg: 'Msg',
            mailSend: 'Send',
            mailFrom: 'From:',
            mailToLabel: 'To:',
            mailDate: 'Date:',
            mailNoSubject: '(no subject)',
            ieInfoAddress: 'http://www.jaj-records.com/home.html',
            ieTempusTitle: 'Index of /tempus_perit/index_files/',
            ieVol: 'VOL:',
            wallpaper: 'Wallpaper:',
            darkTheme: 'Global dark theme',
            tempusUnlockPending: 'Opening page... You unlocked a new wallpaper!',
            secretWallpaperLocked: 'Tempus Secret (locked)',
            secretWallpaperUnlocked: 'Tempus Secret'
        }
    };

    function getCurrentLanguage() {
        return appSettings.desktopLanguage === 'en' ? 'en' : 'fr';
    }

    function tUI() {
        return UI_I18N[getCurrentLanguage()];
    }

    function setLabelText(inputId, text) {
        const input = document.getElementById(inputId);
        if (!input || !input.parentElement) return;
        input.parentElement.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
        });
        input.parentElement.append(` ${text}`);
    }

    function setSelectLabel(selectId, text) {
        const select = document.getElementById(selectId);
        if (!select || !select.parentElement) return;
        const label = select.parentElement;
        label.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
        });
        label.prepend(`${text} `);
    }

    function translateLogMessage(message) {
        const isEn = getCurrentLanguage() === 'en';
        const m = String(message || '');
        if (!isEn) return m;
        if (m === 'Logs effaces manuellement.') return 'Logs cleared manually.';
        if (m === 'Demarrage du systeme.') return 'System startup.';
        if (m === 'Demarrage termine.') return 'Startup complete.';
        if (m === 'Arret du systeme.') return 'System shutdown.';
        if (m === 'Power on demande.') return 'Power on requested.';
        if (m === 'Redemarrage du systeme.') return 'System restart.';
        if (m.startsWith('Parametre modifie: ')) return m.replace('Parametre modifie: ', 'Setting changed: ');
        if (m.startsWith('Fenetre ouverte: ')) return m.replace('Fenetre ouverte: ', 'Window opened: ');
        if (m.startsWith('Fenetre fermee: ')) return m.replace('Fenetre fermee: ', 'Window closed: ');
        if (m.startsWith('Fenetre reduite: ')) return m.replace('Fenetre reduite: ', 'Window minimized: ');
        if (m.startsWith('Lecture piste: ')) return m.replace('Lecture piste: ', 'Playing track: ');
        if (m === 'Démineur: victoire' || m === 'Demineur: victoire') return 'Minesweeper: victory';
        if (m === 'Démineur: BOOM' || m === 'Demineur: BOOM') return 'Minesweeper: BOOM';
        if (m.startsWith('Démineur: nouvelle partie') || m.startsWith('Demineur: nouvelle partie')) return m.replace('Démineur: nouvelle partie', 'Minesweeper: new game').replace('Demineur: nouvelle partie', 'Minesweeper: new game');
        if (m === 'Démineur: icones Aquerty chargees' || m === 'Demineur: icones Aquerty chargees') return 'Minesweeper: Aquerty icons loaded';
        if (m.startsWith('Mail: ouvert ')) return m.replace('Mail: ouvert ', 'Mail: opened ');
        if (m === 'Mail: suppression') return 'Mail: deleted';
        if (m === 'Mail: envoyé' || m === 'Mail: envoye') return 'Mail: sent';
        return m;
    }

    function applyLanguage(lang) {
        const selected = lang === 'en' ? 'en' : 'fr';
        appSettings.desktopLanguage = selected;
        document.documentElement.lang = selected;
        const t = tUI();
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setText('boot-subtitle', t.bootSubtitle);
        setText('start-btn', t.menuLabel);
        const startTitles = document.querySelectorAll('#start-menu .start-menu-title');
        if (startTitles[0]) startTitles[0].textContent = t.recents;
        if (startTitles[1]) startTitles[1].textContent = t.system;
        const startButtons = document.querySelectorAll('#start-menu .start-menu-actions .retro-btn');
        if (startButtons[0]) startButtons[0].textContent = t.settingsTitle;
        if (startButtons[1]) startButtons[1].textContent = t.shutdown;
        if (startButtons[2]) startButtons[2].textContent = t.restart;
        setText('task-logs', t.logsWindow);
        setText('task-tempus', t.tempusTask);
        setText('task-settings', t.settingsTask);
        setText('task-trash', t.trashLabel);
        setText('task-player', t.playerTask);
        setText('task-ms', t.minesTask);
        const playerCfgBtn = document.getElementById('player-cfg-btn');
        if (playerCfgBtn) {
            playerCfgBtn.textContent = 'CFG';
            playerCfgBtn.title = t.playerCfg;
            playerCfgBtn.setAttribute('aria-label', t.playerCfg);
        }
        setText('player-settings-title', t.playerSettingsTitle);
        const playerSkinLabel = document.getElementById('player-skin-label');
        if (playerSkinLabel) {
            playerSkinLabel.childNodes.forEach((node) => {
                if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
            });
            playerSkinLabel.prepend(`${t.playerSkinLabel} `);
        }
        setText('player-night-label', ` ${t.playerNightLabel}`);
        setText('player-settings-hint', t.playerSettingsHint);
        const desktopTrash = document.querySelector('.desktop-icon[data-desktop-icon="trash"] span');
        if (desktopTrash) desktopTrash.textContent = t.trashLabel;
        const trashWinTitle = document.querySelector('#win-trash .title-bar span');
        if (trashWinTitle) trashWinTitle.textContent = t.trashLabel;
        const trashTexts = document.querySelectorAll('#win-trash p');
        if (trashTexts[0]) trashTexts[0].innerHTML = `<strong>${t.trashDeleted}</strong>`;
        if (trashTexts[1]) trashTexts[1].textContent = t.trashHint;
        const msFace = document.getElementById('ms-face');
        if (msFace) msFace.title = t.msFaceTitle;
        const msGrid = document.getElementById('ms-grid');
        if (msGrid) msGrid.setAttribute('aria-label', t.msGridAria);
        setText('ms-help-text', t.msHelp);
        const msDiff = document.getElementById('ms-difficulty');
        if (msDiff) {
            msDiff.options[0].text = t.msDiffBeginner;
            msDiff.options[1].text = t.msDiffIntermediate;
            msDiff.options[2].text = t.msDiffExpert;
        }

        const settingsWindowTitle = document.querySelector('#win-settings .title-bar span');
        if (settingsWindowTitle) settingsWindowTitle.textContent = t.settingsTitle;
        const settingTitles = document.querySelectorAll('#win-settings .setting-title');
        if (settingTitles[0]) settingTitles[0].textContent = t.settingsPC;
        if (settingTitles[1]) settingTitles[1].textContent = t.settingsExp;
        setLabelText('pc-setting-boot', t.enableBoot);
        setLabelText('pc-setting-crt', t.crtEffect);
        setLabelText('pc-setting-dark', t.darkTheme);
        setSelectLabel('pc-setting-wallpaper', t.wallpaper);
        setLabelText('exp-setting-sounds', t.systemSounds);
        setLabelText('exp-setting-boot-sound', t.bootSound);
        setLabelText('exp-setting-ambient', t.ambient);
        setLabelText('exp-setting-popups', t.popups);
        setLabelText('exp-setting-icon-anim', t.iconAnim);
        setLabelText('exp-setting-screensaver', t.screensaver);
        setLabelText('exp-setting-grid-snap', t.snap);
        setText('exp-arrange-icons-btn', t.arrange);
        setSelectLabel('pc-setting-theme', t.theme);
        setSelectLabel('ui-language-setting', t.language);
        setSelectLabel('exp-setting-popup-mode', t.popupMode);
        setSelectLabel('exp-setting-popup-frequency', t.popupFreq);

        const popupMode = document.getElementById('exp-setting-popup-mode');
        if (popupMode) {
            popupMode.options[0].text = t.popupModeRandom;
            popupMode.options[1].text = t.popupModeContext;
            popupMode.options[2].text = t.popupModeMixed;
        }
        const popupFreq = document.getElementById('exp-setting-popup-frequency');
        if (popupFreq) {
            popupFreq.options[0].text = t.popupFreqLow;
            popupFreq.options[1].text = t.popupFreqNormal;
            popupFreq.options[2].text = t.popupFreqHigh;
        }
        const secretWallpaperOption = document.getElementById('wallpaper-opt-tempus-secret');
        if (secretWallpaperOption) {
            secretWallpaperOption.textContent = isTempusUnlocked ? t.secretWallpaperUnlocked : t.secretWallpaperLocked;
        }
        const mobileNow = document.getElementById('mobile-now-playing');
        if (mobileNow && mobileNow.textContent === 'PRÊT') {
            mobileNow.textContent = selected === 'en' ? 'READY' : 'PRÊT';
        }
        const mobilePlayBtn = document.getElementById('mobile-play-btn');
        if (mobilePlayBtn) mobilePlayBtn.textContent = selected === 'en' ? 'PLAY / PAUSE' : 'LECTURE / PAUSE';
        setText('mobile-lite-title', selected === 'en' ? 'Aquerty Mobile Lite' : 'Aquerty Mobile Lite');
        setText('mobile-lite-subtitle', selected === 'en' ? 'Simplified mode: tracks + essential settings.' : 'Version simplifiée : tracks + réglages essentiels.');
        setText('mobile-quick-title', selected === 'en' ? 'Quick settings' : 'Réglages rapides');
        setText('mobile-quick-sounds-label', selected === 'en' ? 'System sounds' : 'Sons système');
        setText('mobile-quick-volume-label', selected === 'en' ? 'Volume' : 'Volume');
        setText('mobile-quick-language-label', selected === 'en' ? 'Language' : 'Langue');
        setText('mobile-exit-lite-btn', selected === 'en' ? 'Exit lite mode' : 'Quitter le mode lite');
        const fab = document.getElementById('lite-exit-fab');
        if (fab) fab.textContent = selected === 'en' ? 'Exit lite' : 'Quitter lite';

        const ieHomeBtn = document.getElementById('ie-home-btn');
        if (ieHomeBtn) ieHomeBtn.title = t.ieHome;
        const ieMenu = document.querySelectorAll('#win-ie .navigator-menubar > span');
        t.ieMenu.forEach((txt, i) => { if (ieMenu[i]) ieMenu[i].textContent = txt; });
        const ieAddressLabel = document.querySelector('#win-ie .navigator-address-row label');
        if (ieAddressLabel) ieAddressLabel.textContent = t.ieAddress;
        updateNavigatorFullscreenMenu();

        const logsTitle = document.querySelector('#win-logs .title-bar span');
        if (logsTitle) logsTitle.textContent = t.logsWindow;
        const logsSub = document.querySelector('#win-logs .log-window-content span');
        if (logsSub) logsSub.textContent = t.logsSession;
        const logsClear = document.querySelector('#win-logs .log-window-content .retro-btn');
        if (logsClear) logsClear.textContent = t.clear;
        const trayLogsBtn = document.getElementById('tray-logs-btn');
        if (trayLogsBtn) trayLogsBtn.title = t.trayLogsTitle;
        const trayLogsImg = trayLogsBtn?.querySelector('img');
        if (trayLogsImg) trayLogsImg.alt = t.trayLogsAlt;
        const traySoundBtn = document.getElementById('tray-sound-btn');
        if (traySoundBtn) traySoundBtn.title = t.traySoundTitle;
        const traySoundImg = traySoundBtn?.querySelector('img');
        if (traySoundImg) traySoundImg.alt = t.traySoundAlt;
        const trayNetBtn = document.getElementById('tray-net-btn');
        if (trayNetBtn) trayNetBtn.title = t.trayNetworkTitle;
        const trayNetImg = trayNetBtn?.querySelector('img');
        if (trayNetImg) trayNetImg.alt = t.trayNetworkAlt;
        const soundPanel = document.getElementById('tray-sound-panel');
        if (soundPanel) soundPanel.setAttribute('aria-label', t.trayPanelSoundAria);
        const netPanel = document.getElementById('tray-net-panel');
        if (netPanel) netPanel.setAttribute('aria-label', t.trayPanelNetworkAria);
        const soundPanelTitle = document.querySelector('#tray-sound-panel .tray-panel-title');
        if (soundPanelTitle) soundPanelTitle.textContent = t.traySoundPanelTitle;
        const soundRows = document.querySelectorAll('#tray-sound-panel .tray-row span');
        if (soundRows[0]) soundRows[0].textContent = t.traySystem;
        if (soundRows[1]) soundRows[1].textContent = t.trayBoot;
        if (soundRows[2]) soundRows[2].textContent = t.trayVolume;
        const netPanelTitle = document.querySelector('#tray-net-panel .tray-panel-title');
        if (netPanelTitle) netPanelTitle.textContent = t.trayNetworkPanelTitle;
        const netRows = document.querySelectorAll('#tray-net-panel .tray-row span:first-child');
        if (netRows[0]) netRows[0].textContent = t.trayStatus;
        const netStatus = document.getElementById('tray-net-status');
        if (netStatus) netStatus.textContent = t.trayConnected;

        const mailFoldersTitle = document.querySelector('#win-mail .mail-sidebar .setting-title');
        if (mailFoldersTitle) mailFoldersTitle.textContent = t.mailFoldersTitle;
        const mailFolders = document.querySelectorAll('#win-mail .mail-folder span');
        if (mailFolders[0]) mailFolders[0].textContent = t.inbox;
        if (mailFolders[1]) mailFolders[1].textContent = t.sent;
        if (mailFolders[2]) mailFolders[2].textContent = t.trash;
        setText('mail-compose-btn', t.mailNew);
        setText('mail-reply-btn', t.mailReply);
        setText('mail-delete-btn', t.mailDelete);
        const mailSearch = document.getElementById('mail-search');
        if (mailSearch) mailSearch.placeholder = t.mailSearch;
        const mailComposeRow = document.querySelector('#win-mail .mail-compose .row strong');
        if (mailComposeRow) mailComposeRow.textContent = t.mailComposeTitle;
        const composeLabels = document.querySelectorAll('#win-mail .mail-compose .row span');
        if (composeLabels[0]) composeLabels[0].textContent = t.mailTo;
        if (composeLabels[1]) composeLabels[1].textContent = t.mailSubject;
        if (composeLabels[2]) composeLabels[2].textContent = t.mailMsg;
        setText('mail-send', t.mailSend);

        setIEPage(currentIEPage, true);
        if (isMailI18nReady) {
            updateMailTranslations();
            mailRenderFolders();
            mailRenderList();
            mailRenderView();
        }
        const accFrame = document.querySelector('#win-acc iframe');
        if (accFrame) accFrame.src = accFrame.src;
        renderSystemLogs();
        renderRecents();
    }

    function closeSystemPopup() {
        if (activePopupTimer) {
            clearTimeout(activePopupTimer);
            activePopupTimer = null;
        }
        const container = document.getElementById('system-popup-container');
        container.innerHTML = '';
    }

    function getRandomMessageFrom(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function showSystemPopup(source = 'random') {
        if (!appSettings.systemPopups) return;
        if (isPoweredOff) return;
        if (source === 'random' && appSettings.popupMode === 'contextual') return;
        closeSystemPopup();
        const container = document.getElementById('system-popup-container');
        const data = getRandomMessageFrom(getSystemPopupMessages());
        const popup = document.createElement('div');
        popup.className = 'system-popup';
        popup.innerHTML = `
            <div class="system-popup-title">
                <span>${data.title}</span>
                <button class="retro-btn" style="padding: 0 5px;" aria-label="Fermer popup" onclick="closeSystemPopup()">X</button>
            </div>
            <div class="system-popup-body">
                <div class="popup-icon">!</div>
                <div>${data.text}</div>
            </div>
            <div class="system-popup-actions">
                <button class="retro-btn" onclick="closeSystemPopup()">OK</button>
            </div>
        `;
        container.appendChild(popup);
        playSystemSound('error');
        activePopupTimer = setTimeout(closeSystemPopup, 9000);
    }

    function triggerContextualPopup(eventKey) {
        if (!appSettings.systemPopups) return;
        if (isPoweredOff) return;
        if (appSettings.popupMode === 'random') return;
        const options = getContextualPopupMessages()[eventKey];
        if (!options || options.length === 0) return;
        closeSystemPopup();
        const container = document.getElementById('system-popup-container');
        const data = getRandomMessageFrom(options);
        const popup = document.createElement('div');
        popup.className = 'system-popup';
        popup.innerHTML = `
            <div class="system-popup-title">
                <span>${data.title}</span>
                <button class="retro-btn" style="padding: 0 5px;" aria-label="Fermer popup" onclick="closeSystemPopup()">X</button>
            </div>
            <div class="system-popup-body">
                <div class="popup-icon">!</div>
                <div>${data.text}</div>
            </div>
            <div class="system-popup-actions">
                <button class="retro-btn" onclick="closeSystemPopup()">OK</button>
            </div>
        `;
        container.appendChild(popup);
        playSystemSound('error');
        activePopupTimer = setTimeout(closeSystemPopup, 7000);
    }

    function getPopupDelayRange() {
        if (appSettings.popupFrequency === 'low') return { min: 45000, max: 75000 };
        if (appSettings.popupFrequency === 'high') return { min: 12000, max: 24000 };
        return { min: 28000, max: 52000 };
    }

    function queueNextPopup() {
        if (!appSettings.systemPopups) return;
        if (appSettings.popupMode === 'contextual') return;
        const { min, max } = getPopupDelayRange();
        const nextDelay = min + Math.floor(Math.random() * (max - min));
        popupLoopTimer = setTimeout(() => {
            showSystemPopup('random');
            queueNextPopup();
        }, nextDelay);
    }

    function restartPopupLoop() {
        if (popupLoopTimer) {
            clearTimeout(popupLoopTimer);
            popupLoopTimer = null;
        }
        closeSystemPopup();
        if (appSettings.systemPopups) queueNextPopup();
    }

    // --- AQ-NAVIGATOR / classic browser chrome ---
    const IE_FAVORITES_KEY = 'aq_navigator_favorites_v3';
    const IE_MAX_HISTORY = 40;

    let currentIEPage = 'info';
    let ieHistory = ['info'];
    let ieHistoryIndex = 0;
    let isTempusUnlocked = false;
    let ieFavorites = loadIEFavorites();

    function escapeNavigatorHTML(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function loadIEFavorites() {
        try {
            const parsed = JSON.parse(localStorage.getItem(IE_FAVORITES_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string').slice(0, 24) : [];
        } catch (_) {
            return [];
        }
    }

    function saveIEFavorites() {
        localStorage.setItem(IE_FAVORITES_KEY, JSON.stringify(ieFavorites));
    }

    function getIEPages(lang) {
        const isEn = lang === 'en';
        return {
            info: {
                address: 'http://www.jaj-records.com/home.html',
                title: 'JAJ Records',
                content: `
                    <h2 style="color:#000080; font-size:16px;">JAJ Records</h2>
                    <hr>
                    <p><strong>${isEn ? 'Welcome to the JAJ Records network.' : 'Bienvenue sur le réseau JAJ Records.'}</strong></p>
                    <p>
                        ${isEn
                            ? 'AQ-NEO is the label portal for music, archives, applications and web experiments. The original Dual experience remains available in the catalogue.'
                            : "AQ-NEO sert de portail du label pour la musique, les archives, les applications et les expériences web. L'expérience Dual d'origine reste disponible dans le catalogue."}
                    </p>
                    <div style="border:1px solid #aca899; background:#f4f4f4; padding:10px; margin:12px 0;">
                        <strong>${isEn ? 'Catalogue / Archives' : 'Catalogue / Archives'}</strong>
                        <p style="margin-bottom:0;">
                            <a href="#" style="color:#0000ee;" onclick="setIEPage('dual'); return false;">Dual - Cha (2026)</a>
                        </p>
                    </div>
                    <p style="font-size:10px; color:#555;">JAJ Records // Aquerty AQ-NEO</p>
                `
            },
            dual: {
                address: 'http://www.jaj-records.com/releases/dual.html',
                title: 'Dual - Cha',
                content: `
                    <h2 style="color:#000080; font-size:16px;">Dual - Cha</h2>
                    <hr>
                    <p><strong>Hey!</strong> ${isEn ? 'Thanks for taking the time to read this.' : 'Merci de prendre le temps de lire ceci.'}</p>
                    <p>
                        ${isEn
                            ? 'Originally, this album was meant to be a collection of all my SoundCloud releases. Then I recovered older projects (thanks Clancy &lt;3), and putting everything together made more sense.'
                            : "À l'origine, cet album devait être une collection de toutes mes sorties SoundCloud. Puis j'ai récupéré d'anciens projets (merci Clancy &lt;3), et les réunir dans un seul ensemble faisait beaucoup plus sens."}
                    </p>
                    <p>
                        ${isEn
                            ? "The name <strong>Dual</strong> is about duality: identity, daily choices and two possible paths."
                            : "Le nom <strong>Dual</strong> parle de dualité : identité, choix du quotidien et deux chemins possibles."}
                    </p>
                    <p><strong>LRJR</strong> = <em>Lost Records of JAJ Records</em> : ${isEn ? 'lost recordings, experiments and sketches.' : 'enregistrements perdus, expérimentations et essais.'}</p>
                    <p><strong>${isEn ? 'System key' : 'Clé système'} :</strong> <span style="color:#000080;font-weight:bold;">NdZkLa</span></p>
                `
            },
            tempus: {
                address: 'http://127.0.0.1/tempus_perit/index_files/',
                title: 'Index of /tempus_perit/index_files/',
                content: `
                    <div style="font-family:'Times New Roman',Times,serif;color:black;background:white;padding:10px;">
                        <h1 style="font-size:20px;font-weight:normal;border-bottom:1px solid black;padding-bottom:5px;margin-top:0;">${tUI().ieTempusTitle}</h1>
                        <pre style="font-size:14px;margin-top:20px;"><a href="#" style="color:blue;" onclick="setIEPage('info');return false;">../</a>
<a href="#" style="color:blue;">Anthem.mp3</a>                       3.2M</pre>
                        <div style="margin-top:30px;padding:10px;border:1px dashed #ccc;background:#f9f9f9;">
                            <p style="margin:0 0 10px;font-size:14px;"><strong>C:\\medias\\musique\\Anthem.mp3</strong></p>
                            <audio id="ie-audio-player" src="medias/musique/anthem.mp3"></audio>
                            <div style="display:flex;gap:5px;align-items:center;">
                                <button onclick="document.getElementById('ie-audio-player').play()" class="retro-btn" style="padding:2px 8px;">PLAY</button>
                                <button onclick="let p=document.getElementById('ie-audio-player');p.pause();p.currentTime=0;" class="retro-btn" style="padding:2px 8px;">STOP</button>
                                <span style="font-size:11px;margin-left:10px;">${tUI().ieVol}</span>
                                <input type="range" min="0" max="1" step="0.1" value="0.5" style="width:60px;" oninput="document.getElementById('ie-audio-player').volume=this.value">
                            </div>
                        </div>
                    </div>
                `
            }
        };
    }

    function pageKeyFromAddress(value) {
        const raw = String(value || '').trim();
        const lower = raw.toLowerCase();
        if (!raw) return 'info';

        if (['info', 'home', 'aq://home', 'http://www.jaj-records.com/home.html'].includes(lower)) return 'info';
        if (['dual', 'aq://archive/dual', 'http://www.jaj-records.com/releases/dual.html'].includes(lower)) return 'dual';
        if (['tempus', 'aq://archive/tempus', 'http://127.0.0.1/tempus_perit/index_files/'].includes(lower)) return 'tempus';
        if (lower === 'favorites' || lower === 'favoris') return '__favorites';
        if (lower === 'history' || lower === 'historique') return '__history';
        if (lower === 'help' || lower === 'aide') return '__help';
        if (lower === 'about') return '__about';
        return null;
    }

    function getIEAddressForPage(pageKey) {
        const pages = getIEPages(getCurrentLanguage());
        if (pages[pageKey]) return pages[pageKey].address;
        if (pageKey === '__favorites') return 'about:favorites';
        if (pageKey === '__history') return 'about:history';
        if (pageKey === '__help') return 'about:help';
        if (pageKey === '__about') return 'about:aq-navigator';
        return String(pageKey || '');
    }

    function renderIENavigatorUtilityPage(pageKey) {
        const isEn = getCurrentLanguage() === 'en';

        if (pageKey === '__favorites') {
            const rows = ieFavorites.length
                ? ieFavorites.map((key) => {
                    const pages = getIEPages(getCurrentLanguage());
                    const label = pages[key]?.title || key;
                    return `
                        <div style="display:flex;justify-content:space-between;gap:8px;padding:6px;border-bottom:1px solid #ddd;">
                            <a href="#" onclick="setIEPage('${escapeNavigatorHTML(key)}');return false;">${escapeNavigatorHTML(label)}</a>
                            <button class="retro-btn" onclick="removeIEFavorite('${escapeNavigatorHTML(key)}')">Suppr.</button>
                        </div>
                    `;
                }).join('')
                : `<p>${isEn ? 'No favorites.' : 'Aucun favori.'}</p>`;
            return `<div style="padding:12px;"><h2 style="font-size:16px;color:#000080;">${isEn ? 'Favorites' : 'Favoris'}</h2><hr>${rows}</div>`;
        }

        if (pageKey === '__history') {
            const pages = getIEPages(getCurrentLanguage());
            const rows = [...ieHistory].reverse().slice(0, IE_MAX_HISTORY).map((key) => `
                <div style="padding:5px;border-bottom:1px solid #ddd;">
                    <a href="#" onclick="setIEPage('${escapeNavigatorHTML(key)}');return false;">${escapeNavigatorHTML(pages[key]?.title || getIEAddressForPage(key))}</a><br>
                    <span style="font-size:9px;color:#777;">${escapeNavigatorHTML(getIEAddressForPage(key))}</span>
                </div>
            `).join('');
            return `<div style="padding:12px;"><h2 style="font-size:16px;color:#000080;">${isEn ? 'History' : 'Historique'}</h2><hr>${rows || '—'}</div>`;
        }

        if (pageKey === '__help') {
            return `
                <div style="padding:12px;">
                    <h2 style="font-size:16px;color:#000080;">${isEn ? 'AQ-Navigator Help' : 'Aide AQ-Navigator'}</h2>
                    <hr>
                    <p>${isEn ? 'Use the address bar, Back/Forward buttons and the menus above.' : 'Utilise la barre d’adresse, les boutons Précédent/Suivant et les menus en haut.'}</p>
                    <p>${isEn ? 'Known local pages:' : 'Pages locales connues :'}</p>
                    <ul style="list-style:square;margin-left:20px;">
                        <li>http://www.jaj-records.com/home.html</li>
                        <li>http://www.jaj-records.com/releases/dual.html</li>
                    </ul>
                </div>
            `;
        }

        return `
            <div style="padding:12px;text-align:center;">
                <h2 style="font-size:16px;color:#000080;">AQ-Navigator</h2>
                <hr>
                <p>Aquerty AQ-NEO</p>
                <p style="font-size:10px;color:#666;">Version 2.0 // JAJ Records</p>
            </div>
        `;
    }

    function updateIENavButtons() {
        const backBtn = document.getElementById('ie-back-btn');
        const forwardBtn = document.getElementById('ie-forward-btn');
        if (backBtn) backBtn.disabled = ieHistoryIndex <= 0;
        if (forwardBtn) forwardBtn.disabled = ieHistoryIndex >= ieHistory.length - 1;
    }

    function setIENavigatorStatus(message) {
        const status = document.getElementById('ie-status');
        if (status) status.textContent = message || (getCurrentLanguage() === 'en' ? 'Done' : 'Terminé');
    }

    function setIEPage(pageKey, fromHistory = false) {
        const pages = getIEPages(getCurrentLanguage());
        if (pageKey === 'tempus' && !isTempusUnlocked) return;
        const isUtility = pageKey.startsWith('__');
        if (!pages[pageKey] && !isUtility) return;

        stopAudioInWindow('win-ie');

        if (!fromHistory) {
            ieHistory = ieHistory.slice(0, ieHistoryIndex + 1);
            ieHistory.push(pageKey);
            if (ieHistory.length > IE_MAX_HISTORY) ieHistory.shift();
            ieHistoryIndex = ieHistory.length - 1;
        }

        currentIEPage = pageKey;
        const address = getIEAddressForPage(pageKey);
        const input = document.getElementById('ie-address-input');
        if (input) input.value = address;

        const box = document.getElementById('ie-content-box');
        if (box) {
            box.innerHTML = isUtility ? renderIENavigatorUtilityPage(pageKey) : pages[pageKey].content;
            box.scrollTop = 0;
        }

        if (pageKey === 'tempus') addRecentItem('indexFiles');
        setIENavigatorStatus(getCurrentLanguage() === 'en' ? 'Done' : 'Terminé');
        updateIENavButtons();
        saveSessionState();
    }

    function navigateIEAddress(value) {
        const raw = String(value || '').trim();
        const key = pageKeyFromAddress(raw);
        if (key) {
            setIEPage(key);
            return;
        }

        if (/^https?:\/\//i.test(raw)) {
            setIENavigatorStatus(getCurrentLanguage() === 'en' ? 'Opening external address…' : 'Ouverture de l’adresse externe…');
            window.open(raw, '_blank', 'noopener,noreferrer');
            return;
        }

        const box = document.getElementById('ie-content-box');
        if (box) {
            box.innerHTML = `
                <div style="padding:35px 20px;font-family:Tahoma,Arial,sans-serif;">
                    <h2 style="font-size:16px;color:#000080;">${getCurrentLanguage() === 'en' ? 'The page cannot be displayed' : 'Impossible d’afficher la page'}</h2>
                    <hr>
                    <p>${getCurrentLanguage() === 'en' ? 'AQ-Navigator could not find this address.' : 'AQ-Navigator n’a pas trouvé cette adresse.'}</p>
                    <p style="font-family:'Courier New',monospace;">${escapeNavigatorHTML(raw)}</p>
                </div>
            `;
        }
        const input = document.getElementById('ie-address-input');
        if (input) input.value = raw;
        setIENavigatorStatus(getCurrentLanguage() === 'en' ? 'Page not found' : 'Page introuvable');
    }

    function goIEBack() {
        if (ieHistoryIndex <= 0) return;
        ieHistoryIndex -= 1;
        setIEPage(ieHistory[ieHistoryIndex], true);
    }

    function goIEForward() {
        if (ieHistoryIndex >= ieHistory.length - 1) return;
        ieHistoryIndex += 1;
        setIEPage(ieHistory[ieHistoryIndex], true);
    }

    function refreshIENavigator() {
        setIEPage(currentIEPage, true);
    }

    function toggleIEFavorite() {
        if (currentIEPage.startsWith('__')) return;
        const exists = ieFavorites.includes(currentIEPage);
        ieFavorites = exists
            ? ieFavorites.filter((item) => item !== currentIEPage)
            : [currentIEPage, ...ieFavorites].slice(0, 24);
        saveIEFavorites();
        setIENavigatorStatus(exists
            ? (getCurrentLanguage() === 'en' ? 'Favorite removed.' : 'Favori retiré.')
            : (getCurrentLanguage() === 'en' ? 'Favorite added.' : 'Favori ajouté.'));
    }

    function removeIEFavorite(pageKey) {
        ieFavorites = ieFavorites.filter((item) => item !== pageKey);
        saveIEFavorites();
        setIEPage('__favorites', true);
    }

    function closeNavigatorMenus() {
        document.querySelectorAll('#navigator-menubar .navigator-dropdown.open').forEach((panel) => panel.classList.remove('open'));
        document.querySelectorAll('#navigator-menubar .navigator-menu-button.active').forEach((button) => button.classList.remove('active'));
    }

    function toggleNavigatorMenu(name) {
        const panel = document.querySelector(`#navigator-menubar [data-menu-panel="${name}"]`);
        const button = document.querySelector(`#navigator-menubar [data-menu="${name}"]`);
        const wasOpen = panel?.classList.contains('open');
        closeNavigatorMenus();
        if (!wasOpen) {
            panel?.classList.add('open');
            button?.classList.add('active');
        }
    }

    function updateNavigatorFullscreenMenu() {
        const win = document.getElementById('win-ie');
        const item = document.getElementById('navigator-fullscreen-menu-item');
        if (!item || !win) return;
        const fullscreen = win.classList.contains('navigator-fullscreen');
        item.textContent = fullscreen
            ? (getCurrentLanguage() === 'en' ? 'Exit full screen' : 'Quitter le plein écran')
            : (getCurrentLanguage() === 'en' ? 'Full screen' : 'Plein écran');
    }

    function toggleNavigatorFullscreen(force) {
        const win = document.getElementById('win-ie');
        if (!win) return;
        const next = typeof force === 'boolean'
            ? force
            : !win.classList.contains('navigator-fullscreen');
        win.classList.toggle('navigator-fullscreen', next);
        updateNavigatorFullscreenMenu();
        setIENavigatorStatus(next
            ? (getCurrentLanguage() === 'en' ? 'Full screen' : 'Plein écran')
            : (getCurrentLanguage() === 'en' ? 'Windowed mode' : 'Mode fenêtré'));
    }

    async function navigatorMenuAction(action) {
        closeNavigatorMenus();

        if (action === 'home') return setIEPage('info');
        if (action === 'open') {
            document.getElementById('ie-address-input')?.focus();
            document.getElementById('ie-address-input')?.select();
            return;
        }
        if (action === 'print') return window.print();
        if (action === 'close') return closeWindow('win-ie', 'task-ie');
        if (action === 'refresh') return refreshIENavigator();
        if (action === 'stop') {
            stopAudioInWindow('win-ie');
            setIENavigatorStatus(getCurrentLanguage() === 'en' ? 'Stopped' : 'Arrêté');
            return;
        }
        if (action === 'fullscreen') {
            toggleNavigatorFullscreen();
            return;
        }
        if (action === 'favorite-add') return toggleIEFavorite();
        if (action === 'favorites') return setIEPage('__favorites');
        if (action === 'history') return setIEPage('__history');
        if (action === 'settings') return openWindow('win-settings', 'task-settings');
        if (action === 'help') return setIEPage('__help');
        if (action === 'about') return setIEPage('__about');

        if (action === 'select-all') {
            const box = document.getElementById('ie-content-box');
            const selection = window.getSelection();
            const range = document.createRange();
            if (box && selection) {
                range.selectNodeContents(box);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            return;
        }

        if (action === 'copy') {
            const text = window.getSelection()?.toString() || '';
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                setIENavigatorStatus(getCurrentLanguage() === 'en' ? 'Copied.' : 'Copié.');
            } catch (_) {
                document.execCommand?.('copy');
            }
        }
    }

    document.querySelectorAll('#navigator-menubar .navigator-menu-button').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleNavigatorMenu(button.dataset.menu);
        });
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#navigator-menubar')) closeNavigatorMenus();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('win-ie')?.classList.contains('navigator-fullscreen')) {
            toggleNavigatorFullscreen(false);
        }
    });

    document.getElementById('ie-address-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        navigateIEAddress(document.getElementById('ie-address-input')?.value || '');
    });

    // --- GESTION DES FENÊTRES ---
    function constrainWindowToDesktop(win) {
        if (!win) return;
        if (
            document.body.classList.contains('mobile-mode') ||
            document.body.classList.contains('desktop-lite-mode') ||
            win.classList.contains('player-night-fullscreen')
        ) return;

        const desktopRoot = document.getElementById('desktop');
        if (!desktopRoot || win.style.display === 'none') return;

        const availableWidth = Math.max(250, desktopRoot.clientWidth - 8);
        const availableHeight = Math.max(150, desktopRoot.clientHeight - 8);

        if (win.offsetWidth > availableWidth) win.style.width = availableWidth + 'px';
        if (win.offsetHeight > availableHeight) win.style.height = availableHeight + 'px';

        const maxLeft = Math.max(0, desktopRoot.clientWidth - win.offsetWidth);
        const maxTop = Math.max(0, desktopRoot.clientHeight - win.offsetHeight);
        const left = Number.isFinite(parseFloat(win.style.left)) ? parseFloat(win.style.left) : win.offsetLeft;
        const top = Number.isFinite(parseFloat(win.style.top)) ? parseFloat(win.style.top) : win.offsetTop;

        win.style.left = Math.max(0, Math.min(maxLeft, left)) + 'px';
        win.style.top = Math.max(0, Math.min(maxTop, top)) + 'px';
    }

    function constrainVisibleWindows() {
        document.querySelectorAll('.window').forEach((win) => {
            if (win.style.display !== 'none') constrainWindowToDesktop(win);
        });
    }

    function stopAudioInWindow(winId) {
        const win = document.getElementById(winId);
        if (!win) return;
        win.querySelectorAll('audio').forEach((audioEl) => {
            audioEl.pause();
            audioEl.currentTime = 0;
        });
    }

    function openWindow(winId, taskId) {
        if (isPoweredOff) return;
        const win = document.getElementById(winId);
        const task = document.getElementById(taskId);
        if (!isRestoringSession) playSystemSound('open');
        win.style.display = 'block';
        task.style.display = 'block';
        constrainWindowToDesktop(win);
        document.querySelectorAll('.window').forEach(w => w.style.zIndex = 10);
        if (document.body.classList.contains('mobile-mode') && !document.body.classList.contains('mobile-lite-mode')) {
            document.querySelectorAll('.window').forEach((w) => {
                if (w.id !== winId) w.style.display = 'none';
            });
        }
        win.style.zIndex = 100;
        document.querySelectorAll('.task-item').forEach(t => t.classList.remove('active'));
        task.classList.add('active');
        const winToRecent = {
            'win-player': 'player',
            'win-ie': 'internet',
            'win-tempus': 'tempusFile',
            'win-trash': 'trash',
            'win-settings': 'settings',
            'win-logs': 'logs',
            'win-acc': 'commandCenter',
            'win-ms': 'minesweeper',
            'win-mail': 'mail',
            'win-myspace': 'myspace'
        };
        if (!isRestoringSession) {
            if (winToRecent[winId]) addRecentItem(winToRecent[winId]);
            if (winId === 'win-player') triggerContextualPopup('openPlayer');
            if (winId === 'win-ie') triggerContextualPopup('openInternet');
            if (winId === 'win-tempus') triggerContextualPopup('openTempus');
            if (winId === 'win-myspace') window.dispatchEvent(new Event('aq:myspace-open'));
            if (winId === 'win-acc') {
                const frame = document.querySelector('#win-acc iframe');
                frame?.contentWindow?.postMessage({ type: 'aq-acc-open' }, window.location.origin);
            }
        }
        if (!isRestoringSession) addSystemLog(`Fenetre ouverte: ${winId}`);
        if (winId === 'win-player') updatePlayerNightEffects();
        updateMobilePortNav();
        saveSessionState();
    }

    function closeWindow(winId, taskId) {
        playSystemSound('close');
        stopAudioInWindow(winId);
        document.getElementById(winId).style.display = 'none';
        document.getElementById(taskId).style.display = 'none';
        if (winId === 'win-player') updatePlayerNightEffects();
        updateMobilePortNav();
        addSystemLog(`Fenetre fermee: ${winId}`);
        saveSessionState();
    }

    function toggleWindow(winId, taskId) {
        if (isPoweredOff) return;
        const win = document.getElementById(winId);
        const task = document.getElementById(taskId);
        if (win.style.display === 'none') {
            win.style.display = 'block';
            constrainWindowToDesktop(win);
            task.classList.add('active');
            document.querySelectorAll('.window').forEach(w => w.style.zIndex = 10);
            win.style.zIndex = 100;
            if (winId === 'win-player') updatePlayerNightEffects();
        } else {
            if (win.style.zIndex != 100) {
                document.querySelectorAll('.window').forEach(w => w.style.zIndex = 10);
                win.style.zIndex = 100;
                document.querySelectorAll('.task-item').forEach(t => t.classList.remove('active'));
                task.classList.add('active');
            } else {
                playSystemSound('close');
                stopAudioInWindow(winId);
                win.style.display = 'none';
                task.classList.remove('active');
                if (winId === 'win-player') updatePlayerNightEffects();
                addSystemLog(`Fenetre reduite: ${winId}`);
            }
        }
        updateMobilePortNav();
        saveSessionState();
    }

    document.querySelectorAll('.window').forEach(win => {
        win.addEventListener('mousedown', () => {
            document.querySelectorAll('.window').forEach(w => w.style.zIndex = 10);
            win.style.zIndex = 100;
            document.querySelectorAll('.task-item').forEach(t => t.classList.remove('active'));
            let taskId = win.id.replace('win-', 'task-');
            let taskEl = document.getElementById(taskId);
            if(taskEl) taskEl.classList.add('active');
        });
        win.addEventListener('mouseup', () => {
            constrainWindowToDesktop(win);
            saveSessionState();
        });
    });

    // --- DRAG AND DROP ---
    function makeDraggable(el) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const titleBar = el.querySelector(".title-bar");
        titleBar.onmousedown = (e) => {
            e = e || window.event;
            if (e.target.closest('button, input, select, textarea, a')) return;
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
                constrainWindowToDesktop(el);
                saveSessionState();
            };
            document.onmousemove = (e) => {
                e = e || window.event;
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;

                const desktopRoot = document.getElementById('desktop');
                const nextLeft = el.offsetLeft - pos1;
                const nextTop = el.offsetTop - pos2;
                const maxLeft = Math.max(0, (desktopRoot?.clientWidth || window.innerWidth) - el.offsetWidth);
                const maxTop = Math.max(0, (desktopRoot?.clientHeight || window.innerHeight) - el.offsetHeight);

                el.style.left = Math.max(0, Math.min(maxLeft, nextLeft)) + "px";
                el.style.top = Math.max(0, Math.min(maxTop, nextTop)) + "px";
            };
        };
    }
    document.querySelectorAll(".window").forEach(makeDraggable);

    window.addEventListener('jaj:session-changed', () => {
        const frame = document.querySelector('#win-acc iframe');
        frame?.contentWindow?.postMessage({ type: 'aq-session-changed' }, window.location.origin);
    });

    // --- LOGIQUE MOT DE PASSE (EASTER EGG) ---
    function checkTempusPwd() {
        if (isPoweredOff) return;
        const pwd = document.getElementById('tempus-pwd').value;
        const msg = document.getElementById('tempus-msg');
        
        // Le mdp est NdZkLa
        if(pwd.toLowerCase() === 'ndzkla') {
            msg.style.color = '#0054e3'; // Bleu style XP
            msg.innerText = tUI().tempusUnlockPending;
            playSystemSound('open');
            
            setTimeout(() => {
                // Ferme la fenêtre du mdp et nettoie
                closeWindow('win-tempus', 'task-tempus');
                document.getElementById('tempus-pwd').value = '';
                msg.innerText = '';
                
                // Ouvre IE puis navigue vers la page tempus_perit dans la meme fenetre
                openWindow('win-ie', 'task-ie');
                isTempusUnlocked = true;
                document.getElementById('ie-tempus-btn').style.display = 'inline-block';
                updateWallpaperUnlockState();
                applyLanguage(getCurrentLanguage());
                saveState();
                setIEPage('tempus');
                triggerContextualPopup('unlockTempus');
                saveSessionState();
            }, 5000);
        } else {
            msg.style.color = '#e81123'; // Rouge erreur
            msg.innerText = 'Erreur : Mot de passe incorrect.';
            playSystemSound('error');
            triggerContextualPopup('wrongPassword');
        }
    }

    // Autoriser la touche "Entrée" pour valider le mot de passe
    document.getElementById('tempus-pwd').addEventListener("keypress", function(event) {
        if (event.key === "Enter") {
            event.preventDefault();
            checkTempusPwd();
        }
    });

    loadPersistedData();
    const persistedState = loadState();
    isTempusUnlocked = persistedState.isTempusUnlocked;
    isPoweredOff = persistedState.isPoweredOff;
    if (isTempusUnlocked) {
        document.getElementById('ie-tempus-btn').style.display = 'inline-block';
    }
    applyVisualSettings();
    setupMenuEvents();
    bindDesktopIconAnimations();
    applyDefaultDesktopLayoutIfMissing();
    setupDesktopIconActivation();
    setupActivityListeners();
    renderRecents();

    const hasSavedSession = !!localStorage.getItem(SESSION_KEY);
    if (hasSavedSession) restoreSessionState();

    if (isPoweredOff) {
        // A reload while AQ-NEO is off must restore the FINAL powered-off screen,
        // not the transient "Arrêt... Préparation" state from the markup.
        stopBootSound();
        const boot = document.getElementById('boot-screen');
        if (boot) boot.style.display = 'none';
        showPoweredOffScreen();
        markBootComplete();
    } else {
        runBootSequence();
        restartPopupLoop();
    }

    // Initialiser la page IE d'accueil au chargement
    if (!hasSavedSession) setIEPage('info');

    // --- PLAYLIST ---
    // Dual est maintenant une archive sortie : plus aucun verrou temporel.
    // Les masters absents du repo sont marques "unavailable" au lieu d'etre faux-verrouilles.
    let myTracks = [
        { title: "Just Not Enough For It (Remastered)", file: "09.mp3", status: "unavailable" },
        { title: "Feelings Of Nostalgia", file: "01.mp3", status: "full" },
        { title: "The Lobby", file: "02.mp3", status: "unavailable" },
        { title: "LRJR_3", file: "03.mp3", status: "full" },
        { title: "Reverie", file: "04_prev.mp3", status: "snippet" },
        { title: "Warsaw", file: "05.mp3", status: "full" },
        { title: "Just Not Enough For It (Speech Intro)", file: "11.mp3", status: "unavailable" },
        { title: "LRJR_1 / Figured Out", file: "15_prev.mp3", status: "snippet" },
        { title: "Cloudy Awakening", file: "06.mp3", status: "unavailable" },
        { title: "LRJR_2", file: "07.mp3", status: "full" },
        { title: "The Red Willow Hotel's Lounge", file: "08.mp3", status: "full" },
        { title: "Inconsistent Use Of Tabs", file: "14.mp3", status: "unavailable" },
        { title: "The Emergency", file: "10.mp3", status: "full" },
        { title: "Huxley", file: "16.mp3", status: "unavailable" },
        { title: "LRJR_4", file: "12.mp3", status: "full" },
        { title: "Loosing", file: "13.mp3", status: "full" },
        { title: "Feelings Of Nostalgia (Alt)", file: "17.mp3", status: "unavailable" },
        { title: "LRJR_5 / Gender Mess", file: "18.mp3", status: "unavailable" }
    ];

    const playlist = document.getElementById('playlist');
    const player = document.getElementById('audio-player');
    const statusDisplay = document.getElementById('now-playing');
    const seekBar = document.getElementById('seek-bar');
    const seekBarContainer = document.getElementById('seek-bar-container');
    const volumeSlider = document.getElementById('volume-slider');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatOneBtn = document.getElementById('repeat-one-btn');
    const playerWindow = document.getElementById('win-player');
    const playerSkinSelect = document.getElementById('player-skin-select');
    const playerNightModeToggle = document.getElementById('player-night-mode');
    const playerSettingsPanel = document.getElementById('player-settings-panel');
    let currentTrackIndex = -1;
    let isShuffleEnabled = false;
    let isRepeatOneEnabled = false;
    let playerSkin = 'classic';
    let isPlayerNightMode = false;
    let lastSavedPlayerSecond = -1;

    function savePlayerState() {
        const payload = {
            currentTrackIndex,
            currentTime: Number.isFinite(player.currentTime) ? player.currentTime : 0,
            volume: player.volume,
            isShuffleEnabled,
            isRepeatOneEnabled,
            playerSkin,
            isPlayerNightMode
        };
        localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(payload));
    }

    function loadPlayerState() {
        try {
            const saved = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || '{}');
            return {
                currentTrackIndex: Number.isInteger(saved.currentTrackIndex) ? saved.currentTrackIndex : -1,
                currentTime: typeof saved.currentTime === 'number' ? saved.currentTime : 0,
                volume: typeof saved.volume === 'number' ? saved.volume : 0.3,
                isShuffleEnabled: !!saved.isShuffleEnabled,
                isRepeatOneEnabled: !!saved.isRepeatOneEnabled,
                playerSkin: typeof saved.playerSkin === 'string' ? saved.playerSkin : 'classic',
                isPlayerNightMode: !!saved.isPlayerNightMode
            };
        } catch (_) {
            return {
                currentTrackIndex: -1,
                currentTime: 0,
                volume: 0.3,
                isShuffleEnabled: false,
                isRepeatOneEnabled: false,
                playerSkin: 'classic',
                isPlayerNightMode: false
            };
        }
    }

    function applyPlayerSkin(skin) {
        playerSkin = skin;
        playerWindow.classList.remove('player-skin-classic', 'player-skin-dark', 'player-skin-ice', 'player-skin-rose');
        if (skin === 'dark') {
            playerWindow.classList.add('player-skin-dark');
        } else if (skin === 'ice') {
            playerWindow.classList.add('player-skin-ice');
        } else if (skin === 'rose') {
            playerWindow.classList.add('player-skin-rose');
        } else {
            playerWindow.classList.add('player-skin-classic');
        }
        playerSkinSelect.value = playerSkin;
    }

    function updatePlayerNightEffects() {
        const isPlayerVisible = playerWindow.style.display === 'block';
        const shouldApply = isPlayerNightMode && isPlayerVisible;
        document.body.classList.toggle('player-night-mode', shouldApply);
        playerWindow.classList.toggle('player-night-fullscreen', shouldApply);
        const exitBtn = document.getElementById('player-exit-night-btn');
        if (exitBtn) exitBtn.style.display = isPlayerNightMode ? '' : 'none';
    }

    function setPlayerNightMode(enabled) {
        if (document.body.classList.contains('mobile-mode')) {
            isPlayerNightMode = false;
            playerNightModeToggle.checked = false;
            updatePlayerNightEffects();
            return;
        }
        isPlayerNightMode = enabled;
        playerNightModeToggle.checked = enabled;
        updatePlayerNightEffects();
    }

    function togglePlayerSettingsPanel() {
        playerSettingsPanel.classList.toggle('open');
        playSystemSound('click');
    }

    function updateModeButtons() {
        shuffleBtn.innerText = isShuffleEnabled ? 'SHUFFLE ON' : 'SHUFFLE OFF';
        repeatOneBtn.innerText = isRepeatOneEnabled ? 'REPEAT1 ON' : 'REPEAT1 OFF';
        shuffleBtn.classList.toggle('active', isShuffleEnabled);
        repeatOneBtn.classList.toggle('active', isRepeatOneEnabled);
    }

    function toggleShuffle() {
        isShuffleEnabled = !isShuffleEnabled;
        updateModeButtons();
        playSystemSound('click');
        savePlayerState();
        notifyPersistenceChange('player-preferences');
    }

    function toggleRepeatOne() {
        isRepeatOneEnabled = !isRepeatOneEnabled;
        updateModeButtons();
        playSystemSound('click');
        savePlayerState();
        notifyPersistenceChange('player-preferences');
    }

    function getPlayableTrackIndices() {
        return myTracks
            .map((track, index) => ({ track, index }))
            .filter((entry) => entry.track.status !== 'locked' && entry.track.status !== 'unavailable')
            .map((entry) => entry.index);
    }

    function getTrackFolder(track) {
        if (track.sourceFolder === 'locked') return 'medias/musique/locked/';
        if (track.status === 'snippet') return 'medias/musique/snippets/';
        return 'medias/musique/sorti/';
    }

    function isMobileLiteMode() {
        return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
    }

    function isMobileDeviceProfile() {
        const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
        const touchCapable = navigator.maxTouchPoints > 0;
        const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent || '');
        const narrowViewport = window.innerWidth <= 1024;
        return (hasCoarsePointer || touchCapable || mobileUA) && narrowViewport;
    }

    function applyClientMode() {
        const forced = appSettings.clientMode || 'auto';
        const autoMobileMode = isMobileLiteMode() || isMobileDeviceProfile();
        const mobileMode = forced === 'mobile' ? true : (forced === 'desktop' ? false : autoMobileMode);
        const liteEnabled = !!appSettings.liteEnabled;
        const liteMode = liteEnabled && mobileMode;
        const desktopLiteMode = liteEnabled && !mobileMode;
        document.body.classList.toggle('mobile-mode', mobileMode);
        document.body.classList.toggle('mobile-lite-mode', liteMode);
        document.body.classList.toggle('desktop-lite-mode', desktopLiteMode);
        const fab = document.getElementById('lite-exit-fab');
        if (fab) fab.style.display = desktopLiteMode ? 'block' : 'none';
        if (mobileMode && !liteMode) {
            updateMobilePortNav();
        }
        if (desktopLiteMode) {
            openWindow('win-player', 'task-player');
        }
        applyMobileRuntimeConstraints(mobileMode);
    }

    function applyMobileRuntimeConstraints(isMobile) {
        if (!isMobile) return;
        // Mobile UX: no random popups / no screensaver
        if (popupLoopTimer) { clearTimeout(popupLoopTimer); popupLoopTimer = null; }
        closeSystemPopup();
        hideScreensaver();
        if (screensaverTimer) { clearTimeout(screensaverTimer); screensaverTimer = null; }
    }

    function updateMobilePortNav() {
        const navButtons = document.querySelectorAll('#mobile-port-nav .mobile-port-btn');
        navButtons.forEach((btn) => {
            const winId = btn.getAttribute('data-open-win');
            const win = winId ? document.getElementById(winId) : null;
            const isActive = !!(win && win.style.display === 'block');
            btn.classList.toggle('active', isActive);
        });
    }

    function syncMobileNowPlaying() {
        const target = document.getElementById('mobile-now-playing');
        if (!target) return;
        target.textContent = statusDisplay.innerText || (getCurrentLanguage() === 'en' ? 'READY' : 'PRÊT');
    }

    function syncMobileQuickSettings() {
        const mobileSounds = document.getElementById('mobile-setting-sounds');
        const mobileVol = document.getElementById('mobile-setting-volume');
        const mobileLang = document.getElementById('mobile-setting-language');
        if (mobileSounds) mobileSounds.checked = !!appSettings.systemSounds;
        if (mobileVol) mobileVol.value = String(appSettings.masterVolume ?? 0.6);
        if (mobileLang) mobileLang.value = appSettings.desktopLanguage || 'fr';
    }

    function syncMobileTransportPlayButton() {
        const btn = document.querySelector('#win-player #mobile-transport button[title="Play/Pause"]');
        if (!btn) return;
        const isEn = getCurrentLanguage() === 'en';
        btn.textContent = player && !player.paused ? (isEn ? 'PAUSE' : 'PAUSE') : (isEn ? 'PLAY' : 'PLAY');
    }

    function togglePlayPause() {
        if (player && !player.paused) pauseAudio();
        else playAudio();
        syncMobileTransportPlayButton();
    }

    function toggleMobileVolumePanel(forceState) {
        const panel = document.getElementById('mobile-volume-panel');
        if (!panel) return;
        const next = typeof forceState === 'boolean' ? forceState : !panel.classList.contains('open');
        panel.classList.toggle('open', next);
    }

    function syncMobileVolumePanel() {
        const slider = document.getElementById('mobile-volume-slider');
        if (!slider) return;
        const v = Number.isFinite(player.volume) ? player.volume : (appSettings.masterVolume ?? 0.6);
        slider.value = String(v);
    }

    function renderMobileTrackList() {
        const list = document.getElementById('mobile-track-list');
        if (!list) return;
        list.innerHTML = '';
        myTracks.forEach((track, index) => {
            const row = document.createElement('div');
            row.className = 'mobile-track-item';
            if (track.status === 'locked') row.classList.add('locked');
            if (track.status === 'unavailable') row.classList.add('unavailable');
            if (index === currentTrackIndex) row.classList.add('active');
            const trackNum = String(index + 1).padStart(2, '0');
            const lockedTag = getCurrentLanguage() === 'en' ? '[LOCKED]' : '[LOCK]';
            const snippetTag = getCurrentLanguage() === 'en' ? '[PREVIEW]' : '[PREVIEW]';
            const unavailableTag = getCurrentLanguage() === 'en' ? '[ARCHIVE N/A]' : '[ARCHIVE INDISPO]';
            const tag = track.status === 'locked'
                ? ` ${lockedTag}`
                : (track.status === 'snippet'
                    ? ` ${snippetTag}`
                    : (track.status === 'unavailable' ? ` ${unavailableTag}` : ''));
            row.textContent = `${trackNum}. ${track.title}${tag}`;
            row.addEventListener('click', () => {
                if (track.status === 'locked' || track.status === 'unavailable') return;
                playTrackAtIndex(index, true);
                renderMobileTrackList();
            });
            list.appendChild(row);
        });
    }

    function setupMobileLite() {
        applyClientMode();
        window.addEventListener('resize', () => {
            applyClientMode();
            requestAnimationFrame(constrainVisibleWindows);
        });
        document.querySelectorAll('#mobile-port-nav .mobile-port-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const winId = btn.getAttribute('data-open-win');
                const taskId = btn.getAttribute('data-open-task');
                if (!winId || !taskId) return;
                openWindow(winId, taskId);
            });
        });
        const prevBtn = document.getElementById('mobile-prev-btn');
        const playBtn = document.getElementById('mobile-play-btn');
        const nextBtn = document.getElementById('mobile-next-btn');
        const soundsInput = document.getElementById('mobile-setting-sounds');
        const volInput = document.getElementById('mobile-setting-volume');
        const langInput = document.getElementById('mobile-setting-language');
        const mobileVolSlider = document.getElementById('mobile-volume-slider');

        if (prevBtn) prevBtn.addEventListener('click', () => { prevTrack(); renderMobileTrackList(); });
        if (playBtn) playBtn.addEventListener('click', () => { if (player.paused) playAudio(); else pauseAudio(); syncMobileNowPlaying(); });
        if (nextBtn) nextBtn.addEventListener('click', () => { nextTrack(); renderMobileTrackList(); });

        if (soundsInput) soundsInput.addEventListener('change', (e) => updateSetting('systemSounds', e.target.checked));
        if (volInput) volInput.addEventListener('input', (e) => {
            const v = Number(e.target.value);
            player.volume = v;
            updateSetting('masterVolume', v, false);
            saveSettings();
            savePlayerState();
        });
        if (mobileVolSlider) mobileVolSlider.addEventListener('input', (e) => {
            const v = Number(e.target.value);
            player.volume = v;
            updateSetting('masterVolume', v, false);
            saveSettings();
            savePlayerState();
        });
        if (langInput) langInput.addEventListener('change', (e) => {
            updateSetting('desktopLanguage', e.target.value);
            applyLanguage(e.target.value);
            syncMobileQuickSettings();
        });
        const exitLiteBtn = document.getElementById('mobile-exit-lite-btn');
        if (exitLiteBtn) exitLiteBtn.addEventListener('click', () => {
            updateSetting('liteEnabled', false);
            applyClientMode();
        });
        const fab = document.getElementById('lite-exit-fab');
        if (fab) fab.addEventListener('click', () => {
            updateSetting('liteEnabled', false);
            applyClientMode();
        });
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('mobile-volume-panel');
            if (!panel || !panel.classList.contains('open')) return;
            if (panel.contains(e.target)) return;
            if (e.target.closest('#win-player #mobile-transport')) return;
            toggleMobileVolumePanel(false);
        });

        syncMobileQuickSettings();
        syncMobileNowPlaying();
        syncMobileTransportPlayButton();
        syncMobileVolumePanel();
        renderMobileTrackList();
    }

    function playTrackAtIndex(index, shouldNotify = true) {
        const track = myTracks[index];
        if (!track || track.status === 'locked' || track.status === 'unavailable') return;
        const folder = getTrackFolder(track);
        currentTrackIndex = index;
        document.querySelectorAll('#playlist li').forEach((el, liIndex) => {
            el.classList.toggle('active', liIndex === index);
        });
        player.src = folder + track.file;
        player.play();
        statusDisplay.innerText = "PLAYING: " + track.title.toUpperCase();
        addSystemLog(`Lecture piste: ${track.title}`);
        if (shouldNotify) triggerContextualPopup('playTrack');
        savePlayerState();
    }

    function nextTrack() {
        const playable = getPlayableTrackIndices();
        if (playable.length === 0) return;
        if (currentTrackIndex === -1) {
            playTrackAtIndex(playable[0], true);
            return;
        }
        if (isShuffleEnabled) {
            if (playable.length === 1) {
                playTrackAtIndex(playable[0], true);
                return;
            }
            const candidates = playable.filter((index) => index !== currentTrackIndex);
            const randomIndex = candidates[Math.floor(Math.random() * candidates.length)];
            playTrackAtIndex(randomIndex, true);
            return;
        }
        const currentPlayableIndex = playable.indexOf(currentTrackIndex);
        const nextPlayableIndex = currentPlayableIndex === -1
            ? 0
            : (currentPlayableIndex + 1) % playable.length;
        playTrackAtIndex(playable[nextPlayableIndex], true);
    }

    function prevTrack() {
        const playable = getPlayableTrackIndices();
        if (playable.length === 0) return;
        if (currentTrackIndex === -1) {
            playTrackAtIndex(playable[playable.length - 1], true);
            return;
        }
        const currentPlayableIndex = playable.indexOf(currentTrackIndex);
        const prevPlayableIndex = currentPlayableIndex === -1
            ? playable.length - 1
            : (currentPlayableIndex - 1 + playable.length) % playable.length;
        playTrackAtIndex(playable[prevPlayableIndex], true);
    }

    function renderPlaylist() {
        playlist.innerHTML = '';
        myTracks.forEach((track, index) => {
            let li = document.createElement('li');
            let trackNum = (index + 1).toString().padStart(2, '0');
            if (track.status !== 'locked' && track.status !== 'unavailable') {
                let folder = getTrackFolder(track);
                li.setAttribute('data-src', folder + track.file);
            }
            li.innerHTML = `<span>${trackNum}. ${track.title}</span>` +
               (track.status === 'locked' ? ' <span style="color:#ff4444; font-size:9px;">[CHIFFRE]</span>' : '') +
               (track.status === 'snippet' ? ' <span style="color:#245edb; font-size:9px;">[PREVIEW]</span>' : '') +
               (track.status === 'unavailable' ? ' <span style="color:#777; font-size:9px;">[ARCHIVE INDISPO]</span>' : '');
            if (track.status === 'locked') li.className = "locked";
            if (track.status === 'unavailable') li.className = "unavailable";
            li.onclick = () => {
                if (track.status === 'locked' || track.status === 'unavailable') return;
                playTrackAtIndex(index, true);
            };
            playlist.appendChild(li);
        });
        renderMobileTrackList();
    }
    renderPlaylist();

    const savedPlayerState = loadPlayerState();
    isShuffleEnabled = savedPlayerState.isShuffleEnabled;
    isRepeatOneEnabled = savedPlayerState.isRepeatOneEnabled;
    applyPlayerSkin(savedPlayerState.playerSkin);
    setPlayerNightMode(savedPlayerState.isPlayerNightMode);
    player.volume = savedPlayerState.volume;
    volumeSlider.value = String(savedPlayerState.volume);
    updateModeButtons();

    if (savedPlayerState.currentTrackIndex >= 0) {
        const playable = getPlayableTrackIndices();
        if (playable.includes(savedPlayerState.currentTrackIndex)) {
            const track = myTracks[savedPlayerState.currentTrackIndex];
            const folder = getTrackFolder(track);
            currentTrackIndex = savedPlayerState.currentTrackIndex;
            player.src = folder + track.file;
            document.querySelectorAll('#playlist li').forEach((el, liIndex) => {
                el.classList.toggle('active', liIndex === currentTrackIndex);
            });
            statusDisplay.innerText = "PRET: " + track.title.toUpperCase();
            player.addEventListener('loadedmetadata', function restoreTimeOnce() {
                if (savedPlayerState.currentTime > 0 && savedPlayerState.currentTime < player.duration) {
                    player.currentTime = savedPlayerState.currentTime;
                    seekBar.style.width = (player.currentTime / player.duration * 100) + "%";
                }
                player.removeEventListener('loadedmetadata', restoreTimeOnce);
            });
        }
    }

    volumeSlider.oninput = () => {
        player.volume = Number(volumeSlider.value);
        savePlayerState();
        notifyPersistenceChange('player-preferences');
    };
    seekBarContainer.addEventListener('click', (e) => {
        if (!player.duration) return;
        const rect = seekBarContainer.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        player.currentTime = ratio * player.duration;
        seekBar.style.width = (ratio * 100) + "%";
        savePlayerState();
    });
    playerSkinSelect.addEventListener('change', (e) => {
        applyPlayerSkin(e.target.value);
        savePlayerState();
        notifyPersistenceChange('player-preferences');
        playSystemSound('click');
    });
    playerNightModeToggle.addEventListener('change', (e) => {
        setPlayerNightMode(e.target.checked);
        savePlayerState();
        notifyPersistenceChange('player-preferences');
        playSystemSound('click');
    });
    document.addEventListener('click', (e) => {
        if (!playerSettingsPanel.classList.contains('open')) return;
        if (playerSettingsPanel.contains(e.target)) return;
        if (e.target.closest('#win-player .title-bar .retro-btn')) return;
        playerSettingsPanel.classList.remove('open');
    });
    function playAudio() {
        if (player.src) {
            player.play();
            savePlayerState();
            return;
        }
        const playable = getPlayableTrackIndices();
        if (playable.length > 0) playTrackAtIndex(playable[0], true);
    }
    function pauseAudio() { player.pause(); savePlayerState(); }
    function stopAudio() { player.pause(); player.currentTime = 0; statusDisplay.innerText = "ARRETE"; seekBar.style.width = "0%"; savePlayerState(); }
    player.ontimeupdate = () => {
        if(player.duration) seekBar.style.width = (player.currentTime / player.duration * 100) + "%";
        const rounded = Math.floor(player.currentTime || 0);
        if (rounded !== lastSavedPlayerSecond) {
            lastSavedPlayerSecond = rounded;
            savePlayerState();
        }
    };
    player.onended = () => {
        if (isRepeatOneEnabled && currentTrackIndex !== -1) {
            playTrackAtIndex(currentTrackIndex, false);
            return;
        }
        nextTrack();
        syncMobileNowPlaying();
    };
    player.addEventListener('pause', () => { savePlayerState(); syncMobileNowPlaying(); syncMobileTransportPlayButton(); syncMobileVolumePanel(); renderMobileTrackList(); });
    player.addEventListener('play', () => { syncMobileNowPlaying(); syncMobileTransportPlayButton(); syncMobileVolumePanel(); renderMobileTrackList(); });
    window.addEventListener('beforeunload', savePlayerState);

    // --- AQ-NEO PROFILE PERSISTENCE BRIDGE (Phase 3) ---
    function readJSONStorage(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function getCloudPlayerPreferences() {
        return {
            volume: Number.isFinite(player.volume) ? player.volume : 0.3,
            isShuffleEnabled: !!isShuffleEnabled,
            isRepeatOneEnabled: !!isRepeatOneEnabled,
            playerSkin: typeof playerSkin === 'string' ? playerSkin : 'classic',
            isPlayerNightMode: !!isPlayerNightMode
        };
    }

    function exportAQProfileSnapshot() {
        return {
            version: 1,
            settings: { ...appSettings },
            recents: [...recentItems],
            state: {
                isTempusUnlocked: !!isTempusUnlocked
            },
            desktopLayout: loadDesktopLayout(),
            session: readJSONStorage(SESSION_KEY, { windows: [], currentIEPage: 'info' }),
            player: getCloudPlayerPreferences()
        };
    }

    function getDefaultAQProfileSnapshot() {
        return {
            version: 1,
            settings: { ...defaultSettings },
            recents: [],
            state: { isTempusUnlocked: false },
            desktopLayout: JSON.parse(JSON.stringify(DEFAULT_DESKTOP_LAYOUT)),
            session: { windows: [], currentIEPage: 'info' },
            player: {
                volume: 0.3,
                isShuffleEnabled: false,
                isRepeatOneEnabled: false,
                playerSkin: 'classic',
                isPlayerNightMode: false
            }
        };
    }

    function resetWindowsBeforeSessionRestore() {
        document.querySelectorAll('.window').forEach((win) => {
            win.style.display = 'none';
            win.style.zIndex = 10;
        });
        document.querySelectorAll('.task-item').forEach((task) => {
            task.style.display = 'none';
            task.classList.remove('active');
        });
    }

    function applyAQProfileSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;

        isApplyingPersistenceSnapshot = true;
        try {
            const safeSettings = snapshot.settings && typeof snapshot.settings === 'object'
                ? snapshot.settings
                : {};
            appSettings = { ...defaultSettings, ...safeSettings };
            recentItems = Array.isArray(snapshot.recents)
                ? snapshot.recents.filter((item) => typeof item === 'string').slice(0, MAX_RECENTS)
                : [];

            isTempusUnlocked = !!snapshot.state?.isTempusUnlocked;

            const desktopLayout = snapshot.desktopLayout && typeof snapshot.desktopLayout === 'object'
                ? snapshot.desktopLayout
                : DEFAULT_DESKTOP_LAYOUT;
            const session = snapshot.session && typeof snapshot.session === 'object'
                ? snapshot.session
                : { windows: [], currentIEPage: 'info' };
            const playerPrefs = snapshot.player && typeof snapshot.player === 'object'
                ? snapshot.player
                : {};

            localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
            localStorage.setItem(RECENTS_KEY, JSON.stringify(recentItems));
            localStorage.setItem(STATE_KEY, JSON.stringify({
                isTempusUnlocked,
                isPoweredOff: false
            }));
            localStorage.setItem(DESKTOP_LAYOUT_KEY, JSON.stringify(desktopLayout));
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));

            const currentPlayerState = loadPlayerState();
            localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify({
                ...currentPlayerState,
                volume: typeof playerPrefs.volume === 'number' ? playerPrefs.volume : 0.3,
                isShuffleEnabled: !!playerPrefs.isShuffleEnabled,
                isRepeatOneEnabled: !!playerPrefs.isRepeatOneEnabled,
                playerSkin: typeof playerPrefs.playerSkin === 'string' ? playerPrefs.playerSkin : 'classic',
                isPlayerNightMode: !!playerPrefs.isPlayerNightMode
            }));

            isPoweredOff = false;
            document.getElementById('power-screen')?.classList.remove('show');
            document.getElementById('ie-tempus-btn').style.display = isTempusUnlocked ? 'inline-block' : 'none';

            applyVisualSettings();
            updateWallpaperUnlockState();
            applyWallpaper();
            applyDefaultDesktopLayoutIfMissing();
            renderRecents();

            isShuffleEnabled = !!playerPrefs.isShuffleEnabled;
            isRepeatOneEnabled = !!playerPrefs.isRepeatOneEnabled;
            applyPlayerSkin(typeof playerPrefs.playerSkin === 'string' ? playerPrefs.playerSkin : 'classic');
            setPlayerNightMode(!!playerPrefs.isPlayerNightMode);
            player.volume = typeof playerPrefs.volume === 'number'
                ? Math.max(0, Math.min(1, playerPrefs.volume))
                : 0.3;
            volumeSlider.value = String(player.volume);
            updateModeButtons();

            resetWindowsBeforeSessionRestore();
            currentIEPage = 'info';
            ieHistory = ['info'];
            ieHistoryIndex = 0;
            setIEPage('info', true);
            restoreSessionState();
            updateMobilePortNav();
            syncMobileQuickSettings();
            syncMobileNowPlaying();
            syncMobileVolumePanel();

            return true;
        } finally {
            isApplyingPersistenceSnapshot = false;
        }
    }

    window.AQPersistence = {
        exportSnapshot: exportAQProfileSnapshot,
        applySnapshot: applyAQProfileSnapshot,
        getDefaultSnapshot: getDefaultAQProfileSnapshot
    };

    // --- HORLOGE BARRE DES TÂCHES ---
    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        document.getElementById('clock-display').innerText = `${hours}:${minutes}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // --- MINESWEEPER ---
    const msGridEl = document.getElementById('ms-grid');
    const msMinesEl = document.getElementById('ms-mines');
    const msTimeEl = document.getElementById('ms-time');
    const msFaceEl = document.getElementById('ms-face');
    const msDifficultyEl = document.getElementById('ms-difficulty');

    let msRows = 9;
    let msCols = 9;
    let msMines = 10;
    let msBoard = [];
    let msRevealedCount = 0;
    let msFlagsCount = 0;
    let msGameOver = false;
    let msStarted = false;
    let msTimer = null;
    let msSeconds = 0;

    function msFormatCounter(n) {
        const v = Math.max(0, Math.min(999, n));
        return String(v).padStart(3, '0');
    }

    function msResetTimer() {
        if (msTimer) clearInterval(msTimer);
        msTimer = null;
        msSeconds = 0;
        msTimeEl.innerText = '000';
    }

    function msStartTimer() {
        if (msTimer) return;
        msTimer = setInterval(() => {
            msSeconds = Math.min(999, msSeconds + 1);
            msTimeEl.innerText = msFormatCounter(msSeconds);
        }, 1000);
    }

    function msSetFace(state) {
        // classic minesweeper-ish faces
        if (state === 'win') msFaceEl.innerText = ':D';
        else if (state === 'dead') msFaceEl.innerText = 'X(';
        else if (state === 'surprise') msFaceEl.innerText = ':O';
        else msFaceEl.innerText = ':)';
    }

    function msParseDifficulty(value) {
        const [r, c, m] = value.split('x').map((x) => parseInt(x, 10));
        return { r, c, m };
    }

    function msInitBoard(rows, cols, mines) {
        msRows = rows; msCols = cols; msMines = mines;
        msBoard = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
            mine: false,
            revealed: false,
            flagged: false,
            adjacent: 0
        })));
        msRevealedCount = 0;
        msFlagsCount = 0;
        msGameOver = false;
        msStarted = false;
        msResetTimer();
        msSetFace('ok');
        msMinesEl.innerText = msFormatCounter(msMines);
        msRenderGrid();
    }

    function msInBounds(r, c) { return r >= 0 && c >= 0 && r < msRows && c < msCols; }

    function msNeighbors(r, c) {
        const out = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = r + dr, nc = c + dc;
                if (msInBounds(nr, nc)) out.push([nr, nc]);
            }
        }
        return out;
    }

    function msPlantMines(safeR, safeC) {
        const forbidden = new Set([`${safeR},${safeC}`]);
        msNeighbors(safeR, safeC).forEach(([r, c]) => forbidden.add(`${r},${c}`));

        let planted = 0;
        while (planted < msMines) {
            const r = Math.floor(Math.random() * msRows);
            const c = Math.floor(Math.random() * msCols);
            const key = `${r},${c}`;
            if (forbidden.has(key)) continue;
            if (msBoard[r][c].mine) continue;
            msBoard[r][c].mine = true;
            planted++;
        }

        for (let r = 0; r < msRows; r++) {
            for (let c = 0; c < msCols; c++) {
                if (msBoard[r][c].mine) continue;
                const count = msNeighbors(r, c).reduce((acc, [nr, nc]) => acc + (msBoard[nr][nc].mine ? 1 : 0), 0);
                msBoard[r][c].adjacent = count;
            }
        }
    }

    function msReveal(r, c) {
        const cell = msBoard[r][c];
        if (cell.revealed || cell.flagged) return;
        cell.revealed = true;
        msRevealedCount++;

        const cellEl = document.querySelector(`.ms-cell[data-r="${r}"][data-c="${c}"]`);
        if (cellEl) {
            cellEl.classList.add('revealed');
            if (cell.mine) cellEl.classList.add('mine');
            if (!cell.mine && cell.adjacent > 0) {
                cellEl.innerText = String(cell.adjacent);
                cellEl.classList.add(`ms-n${cell.adjacent}`);
            }
        }

        if (!cell.mine && cell.adjacent === 0) {
            msNeighbors(r, c).forEach(([nr, nc]) => {
                if (!msBoard[nr][nc].revealed) msReveal(nr, nc);
            });
        }
    }

    function msRevealAllMines() {
        for (let r = 0; r < msRows; r++) {
            for (let c = 0; c < msCols; c++) {
                if (!msBoard[r][c].mine) continue;
                const el = document.querySelector(`.ms-cell[data-r="${r}"][data-c="${c}"]`);
                if (!el) continue;
                el.classList.add('revealed', 'mine');
            }
        }
    }

    function msUpdateMineCounter() {
        msMinesEl.innerText = msFormatCounter(msMines - msFlagsCount);
    }

    function msToggleFlag(r, c) {
        const cell = msBoard[r][c];
        if (cell.revealed) return;
        cell.flagged = !cell.flagged;
        msFlagsCount += cell.flagged ? 1 : -1;
        const el = document.querySelector(`.ms-cell[data-r="${r}"][data-c="${c}"]`);
        if (el) el.classList.toggle('flagged', cell.flagged);
        msUpdateMineCounter();
    }

    function msCheckWin() {
        const safeCells = msRows * msCols - msMines;
        if (msRevealedCount >= safeCells && !msGameOver) {
            msGameOver = true;
            msSetFace('win');
            if (msTimer) { clearInterval(msTimer); msTimer = null; }
            addSystemLog('Démineur: victoire');
        }
    }

    function msHandleLeftClick(r, c) {
        if (msGameOver) return;
        if (!msStarted) {
            msStarted = true;
            msPlantMines(r, c);
            msStartTimer();
        }
        const cell = msBoard[r][c];
        if (cell.flagged || cell.revealed) return;
        if (cell.mine) {
            msGameOver = true;
            msSetFace('dead');
            msReveal(r, c);
            msRevealAllMines();
            if (msTimer) { clearInterval(msTimer); msTimer = null; }
            addSystemLog('Démineur: BOOM', 'warn');
            return;
        }
        msReveal(r, c);
        msCheckWin();
    }

    function msRenderGrid() {
        msGridEl.style.gridTemplateColumns = `repeat(${msCols}, 22px)`;
        msGridEl.style.gridTemplateRows = `repeat(${msRows}, 22px)`;
        msGridEl.innerHTML = '';
        for (let r = 0; r < msRows; r++) {
            for (let c = 0; c < msCols; c++) {
                const cellEl = document.createElement('div');
                cellEl.className = 'ms-cell';
                cellEl.dataset.r = String(r);
                cellEl.dataset.c = String(c);
                cellEl.addEventListener('mousedown', () => { if (!msGameOver) msSetFace('surprise'); });
                cellEl.addEventListener('mouseup', () => { if (!msGameOver) msSetFace('ok'); });
                cellEl.addEventListener('click', () => msHandleLeftClick(r, c));
                cellEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    if (msGameOver) return;
                    if (!msStarted) return;
                    msToggleFlag(r, c);
                    msCheckWin();
                });
                msGridEl.appendChild(cellEl);
            }
        }
    }

    function msNewGameFromUI() {
        const d = msParseDifficulty(msDifficultyEl.value);
        msInitBoard(d.r, d.c, d.m);
        addSystemLog(`Démineur: nouvelle partie (${d.r}x${d.c}, ${d.m})`);
    }

    msFaceEl.addEventListener('click', msNewGameFromUI);
    msDifficultyEl.addEventListener('change', msNewGameFromUI);
    msNewGameFromUI();

    // Try to auto-detect Aquerty minesweeper icons in medias/img/
    async function msDetectIcons() {
        const candidates = {
            bomb: ['medias/img/mineimg.png', 'medias/img/mine_bomb.png', 'medias/img/bomb.png', 'medias/img/bombe.png', 'medias/img/bombimg.png'],
            flag: ['medias/img/flagimg.png', 'medias/img/mine_flag.png', 'medias/img/flag.png', 'medias/img/drapeau.png']
        };
        async function firstExisting(list) {
            for (const url of list) {
                try {
                    const res = await fetch(url, { cache: 'no-store' });
                    if (res.ok) return url;
                } catch (_) {}
            }
            return null;
        }
        const bombUrl = await firstExisting(candidates.bomb);
        const flagUrl = await firstExisting(candidates.flag);
        if (bombUrl && flagUrl) {
            const win = document.getElementById('win-ms');
            win.classList.add('ms-has-icons');
            win.style.setProperty('--ms-bomb-url', `url("${bombUrl}")`);
            win.style.setProperty('--ms-flag-url', `url("${flagUrl}")`);
            addSystemLog('Démineur: icones Aquerty chargees');
        }
    }
    msDetectIcons();

    // --- MAIL APP ---
    const mailListEl = document.getElementById('mail-list');
    const mailViewEl = document.getElementById('mail-view');
    const mailSearchEl = document.getElementById('mail-search');
    const mailComposeBtn = document.getElementById('mail-compose-btn');
    const mailReplyBtn = document.getElementById('mail-reply-btn');
    const mailDeleteBtn = document.getElementById('mail-delete-btn');
    const mailOverlayEl = document.getElementById('mail-compose-overlay');
    const mailComposeClose = document.getElementById('mail-compose-close');
    const mailToEl = document.getElementById('mail-to');
    const mailSubjectEl = document.getElementById('mail-subject');
    const mailBodyEl = document.getElementById('mail-body');
    const mailSendEl = document.getElementById('mail-send');

    let mailFolder = 'inbox';
    let mailSelectedId = null;

    function getAquertySessionMail() {
        return window.JAJSession?.aquertyMail || 'guest@aquerty.fr';
    }

    function updateMailAccountStrip() {
        const addressEl = document.getElementById('mail-current-address');
        if (addressEl) addressEl.textContent = getAquertySessionMail();
    }

    let mailData = [
        { id: 'm1', folder: 'inbox', from: 'updates@aquerty.local', to: getAquertySessionMail(), subject: '', date: '2026-04-24 11:02', unread: true, body: '' },
        { id: 'm2', folder: 'inbox', from: 'support@aquerty.local', to: getAquertySessionMail(), subject: '', date: '2026-04-24 11:18', unread: true, body: '' },
        { id: 'm3', folder: 'sent', from: getAquertySessionMail(), to: 'support@aquerty.local', subject: '', date: '2026-04-24 11:21', unread: false, body: '' }
    ];

    function updateMailTranslations() {
        const isEn = getCurrentLanguage() === 'en';
        const defaults = {
            m1: {
                subject: isEn ? 'Welcome to Aquerty AQ-NEO' : 'Bienvenue sur Aquerty AQ-NEO',
                body: isEn
                    ? 'Your AQ-NEO environment is ready.\n\n- Player: OK\n- ACC: OK\n- Minesweeper: OK\n\nHave fun.'
                    : 'Ton environnement AQ-NEO est pret.\n\n- Player: OK\n- ACC: OK\n- Demineur: OK\n\nBon test.'
            },
            m2: {
                subject: isEn ? 'Ticket #1042 - Audio settings' : 'Ticket #1042 - Paramètres audio',
                body: isEn
                    ? 'We received your request.\n\nTip: adjust the master volume with the Sound icon (bottom right).'
                    : 'On a bien recu ta demande.\n\nConseil: regle le volume master via l icone Son (en bas a droite).'
            },
            m3: {
                subject: 'Re: Ticket #1042',
                body: isEn ? 'Thanks, that works.' : 'Merci, c est bon.'
            }
        };
        mailData.forEach((m) => {
            if (!defaults[m.id]) return;
            m.subject = defaults[m.id].subject;
            m.body = defaults[m.id].body;
        });
    }

    function mailRenderFolders() {
        document.querySelectorAll('#win-mail .mail-folder').forEach((el) => {
            el.classList.toggle('active', el.dataset.folder === mailFolder);
        });
    }

    function mailGetVisibleList() {
        const q = (mailSearchEl.value || '').trim().toLowerCase();
        return mailData
            .filter(m => m.folder === mailFolder)
            .filter(m => !q || m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.body.toLowerCase().includes(q))
            .sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    function mailRenderList() {
        const list = mailGetVisibleList();
        mailListEl.innerHTML = '';
        if (list.length === 0) {
            mailListEl.innerHTML = `<div class="mail-empty">${tUI().mailNoMessages}</div>`;
            return;
        }
        list.forEach((m) => {
            const row = document.createElement('div');
            row.className = `mail-item${m.unread ? ' unread' : ''}${m.id === mailSelectedId ? ' active' : ''}`;
            row.innerHTML = `<div style="display:flex; justify-content:space-between; gap:8px;">
                <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.subject}</span>
                <span style="opacity:0.75; font-size:11px;">${m.date.slice(11,16)}</span>
            </div>
            <div style="opacity:0.85; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.from}</div>`;
            row.addEventListener('click', () => mailOpen(m.id));
            mailListEl.appendChild(row);
        });
    }

    function mailRenderView() {
        const m = mailData.find(x => x.id === mailSelectedId);
        if (!m) {
            mailViewEl.innerHTML = `<div class="mail-empty">${tUI().mailSelect}</div>`;
            return;
        }
        const t = tUI();
        mailViewEl.innerHTML = `
            <div class="mail-subject">${m.subject}</div>
            <div class="mail-meta">
                <div><strong>${t.mailFrom}</strong> ${m.from}</div>
                <div><strong>${t.mailToLabel}</strong> ${m.to}</div>
                <div><strong>${t.mailDate}</strong> ${m.date}</div>
            </div>
            <pre style="white-space:pre-wrap; margin:0; font-family:Tahoma,sans-serif; font-size:12px;">${m.body}</pre>
        `;
    }

    function mailOpen(id) {
        mailSelectedId = id;
        const m = mailData.find(x => x.id === id);
        if (m) m.unread = false;
        mailRenderList();
        mailRenderView();
        addSystemLog(`Mail: ouvert ${id}`);
    }

    function mailDeleteSelected() {
        if (!mailSelectedId) return;
        const idx = mailData.findIndex(x => x.id === mailSelectedId);
        if (idx === -1) return;
        const m = mailData[idx];
        if (m.folder !== 'trash') {
            m.folder = 'trash';
        } else {
            mailData.splice(idx, 1);
        }
        mailSelectedId = null;
        mailRenderList();
        mailRenderView();
        addSystemLog('Mail: suppression');
    }

    function mailOpenCompose(prefill = {}) {
        mailOverlayEl.classList.add('open');
        mailToEl.value = prefill.to || 'support@aquerty.local';
        mailSubjectEl.value = prefill.subject || '';
        mailBodyEl.value = prefill.body || '';
    }

    function mailCloseCompose() {
        mailOverlayEl.classList.remove('open');
    }

    function mailSend() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mi = String(now.getMinutes()).padStart(2, '0');
        mailData.unshift({
            id: `s_${Date.now()}`,
            folder: 'sent',
            from: getAquertySessionMail(),
            to: mailToEl.value || 'support@aquerty.local',
            subject: mailSubjectEl.value || tUI().mailNoSubject,
            date: `${yyyy}-${mm}-${dd} ${hh}:${mi}`,
            unread: false,
            body: mailBodyEl.value || ''
        });
        mailCloseCompose();
        mailFolder = 'sent';
        mailSelectedId = null;
        mailRenderFolders();
        mailRenderList();
        mailRenderView();
        addSystemLog('Mail: envoyé');
        triggerContextualPopup('openInternet');
    }

    document.querySelectorAll('#win-mail .mail-folder').forEach((el) => {
        el.addEventListener('click', () => {
            mailFolder = el.dataset.folder;
            mailSelectedId = null;
            mailRenderFolders();
            mailRenderList();
            mailRenderView();
        });
    });
    mailSearchEl.addEventListener('input', mailRenderList);
    mailComposeBtn.addEventListener('click', () => mailOpenCompose());
    mailComposeClose.addEventListener('click', mailCloseCompose);
    mailOverlayEl.addEventListener('click', (e) => { if (e.target === mailOverlayEl) mailCloseCompose(); });
    mailDeleteBtn.addEventListener('click', mailDeleteSelected);
    mailReplyBtn.addEventListener('click', () => {
        const m = mailData.find(x => x.id === mailSelectedId);
        if (!m) return;
        mailOpenCompose({
            to: m.from,
            subject: `Re: ${m.subject}`,
            body: `\n\n----\n${m.from} (${m.date})\n${m.body}`
        });
    });
    mailSendEl.addEventListener('click', mailSend);
    window.addEventListener('jaj:session-changed', (event) => {
        const sessionMail = event.detail?.aquertyMail || getAquertySessionMail();
        updateMailAccountStrip();
        mailData.forEach((message) => {
            if (message.id === 'm1' || message.id === 'm2') message.to = sessionMail;
            if (message.id === 'm3') message.from = sessionMail;
        });
        if (isMailI18nReady) {
            mailRenderList();
            mailRenderView();
        }
    });

    isMailI18nReady = true;
    updateMailTranslations();
    updateMailAccountStrip();
    mailRenderFolders();
    mailRenderList();
    mailRenderView();
    applyLanguage(getCurrentLanguage());
