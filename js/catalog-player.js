import AQCatalog from './catalog.js';

let activeReleaseId = null;
let desktopReleaseSelect = null;
let mobileReleaseSelect = null;
let releaseLabel = null;
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

function ensureReleaseSelectors() {
    const settingsPanel = document.getElementById('player-settings-panel');
    const skinLabel = document.getElementById('player-skin-label');

    if (settingsPanel && !document.getElementById('player-release-select')) {
        releaseLabel = document.createElement('label');
        releaseLabel.className = 'setting-row';
        releaseLabel.id = 'player-release-label';

        const text = document.createElement('span');
        text.className = 'player-release-label-text';

        desktopReleaseSelect = document.createElement('select');
        desktopReleaseSelect.id = 'player-release-select';
        desktopReleaseSelect.style.marginLeft = 'auto';
        desktopReleaseSelect.style.fontSize = '11px';

        releaseLabel.append(text, desktopReleaseSelect);
        if (skinLabel) settingsPanel.insertBefore(releaseLabel, skinLabel);
        else settingsPanel.appendChild(releaseLabel);

        desktopReleaseSelect.addEventListener('change', () => {
            selectRelease(desktopReleaseSelect.value, { resetPlayback: true, persist: true });
        });
    } else {
        releaseLabel = document.getElementById('player-release-label');
        desktopReleaseSelect = document.getElementById('player-release-select');
    }

    const quickCard = document.getElementById('mobile-quick-title')?.parentElement;
    if (quickCard && !document.getElementById('mobile-release-select')) {
        mobileReleaseLabel = document.createElement('label');
        mobileReleaseLabel.id = 'mobile-release-row';
        mobileReleaseLabel.style.display = 'flex';
        mobileReleaseLabel.style.justifyContent = 'space-between';
        mobileReleaseLabel.style.alignItems = 'center';
        mobileReleaseLabel.style.gap = '10px';
        mobileReleaseLabel.style.margin = '8px 0';

        const text = document.createElement('span');
        text.className = 'mobile-release-label-text';

        mobileReleaseSelect = document.createElement('select');
        mobileReleaseSelect.id = 'mobile-release-select';
        mobileReleaseSelect.style.maxWidth = '62%';

        mobileReleaseLabel.append(text, mobileReleaseSelect);

        const languageRow = document.getElementById('mobile-setting-language')?.closest('label');
        if (languageRow) quickCard.insertBefore(mobileReleaseLabel, languageRow);
        else quickCard.appendChild(mobileReleaseLabel);

        mobileReleaseSelect.addEventListener('change', () => {
            selectRelease(mobileReleaseSelect.value, { resetPlayback: true, persist: true });
        });
    } else {
        mobileReleaseLabel = document.getElementById('mobile-release-row');
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
    const desktopText = releaseLabel?.querySelector('.player-release-label-text');
    if (desktopText) desktopText.textContent = tr('Sortie :', 'Release:');

    const mobileText = mobileReleaseLabel?.querySelector('.mobile-release-label-text');
    if (mobileText) mobileText.textContent = tr('Sortie', 'Release');

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
