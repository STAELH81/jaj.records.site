// Load catalogue data before the classic desktop restores its saved session.
import AQCatalog from './catalog.js';
await AQCatalog.refresh();
await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'js/app.js';
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
});
await import('./catalog-player.js');
await import('./player-skin.js');
await import('./visualizer.js');
await Promise.all([import('./auth.js'), import('./myspace.js'), import('./artist-publisher.js')]);
