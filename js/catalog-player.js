import AQCatalog from './catalog.js';
import { showSkinView, installSkinChooser } from './player-skin.js';

let activeReleaseId = null;
let activeQueue = null;
let currentView = 'library';
let libraryFilter = 'albums';

const ui = {
    win: null,
    shell: null,
    sidebar: null,
    toolbarTitle: null,
    toolbarContext: null,
    libraryView: null,
    libraryTree: null,
    libraryRows: null,
    nowView: null,
    visualView: null
};

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

function installStyles() {
    if (document.getElementById('aq-player-6a-styles')) return;

    const style = document.createElement('style');
    style.id = 'aq-player-6a-styles';
    style.textContent = `
        #win-player.aqmp-window {
            min-width: 760px;
            min-height: 500px;
            background: #0b2851;
            border: 2px solid #0b3b7a;
            border-radius: 15px 15px 12px 12px;
            box-shadow: 0 10px 28px rgba(0,0,0,.48), inset 0 0 0 1px #8dc1ff;
            overflow: hidden;
        }

        #win-player.aqmp-window > .title-bar {
            height: 29px;
            box-sizing: border-box;
            padding: 4px 8px 4px 13px;
            border-radius: 12px 12px 0 0;
            border-bottom: 1px solid #051f4c;
            background:
                linear-gradient(to bottom, rgba(255,255,255,.42) 0 8%, transparent 9% 100%),
                linear-gradient(to bottom, #2e7bd4 0%, #0c4f9d 48%, #07346f 52%, #0a438d 100%);
            box-shadow: inset 0 1px 0 #b9dcff, inset 0 -1px 0 #041a3e;
            color: #fff;
            text-shadow: 0 1px 1px #062a60;
            font: bold 12px Tahoma, sans-serif;
        }

        #win-player.aqmp-window .window-controls { gap: 3px; }

        #win-player.aqmp-window .title-bar .retro-btn {
            min-width: 23px;
            height: 20px;
            padding: 0 5px;
            border: 1px solid #8fafd0;
            border-radius: 7px;
            background: linear-gradient(to bottom, #f7fbff 0%, #c4d8ed 47%, #7ea1c4 52%, #e7f2fb 100%);
            box-shadow: inset 0 1px 0 #fff, 0 1px 1px rgba(0,0,0,.35);
            color: #0b335d;
            font: bold 9px Tahoma, sans-serif;
            text-shadow: none;
        }

        #win-player.aqmp-window .title-bar .window-close-btn { color: #7e1010; }

        #win-player.aqmp-window #player-settings-panel {
            top: 34px;
            right: 8px;
            z-index: 1300;
            width: 230px;
            border: 1px solid #6e8ba9;
            background: #eaf1f8;
            box-shadow: 2px 3px 8px rgba(0,0,0,.38);
        }

        #aqmp-shell {
            height: calc(100% - 29px);
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #d9e2ec;
            font: 11px Tahoma, sans-serif;
        }

        #aqmp-body {
            flex: 1 1 auto;
            min-height: 0;
            display: grid;
            grid-template-columns: 148px minmax(0, 1fr);
            background: #f4f6f8;
        }

        #aqmp-sidebar {
            min-width: 0;
            padding: 8px 5px 10px;
            background: linear-gradient(to right, rgba(255,255,255,.96) 0%, rgba(240,247,255,.98) 70%, rgba(191,216,242,.98) 100%);
            border-right: 1px solid #7894b3;
            box-shadow: inset -8px 0 14px rgba(104,150,196,.18);
        }

        .aqmp-side-button {
            position: relative;
            display: block;
            width: 100%;
            min-height: 37px;
            margin: 0 0 2px;
            padding: 5px 7px 5px 12px;
            border: 1px solid transparent;
            border-radius: 12px 2px 2px 12px;
            background: transparent;
            color: #18304f;
            text-align: left;
            font: bold 10px Tahoma, sans-serif;
            line-height: 1.15;
            cursor: pointer;
        }

        .aqmp-side-button::before {
            content: '';
            position: absolute;
            left: 3px;
            top: 50%;
            width: 4px;
            height: 18px;
            transform: translateY(-50%);
            border-radius: 4px;
            background: transparent;
        }

        .aqmp-side-button:hover {
            border-color: #8daed0;
            background: linear-gradient(to right, #fff 0%, #dfefff 100%);
        }

        .aqmp-side-button.active {
            border-color: #5c87b5;
            background: linear-gradient(to right, #fff 0%, #cfe5fb 70%, #a9c9ea 100%);
            color: #073f82;
            box-shadow: inset 0 1px 0 #fff;
        }

        .aqmp-side-button.active::before { background: #0a65b9; }

        .aqmp-side-button small {
            display: block;
            margin-top: 2px;
            color: #697b90;
            font-size: 8px;
            font-weight: normal;
        }

        .aqmp-side-separator {
            height: 1px;
            margin: 6px 8px;
            background: linear-gradient(to right, transparent, #9db0c6, transparent);
        }

        #aqmp-stage {
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #fff;
        }

        #aqmp-toolbar {
            flex: 0 0 35px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            box-sizing: border-box;
            border-bottom: 1px solid #7d91a8;
            background: linear-gradient(to bottom, #fdfefe 0%, #e4ebf2 46%, #c7d3df 52%, #edf3f7 100%);
            box-shadow: inset 0 1px 0 #fff;
        }

        #aqmp-toolbar-title {
            color: #193e6e;
            font-size: 12px;
            font-weight: bold;
        }

        #aqmp-toolbar-context {
            color: #667b91;
            font-size: 9px;
        }

        .aqmp-tool-spacer { flex: 1 1 auto; }

        .aqmp-tool-pill {
            height: 23px;
            padding: 0 8px;
            border: 1px solid #8097ae;
            border-radius: 7px;
            background: linear-gradient(to bottom, #fff, #dbe6f0);
            color: #183c68;
            font: 9px Tahoma, sans-serif;
            cursor: pointer;
        }

        .aqmp-view {
            flex: 1 1 auto;
            min-height: 0;
            display: none;
        }

        .aqmp-view.active { display: flex; }

        #aqmp-library-view { background: #fff; }

        #aqmp-library-tree {
            flex: 0 0 168px;
            min-width: 0;
            padding: 8px 6px;
            box-sizing: border-box;
            border-right: 1px solid #9daebe;
            background: linear-gradient(to right, #edf2f7 0%, #dce5ee 100%);
            overflow: auto;
        }

        .aqmp-tree-title {
            margin: 0 0 6px;
            padding: 4px 6px;
            border-bottom: 1px solid #9eafbf;
            color: #264c76;
            font-weight: bold;
        }

        .aqmp-tree-item {
            display: block;
            width: 100%;
            margin: 1px 0;
            padding: 4px 5px 4px 18px;
            border: 1px solid transparent;
            background: transparent;
            color: #263b53;
            text-align: left;
            font: 10px Tahoma, sans-serif;
            cursor: pointer;
        }

        .aqmp-tree-item::before {
            content: '▸';
            margin-left: -12px;
            margin-right: 5px;
            color: #52779d;
        }

        .aqmp-tree-item.active {
            border-color: #7f9db9;
            background: #fff;
            color: #003c84;
            font-weight: bold;
        }

        #aqmp-library-main {
            flex: 1 1 auto;
            min-width: 0;
            min-height: 0;
            display: flex;
            flex-direction: column;
            background: #fff;
        }

        #aqmp-list-head,
        .aqmp-release-row {
            display: grid;
            grid-template-columns: minmax(190px, 1.7fr) minmax(105px, .9fr) 58px 72px 72px;
            align-items: center;
        }

        #aqmp-list-head {
            flex: 0 0 23px;
            border-bottom: 1px solid #a7a7a7;
            background: linear-gradient(to bottom, #fff 0%, #e4e4e4 100%);
            color: #3d4e60;
            font-size: 9px;
            font-weight: bold;
        }

        #aqmp-list-head span {
            height: 100%;
            padding: 5px 7px;
            box-sizing: border-box;
            border-right: 1px solid #c3c3c3;
        }

        #aqmp-library-rows {
            flex: 1 1 auto;
            min-height: 0;
            overflow: auto;
            background: #fff;
        }

        .aqmp-release-row {
            min-height: 50px;
            border-bottom: 1px solid #e1e1e1;
            color: #27384c;
            cursor: default;
        }

        .aqmp-release-row:hover,
        .aqmp-release-row:focus-visible {
            outline: none;
            background: #dbeaff;
        }

        .aqmp-release-row.selected { background: #b9d7fa; }

        .aqmp-release-main {
            min-width: 0;
            display: grid;
            grid-template-columns: 42px minmax(0, 1fr);
            gap: 7px;
            align-items: center;
            padding: 4px 6px;
        }

        .aqmp-release-cover {
            width: 38px;
            height: 38px;
            border: 1px solid #707070;
            object-fit: cover;
            background: #d6d6d6;
            box-shadow: 1px 1px 2px rgba(0,0,0,.25);
        }

        .aqmp-release-title {
            overflow: hidden;
            color: #153f72;
            font-weight: bold;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .aqmp-release-sub {
            margin-top: 2px;
            overflow: hidden;
            color: #75808b;
            font-size: 8px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .aqmp-cell {
            min-width: 0;
            padding: 4px 7px;
            overflow: hidden;
            color: #3d4b5c;
            font-size: 9px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #aqmp-now-view.player-content {
            display: none;
            grid-template-columns: 210px minmax(0,1fr);
            gap: 8px;
            height: auto;
            padding: 8px;
            background: radial-gradient(circle at 18% 20%, rgba(23,100,174,.28), transparent 34%), linear-gradient(to bottom, #0d274b 0%, #07192e 100%);
        }

        #aqmp-now-view.player-content.active { display: grid; }

        #aqmp-now-view > div:first-child {
            min-width: 0;
            padding: 9px;
            box-sizing: border-box;
            border: 1px solid #4b6a8a;
            background: linear-gradient(to bottom, #163b65, #091d35);
            box-shadow: inset 0 0 18px rgba(0,0,0,.45);
        }

        #aqmp-now-view > div:first-child img {
            width: min(180px, 100%) !important;
            height: auto !important;
            aspect-ratio: 1 / 1;
            border: 1px solid #9fc4e8 !important;
            box-shadow: 0 4px 14px rgba(0,0,0,.55);
        }

        #aqmp-now-view > div:first-child p { color: #a8c4e1 !important; }

        #aqmp-now-view .tracklist-window {
            min-height: 0;
            border: 1px solid #6381a0;
            background: #f7f8fa;
            box-shadow: inset 0 1px 3px rgba(0,0,0,.22);
        }

        #aqmp-now-view #playlist li {
            min-height: 24px;
            padding: 5px 8px;
            border-bottom: 1px solid #e0e4e8;
            color: #24364b;
        }

        #aqmp-now-view #playlist li:hover:not(.locked):not(.unavailable) { background: #dbeaff; }
        #aqmp-now-view #playlist li.active { background: #1b5da4; color: #fff; }

        #aqmp-visual-view {
            position: relative;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background: radial-gradient(circle at 50% 45%, rgba(0,137,255,.55) 0%, rgba(0,48,128,.32) 20%, transparent 47%), #000717;
        }

        #win-player.aqmp-window #player-bottom-bar {
            position: relative !important;
            flex: 0 0 73px;
            bottom: auto !important;
            width: auto !important;
            padding: 8px 12px 6px !important;
            box-sizing: border-box;
            border-top: 1px solid #4e6d8d !important;
            border-radius: 0 0 10px 10px;
            background: linear-gradient(to bottom, rgba(255,255,255,.82) 0%, rgba(255,255,255,.18) 9%, transparent 10%), linear-gradient(to bottom, #cad9e7 0%, #819fbc 46%, #527798 52%, #b8ccdc 100%) !important;
            box-shadow: inset 0 1px 0 #fff, inset 0 -1px 0 #466786;
        }

        #win-player.aqmp-window #player-controls-row { display: flex !important; align-items: center !important; gap: 5px !important; }

        #win-player.aqmp-window #player-controls-row .retro-btn {
            min-width: 28px;
            height: 27px;
            padding: 0 7px;
            border: 1px solid #607f9e;
            border-radius: 14px;
            background: linear-gradient(to bottom, #fff 0%, #d8e5ef 42%, #7196b8 49%, #e7f0f7 100%);
            box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(0,0,0,.36);
            color: #0d355e;
            font: bold 8px Tahoma, sans-serif;
        }

        #win-player.aqmp-window .seek-bar-container {
            height: 8px;
            border: 1px solid #6e879e;
            border-radius: 6px;
            background: #eef5fa;
            overflow: hidden;
        }

        #win-player.aqmp-window #seek-bar { background: linear-gradient(to right, #64ba28, #b7ed70); }

        #win-player.aqmp-window #now-playing {
            margin-top: 4px !important;
            color: #143e6a !important;
            font-size: 9px !important;
            text-shadow: 0 1px 0 rgba(255,255,255,.65);
        }

        @media (max-width: 760px) {
            #aqmp-body { grid-template-columns: 110px minmax(0,1fr); }
            .aqmp-side-button { min-height: 31px; padding-left: 8px; font-size: 9px; }
            #aqmp-library-tree { display: none; }
            #aqmp-list-head,
            .aqmp-release-row { grid-template-columns: minmax(150px,1fr) 65px; }
            #aqmp-list-head span:nth-child(2),
            #aqmp-list-head span:nth-child(4),
            #aqmp-list-head span:nth-child(5),
            .aqmp-cell.artist,
            .aqmp-cell.type,
            .aqmp-cell.status { display: none; }
        }
    `;
    document.head.appendChild(style);
}

function buildShell() {
    ui.win = document.getElementById('win-player');
    if (!ui.win) return false;

    repairMySpaceIconPath();
    installStyles();

    ui.win.classList.add('aqmp-window');
    ui.win.style.minWidth = '760px';
    ui.win.style.minHeight = '500px';

    if (ui.win.dataset.phase6aSized !== '1') {
        const width = parseInt(ui.win.style.width || '0', 10);
        const height = parseInt(ui.win.style.height || '0', 10);
        if (!width || width <= 760) ui.win.style.width = '860px';
        if (!height || height <= 460) ui.win.style.height = '560px';
        ui.win.dataset.phase6aSized = '1';
    }

    const playerContent = ui.win.querySelector('.player-content');
    const bottomBar = document.getElementById('player-bottom-bar');
    const titleBar = ui.win.querySelector('.title-bar');
    if (!playerContent || !bottomBar || !titleBar) return false;

    document.getElementById('player-modebar')?.remove();
    document.getElementById('player-library-view')?.remove();
    document.getElementById('player-release-strip')?.remove();
    document.getElementById('mobile-release-row')?.remove();

    if (!document.getElementById('aqmp-shell')) {
        const shell = document.createElement('div');
        shell.id = 'aqmp-shell';

        const body = document.createElement('div');
        body.id = 'aqmp-body';

        const sidebar = document.createElement('aside');
        sidebar.id = 'aqmp-sidebar';

        const stage = document.createElement('main');
        stage.id = 'aqmp-stage';

        const toolbar = document.createElement('div');
        toolbar.id = 'aqmp-toolbar';

        const toolbarTitle = document.createElement('div');
        toolbarTitle.id = 'aqmp-toolbar-title';

        const toolbarContext = document.createElement('div');
        toolbarContext.id = 'aqmp-toolbar-context';

        const spacer = document.createElement('div');
        spacer.className = 'aqmp-tool-spacer';

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'aqmp-tool-pill';
        backButton.dataset.action = 'library';
        backButton.addEventListener('click', () => showView('library'));

        toolbar.append(toolbarTitle, toolbarContext, spacer, backButton);

        const libraryView = document.createElement('section');
        libraryView.id = 'aqmp-library-view';
        libraryView.className = 'aqmp-view';

        const libraryTree = document.createElement('aside');
        libraryTree.id = 'aqmp-library-tree';

        const libraryMain = document.createElement('div');
        libraryMain.id = 'aqmp-library-main';

        const listHead = document.createElement('div');
        listHead.id = 'aqmp-list-head';
        listHead.innerHTML = '<span data-col="title"></span><span data-col="artist"></span><span data-col="year"></span><span data-col="type"></span><span data-col="status"></span>';

        const libraryRows = document.createElement('div');
        libraryRows.id = 'aqmp-library-rows';

        libraryMain.append(listHead, libraryRows);
        libraryView.append(libraryTree, libraryMain);

        const visualView = document.createElement('section');
        visualView.id = 'aqmp-visual-view';
        visualView.className = 'aqmp-view';

        playerContent.id = 'aqmp-now-view';
        playerContent.classList.add('aqmp-view');

        stage.append(toolbar, libraryView, playerContent, visualView);
        body.append(sidebar, stage);
        shell.append(body, bottomBar);
        titleBar.insertAdjacentElement('afterend', shell);
    }

    ui.shell = document.getElementById('aqmp-shell');
    ui.sidebar = document.getElementById('aqmp-sidebar');
    ui.toolbarTitle = document.getElementById('aqmp-toolbar-title');
    ui.toolbarContext = document.getElementById('aqmp-toolbar-context');
    ui.libraryView = document.getElementById('aqmp-library-view');
    ui.libraryTree = document.getElementById('aqmp-library-tree');
    ui.libraryRows = document.getElementById('aqmp-library-rows');
    ui.nowView = document.getElementById('aqmp-now-view');
    ui.visualView = document.getElementById('aqmp-visual-view');

    buildSidebar();
    renderLibraryTree();
    polishTransport();
    return true;
}

function buildSidebar() {
    if (!ui.sidebar) return;
    ui.sidebar.innerHTML = '';

    const items = [
        { view: 'now', fr: 'Lecture en cours', en: 'Now Playing', hintFr: 'piste + pochette', hintEn: 'track + cover' },
        { view: 'library', fr: 'Bibliothèque média', en: 'Media Library', hintFr: 'albums, artistes', hintEn: 'albums, artists' },
        { view: 'playlists', fr: 'Playlists & favoris', en: 'Playlists & favorites', hintFr: 'mes sélections, partage', hintEn: 'my mixes, sharing' },
        { view: 'visual', fr: 'Visualisations', en: 'Visualizations', hintFr: 'moteur visuel', hintEn: 'visual engine' }
    ];

    items.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aqmp-side-button';
        button.dataset.view = item.view;
        button.innerHTML = `${tr(item.fr, item.en)}<small>${tr(item.hintFr, item.hintEn)}</small>`;
        button.addEventListener('click', () => showView(item.view));
        ui.sidebar.appendChild(button);
    });

    const sep1 = document.createElement('div');
    sep1.className = 'aqmp-side-separator';
    ui.sidebar.appendChild(sep1);

    [tr('Copier depuis un CD', 'Copy from CD'), tr('Radio JAJ', 'JAJ Radio'), tr('Copier vers un appareil', 'Copy to Device')].forEach((text) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aqmp-side-button';
        button.disabled = true;
        button.style.opacity = '.48';
        button.innerHTML = `${text}<small>${tr('indisponible', 'unavailable')}</small>`;
        ui.sidebar.appendChild(button);
    });

    const sep2 = document.createElement('div');
    sep2.className = 'aqmp-side-separator';
    ui.sidebar.appendChild(sep2);

    const skin = document.createElement('button');
    skin.type = 'button';
    skin.className = 'aqmp-side-button';
    skin.dataset.view = 'skin';
    skin.innerHTML = `${tr('Sélecteur de skins', 'Skin Chooser')}<small>CFG</small>`;
    skin.addEventListener('click', () => {
        showSkinView();
    });
    ui.sidebar.appendChild(skin);
}

function renderLibraryTree() {
    if (!ui.libraryTree) return;

    const filters = [
        { id: 'all', fr: 'Toute la musique', en: 'All Music' },
        { id: 'albums', fr: 'Albums', en: 'Albums' },
        { id: 'artists', fr: 'Artistes', en: 'Artists' },
        { id: 'archives', fr: 'Archives', en: 'Archives' }
    ];

    ui.libraryTree.innerHTML = `<div class="aqmp-tree-title">${tr('Bibliothèque', 'Library')}</div>`;

    filters.forEach((filter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aqmp-tree-item';
        button.dataset.filter = filter.id;
        button.textContent = tr(filter.fr, filter.en);
        button.classList.toggle('active', libraryFilter === filter.id);
        button.addEventListener('click', () => {
            libraryFilter = filter.id;
            renderLibraryTree();
            renderLibrary();
        });
        ui.libraryTree.appendChild(button);
    });
}

function releaseTypeLabel(release) {
    const type = String(release?.type || '').toLowerCase();
    if (type === 'album') return 'Album';
    if (type === 'single') return 'Single';
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

function filteredReleases() {
    const releases = AQCatalog.getReleases();
    if (libraryFilter === 'archives') return releases.filter((release) => release.status === 'archive');
    return releases;
}

function renderLibrary() {
    if (!ui.libraryRows) return;

    const labels = {
        title: tr('Titre', 'Title'),
        artist: tr('Artiste', 'Artist'),
        year: tr('Année', 'Year'),
        type: 'Type',
        status: tr('Statut', 'Status')
    };

    document.querySelectorAll('#aqmp-list-head [data-col]').forEach((cell) => {
        cell.textContent = labels[cell.dataset.col] || '';
    });

    const releases = filteredReleases();
    ui.libraryRows.innerHTML = '';

    releases.forEach((release) => {
        const artist = getReleaseArtist(release);
        const row = document.createElement('div');
        row.className = 'aqmp-release-row';
        row.tabIndex = 0;
        row.dataset.releaseId = release.id;
        row.classList.toggle('selected', release.id === activeReleaseId);

        const main = document.createElement('div');
        main.className = 'aqmp-release-main';

        const cover = document.createElement('img');
        cover.className = 'aqmp-release-cover';
        cover.src = release.cover || 'medias/img/albumimg.png';
        cover.alt = '';

        const copy = document.createElement('div');
        copy.innerHTML = '<div class="aqmp-release-title"></div><div class="aqmp-release-sub"></div>';
        copy.querySelector('.aqmp-release-title').textContent = release.title;
        copy.querySelector('.aqmp-release-sub').textContent = `${release.tracks?.length || 0} ${tr('pistes', 'tracks')} · ${release.label || 'JAJ Records'}`;
        main.append(cover, copy);

        const cells = [
            ['artist', artist.name],
            ['year', release.year || '—'],
            ['type', releaseTypeLabel(release)],
            ['status', releaseStatusLabel(release)]
        ].map(([className, value]) => {
            const cell = document.createElement('div');
            cell.className = `aqmp-cell ${className}`;
            cell.textContent = value;
            return cell;
        });

        row.append(main, ...cells);

        const open = () => {
            selectRelease(release.id, { resetPlayback: true, persist: true });
            showView('now');
        };

        row.addEventListener('dblclick', open);
        row.addEventListener('click', () => {
            document.querySelectorAll('.aqmp-release-row.selected').forEach((el) => el.classList.remove('selected'));
            row.classList.add('selected');
        });
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') open();
        });

        ui.libraryRows.appendChild(row);
    });
}

function polishTransport() {
    const controls = document.querySelectorAll('#player-controls-row .retro-btn');
    if (controls[0]) controls[0].textContent = '◀◀';
    if (controls[1]) controls[1].textContent = '▶';
    if (controls[2]) controls[2].textContent = 'Ⅱ';
    if (controls[3]) controls[3].textContent = '■';
    if (controls[4]) controls[4].textContent = '▶▶';
}

function showView(view) {
    const safe = ['library', 'now', 'visual', 'playlists'].includes(view) ? view : 'library';
    currentView = safe;

    const map = { library: ui.libraryView, now: ui.nowView, visual: ui.visualView, playlists: document.getElementById('aqmp-playlists-view') };
    document.querySelectorAll('#aqmp-stage > .aqmp-view').forEach(element => element.classList.remove('active'));
    map[safe]?.classList.add('active');

    document.querySelectorAll('#aqmp-sidebar [data-view]').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === safe);
    });

    const back = document.querySelector('#aqmp-toolbar [data-action="library"]');
    if (back) {
        back.textContent = tr('← Bibliothèque', '← Library');
        back.style.display = safe === 'library' ? 'none' : '';
    }

    if (safe === 'playlists') {
        ui.toolbarTitle.textContent = tr('Playlists & favoris', 'Playlists & favorites');
        ui.toolbarContext.textContent = 'AQ-Player++';
        window.dispatchEvent(new Event('aq:playlists-open'));
    } else if (safe === 'library') {
        ui.toolbarTitle.textContent = tr('Bibliothèque média', 'Media Library');
        ui.toolbarContext.textContent = tr('JAJ Records // catalogue local', 'JAJ Records // local catalog');
        renderLibrary();
    } else if (safe === 'now') {
        const release = AQCatalog.getRelease(activeReleaseId);
        const artist = getReleaseArtist(release);
        ui.toolbarTitle.textContent = tr('Lecture en cours', 'Now Playing');
        ui.toolbarContext.textContent = activeQueue?.name || (release ? `${artist.name} — ${release.title}` : '');
    } else {
        ui.toolbarTitle.textContent = tr('Visualisations', 'Visualizations');
        ui.toolbarContext.textContent = tr('Moteur procédural audio-réactif', 'Audio-reactive procedural engine');
    }
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
    document.querySelectorAll('#playlist li').forEach((row, index) => row.classList.toggle('active', index === currentTrackIndex));
    return true;
}

function updateReleaseMetadata(release) {
    const artist = getReleaseArtist(release);

    const title = document.querySelector('#win-player .title-bar > span');
    if (title) title.textContent = 'AQ-Player';

    const cover = document.querySelector('#aqmp-now-view > div:first-child img');
    if (cover) {
        cover.hidden = !release.cover;
        if (release.cover) cover.src = release.cover;
        else cover.removeAttribute('src');
        cover.alt = `${release.title} — ${artist.name}`;
    }

    const copyright = document.querySelector('#aqmp-now-view > div:first-child p');
    if (copyright) copyright.textContent = release.copyright || `© ${release.year || ''} ${release.label || 'JAJ Records'}`.trim();

    renderLibrary();
}

function selectRelease(releaseId, options = {}) {
    const { resetPlayback = false, persist = false } = options;
    const release = AQCatalog.getRelease(releaseId) || AQCatalog.getRelease(AQCatalog.defaultReleaseId);
    if (!release) return false;

    const changed = !!activeQueue || activeReleaseId !== release.id;
    activeQueue = null;
    if (resetPlayback && changed) clearPlaybackForReleaseSwitch();
    if (!applyPlayerTracks(release)) return false;

    activeReleaseId = release.id;
    updateReleaseMetadata(release);

    if (persist && typeof updateSetting === 'function') updateSetting('playerReleaseId', release.id, false);
    if (resetPlayback && changed && typeof savePlayerState === 'function') savePlayerState();

    window.dispatchEvent(new CustomEvent('aq:catalog-release-changed', {
        detail: { releaseId: release.id, artistId: release.artistId }
    }));

    return true;
}

function releaseFromSettings() {
    if (typeof appSettings !== 'undefined' && appSettings?.playerReleaseId) return appSettings.playerReleaseId;
    return AQCatalog.defaultReleaseId;
}

function syncReleaseFromSettings() {
    if (activeQueue) return;
    const wanted = releaseFromSettings();
    if (!wanted) return;
    selectRelease(wanted, {
        resetPlayback: !!activeReleaseId && activeReleaseId !== wanted,
        persist: false
    });
}

function refreshLanguage() {
    buildSidebar();
    renderLibraryTree();
    renderLibrary();
    showView(currentView);
}

function initCatalogPlayer() {
    if (typeof myTracks === 'undefined' || typeof renderPlaylist !== 'function') {
        console.warn('[AQ Catalog Player] AQ-Player is not initialized yet.');
        return;
    }

    repairMySpaceIconPath();
    if (!buildShell()) return;
    installSkinChooser();

    selectRelease(releaseFromSettings(), { resetPlayback: false, persist: false });
    showView('library');

    window.addEventListener('aq:catalog-updated', () => {
        renderLibraryTree(); renderLibrary();
        if (activeQueue) {
            // A withdrawn track must no longer be playable through a saved queue.
            const valid = resolveQueue(activeQueue.refs);
            if (valid.length !== myTracks.length || valid.some((track, index) => track.file !== myTracks[index]?.file || track.audioBase !== myTracks[index]?.audioBase)) {
                clearPlaybackForReleaseSwitch(); activeQueue = null; syncReleaseFromSettings();
            }
            return;
        }
        if (activeReleaseId && !AQCatalog.getRelease(activeReleaseId)) {
            selectRelease(AQCatalog.defaultReleaseId, { resetPlayback: true, persist: true });
            return;
        }
        // Leave an ongoing queue intact; refreshed releases load on the next selection.
        if (typeof player !== 'undefined' && player.paused) syncReleaseFromSettings();
    });
    window.addEventListener('aq:language-changed', refreshLanguage);
    window.addEventListener('jaj:session-changed', () => { if (activeQueue) clearPlaybackForReleaseSwitch(); activeQueue = null; queueMicrotask(syncReleaseFromSettings); });
    window.addEventListener('aq:track-changed', () => {
        if (!activeQueue) return;
        const release = AQCatalog.getRelease(myTracks[currentTrackIndex]?.releaseId);
        if (release) updateReleaseMetadata(release);
    });
}

function resolveQueue(refs) {
    return refs.map(ref => AQCatalog.toPlayerTracks(ref.releaseId).find(track => track.id === ref.trackId))
        .filter(track => track && track.file && ['full', 'snippet'].includes(track.status));
}

function playQueue(refs, name, startRef = null) {
    const tracks = resolveQueue(refs);
    if (!tracks.length) return false;
    clearPlaybackForReleaseSwitch();
    activeQueue = { refs: structuredClone(refs), name };
    myTracks = tracks;
    renderPlaylist();
    const index = startRef ? tracks.findIndex(track => track.id === startRef.trackId && track.releaseId === startRef.releaseId) : 0;
    playTrackAtIndex(Math.max(0, index), false);
    showView('now');
    return true;
}

window.AQPlayerCatalog = {
    playQueue,
    isCustomQueue: () => !!activeQueue,
    getCurrentTrack: () => typeof currentTrackIndex !== 'undefined' ? myTracks[currentTrackIndex] || null : null,
    showPlaylists: () => showView('playlists'),
    selectRelease: (releaseId) => selectRelease(releaseId, { resetPlayback: true, persist: true }),
    getCurrentRelease: () => AQCatalog.getRelease(activeReleaseId),
    getCurrentReleaseId: () => activeReleaseId,
    showLibrary: () => showView('library'),
    showNowPlaying: () => showView('now'),
    showVisualizations: () => showView('visual'),
    refresh: syncReleaseFromSettings
};

initCatalogPlayer();
