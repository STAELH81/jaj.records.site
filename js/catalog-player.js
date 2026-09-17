import AQCatalog from './catalog.js';

let activeReleaseId = null;
let playerWindow = null;
let playerModeBar = null;
let playerLibraryView = null;
let libraryTabButton = null;
let nowPlayingTabButton = null;
let libraryList = null;
let libraryHeading = null;
let libraryCount = null;
let libraryBrand = null;

function isEnglish() {
    return document.documentElement.lang === 'en';
}

function tr(fr, en) {
    return isEnglish() ? en : fr;
}

function getReleaseArtist(release) {
    return AQCatalog.getArtist(release?.artistId) || { name: release?.artistId || '—' };
}

function repairMySpaceIconPath() {
    const src = 'medias/img/myspaceimg.png';
    document.querySelectorAll('img[alt="AQ-MySpace"]').forEach((img) => {
        img.style.display = '';
        img.onerror = function onMySpaceIconError() {
            this.style.display = 'none';
        };
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
}

function installPlayerLibraryStyles() {
    if (document.getElementById('aq-catalog-player-styles')) return;

    const style = document.createElement('style');
    style.id = 'aq-catalog-player-styles';
    style.textContent = `
        #player-modebar {
            height: 31px;
            display: flex;
            align-items: flex-end;
            gap: 2px;
            padding: 3px 6px 0;
            box-sizing: border-box;
            background: linear-gradient(to bottom, #f7f6ef 0%, #d9d6c8 100%);
            border-bottom: 1px solid #8b8b8b;
            font: 11px Tahoma, sans-serif;
        }

        #player-modebar .player-mode-tab {
            height: 24px;
            min-width: 108px;
            padding: 2px 12px;
            border-top: 1px solid #fff;
            border-left: 1px solid #fff;
            border-right: 1px solid #7f7f7f;
            border-bottom: 1px solid #7f7f7f;
            background: #d4d0c8;
            color: #111;
            font: bold 10px Tahoma, sans-serif;
            cursor: pointer;
        }

        #player-modebar .player-mode-tab.active {
            background: #fff;
            border-top-color: #7f7f7f;
            border-left-color: #7f7f7f;
            border-right-color: #fff;
            border-bottom-color: #fff;
            color: #003c8f;
        }

        #player-modebar .player-mode-spacer {
            flex: 1 1 auto;
        }

        #player-library-brand {
            padding: 0 4px 6px;
            color: #555;
            font-size: 9px;
            letter-spacing: .4px;
            text-transform: uppercase;
        }

        #player-library-view {
            height: calc(100% - 58px);
            min-height: 0;
            display: grid;
            grid-template-columns: 150px minmax(0, 1fr);
            background: #f3f3f3;
            font: 11px Tahoma, sans-serif;
        }

        #player-library-nav {
            min-width: 0;
            padding: 9px 7px;
            background: linear-gradient(to right, #e3e8ef 0%, #cbd5e2 100%);
            border-right: 1px solid #8d99a8;
            color: #1f2f44;
        }

        #player-library-nav .library-nav-title {
            margin: 0 0 7px;
            padding: 3px 5px 5px;
            border-bottom: 1px solid #8d99a8;
            font-weight: bold;
            color: #173a6b;
        }

        #player-library-nav .library-nav-item {
            display: block;
            width: 100%;
            margin: 1px 0;
            padding: 5px 7px 5px 20px;
            box-sizing: border-box;
            border: 1px solid transparent;
            background: transparent;
            color: #22364d;
            text-align: left;
            font: 11px Tahoma, sans-serif;
        }

        #player-library-nav .library-nav-item.active {
            border-color: #7f9db9;
            background: #fff;
            color: #003c8f;
            font-weight: bold;
        }

        #player-library-main {
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #fff;
        }

        #player-library-header {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 38px;
            padding: 5px 9px;
            box-sizing: border-box;
            background: linear-gradient(to bottom, #ffffff 0%, #e7e7e7 100%);
            border-bottom: 1px solid #a6a6a6;
        }

        #player-library-heading {
            color: #173a6b;
            font-size: 14px;
            font-weight: bold;
        }

        #player-library-count {
            color: #666;
            font-size: 10px;
        }

        #player-library-list {
            flex: 1 1 auto;
            min-height: 0;
            overflow: auto;
            background: #fff;
        }

        .player-library-row {
            display: grid;
            grid-template-columns: 68px minmax(0, 1fr) 82px 82px 64px;
            gap: 8px;
            align-items: center;
            min-height: 76px;
            padding: 6px 8px;
            box-sizing: border-box;
            border-bottom: 1px solid #dedede;
            cursor: default;
        }

        .player-library-row:hover,
        .player-library-row:focus-visible {
            outline: none;
            background: #e8f1fb;
        }

        .player-library-cover {
            width: 58px;
            height: 58px;
            object-fit: cover;
            border: 1px solid #777;
            background: #ddd;
            box-shadow: 1px 1px 2px rgba(0,0,0,.3);
        }

        .player-library-title {
            margin-bottom: 3px;
            color: #123f77;
            font-size: 12px;
            font-weight: bold;
        }

        .player-library-artist {
            color: #333;
        }

        .player-library-meta {
            margin-top: 4px;
            color: #777;
            font-size: 9px;
        }

        .player-library-col {
            color: #454545;
            font-size: 10px;
        }

        .player-library-open {
            justify-self: end;
            padding: 3px 7px;
            background: #ece9d8;
            border-top: 2px solid #fff;
            border-left: 2px solid #fff;
            border-right: 2px solid #808080;
            border-bottom: 2px solid #808080;
            color: #111;
            font: bold 9px Tahoma, sans-serif;
            cursor: pointer;
        }

        .player-library-open:active {
            border-top-color: #808080;
            border-left-color: #808080;
            border-right-color: #fff;
            border-bottom-color: #fff;
        }

        #win-player.catalog-library-mode .player-content,
        #win-player.catalog-library-mode #player-bottom-bar {
            display: none !important;
        }

        #win-player:not(.catalog-library-mode) #player-library-view {
            display: none;
        }

        #win-player:not(.catalog-library-mode) .player-content {
            height: calc(100% - 101px);
        }

        #win-player #player-settings-panel {
            top: 62px;
        }

        #win-player.player-skin-dark #player-modebar {
            background: linear-gradient(to bottom, #353535 0%, #202020 100%);
            border-bottom-color: #555;
        }

        #win-player.player-skin-dark #player-modebar .player-mode-tab {
            background: #333;
            border-color: #666 #111 #111 #666;
            color: #ddd;
        }

        #win-player.player-skin-dark #player-modebar .player-mode-tab.active {
            background: #111;
            color: #fff;
        }

        #win-player.player-skin-dark #player-library-brand {
            color: #aaa;
        }

        #win-player.player-skin-dark #player-library-nav {
            background: #252525;
            border-right-color: #555;
            color: #ddd;
        }

        #win-player.player-skin-dark #player-library-nav .library-nav-title,
        #win-player.player-skin-dark #player-library-nav .library-nav-item {
            color: #ddd;
        }

        #win-player.player-skin-dark #player-library-nav .library-nav-item.active {
            background: #111;
            color: #fff;
        }

        #win-player.player-skin-dark #player-library-main,
        #win-player.player-skin-dark #player-library-list {
            background: #111;
        }

        #win-player.player-skin-dark #player-library-header {
            background: #252525;
            border-bottom-color: #555;
        }

        #win-player.player-skin-dark #player-library-heading,
        #win-player.player-skin-dark .player-library-title {
            color: #b7d4ff;
        }

        #win-player.player-skin-dark .player-library-row {
            border-bottom-color: #333;
        }

        #win-player.player-skin-dark .player-library-row:hover,
        #win-player.player-skin-dark .player-library-row:focus-visible {
            background: #26374f;
        }

        #win-player.player-skin-dark .player-library-artist,
        #win-player.player-skin-dark .player-library-col,
        #win-player.player-skin-dark .player-library-meta,
        #win-player.player-skin-dark #player-library-count {
            color: #ccc;
        }

        @media (max-width: 700px) {
            #player-library-view {
                grid-template-columns: 105px minmax(0, 1fr);
            }

            .player-library-row {
                grid-template-columns: 54px minmax(0, 1fr) 54px;
            }

            .player-library-cover {
                width: 46px;
                height: 46px;
            }

            .player-library-col.library-year,
            .player-library-col.library-type {
                display: none;
            }

            #player-modebar .player-mode-tab {
                min-width: 88px;
                padding-left: 6px;
                padding-right: 6px;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensurePlayerShell() {
    playerWindow = document.getElementById('win-player');
    if (!playerWindow) return false;

    document.getElementById('player-release-strip')?.remove();
    document.getElementById('mobile-release-row')?.remove();

    if (!document.getElementById('player-modebar')) {
        playerModeBar = document.createElement('div');
        playerModeBar.id = 'player-modebar';

        libraryTabButton = document.createElement('button');
        libraryTabButton.id = 'player-library-tab';
        libraryTabButton.className = 'player-mode-tab';
        libraryTabButton.type = 'button';
        libraryTabButton.addEventListener('click', showLibraryMode);

        nowPlayingTabButton = document.createElement('button');
        nowPlayingTabButton.id = 'player-now-playing-tab';
        nowPlayingTabButton.className = 'player-mode-tab';
        nowPlayingTabButton.type = 'button';
        nowPlayingTabButton.addEventListener('click', showPlaybackMode);

        const spacer = document.createElement('div');
        spacer.className = 'player-mode-spacer';

        libraryBrand = document.createElement('div');
        libraryBrand.id = 'player-library-brand';

        playerModeBar.append(libraryTabButton, nowPlayingTabButton, spacer, libraryBrand);
        playerWindow.querySelector('.title-bar')?.insertAdjacentElement('afterend', playerModeBar);
    } else {
        playerModeBar = document.getElementById('player-modebar');
        libraryTabButton = document.getElementById('player-library-tab');
        nowPlayingTabButton = document.getElementById('player-now-playing-tab');
        libraryBrand = document.getElementById('player-library-brand');
    }

    if (!document.getElementById('player-library-view')) {
        playerLibraryView = document.createElement('div');
        playerLibraryView.id = 'player-library-view';

        const nav = document.createElement('aside');
        nav.id = 'player-library-nav';
        nav.innerHTML = `
            <div class="library-nav-title"></div>
            <button type="button" class="library-nav-item">♫ ${tr('Musique', 'Music')}</button>
            <button type="button" class="library-nav-item active">▣ ${tr('Albums', 'Albums')}</button>
            <button type="button" class="library-nav-item">☺ ${tr('Artistes', 'Artists')}</button>
            <button type="button" class="library-nav-item">□ ${tr('Archives', 'Archives')}</button>
        `;

        const main = document.createElement('section');
        main.id = 'player-library-main';

        const header = document.createElement('div');
        header.id = 'player-library-header';
        libraryHeading = document.createElement('div');
        libraryHeading.id = 'player-library-heading';
        libraryCount = document.createElement('div');
        libraryCount.id = 'player-library-count';
        header.append(libraryHeading, libraryCount);

        libraryList = document.createElement('div');
        libraryList.id = 'player-library-list';

        main.append(header, libraryList);
        playerLibraryView.append(nav, main);
        playerModeBar.insertAdjacentElement('afterend', playerLibraryView);
    } else {
        playerLibraryView = document.getElementById('player-library-view');
        libraryHeading = document.getElementById('player-library-heading');
        libraryCount = document.getElementById('player-library-count');
        libraryList = document.getElementById('player-library-list');
    }

    return true;
}

function releaseTypeLabel(release) {
    const type = String(release?.type || 'release').toLowerCase();
    if (type === 'album') return tr('Album', 'Album');
    if (type === 'single') return tr('Single', 'Single');
    if (type === 'ep') return 'EP';
    return tr('Sortie', 'Release');
}

function releaseStatusLabel(release) {
    const status = String(release?.status || '').toLowerCase();
    if (status === 'archive') return tr('Archive', 'Archive');
    if (status === 'published') return tr('Publié', 'Published');
    if (status === 'preview') return tr('Aperçu', 'Preview');
    return status || '—';
}

function renderLibrary() {
    if (!libraryList) return;

    const releases = AQCatalog.getReleases();
    libraryList.innerHTML = '';

    const navTitle = document.querySelector('#player-library-nav .library-nav-title');
    if (navTitle) navTitle.textContent = tr('Bibliothèque', 'Library');

    const navItems = document.querySelectorAll('#player-library-nav .library-nav-item');
    const navLabels = isEnglish()
        ? ['♫ Music', '▣ Albums', '☺ Artists', '□ Archives']
        : ['♫ Musique', '▣ Albums', '☺ Artistes', '□ Archives'];
    navItems.forEach((item, index) => {
        if (navLabels[index]) item.textContent = navLabels[index];
    });

    if (libraryHeading) libraryHeading.textContent = tr('Albums disponibles', 'Available albums');
    if (libraryCount) {
        libraryCount.textContent = `${releases.length} ${releases.length > 1 ? tr('sorties', 'releases') : tr('sortie', 'release')}`;
    }
    if (libraryBrand) libraryBrand.textContent = 'JAJ Records Media Library';

    releases.forEach((release) => {
        const artist = getReleaseArtist(release);
        const row = document.createElement('div');
        row.className = 'player-library-row';
        row.tabIndex = 0;
        row.dataset.releaseId = release.id;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', `${release.title} — ${artist.name}`);

        const cover = document.createElement('img');
        cover.className = 'player-library-cover';
        cover.src = release.cover || 'medias/img/albumimg.png';
        cover.alt = '';

        const info = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'player-library-title';
        title.textContent = release.title;
        const artistEl = document.createElement('div');
        artistEl.className = 'player-library-artist';
        artistEl.textContent = artist.name;
        const meta = document.createElement('div');
        meta.className = 'player-library-meta';
        meta.textContent = `${release.tracks?.length || 0} ${tr('pistes', 'tracks')} · ${releaseStatusLabel(release)}`;
        info.append(title, artistEl, meta);

        const year = document.createElement('div');
        year.className = 'player-library-col library-year';
        year.textContent = release.year || '—';

        const type = document.createElement('div');
        type.className = 'player-library-col library-type';
        type.textContent = releaseTypeLabel(release);

        const open = document.createElement('button');
        open.className = 'player-library-open';
        open.type = 'button';
        open.textContent = tr('Ouvrir', 'Open');

        const openRelease = () => {
            selectRelease(release.id, {
                resetPlayback: true,
                persist: true,
                enterPlayback: true
            });
        };

        row.addEventListener('dblclick', openRelease);
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openRelease();
            }
        });
        open.addEventListener('click', (event) => {
            event.stopPropagation();
            openRelease();
        });

        row.append(cover, info, year, type, open);
        libraryList.appendChild(row);
    });
}

function updateModeLabels() {
    if (libraryTabButton) libraryTabButton.textContent = tr('Bibliothèque', 'Library');
    if (nowPlayingTabButton) nowPlayingTabButton.textContent = tr('Lecture en cours', 'Now Playing');
    renderLibrary();
}

function showLibraryMode() {
    if (!playerWindow) return;
    playerWindow.classList.add('catalog-library-mode');
    libraryTabButton?.classList.add('active');
    nowPlayingTabButton?.classList.remove('active');

    const title = playerWindow.querySelector('.title-bar > span');
    if (title) title.textContent = 'AQ-Player | JAJ Records Media Library';

    renderLibrary();
}

function showPlaybackMode() {
    if (!playerWindow) return;
    playerWindow.classList.remove('catalog-library-mode');
    libraryTabButton?.classList.remove('active');
    nowPlayingTabButton?.classList.add('active');

    const release = AQCatalog.getRelease(activeReleaseId) || AQCatalog.getRelease(AQCatalog.defaultReleaseId);
    if (release) updateReleaseMetadata(release);
}

function updateReleaseMetadata(release) {
    const artist = getReleaseArtist(release);
    const title = document.querySelector('#win-player .title-bar > span');
    if (title && !playerWindow?.classList.contains('catalog-library-mode')) {
        title.textContent = `AQ-Player | ${release.label || 'JAJ Records'} / ${release.title} - ${artist.name}`;
    }

    const cover = document.querySelector('#win-player .player-content img');
    if (cover && release.cover) {
        cover.src = release.cover;
        cover.alt = `${release.title} — ${artist.name}`;
    }

    const copyright = document.querySelector('#win-player .player-content p');
    if (copyright) copyright.textContent = release.copyright || `© ${release.year || ''} ${release.label || 'JAJ Records'}`.trim();
}

function clearPlaybackForReleaseSwitch() {
    const audio = document.getElementById('audio-player');
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
    }

    if (typeof currentTrackIndex !== 'undefined') currentTrackIndex = -1;

    const status = document.getElementById('now-playing');
    if (status) status.textContent = tr('PRÊT', 'READY');

    const seek = document.getElementById('seek-bar');
    if (seek) seek.style.width = '0%';
}

function applyPlayerTracks(release) {
    if (typeof myTracks === 'undefined') {
        console.error('[AQ Catalog Player] AQ-Player track state is unavailable.');
        return false;
    }

    myTracks = AQCatalog.toPlayerTracks(release.id);
    if (typeof renderPlaylist === 'function') renderPlaylist();
    return true;
}

function selectRelease(releaseId, options = {}) {
    const {
        resetPlayback = false,
        persist = false,
        enterPlayback = false
    } = options;

    const release = AQCatalog.getRelease(releaseId) || AQCatalog.getRelease(AQCatalog.defaultReleaseId);
    if (!release) return false;

    const changed = activeReleaseId !== release.id;
    if (resetPlayback && changed) clearPlaybackForReleaseSwitch();
    if (!applyPlayerTracks(release)) return false;

    activeReleaseId = release.id;
    updateReleaseMetadata(release);

    if (persist && typeof updateSetting === 'function') {
        updateSetting('playerReleaseId', release.id, false);
    }

    if (resetPlayback && changed && typeof savePlayerState === 'function') {
        savePlayerState();
    }

    if (enterPlayback) showPlaybackMode();

    window.dispatchEvent(new CustomEvent('aq:catalog-release-changed', {
        detail: {
            releaseId: release.id,
            artistId: release.artistId
        }
    }));

    return true;
}

function releaseFromSettings() {
    if (typeof appSettings !== 'undefined' && appSettings?.playerReleaseId) {
        return appSettings.playerReleaseId;
    }
    return AQCatalog.defaultReleaseId;
}

function syncReleaseFromSettings() {
    const wanted = releaseFromSettings();
    if (!wanted) return;
    selectRelease(wanted, {
        resetPlayback: !!activeReleaseId && activeReleaseId !== wanted,
        persist: false,
        enterPlayback: false
    });
    renderLibrary();
}

function installTrackSourceResolver() {
    if (typeof getTrackFolder !== 'function') return;
    const legacyResolver = getTrackFolder;
    getTrackFolder = function catalogTrackFolder(track) {
        if (track?.audioBase) return track.audioBase;
        return legacyResolver(track);
    };
}

function initCatalogPlayer() {
    repairMySpaceIconPath();
    installPlayerLibraryStyles();

    if (typeof myTracks === 'undefined' || typeof renderPlaylist !== 'function') {
        console.warn('[AQ Catalog Player] AQ-Player is not initialized yet.');
        return;
    }

    installTrackSourceResolver();
    if (!ensurePlayerShell()) return;

    selectRelease(releaseFromSettings(), {
        resetPlayback: false,
        persist: false,
        enterPlayback: false
    });
    updateModeLabels();
    showLibraryMode();

    window.addEventListener('aq:language-changed', () => {
        updateModeLabels();
        if (playerWindow?.classList.contains('catalog-library-mode')) showLibraryMode();
        else showPlaybackMode();
    });

    window.addEventListener('jaj:session-changed', () => {
        queueMicrotask(syncReleaseFromSettings);
    });
}

window.AQPlayerCatalog = {
    selectRelease: (releaseId) => selectRelease(releaseId, {
        resetPlayback: true,
        persist: true,
        enterPlayback: true
    }),
    showLibrary: showLibraryMode,
    showPlayer: showPlaybackMode,
    getCurrentRelease: () => AQCatalog.getRelease(activeReleaseId),
    getCurrentReleaseId: () => activeReleaseId,
    refresh: syncReleaseFromSettings
};

initCatalogPlayer();
