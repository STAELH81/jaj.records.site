// Layout guard for Phase 6 visualizations.
// catalog-player's old preview centered its children; a real visualizer needs a stretched stage.
const style = document.createElement('style');
style.id = 'aqmp-visual-layout-guard';
style.textContent = `
  #win-player #aqmp-visual-view.active{
    display:flex!important;
    flex-direction:column!important;
    align-items:stretch!important;
    justify-content:flex-start!important;
  }
  #win-player #aqmp-visual-stage{
    position:relative!important;
    width:100%!important;
    min-width:0!important;
    min-height:160px!important;
    align-self:stretch!important;
    flex:1 1 0!important;
    box-sizing:border-box!important;
  }
  #win-player #aqmp-visual-svg{
    position:absolute!important;
    inset:0!important;
    display:block!important;
    width:100%!important;
    height:100%!important;
    min-width:100%!important;
    min-height:100%!important;
    z-index:1!important;
  }
  #win-player #aqmp-visual-scanlines{z-index:2!important}
  #win-player #aqmp-visual-controls{
    width:100%!important;
    align-self:stretch!important;
    flex:0 0 40px!important;
    box-sizing:border-box!important;
    z-index:3!important;
  }
`;
document.head.appendChild(style);
