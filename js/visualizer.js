// AQ-Player Phase 6 visualizer/theme entrypoint.
// SVG avoids the hidden-view canvas sizing bug that could leave Visualisations black.
import './visualizer-svg.js';
import './visualizer-layout-fix.js';
import './player-phase6b-final.js';

// The Skin Chooser hotfix is another sibling import of cloud-sync.js.
// Load the theme upgrade on the next task so that its sidebar/button wiring already exists.
setTimeout(() => {
  import('./player-theme-upgrade.js').catch(error => console.error('[AQ-Player themes] load failed', error));
}, 0);
