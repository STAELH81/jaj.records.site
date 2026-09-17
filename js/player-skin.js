// AQ-Player integrated skin chooser and view lifecycle.
function tr(fr,en){return document.documentElement.lang==='en'?en:fr;}

function installSkinStyles(){
  if(document.getElementById('aqmp-skin-styles'))return;
  const style=document.createElement('style'); style.id='aqmp-skin-styles';
  style.textContent=`#player-cfg-btn{display:none!important}#aqmp-skin-view{background:linear-gradient(to bottom,#f8fbfe,#dbe7f2);overflow:auto}#aqmp-skin-view.active{display:block}.aqmp-skin-layout{width:min(520px,calc(100% - 40px));margin:28px auto;padding:18px;box-sizing:border-box;border:1px solid #7896b3;background:#f4f8fb;box-shadow:inset 0 1px 0 #fff,2px 3px 7px rgba(35,70,105,.24);color:#183b63;font:11px Tahoma,sans-serif}.aqmp-skin-title{font-size:18px;font-weight:bold;color:#174d86;margin-bottom:3px}.aqmp-skin-sub{color:#667b91;margin-bottom:15px}.aqmp-skin-panel-host{border:1px solid #9bacbd;background:#fff;padding:12px;box-shadow:inset 1px 1px 2px rgba(0,0,0,.12)}#aqmp-skin-view #player-settings-panel{position:static!important;display:block!important;width:auto!important;top:auto!important;right:auto!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#203a55}#aqmp-skin-view #player-settings-panel .setting-title{color:#164b82;border-bottom:1px solid #b7c6d5;padding-bottom:5px;margin-bottom:10px}#aqmp-skin-view #player-settings-panel .setting-row{display:flex;align-items:center;min-height:28px;margin:0 0 8px}#aqmp-skin-view #player-settings-panel select{min-width:180px;height:24px}.aqmp-skin-note{margin-top:12px;padding-top:9px;border-top:1px solid #b8c8d7;color:#6b7d8e;font-size:9px}`;
  document.head.appendChild(style);
}

export function showSkinView(){
  if(!installSkinChooser())return;
  document.querySelectorAll('#aqmp-stage > .aqmp-view').forEach(v=>v.classList.remove('active'));
  document.getElementById('aqmp-skin-view')?.classList.add('active');
  document.querySelectorAll('#aqmp-sidebar .aqmp-side-button').forEach(b=>b.classList.toggle('active',b.dataset.view==='skin'));
  const title=document.getElementById('aqmp-toolbar-title'),ctx=document.getElementById('aqmp-toolbar-context'),back=document.querySelector('#aqmp-toolbar [data-action="library"]');
  if(title)title.textContent=tr('Sélecteur de skins','Skin Chooser'); if(ctx)ctx.textContent=tr('Apparence d’AQ-Player','AQ-Player appearance');
  if(back){back.textContent=tr('← Bibliothèque','← Library');back.style.display='';}
}

export function installSkinChooser(){
  const stage=document.getElementById('aqmp-stage'),sidebar=document.getElementById('aqmp-sidebar'),panel=document.getElementById('player-settings-panel');
  if(!stage||!sidebar||!panel)return false;
   installSkinStyles();
  let view=document.getElementById('aqmp-skin-view');
  if(!view){view=document.createElement('section');view.id='aqmp-skin-view';view.className='aqmp-view';view.innerHTML=`<div class="aqmp-skin-layout"><div class="aqmp-skin-title">${tr('Sélecteur de skins','Skin Chooser')}</div><div class="aqmp-skin-sub">${tr('Personnalise l’apparence d’AQ-Player.','Customize AQ-Player appearance.')}</div><div class="aqmp-skin-panel-host"></div><div class="aqmp-skin-note">${tr('Les réglages du lecteur sont intégrés directement dans l’application.','Player settings are integrated directly into the application.')}</div></div>`;stage.appendChild(view);}
  const host=view.querySelector('.aqmp-skin-panel-host'); if(host&&panel.parentElement!==host)host.appendChild(panel); panel.classList.remove('open');
  const hint=document.getElementById('player-settings-hint'); if(hint)hint.textContent=tr('Choisis un skin pour AQ-Player.','Choose a skin for AQ-Player.');
  return true;
}

// The procedural SVG visualizer owns its own visibility and audio lifecycle.
installSkinChooser();
window.addEventListener('aq:language-changed', installSkinChooser);
