// AQ-Player Phase 6 — full-app skin system + final i18n/title cleanup.
const PLAYER_STATE_KEY = 'aquerty_player_state_v1';

const THEMES = [
  { id: 'classic', fr: 'Classique XP', en: 'Classic XP' },
  { id: 'dark', fr: 'Nocturne', en: 'Midnight' },
  { id: 'rose', fr: 'Rose OG', en: 'Rose OG' },
  { id: 'lime', fr: 'Vert LimeWire', en: 'LimeWire Green' },
  { id: 'silver', fr: 'Argent 2000', en: 'Media Silver' },
  { id: 'violet', fr: 'Violet Plasma', en: 'Plasma Violet' }
];

const ALL_CLASSES = THEMES.map(theme => `player-skin-${theme.id}`);
const isEnglish = () => document.documentElement.lang === 'en';
const tr = (fr, en) => isEnglish() ? en : fr;

function readSavedTheme() {
  try {
    const state = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || '{}');
    const saved = String(state.playerSkin || 'classic');
    return THEMES.some(theme => theme.id === saved) ? saved : 'classic';
  } catch (_) {
    return 'classic';
  }
}

function writeSavedTheme(themeId) {
  try {
    const state = JSON.parse(localStorage.getItem(PLAYER_STATE_KEY) || '{}');
    state.playerSkin = themeId;
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('aq:persistence-changed', { detail: { kind: 'player-preferences', at: Date.now() } }));
  } catch (_) {}
}

function applyTheme(themeId, persist = false) {
  const win = document.getElementById('win-player');
  if (!win) return;
  const safe = THEMES.some(theme => theme.id === themeId) ? themeId : 'classic';
  win.classList.remove(...ALL_CLASSES, 'player-skin-ice');
  win.classList.add(`player-skin-${safe}`);
  win.dataset.aqPlayerTheme = safe;
  const select = document.getElementById('player-skin-select');
  if (select && select.value !== safe) select.value = safe;
  if (persist) writeSavedTheme(safe);
}

function rebuildThemeSelect() {
  const select = document.getElementById('player-skin-select');
  if (!select) return false;
  const wanted = select.value || readSavedTheme();
  select.innerHTML = '';
  THEMES.forEach(theme => {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = isEnglish() ? theme.en : theme.fr;
    select.appendChild(option);
  });
  select.value = THEMES.some(theme => theme.id === wanted) ? wanted : readSavedTheme();
  if (select.dataset.phase6Themes !== '1') {
    select.dataset.phase6Themes = '1';
    select.addEventListener('change', event => {
      applyTheme(event.target.value, true);
    });
  }
  applyTheme(select.value, false);
  return true;
}

function forceSimpleTitle() {
  const title = document.querySelector('#win-player > .title-bar > span');
  if (!title) return;
  if (title.textContent !== 'AQ-Player') title.textContent = 'AQ-Player';
}

function translatePlayerUI() {
  forceSimpleTitle();
  rebuildThemeSelect();

  const settingsTitle = document.getElementById('player-settings-title');
  const skinLabel = document.getElementById('player-skin-label');
  const hint = document.getElementById('player-settings-hint');
  const skinTitle = document.querySelector('#aqmp-skin-view .aqmp-skin-title');
  const skinSub = document.querySelector('#aqmp-skin-view .aqmp-skin-sub');
  const skinNote = document.querySelector('#aqmp-skin-view .aqmp-skin-note');

  if (settingsTitle) settingsTitle.textContent = tr('Apparence du lecteur', 'Player appearance');
  if (skinLabel) {
    const select = document.getElementById('player-skin-select');
    skinLabel.childNodes.forEach(node => { if (node.nodeType === Node.TEXT_NODE) node.textContent = ''; });
    skinLabel.prepend(`${tr('Thème :', 'Theme:')} `);
    if (select && select.parentElement !== skinLabel) skinLabel.appendChild(select);
  }
  if (hint) hint.textContent = tr('Choisis un thème pour toute l’interface AQ-Player.', 'Choose a theme for the whole AQ-Player interface.');
  if (skinTitle) skinTitle.textContent = tr('Sélecteur de thèmes', 'Theme Chooser');
  if (skinSub) skinSub.textContent = tr('Le thème s’applique maintenant à toute l’application.', 'The theme now applies to the whole application.');
  if (skinNote) skinNote.textContent = tr('Bibliothèque, lecture, visualisations, contrôles et menus utilisent tous le même thème.', 'Library, playback, visualizations, controls and menus all use the same theme.');

  const skinSidebar = Array.from(document.querySelectorAll('#aqmp-sidebar .aqmp-side-button')).find(button => button.dataset.view === 'skin' || button.querySelector('small')?.textContent === 'CFG');
  if (skinSidebar) skinSidebar.innerHTML = `${tr('Sélecteur de thèmes', 'Theme Chooser')}<small>${tr('apparence complète', 'full appearance')}</small>`;

  const currentSidebar = document.querySelector('#aqmp-sidebar [data-view="now"]');
  const librarySidebar = document.querySelector('#aqmp-sidebar [data-view="library"]');
  const visualSidebar = document.querySelector('#aqmp-sidebar [data-view="visual"]');
  if (currentSidebar) currentSidebar.innerHTML = `${tr('Lecture en cours', 'Now Playing')}<small>${tr('piste + pochette', 'track + cover')}</small>`;
  if (librarySidebar) librarySidebar.innerHTML = `${tr('Bibliothèque média', 'Media Library')}<small>${tr('albums, artistes', 'albums, artists')}</small>`;
  if (visualSidebar) visualSidebar.innerHTML = `${tr('Visualisations', 'Visualizations')}<small>${tr('moteur procédural', 'procedural engine')}</small>`;
}

function installThemeStyles() {
  if (document.getElementById('aq-player-full-theme-styles')) return;
  const style = document.createElement('style');
  style.id = 'aq-player-full-theme-styles';
  style.textContent = `
    #win-player.aqmp-window{
      --aqp-title1:#2e7bd4;--aqp-title2:#0c4f9d;--aqp-title3:#07346f;--aqp-title4:#0a438d;
      --aqp-border:#5c87b5;--aqp-shell:#d9e2ec;--aqp-sidebar1:#fff;--aqp-sidebar2:#d9ebfb;
      --aqp-panel:#f6f9fc;--aqp-panel2:#dce7f1;--aqp-stage:#fff;--aqp-text:#183b63;--aqp-muted:#65798e;
      --aqp-active:#b9d7fa;--aqp-active2:#1b5da4;--aqp-button:linear-gradient(to bottom,#fff,#d8e5ef 42%,#7196b8 49%,#e7f0f7 100%);
      --aqp-bottom:linear-gradient(to bottom,rgba(255,255,255,.82) 0%,rgba(255,255,255,.18) 9%,transparent 10%),linear-gradient(to bottom,#cad9e7 0%,#819fbc 46%,#527798 52%,#b8ccdc 100%);
      --aqp-now1:#163b65;--aqp-now2:#07192e;--aqp-nowtext:#a8c4e1;--aqp-accent:#64ba28;
    }
    #win-player.player-skin-dark{--aqp-title1:#494f5d;--aqp-title2:#252b36;--aqp-title3:#10141b;--aqp-title4:#272d37;--aqp-border:#59616c;--aqp-shell:#20242b;--aqp-sidebar1:#30353d;--aqp-sidebar2:#171b20;--aqp-panel:#242a31;--aqp-panel2:#171b20;--aqp-stage:#14181d;--aqp-text:#e5e9ef;--aqp-muted:#a2aab4;--aqp-active:#3b4654;--aqp-active2:#65788d;--aqp-button:linear-gradient(to bottom,#606875,#363d47 46%,#20262e 52%,#4b535e 100%);--aqp-bottom:linear-gradient(to bottom,#505862,#2c333c 48%,#181d23 52%,#3c444e);--aqp-now1:#191e25;--aqp-now2:#080b0f;--aqp-nowtext:#c7d0da;--aqp-accent:#7ad45e}
    #win-player.player-skin-rose{--aqp-title1:#e18aad;--aqp-title2:#b64f78;--aqp-title3:#7a2849;--aqp-title4:#a54468;--aqp-border:#b76d8a;--aqp-shell:#f0dce5;--aqp-sidebar1:#fff8fb;--aqp-sidebar2:#efd1df;--aqp-panel:#fff8fb;--aqp-panel2:#efd6e1;--aqp-stage:#fffafb;--aqp-text:#6f2946;--aqp-muted:#94667a;--aqp-active:#f2c2d6;--aqp-active2:#b9517a;--aqp-button:linear-gradient(to bottom,#fff,#f5dce7 44%,#ca789a 50%,#f8e9ef 100%);--aqp-bottom:linear-gradient(to bottom,#f7dce7,#c97698 48%,#9e476a 52%,#e9b9cc);--aqp-now1:#6e2947;--aqp-now2:#2a0b17;--aqp-nowtext:#f7ccdc;--aqp-accent:#ff6aaf}
    #win-player.player-skin-lime{--aqp-title1:#92d95f;--aqp-title2:#4e9b2e;--aqp-title3:#2e6318;--aqp-title4:#4b8d2c;--aqp-border:#5c8a45;--aqp-shell:#dfe9d9;--aqp-sidebar1:#fbfff8;--aqp-sidebar2:#d8edcc;--aqp-panel:#f8fff3;--aqp-panel2:#dbead4;--aqp-stage:#fcfff9;--aqp-text:#28501a;--aqp-muted:#66815b;--aqp-active:#c7eab4;--aqp-active2:#579d35;--aqp-button:linear-gradient(to bottom,#fff,#e5f3dc 45%,#7fb65f 51%,#f1faec 100%);--aqp-bottom:linear-gradient(to bottom,#e3f1da,#8fbd70 48%,#557e3b 52%,#c3dfb2);--aqp-now1:#31591f;--aqp-now2:#11200a;--aqp-nowtext:#d3efc5;--aqp-accent:#9fff4d}
    #win-player.player-skin-silver{--aqp-title1:#eceff2;--aqp-title2:#adb4bc;--aqp-title3:#6e7680;--aqp-title4:#a0a7af;--aqp-border:#7b858f;--aqp-shell:#d8dde2;--aqp-sidebar1:#fafafa;--aqp-sidebar2:#d5d9de;--aqp-panel:#f7f7f7;--aqp-panel2:#dddfe2;--aqp-stage:#fff;--aqp-text:#30363c;--aqp-muted:#70777d;--aqp-active:#d1d8df;--aqp-active2:#7b8794;--aqp-button:linear-gradient(to bottom,#fff,#e7e9eb 45%,#9da4ab 51%,#f5f6f7 100%);--aqp-bottom:linear-gradient(to bottom,#eceeef,#b0b6bc 48%,#7d858c 52%,#d4d7da);--aqp-now1:#555b61;--aqp-now2:#1d2023;--aqp-nowtext:#e1e5e9;--aqp-accent:#a9d8ff}
    #win-player.player-skin-violet{--aqp-title1:#a677e6;--aqp-title2:#6844ae;--aqp-title3:#3a236f;--aqp-title4:#5d3c99;--aqp-border:#7657a4;--aqp-shell:#e4daf1;--aqp-sidebar1:#fdf9ff;--aqp-sidebar2:#dfcff0;--aqp-panel:#fcf8ff;--aqp-panel2:#e0d5ea;--aqp-stage:#fffbff;--aqp-text:#4d2b73;--aqp-muted:#79668f;--aqp-active:#d8c3f1;--aqp-active2:#7550aa;--aqp-button:linear-gradient(to bottom,#fff,#eee2f8 45%,#9a77c4 51%,#f7effd 100%);--aqp-bottom:linear-gradient(to bottom,#e8daf5,#9b7abf 48%,#65468a 52%,#d5c0e7);--aqp-now1:#493066;--aqp-now2:#170c24;--aqp-nowtext:#e6d2f6;--aqp-accent:#cf8cff}

    #win-player.aqmp-window{background:var(--aqp-shell)!important;border-color:var(--aqp-border)!important}
    #win-player.aqmp-window>.title-bar{background:linear-gradient(to bottom,rgba(255,255,255,.42) 0 8%,transparent 9% 100%),linear-gradient(to bottom,var(--aqp-title1) 0%,var(--aqp-title2) 48%,var(--aqp-title3) 52%,var(--aqp-title4) 100%)!important;border-bottom-color:var(--aqp-border)!important}
    #win-player #aqmp-shell,#win-player #aqmp-body{background:var(--aqp-shell)!important;color:var(--aqp-text)!important}
    #win-player #aqmp-sidebar{background:linear-gradient(to right,var(--aqp-sidebar1),var(--aqp-sidebar2))!important;border-right-color:var(--aqp-border)!important}
    #win-player .aqmp-side-button{color:var(--aqp-text)!important}
    #win-player .aqmp-side-button small{color:var(--aqp-muted)!important}
    #win-player .aqmp-side-button:hover,#win-player .aqmp-side-button.active{border-color:var(--aqp-border)!important;background:var(--aqp-active)!important;color:var(--aqp-text)!important}
    #win-player #aqmp-toolbar{background:linear-gradient(to bottom,var(--aqp-panel),var(--aqp-panel2))!important;border-bottom-color:var(--aqp-border)!important}
    #win-player #aqmp-toolbar-title,#win-player #aqmp-toolbar-context{color:var(--aqp-text)!important}
    #win-player .aqmp-tool-pill,#win-player .aqmp-vis-btn{background:var(--aqp-button)!important;border-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
    #win-player #aqmp-stage,#win-player #aqmp-library-view,#win-player #aqmp-library-main,#win-player #aqmp-library-rows{background:var(--aqp-stage)!important;color:var(--aqp-text)!important}
    #win-player #aqmp-library-tree{background:linear-gradient(to right,var(--aqp-panel),var(--aqp-panel2))!important;border-right-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
    #win-player .aqmp-tree-title,#win-player .aqmp-tree-item,#win-player .aqmp-release-title,#win-player .aqmp-cell{color:var(--aqp-text)!important}
    #win-player .aqmp-tree-item.active,#win-player .aqmp-release-row.selected,#win-player .aqmp-release-row:hover{background:var(--aqp-active)!important;border-color:var(--aqp-border)!important}
    #win-player #aqmp-list-head{background:linear-gradient(to bottom,var(--aqp-panel),var(--aqp-panel2))!important;color:var(--aqp-text)!important;border-bottom-color:var(--aqp-border)!important}
    #win-player .aqmp-release-row{border-bottom-color:color-mix(in srgb,var(--aqp-border) 30%,transparent)!important;color:var(--aqp-text)!important}
    #win-player #aqmp-now-view.player-content{background:radial-gradient(circle at 18% 20%,color-mix(in srgb,var(--aqp-title1) 30%,transparent),transparent 36%),linear-gradient(to bottom,var(--aqp-now1),var(--aqp-now2))!important}
    #win-player #aqmp-now-view>div:first-child{background:linear-gradient(to bottom,var(--aqp-now1),var(--aqp-now2))!important;border-color:var(--aqp-border)!important}
    #win-player #aqmp-now-view>div:first-child p{color:var(--aqp-nowtext)!important}
    #win-player #aqmp-now-view .tracklist-window{background:var(--aqp-stage)!important;border-color:var(--aqp-border)!important}
    #win-player #aqmp-now-view #playlist li{color:var(--aqp-text)!important;border-bottom-color:color-mix(in srgb,var(--aqp-border) 25%,transparent)!important}
    #win-player #aqmp-now-view #playlist li:hover:not(.locked):not(.unavailable){background:var(--aqp-active)!important}
    #win-player #aqmp-now-view #playlist li.active{background:var(--aqp-active2)!important;color:#fff!important}
    #win-player #player-bottom-bar,#win-player #aqmp-visual-controls{background:var(--aqp-bottom)!important;border-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
    #win-player #player-controls-row .retro-btn,#win-player #mobile-transport .retro-btn{background:var(--aqp-button)!important;border-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
    #win-player #now-playing{color:var(--aqp-text)!important}
    #win-player #seek-bar{background:linear-gradient(to right,var(--aqp-accent),color-mix(in srgb,var(--aqp-accent) 45%,#fff))!important}
    #win-player #aqmp-skin-view{background:linear-gradient(to bottom,var(--aqp-panel),var(--aqp-panel2))!important;color:var(--aqp-text)!important}
    #win-player .aqmp-skin-layout,#win-player .aqmp-skin-panel-host{background:var(--aqp-panel)!important;border-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
    #win-player .aqmp-skin-title,#win-player .aqmp-skin-sub,#win-player .aqmp-skin-note,#win-player #player-settings-panel,#win-player #player-settings-panel .setting-title{color:var(--aqp-text)!important}
    #win-player #aqmp-visual-controls select{background:var(--aqp-panel)!important;border-color:var(--aqp-border)!important;color:var(--aqp-text)!important}
  `;
  document.head.appendChild(style);
}

function init() {
  installThemeStyles();
  rebuildThemeSelect();
  applyTheme(readSavedTheme(), false);
  translatePlayerUI();

  const title = document.querySelector('#win-player > .title-bar > span');
  if (title && !title.dataset.simpleTitleObserved) {
    title.dataset.simpleTitleObserved = '1';
    new MutationObserver(forceSimpleTitle).observe(title, { childList: true, characterData: true, subtree: true });
  }
}

init();
window.addEventListener('aq:language-changed', () => setTimeout(translatePlayerUI, 0));
window.addEventListener('aq:catalog-release-changed', forceSimpleTitle);
