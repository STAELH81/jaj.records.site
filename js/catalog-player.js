import AQCatalog from './catalog.js';

let activeReleaseId = null;
let desktopReleaseSelect = null;
let mobileReleaseSelect = null;
let desktopReleaseLabel = null;
let mobileReleaseLabel = null;

function isEnglish() {
    return document.documentElement.lang === 'en';
}

function tr(fr, en) {
    return isEnglish() ? en : fr;
}

function getReleaseArtist(release) {
    return AQCatalog.getArtist(release?.artistId) || { name: release?.artistId || '—' };
}

function releaseOptionText(release) {
    const artist = getReleaseArtist(release);
    const year = release.year ? ` (${release.year})` : '';
    return `${artist.name} — ${release.title}${year}`;
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
        #win-player .player-content {
            grid-template-rows: 28px minmax(0, 1fr);
            gap: 8px 15px;
        }

        #player-release-strip {
            grid-column: 1 / -1;
            display: flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
            padding: 3px 5px;
            box-sizing: border-box;
            background: var(--xp-beige);
            border-top: 2px solid #fff;
            border-left: 2px solid #fff;
            border-right: 2px solid #808080;
            border-bottom: 2px solid #808080;
            font: 11px Tahoma, sans-serif;
        }

        #player-release-strip .player-release-label-text {
            flex: 0 0 auto;
            font-weight: bold;
            color: #222;
        }

        #player-release-select {
            flex: 1 1 auto;
            min-width: 0;
            height: 20px;
            box-sizing: border-box;
            border: 2px inset #fff;
            background: #fff;
            color: #000;
            font: 11px Tahoma, sans-serif;
        }

        #player-release-kind {
            flex: 0 0 auto;
            padding: 1px 5px;
            border: 1px solid #808080;
            background: #d4d0c8;
            color: #333;
            font-size: 9px;
            line-height: 15px;
            text-transform: uppercase;
        }

        #win-player.player-skin-dark #player-release-strip {
            background: #272727;
            border-top-color: #555;
            border-left-color: #555;
            border-right-color: #111;
            border-bottom-color: #111;
        }

        #win-player.player-skin-dark #player-release-strip .player-release-label-text {
            color: #ddd;
        }

        #win-player.player-skin-dark #player-release-kind {
            background: #333;
            border-color: #666;
            color: #ddd;
        }

        #win-player.player-skin-ice #player-release-strip {
            background: #dcecff;
        }

        #win-player.player-skin-rose #player-release-strip {
            background: #ffe3f3;
        }

        #mobile-release-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 8px 0 0;
            padding-top: 8px;
            border-top: 1px solid #9a9a9a;
        }

        #mobile-release-row .mobile-release-label-text {
            flex: 0 0 auto;
            font-size: 11px;
            font-weight: bold;
        }

        #mobile-release-select {
            min-width: 0;
            flex: 1 1 auto;
            height: 24px;
            font: 11px Tahoma, sans-serif;
        }
    `;
    document.head.appendChild(style);
}

function ensureReleaseSelectors() {
    const playerContent = document.querySelector('#win-player .player-content');

    if (playerContent && !document.getElementById('player-release-strip')) {
        const strip = document.createElement('div');
        strip.id = 'player-release-strip';

        desktopReleaseLabel = document.createElement('span');
        desktopReleaseLabel.className = 'player-release-label-text';

        desktopReleaseSelect = document.createElement('select');
        desktopReleaseSelect.id = 'player-release-select';
        desktopReleaseSelect.setAttribute('aria-label', tr('Choisir une sortie', 'Choose a release'));

        const kind = document.createElement('span');
        kind.id = 'player-release-kind';

        strip.append(desktopReleaseLabel, desktopReleaseSelect, kind);
        playerContent.insertBefore(strip, playerContent.firstChild);

        desktopReleaseSelect.addEventListener('change', () => {
            selectRelease(desktopReleaseSelect.value, { resetPlayback: true, persist: true });
        });
    } else {
        desktopReleaseLabel = document.querySelector('#player-release-strip .player-release-label-text');
        desktopReleaseSelect = document.getElementById('player-release-select');
    }

    const mobileNowPlayingCard = document.getElementById('mobile-now-playing')?.parentElement;
    const mobileControls = document.getElementById('mobile-player-controls');

    if (mobileNowPlayingCard && !document.getElementById('mobile-release-row')) {
        const row = document.createElement('div');
        row.id = 'mobile-release-row';

        mobileReleaseLabel = document.createElement('span');
        mobileReleaseLabel.className = 'mobile-release-label-text';

        mobileReleaseSelect = document.createElement('select');
        mobileReleaseSelect.id = 'mobile-release-select';
        mobileReleaseSelect.setAttribute('aria-label', tr('Choisir une sortie', 'Choose a release'));

        row.append(mobileReleaseLabel, mobileReleaseSelect);
        if (mobileControls) mobileNowPlayingCard.insertBefore(row, mobileControls);
        else mobileNowPlayingCard.appendChild(row);

        mobileReleaseSelect.addEventListener('change', () => {
            selectRelease(mobileReleaseSelect.value, { resetPlayback: true, persist: true });
        });
    } else {
        mobileReleaseLabel = document.querySelector('#mobile-release-row .mobile-release-label-text');
        mobileReleaseSelect = document.getElementById('mobile-release-select');
    }
}

function populateReleaseSelectors() {
    const releases = AQCatalog.getReleases();
    [desktopReleaseSelect, mobileReleaseSelect].forEach((select) => {
        if (!select) return;
        select.innerHTML = '';
        releases.forEach((release) => {
            const option = document.createElement('option');
            option.value = release.id;
            option.textContent = releaseOptionText(release);
            select.appendChild(option);
        });
        if (activeReleaseId) select.value = activeReleaseId;
    });
}

function updateReleaseLabels() {
    if (desktopReleaseLabel) desktopReleaseLabel.textContent = tr('Bibliothèque :', 'Library:');
    if (mobileReleaseLabel) mobileReleaseLabel.textContent = tr('Sortie :', 'Release:');

    if (desktopReleaseSelect) {
        desktopReleaseSelect.setAttribute('aria-label', tr('Choisir une sortie', 'Choose a release'));
    }
    if (mobileReleaseSelect) {
        mobileReleaseSelect.setAttribute('aria-label', tr('Choisir une sortie', 'Choose a release'));
    }

    populateReleaseSelectors();
}

function updateReleaseMetadata(release) {
    const artist = getReleaseArtist(release);
    const title = document.querySelector('#win-player .title-bar > span');
    if (title) title.textContent = `AQ-Player | ${release.label || 'JAJ Records'} / ${release.title} - ${artist.name}`;

    const cover = document.querySelector('#win-player .player-content img');
    if (cover && release.cover) {
        cover.src = release.cover;
        cover.alt = `${release.title} — ${artist.name}`;
    }

    const copyright = document.querySelector('#win-player .player-content p');
    if (copyright) copyright.textContent = release.copyright || `© ${release.year || ''} ${release.label || 'JAJ Records'}`.trim();

    const kind = document.getElementById('player-release-kind');
    if (kind) {
        const type = String(release.type || 'release').toUpperCase();
        kind.textContent = release.year ? `${type} · ${release.year}` : type;
    }

    if (desktopReleaseSelect) desktopReleaseSelect.value = release.id;
    if (mobileReleaseSelect) mobileReleaseSelect.value = release.id;
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
        persist = false
    } = options;

    const release = AQCatalog.getRelease(releaseId) || AQCatalog.getRelease(AQCatalog.defaultReleaseId);
    if (!release) return false;

    const changed = activeReleaseId !== release.id;
    if (resetPlayback && changed) clearPlaybackForReleaseSwitch();

    if (!applyPlayerTracks(release)) return false;

    activeReleaseId = release.id;
    updateReleaseMetadata(release);
    updateReleaseLabels();

    if (persist && typeof updateSetting === 'function') {
        updateSetting('playerReleaseId', release.id, false);
    }

    if (resetPlayback && changed && typeof savePlayerState === 'function') {
        savePlayerState();
    }

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
        persist: false
    });
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
    ensureReleaseSelectors();
    populateReleaseSelectors();
    selectRelease(releaseFromSettings(), { resetPlayback: false, persist: false });
    updateReleaseLabels();

    window.addEventListener('aq:language-changed', updateReleaseLabels);
    window.addEventListener('jaj:session-changed', () => {
        queueMicrotask(syncReleaseFromSettings);
    });
}

window.AQPlayerCatalog = {
    selectRelease: (releaseId) => selectRelease(releaseId, { resetPlayback: true, persist: true }),
    getCurrentRelease: () => AQCatalog.getRelease(activeReleaseId),
    getCurrentReleaseId: () => activeReleaseId,
    refresh: syncReleaseFromSettings
};

initCatalogPlayer();
