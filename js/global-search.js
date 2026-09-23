// AQ-NEO global search + artist directory
import AQCatalog from './catalog.js';

const tr = (fr, en) => document.documentElement.lang === 'en' ? en : fr;
const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function artistAvatar(artist) {
    if (artist?.avatar) return '<img class="aq-search-avatar" src="' + esc(artist.avatar) + '" alt="' + esc(artist.name) + '">';
    return '<span class="aq-search-avatar aq-search-avatar-fallback">' + esc((artist?.name || '?').slice(0, 1).toUpperCase()) + '</span>';
}

function openNavigator() {
    window.openWindow?.('win-ie', 'task-ie');
}

function setNavigatorChrome(address, status) {
    const input = document.getElementById('ie-address-input');
    const statusNode = document.getElementById('ie-status');
    if (input) input.value = address;
    if (statusNode) statusNode.textContent = status;
}

function renderArtists() {
    openNavigator();
    const box = document.getElementById('ie-content-box');
    if (!box) return;
    const artists = AQCatalog.data.artists || [];
    box.innerHTML =
        '<article class="aq-artists-directory">' +
        '<div class="aq-search-page-head"><div><div class="aq-search-kicker">JAJ RECORDS NETWORK</div><h2>' + tr('Artistes', 'Artists') + '</h2><p>' +
        tr('Tous les artistes actuellement présents dans le catalogue public.', 'All artists currently available in the public catalogue.') +
        '</p></div><span class="aq-search-count">' + artists.length + '</span></div>' +
        '<div class="aq-artists-grid">' +
        artists.map((artist) => {
            const releases = AQCatalog.getReleases({ artistId: artist.id });
            return '<button type="button" class="aq-artist-directory-card" data-catalog-page="artist:' + esc(artist.id) + '">' +
                artistAvatar(artist) +
                '<span class="aq-artist-card-copy"><strong>' + esc(artist.name) + '</strong><small>' +
                releases.length + ' ' + tr('sortie(s)', 'release(s)') +
                '</small><span>' + esc(artist.bio || tr('Voir la page artiste', 'View artist page')) + '</span></span>' +
                '<span class="aq-search-arrow">›</span></button>';
        }).join('') +
        '</div></article>';
    box.scrollTop = 0;
    setNavigatorChrome('http://www.jaj-records.com/artists/index.html', tr('Annuaire des artistes', 'Artist directory'));
}

function collectResults(query) {
    const q = normalize(query);
    if (!q) return [];
    const rows = [];

    (AQCatalog.data.artists || []).forEach((artist) => {
        if (normalize([artist.name, artist.bio].join(' ')).includes(q)) {
            rows.push({
                kind: 'artist',
                title: artist.name,
                meta: tr('Artiste', 'Artist'),
                detail: artist.bio || tr('Page artiste JAJ Records', 'JAJ Records artist page'),
                artist,
                page: 'artist:' + artist.id
            });
        }
    });

    AQCatalog.getReleases().forEach((release) => {
        const artist = AQCatalog.getArtist(release.artistId);
        const releaseHaystack = [release.title, artist?.name, release.type, release.year, release.label].join(' ');
        if (normalize(releaseHaystack).includes(q)) {
            rows.push({
                kind: 'release',
                title: release.title,
                meta: (artist?.name || release.artistId) + ' · ' + String(release.type || '').toUpperCase() + (release.year ? ' · ' + release.year : ''),
                detail: tr('Sortie du catalogue', 'Catalog release'),
                cover: release.cover,
                page: 'release:' + release.id,
                releaseId: release.id
            });
        }
        (release.tracks || []).forEach((track) => {
            const haystack = [track.title, release.title, artist?.name].join(' ');
            if (!normalize(haystack).includes(q)) return;
            rows.push({
                kind: 'track',
                title: track.title,
                meta: (artist?.name || release.artistId) + ' — ' + release.title,
                detail: track.availability === 'snippet'
                    ? tr('Extrait', 'Snippet')
                    : track.availability === 'full'
                        ? tr('Disponible', 'Available')
                        : tr('Indisponible', 'Unavailable'),
                cover: release.cover,
                releaseId: release.id,
                trackId: track.id,
                page: 'release:' + release.id,
                playable: !!track.audio && ['full', 'snippet'].includes(track.availability)
            });
        });
    });

    try {
        const state = window.AQPlayerLibrary?.getState?.();
        const playlists = state?.library?.playlists || [];
        playlists.forEach((playlist) => {
            if (!normalize(playlist.name).includes(q)) return;
            rows.push({
                kind: 'playlist',
                title: playlist.name,
                meta: tr('Playlist AQ-Player', 'AQ-Player playlist'),
                detail: (playlist.tracks?.length || 0) + ' ' + tr('piste(s)', 'track(s)'),
                playlistId: playlist.id
            });
        });
    } catch (_) {}

    const socialTargets = [
        { keys: ['myspace', 'social', 'reseau', 'network', 'feed', 'fil'], title: 'AQ-MySpace', detail: tr('Réseau social JAJ Records', 'JAJ Records social network'), tab: 'feed' },
        { keys: ['amis', 'friends', 'top 8'], title: tr('Amis MySpace', 'MySpace friends'), detail: tr('Amis et Top 8', 'Friends and Top 8'), tab: 'friends' },
        { keys: ['messages', 'dm', 'chat'], title: tr('Messages MySpace', 'MySpace messages'), detail: tr('Messagerie sociale', 'Social messaging'), tab: 'messages' }
    ];
    socialTargets.forEach((item) => {
        if (item.keys.some((key) => normalize(key).includes(q) || q.includes(normalize(key)))) {
            rows.push({ kind: 'social', title: item.title, meta: 'AQ-MySpace', detail: item.detail, socialTab: item.tab });
        }
    });

    return rows.slice(0, 80);
}

function resultIcon(row) {
    if (row.artist) return artistAvatar(row.artist);
    if (row.cover) return '<img class="aq-search-avatar aq-search-cover" src="' + esc(row.cover) + '" alt="">';
    const symbols = { playlist: '♫', social: 'M', track: '♪', release: '▣' };
    return '<span class="aq-search-avatar aq-search-avatar-fallback">' + (symbols[row.kind] || '?') + '</span>';
}

function resultAction(row, index) {
    if (row.kind === 'track' && row.playable) {
        return '<button type="button" class="retro-btn aq-search-play" data-search-play="' + index + '">' + tr('Écouter', 'Play') + '</button>';
    }
    if (row.kind === 'playlist') {
        return '<button type="button" class="retro-btn aq-search-open-playlists">' + tr('Ouvrir Player', 'Open Player') + '</button>';
    }
    if (row.kind === 'social') {
        return '<button type="button" class="retro-btn aq-search-open-social" data-social-tab="' + esc(row.socialTab) + '">' + tr('Ouvrir', 'Open') + '</button>';
    }
    return '';
}

let currentResults = [];

function renderSearch(query) {
    const cleaned = String(query || '').trim();
    if (!cleaned) return renderArtists();
    openNavigator();
    const box = document.getElementById('ie-content-box');
    if (!box) return;
    currentResults = collectResults(cleaned);
    const groups = currentResults.reduce((acc, row) => {
        (acc[row.kind] ||= []).push(row);
        return acc;
    }, {});
    const labels = {
        artist: tr('Artistes', 'Artists'),
        release: tr('Sorties', 'Releases'),
        track: tr('Morceaux', 'Tracks'),
        playlist: tr('Playlists', 'Playlists'),
        social: tr('Social', 'Social')
    };

    let body = '';
    ['artist', 'release', 'track', 'playlist', 'social'].forEach((kind) => {
        const list = groups[kind] || [];
        if (!list.length) return;
        body += '<section class="aq-search-group"><h3>' + labels[kind] + ' <small>(' + list.length + ')</small></h3>';
        body += list.map((row) => {
            const index = currentResults.indexOf(row);
            const openAttr = row.page ? ' data-catalog-page="' + esc(row.page) + '"' : '';
            const tag = row.page ? 'button' : 'div';
            return '<div class="aq-search-result">' +
                '<' + tag + (row.page ? ' type="button"' : '') + ' class="aq-search-main"' + openAttr + '>' +
                resultIcon(row) +
                '<span class="aq-search-copy"><strong>' + esc(row.title) + '</strong><small>' + esc(row.meta) + '</small><span>' + esc(row.detail) + '</span></span>' +
                (row.page ? '<span class="aq-search-arrow">›</span>' : '') +
                '</' + tag + '>' +
                '<div class="aq-search-actions">' + resultAction(row, index) + '</div>' +
                '</div>';
        }).join('');
        body += '</section>';
    });

    box.innerHTML =
        '<article class="aq-search-page">' +
        '<div class="aq-search-page-head"><div><div class="aq-search-kicker">AQ-NET SEARCH</div><h2>' + tr('Recherche', 'Search') + '</h2><p>' +
        tr('Résultats pour', 'Results for') + ' <strong>“' + esc(cleaned) + '”</strong></p></div><span class="aq-search-count">' + currentResults.length + '</span></div>' +
        (body || '<div class="aq-search-empty"><strong>' + tr('Aucun résultat.', 'No results.') + '</strong><p>' + tr('Essaie un artiste, un album, un morceau ou une playlist.', 'Try an artist, album, track or playlist.') + '</p></div>') +
        '</article>';
    box.scrollTop = 0;
    setNavigatorChrome('aq://search?q=' + encodeURIComponent(cleaned), currentResults.length + ' ' + tr('résultat(s)', 'result(s)'));
}

function openPlaylists() {
    window.openWindow?.('win-player', 'task-player');
    window.AQPlayerCatalog?.showPlaylists?.();
    window.dispatchEvent(new Event('aq:playlists-open'));
}

function openSocial(tab) {
    window.openWindow?.('win-myspace', 'task-myspace');
    const button = document.querySelector('#win-myspace .myspace-nav-btn[data-tab="' + tab + '"]');
    button?.click();
}

function playResult(index) {
    const row = currentResults[index];
    if (!row?.playable) return;
    window.openWindow?.('win-player', 'task-player');
    window.AQPlayerCatalog?.playQueue?.(
        [{ releaseId: row.releaseId, trackId: row.trackId }],
        tr('Résultat de recherche', 'Search result'),
        { releaseId: row.releaseId, trackId: row.trackId }
    );
}

function installNavigatorSearch() {
    const links = document.querySelector('#win-ie .navigator-linksbar');
    if (!links || document.getElementById('aq-global-search-form')) return;

    const artists = document.createElement('button');
    artists.type = 'button';
    artists.className = 'retro-btn';
    artists.id = 'ie-artists-btn';
    artists.textContent = tr('Artistes', 'Artists');
    artists.addEventListener('click', renderArtists);
    links.appendChild(artists);

    const form = document.createElement('form');
    form.id = 'aq-global-search-form';
    form.className = 'aq-global-search-form';
    form.innerHTML =
        '<input id="aq-global-search-input" type="search" maxlength="120" autocomplete="off" spellcheck="false" placeholder="' +
        esc(tr('Rechercher artistes, titres, playlists…', 'Search artists, tracks, playlists…')) +
        '"><button type="submit" class="retro-btn">' + tr('Rechercher', 'Search') + '</button>';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        renderSearch(form.querySelector('input')?.value || '');
    });
    links.appendChild(form);

    document.getElementById('ie-content-box')?.addEventListener('click', (event) => {
        const play = event.target.closest('[data-search-play]');
        if (play) {
            event.preventDefault();
            event.stopPropagation();
            playResult(Number(play.dataset.searchPlay));
            return;
        }
        if (event.target.closest('.aq-search-open-playlists')) {
            event.preventDefault();
            openPlaylists();
            return;
        }
        const social = event.target.closest('.aq-search-open-social');
        if (social) {
            event.preventDefault();
            openSocial(social.dataset.socialTab || 'feed');
        }
    });
}

function installStyles() {
    if (document.getElementById('aq-global-search-styles')) return;
    const style = document.createElement('style');
    style.id = 'aq-global-search-styles';
    style.textContent = [
        '.aq-global-search-form{margin-left:auto;display:flex;gap:4px;min-width:240px;max-width:430px;flex:1;justify-content:flex-end}',
        '.aq-global-search-form input{min-width:130px;max-width:310px;flex:1;border:2px inset #fff;padding:3px 5px;font:11px Tahoma,sans-serif}',
        '.aq-search-page,.aq-artists-directory{max-width:920px;margin:0 auto;color:#111}',
        '.aq-search-page-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #aca899;padding-bottom:10px;margin-bottom:12px}',
        '.aq-search-page-head h2{margin:2px 0 4px;color:#000080;font-size:19px}',
        '.aq-search-page-head p{margin:0;color:#555}',
        '.aq-search-kicker{font-size:9px;letter-spacing:1.2px;color:#777;font-weight:bold}',
        '.aq-search-count{min-width:34px;height:34px;display:grid;place-items:center;background:#0054e3;color:#fff;border:2px outset #fff;font-weight:bold}',
        '.aq-search-group{margin:14px 0}.aq-search-group h3{font-size:13px;margin:0 0 6px;color:#000080}.aq-search-group h3 small{color:#666}',
        '.aq-search-result{display:flex;align-items:stretch;border:1px solid #c9c7b8;background:#f8f8f2;margin-bottom:5px}',
        '.aq-search-main{appearance:none;border:0;background:transparent;text-align:left;display:flex;align-items:center;gap:9px;flex:1;padding:7px;min-width:0;color:inherit;font:inherit;cursor:pointer}',
        'div.aq-search-main{cursor:default}.aq-search-main:hover{background:#e8efff}',
        '.aq-search-avatar{width:42px;height:42px;object-fit:cover;border:1px solid #808080;background:#fff;flex:0 0 42px}',
        '.aq-search-avatar-fallback{display:grid;place-items:center;background:linear-gradient(#5d94e7,#174899);color:white;font:bold 18px Tahoma}',
        '.aq-search-cover{object-fit:cover}',
        '.aq-search-copy{display:flex;flex-direction:column;min-width:0;gap:2px;flex:1}.aq-search-copy strong{font-size:12px;color:#003399}.aq-search-copy small{font-size:10px;color:#666}.aq-search-copy>span{font-size:10px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.aq-search-arrow{font-size:24px;color:#777;padding:0 4px}.aq-search-actions{display:flex;align-items:center;padding:6px;border-left:1px solid #ddd}',
        '.aq-search-empty{border:1px dashed #aaa;background:#fafafa;padding:20px;text-align:center}',
        '.aq-artists-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}',
        '.aq-artist-directory-card{display:flex;align-items:center;gap:9px;text-align:left;padding:9px;background:#f8f8f2;border:2px outset #fff;cursor:pointer;font:inherit}',
        '.aq-artist-directory-card:hover{background:#e8efff}.aq-artist-card-copy{display:flex;flex-direction:column;min-width:0;flex:1}.aq-artist-card-copy strong{color:#003399;font-size:13px}.aq-artist-card-copy small{color:#666;margin:2px 0}.aq-artist-card-copy>span{font-size:10px;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        'body.global-dark .aq-search-page,body.global-dark .aq-artists-directory{color:#eef3ff}body.global-dark .aq-search-result,body.global-dark .aq-artist-directory-card,body.global-dark .aq-search-empty{background:#202b3e;border-color:#51698f}body.global-dark .aq-search-copy>span,body.global-dark .aq-artist-card-copy>span,body.global-dark .aq-search-page-head p{color:#d7e0ef}body.global-dark .aq-search-copy strong,body.global-dark .aq-artist-card-copy strong,body.global-dark .aq-search-page-head h2,body.global-dark .aq-search-group h3{color:#9ec3ff}',
        '@media(max-width:700px){.aq-global-search-form{width:100%;min-width:0;order:5}.navigator-linksbar{flex-wrap:wrap}.aq-search-result{flex-direction:column}.aq-search-actions{border-left:0;border-top:1px solid #ddd}.aq-artists-grid{grid-template-columns:1fr}}'
    ].join('');
    document.head.appendChild(style);
}

window.AQGlobalSearch = { search: renderSearch, artists: renderArtists };
window.addEventListener('aq:language-changed', () => {
    const artists = document.getElementById('ie-artists-btn');
    const input = document.getElementById('aq-global-search-input');
    const submit = document.querySelector('#aq-global-search-form button');
    if (artists) artists.textContent = tr('Artistes', 'Artists');
    if (input) input.placeholder = tr('Rechercher artistes, titres, playlists…', 'Search artists, tracks, playlists…');
    if (submit) submit.textContent = tr('Rechercher', 'Search');
});

installStyles();
installNavigatorSearch();
