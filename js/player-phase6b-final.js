// AQ-Player Phase 6B final polish: final labels, stable title and theme -> visualizer bridge.
const isEnglish = () => document.documentElement.lang === 'en';
const tr = (fr, en) => isEnglish() ? en : fr;

let lastTheme = '';

function currentTheme() {
  const win = document.getElementById('win-player');
  if (!win) return 'classic';
  return win.dataset.aqPlayerTheme
    || Array.from(win.classList).find(name => name.startsWith('player-skin-'))?.replace('player-skin-', '')
    || 'classic';
}

function emitThemeIfChanged() {
  const theme = currentTheme();
  if (theme === lastTheme) return;
  lastTheme = theme;
  window.dispatchEvent(new CustomEvent('aq:player-theme-changed', { detail: { theme } }));
}

function setTextIfNeeded(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function polishPlayer() {
  const win = document.getElementById('win-player');
  if (!win) return;

  setTextIfNeeded(win.querySelector(':scope > .title-bar > span'), 'AQ-Player');

  const visual = document.getElementById('aqmp-visual-view');
  if (visual?.classList.contains('active')) {
    setTextIfNeeded(document.getElementById('aqmp-toolbar-title'), tr('Visualisations', 'Visualizations'));
    setTextIfNeeded(document.getElementById('aqmp-toolbar-context'), tr('Moteur procédural audio-réactif', 'Audio-reactive procedural engine'));
  }

  emitThemeIfChanged();
}

function install() {
  const win = document.getElementById('win-player');
  if (!win) return false;

  if (!win.dataset.phase6bFinalObserver) {
    const observer = new MutationObserver(polishPlayer);
    observer.observe(win, {
      attributes: true,
      attributeFilter: ['class', 'data-aq-player-theme'],
      subtree: true,
      childList: true
    });
    win.dataset.phase6bFinalObserver = '1';
  }

  const visual = document.getElementById('aqmp-visual-view');
  if (visual && !visual.dataset.phase6bFinalObserver) {
    const observer = new MutationObserver(polishPlayer);
    observer.observe(visual, { attributes: true, attributeFilter: ['class'] });
    visual.dataset.phase6bFinalObserver = '1';
  }

  polishPlayer();
  return true;
}

if (!install()) {
  const observer = new MutationObserver(() => {
    if (install()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

window.addEventListener('aq:language-changed', polishPlayer);
window.addEventListener('aq:catalog-release-changed', polishPlayer);
setTimeout(polishPlayer, 0);
setTimeout(polishPlayer, 250);
