// AQ-Player Phase 6 hotfix: robust visual canvas sizing + integrated Skin Chooser settings.

function tr(fr, en) {
    return document.documentElement.lang === 'en' ? en : fr;
}

function disableLegacyNightMode() {
    const win = document.getElementById('win-player');
    document.body.classList.remove('player-night-mode');
    win?.classList.remove('player-night-fullscreen');

    const nightToggle = document.getElementById('player-night-mode');
    if (nightToggle) {
        nightToggle.checked = false;
        nightToggle.closest('label')?.remove();
    }

    document.getElementById('player-exit-night-btn')?.remove();

    try {
        if (typeof window.setPlayerNightMode === 'function') window.setPlayerNightMode(false);
    } catch (_) {}
}

function installSkinChooserView() {
    const win = document.getElementById('win-player');
    const stage = document.getElementById('aqmp-stage');
    const sidebar = document.getElementById('aqmp-sidebar');
    const panel = document.getElementById('player-settings-panel');
    if (!win || !stage || !sidebar || !panel) return false;

    document.getElementById('player-cfg-btn')?.remove();
    disableLegacyNightMode();

    let skinView = document.getElementById('aqmp-skin-view');
    if (!skinView) {
        skinView = document.createElement('section');
        skinView.id = 'aqmp-skin-view';
        skinView.className = 'aqmp-view';
        skinView.innerHTML = `
            <div class="aqmp-skin-layout">
                <div class="aqmp-skin-title">${tr('Sélecteur de skins', 'Skin Chooser')}</div>
                <div class="aqmp-skin-sub">${tr('Personnalise l’apparence d’AQ-Player.', 'Customize the AQ-Player appearance.')}</div>
                <div class="aqmp-skin-panel-host"></div>
                <div class="aqmp-skin-note">${tr('Les réglages du lecteur vivent maintenant ici, comme dans une vraie application multimédia.', 'Player settings now live here, like in a real media application.')}</div>
            </div>
        `;
        stage.appendChild(skinView);
    }

    const host = skinView.querySelector('.aqmp-skin-panel-host');
    if (host && panel.parentElement !== host) host.appendChild(panel);
    panel.classList.remove('open');

    const nightHint = document.getElementById('player-settings-hint');
    if (nightHint) nightHint.textContent = tr('Choisis un skin pour AQ-Player.', 'Choose a skin for AQ-Player.');

    let skinButton = Array.from(sidebar.querySelectorAll('.aqmp-side-button')).find((button) =>
        button.textContent.includes('Sélecteur de skins') || button.textContent.includes('Skin Chooser') || button.querySelector('small')?.textContent === 'CFG'
    );

    if (skinButton && skinButton.dataset.phase6SkinWired !== '1') {
        const replacement = skinButton.cloneNode(true);
        replacement.dataset.phase6SkinWired = '1';
        replacement.dataset.view = 'skin';
        replacement.disabled = false;
        replacement.style.opacity = '';
        replacement.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            showSkinView();
        });
        skinButton.replaceWith(replacement);
        skinButton = replacement;
    }

    return true;
}

function showSkinView() {
    if (!installSkinChooserView()) return;
    const skinView = document.getElementById('aqmp-skin-view');
    document.querySelectorAll('#aqmp-stage > .aqmp-view').forEach((view) => view.classList.remove('active'));
    skinView?.classList.add('active');

    document.querySelectorAll('#aqmp-sidebar .aqmp-side-button').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === 'skin');
    });

    const title = document.getElementById('aqmp-toolbar-title');
    const context = document.getElementById('aqmp-toolbar-context');
    const back = document.querySelector('#aqmp-toolbar [data-action="library"]');
    if (title) title.textContent = tr('Sélecteur de skins', 'Skin Chooser');
    if (context) context.textContent = tr('Apparence d’AQ-Player', 'AQ-Player appearance');
    if (back) {
        back.textContent = tr('← Bibliothèque', '← Library');
        back.style.display = '';
    }
}

function hideSkinViewForNativeNavigation(event) {
    const skinView = document.getElementById('aqmp-skin-view');
    if (!skinView?.classList.contains('active')) return;

    const nativeViewButton = event.target.closest?.('#aqmp-sidebar [data-view]:not([data-view="skin"])');
    const backButton = event.target.closest?.('#aqmp-toolbar [data-action="library"]');
    if (nativeViewButton || backButton) skinView.classList.remove('active');
}

function installSkinStyles() {
    if (document.getElementById('aqmp-skin-hotfix-styles')) return;
    const style = document.createElement('style');
    style.id = 'aqmp-skin-hotfix-styles';
    style.textContent = `
        #player-cfg-btn { display:none !important; }
        #aqmp-skin-view { background:linear-gradient(to bottom,#f8fbfe,#dbe7f2); overflow:auto; }
        #aqmp-skin-view.active { display:block; }
        .aqmp-skin-layout { width:min(520px,calc(100% - 40px)); margin:28px auto; padding:18px; box-sizing:border-box; border:1px solid #7896b3; background:#f4f8fb; box-shadow:inset 0 1px 0 #fff,2px 3px 7px rgba(35,70,105,.24); color:#183b63; font:11px Tahoma,sans-serif; }
        .aqmp-skin-title { font-size:18px; font-weight:bold; color:#174d86; margin-bottom:3px; }
        .aqmp-skin-sub { color:#667b91; margin-bottom:15px; }
        .aqmp-skin-panel-host { border:1px solid #9bacbd; background:#fff; padding:12px; box-shadow:inset 1px 1px 2px rgba(0,0,0,.12); }
        #aqmp-skin-view #player-settings-panel { position:static !important; display:block !important; width:auto !important; top:auto !important; right:auto !important; padding:0 !important; border:0 !important; background:transparent !important; box-shadow:none !important; color:#203a55; }
        #aqmp-skin-view #player-settings-panel .setting-title { color:#164b82; border-bottom:1px solid #b7c6d5; padding-bottom:5px; margin-bottom:10px; }
        #aqmp-skin-view #player-settings-panel .setting-row { display:flex; align-items:center; min-height:28px; margin:0 0 8px; }
        #aqmp-skin-view #player-settings-panel select { min-width:180px; height:24px; }
        .aqmp-skin-note { margin-top:12px; padding-top:9px; border-top:1px solid #b8c8d7; color:#6b7d8e; font-size:9px; }
    `;
    document.head.appendChild(style);
}

function forceVisualizerSurface() {
    const view = document.getElementById('aqmp-visual-view');
    const stage = document.getElementById('aqmp-visual-stage');
    const canvas = document.getElementById('aqmp-visual-canvas');
    if (!view || !stage || !canvas || !view.classList.contains('active')) return false;

    const rect = stage.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wantedW = Math.max(2, Math.round(rect.width * dpr));
    const wantedH = Math.max(2, Math.round(rect.height * dpr));

    if (canvas.width !== wantedW || canvas.height !== wantedH) {
        canvas.width = wantedW;
        canvas.height = wantedH;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        const ctx = canvas.getContext('2d');
        ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    try { window.AQVisualizer?.mutate?.(); } catch (_) {}
    return true;
}

function wakeVisualizer() {
    requestAnimationFrame(() => {
        forceVisualizerSurface();
        requestAnimationFrame(forceVisualizerSurface);
    });
}

function installVisualizerWakeups() {
    const view = document.getElementById('aqmp-visual-view');
    const stage = document.getElementById('aqmp-visual-stage');
    if (!view || !stage) return false;

    if (!view.dataset.phase6WakeObserved) {
        const observer = new MutationObserver(() => {
            if (view.classList.contains('active')) wakeVisualizer();
        });
        observer.observe(view, { attributes: true, attributeFilter: ['class'] });
        view.dataset.phase6WakeObserved = '1';
    }

    if (!stage.dataset.phase6ResizeObserved && 'ResizeObserver' in window) {
        const resize = new ResizeObserver(() => {
            if (view.classList.contains('active')) forceVisualizerSurface();
        });
        resize.observe(stage);
        stage.dataset.phase6ResizeObserved = '1';
    }

    window.addEventListener('resize', wakeVisualizer, { passive: true });
    if (view.classList.contains('active')) wakeVisualizer();
    return true;
}

function repairPhase6() {
    installSkinStyles();
    installSkinChooserView();
    installVisualizerWakeups();
}

// Catalog-player and visualizer are module dependencies; wait one turn for their DOM work.
queueMicrotask(repairPhase6);
requestAnimationFrame(repairPhase6);
setTimeout(repairPhase6, 150);
setTimeout(repairPhase6, 800);

document.addEventListener('click', hideSkinViewForNativeNavigation, true);
window.addEventListener('aq:language-changed', () => setTimeout(repairPhase6, 0));
window.addEventListener('aq:catalog-release-changed', () => setTimeout(repairPhase6, 0));
