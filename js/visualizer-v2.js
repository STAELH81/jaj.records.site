// AQ-Player Phase 6B v2 — robust old-school procedural visualizer
// Canvas + sin/cos + polar geometry + FFT + feedback. No generated images.

const PRESETS = [
  ['lissajous','Lissajous Reactor'],
  ['spiral','Spiral Bloom'],
  ['tunnel','Plasma Tunnel'],
  ['halo','FFT Halo'],
  ['flower','Feedback Flower'],
  ['mesh','Electric Mesh'],
  ['orbital','Orbital Scope'],
  ['chaos','Chaos Garden']
];

const S = {
  view:null, stage:null, canvas:null, ctx:null, back:null, bctx:null,
  audio:null, ac:null, analyser:null, source:null, freq:null, wave:null,
  preset:0, auto:true, reactive:true, feedback:true, raf:0,
  p:null, target:null, lastMutate:0, hue:195,
  energy:{bass:.18,mids:.13,highs:.09,level:.13}
};

const r=(a,b)=>a+Math.random()*(b-a);
const ri=(a,b)=>Math.floor(r(a,b+1));
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const isEn=()=>document.documentElement.lang==='en';
const tr=(fr,en)=>isEn()?en:fr;

function params(){
  return {a:r(1.4,6.8),b:r(2.1,9.3),c:r(.4,3.5),d:r(.3,2.8),petals:ri(3,11),arms:ri(3,8),spin:r(-.35,.35),speed:r(.08,.34),warp:r(.6,2.2),zoom:r(1.002,1.014),rot:r(-.008,.008),decay:r(.83,.94),glow:r(8,22),thick:r(.75,1.65),mesh:ri(18,32)};
}
function mutate(hard=false){
  S.target=params(); S.hue=(S.hue+r(24,100))%360; S.lastMutate=performance.now();
  if(hard||!S.p) S.p={...S.target};
  status();
}
function smooth(){ if(!S.p||!S.target)return; for(const k of Object.keys(S.p)) if(typeof S.p[k]==='number') S.p[k]=lerp(S.p[k],S.target[k],.01); }
function avg(data,a,b){ if(!data?.length)return 0; a=clamp(a,0,data.length-1); b=clamp(b,a+1,data.length); let sum=0; for(let i=a;i<b;i++)sum+=data[i]; return sum/(b-a)/255; }

function energy(t){
  if(S.reactive&&S.analyser&&S.freq&&S.wave){
    S.analyser.getByteFrequencyData(S.freq); S.analyser.getByteTimeDomainData(S.wave);
    S.energy.bass=lerp(S.energy.bass,avg(S.freq,0,28),.23);
    S.energy.mids=lerp(S.energy.mids,avg(S.freq,28,130),.2);
    S.energy.highs=lerp(S.energy.highs,avg(S.freq,130,Math.min(420,S.freq.length)),.18);
  } else {
    const q=.18+Math.sin(t*1.7)*.05;
    S.energy.bass=lerp(S.energy.bass,q,.08);
    S.energy.mids=lerp(S.energy.mids,q*.75,.08);
    S.energy.highs=lerp(S.energy.highs,q*.5,.08);
  }
  S.energy.level=S.energy.bass*.45+S.energy.mids*.35+S.energy.highs*.2;
}

function audioGraph(){
  if(S.analyser)return;
  S.audio=document.getElementById('audio-player'); if(!S.audio)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
    S.ac=new AC(); S.analyser=S.ac.createAnalyser(); S.analyser.fftSize=1024; S.analyser.smoothingTimeConstant=.82;
    S.source=S.ac.createMediaElementSource(S.audio); S.source.connect(S.analyser); S.analyser.connect(S.ac.destination);
    S.freq=new Uint8Array(S.analyser.frequencyBinCount); S.wave=new Uint8Array(S.analyser.fftSize);
    const resume=()=>{ if(S.ac?.state==='suspended') S.ac.resume().catch(()=>{}); };
    S.audio.addEventListener('play',resume); document.addEventListener('pointerdown',resume,{passive:true});
  }catch(err){ console.warn('[AQ Visualizer v2] audio graph unavailable, using idle math',err); S.analyser=null; }
}

function color(alpha=.8,off=0){ return `hsla(${(S.hue+off+360)%360},96%,66%,${alpha})`; }
function stroke(alpha=.8,off=0,width=1){ const c=S.ctx; c.strokeStyle=color(alpha,off); c.lineWidth=width; c.shadowColor=color(.95,off); c.shadowBlur=S.p.glow+S.energy.bass*24; c.globalCompositeOperation='lighter'; }

function resize(){
  if(!S.stage||!S.canvas)return false;
  const w=Math.max(2,Math.floor(S.stage.clientWidth)), h=Math.max(2,Math.floor(S.stage.clientHeight));
  if(w<10||h<10)return false;
  if(S.canvas.width!==w||S.canvas.height!==h){
    S.canvas.width=w; S.canvas.height=h; S.back.width=w; S.back.height=h;
    // Immediate proof-of-life draw: never leave an empty black canvas after resize.
    S.ctx.fillStyle='#00030b'; S.ctx.fillRect(0,0,w,h);
    S.ctx.strokeStyle='rgba(80,190,255,.85)'; S.ctx.beginPath(); S.ctx.moveTo(0,h/2); S.ctx.lineTo(w,h/2); S.ctx.stroke();
  }
  return true;
}

function fade(w,h){
  const c=S.ctx;
  if(S.feedback&&S.back&&S.back.width===w&&S.back.height===h){
    S.bctx.setTransform(1,0,0,1,0,0); S.bctx.clearRect(0,0,w,h); S.bctx.drawImage(S.canvas,0,0);
    c.globalCompositeOperation='source-over'; c.globalAlpha=1; c.fillStyle=`rgba(0,3,11,${1-S.p.decay})`; c.fillRect(0,0,w,h);
    c.save(); c.globalAlpha=S.p.decay; c.translate(w/2,h/2); c.rotate(S.p.rot); c.scale(S.p.zoom,S.p.zoom); c.translate(-w/2,-h/2); c.drawImage(S.back,0,0); c.restore();
  } else {
    c.globalCompositeOperation='source-over'; c.globalAlpha=1; c.fillStyle='rgba(0,3,11,.22)'; c.fillRect(0,0,w,h);
  }
  c.globalAlpha=1;
}

function lissajous(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,cx=w/2,cy=h/2,rx=w*(.27+e.bass*.09),ry=h*(.29+e.mids*.09); for(let L=0;L<3;L++){ stroke(.48+L*.14,L*34,p.thick); c.beginPath(); for(let i=0;i<=850;i++){ const u=i/850*Math.PI*2, A=p.a+Math.sin(t*.17)*.55, B=p.b+Math.cos(t*.11)*.45; const x=cx+Math.sin(u*A+t*p.speed+L*.17)*rx+Math.sin(u*(p.c+L)+t*.7)*e.highs*24; const y=cy+Math.sin(u*B+Math.cos(t*.13)+L*.2)*ry; i?c.lineTo(x,y):c.moveTo(x,y);} c.stroke(); } }
function spiral(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,cx=w/2,cy=h/2; stroke(.8,18,1.1); c.beginPath(); for(let i=0;i<1100;i++){ const a=i*.023, rose=Math.sin(a*p.petals+t*.7)*(20+e.mids*44), rr=12+a*3.6+rose+Math.sin(a*p.c-t)*9, spin=a+t*p.spin; const x=cx+Math.cos(spin)*rr, y=cy+Math.sin(spin)*rr*.72; i?c.lineTo(x,y):c.moveTo(x,y);} c.stroke(); }
function tunnel(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,cx=w/2,cy=h/2; for(let j=0;j<23;j++){ const z=((j/23)+t*.055)%1,R=12+z*Math.min(w,h)*.62, ox=Math.sin(t*.41+j*.37)*22*(1-z),oy=Math.cos(t*.33+j*.31)*18*(1-z); stroke(.14+(1-z)*.6,j*7,.8+(1-z)*1.2); c.beginPath(); for(let i=0;i<=88;i++){ const a=i/88*Math.PI*2, rr=R+Math.sin(a*p.petals+t*p.warp+j)*(3+e.bass*15),x=cx+ox+Math.cos(a+t*p.spin)*rr,y=cy+oy+Math.sin(a+t*p.spin)*rr*.58; i?c.lineTo(x,y):c.moveTo(x,y);} c.closePath(); c.stroke(); } }
function halo(w,h,t){ const c=S.ctx,cx=w/2,cy=h/2,data=S.freq,n=180,base=Math.min(w,h)*.22; stroke(.86,0,1.1); c.beginPath(); for(let i=0;i<=n;i++){ const j=i%n,a=j/n*Math.PI*2-Math.PI/2+t*.05, amp=data?.length?data[Math.floor(j/n*Math.min(data.length-1,360))]/255:.25+Math.sin(a*7+t)*.12, rr=base+amp*Math.min(w,h)*.22+Math.sin(a*S.p.petals+t)*7,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr; i?c.lineTo(x,y):c.moveTo(x,y);} c.closePath(); c.stroke(); }
function flower(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,cx=w/2,cy=h/2; for(let L=0;L<5;L++){ stroke(.24+L*.11,L*27,.8); c.beginPath(); for(let i=0;i<=700;i++){ const a=i/700*Math.PI*2,rr=Math.min(w,h)*(.17+L*.036)+Math.sin(a*(p.petals+L*.5)+t*(.45+L*.04))*(34+e.bass*50),x=cx+Math.cos(a+t*p.spin)*rr,y=cy+Math.sin(a+t*p.spin)*rr; i?c.lineTo(x,y):c.moveTo(x,y);} c.closePath(); c.stroke(); } }
function mesh(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,step=Math.max(14,p.mesh); stroke(.25,-12,.7); for(let y=-step;y<h+step;y+=step){ c.beginPath(); let first=true; for(let x=-step;x<w+step;x+=5){ const yy=y+Math.sin(x*.025*p.warp+t*.9+y*.01)*(10+e.bass*32),xx=x+Math.cos(y*.032*p.c-t*.65+x*.008)*(5+e.highs*17); first?(c.moveTo(xx,yy),first=false):c.lineTo(xx,yy);} c.stroke(); } stroke(.19,52,.65); for(let x=-step;x<w+step;x+=step){ c.beginPath(); let first=true; for(let y=-step;y<h+step;y+=5){ const xx=x+Math.sin(y*.026*p.warp-t*.72+x*.012)*(10+e.mids*28),yy=y+Math.cos(x*.029*p.d+t*.54+y*.01)*(5+e.highs*15); first?(c.moveTo(xx,yy),first=false):c.lineTo(xx,yy);} c.stroke(); } }
function orbital(w,h,t){ const p=S.p,c=S.ctx,cx=w/2,cy=h/2,wave=S.wave; for(let ring=0;ring<4;ring++){ stroke(.38+ring*.1,ring*38,.9); c.beginPath(); for(let i=0;i<=360;i++){ const a=i/360*Math.PI*2,idx=wave?.length?Math.floor(i/360*(wave.length-1)):0,sample=wave?.length?(wave[idx]-128)/128:Math.sin(a*5+t)*.2,base=Math.min(w,h)*(.12+ring*.07),rr=base+sample*(22+ring*7)+Math.sin(a*p.a+t*.8)*S.energy.bass*15,x=cx+Math.cos(a+t*p.spin*(ring%2?-1:1))*rr*(1+ring*.05),y=cy+Math.sin(a+t*p.spin)*rr*(.72+ring*.04); i?c.lineTo(x,y):c.moveTo(x,y);} c.closePath(); c.stroke(); } }
function chaos(w,h,t){ const p=S.p,e=S.energy,c=S.ctx,cx=w/2,cy=h/2; for(let L=0;L<6;L++){ stroke(.18+L*.09,L*31,.65+L*.08); c.beginPath(); for(let i=0;i<=620;i++){ const u=i/620*Math.PI*2,rr=Math.min(w,h)*(.18+L*.018)+Math.sin(u*(p.petals+L)+t*.7)*(26+e.bass*48)+Math.cos(u*p.c-t*.9)*(11+e.mids*22),x=cx+Math.cos(u*p.a+t*p.spin+L)*rr,y=cy+Math.sin(u*p.b-t*p.speed+L*.5)*rr*.66; i?c.lineTo(x,y):c.moveTo(x,y);} c.stroke(); } }
const DRAW={lissajous,spiral,tunnel,halo,flower,mesh,orbital,chaos};

function drawFrame(ts){
  S.raf=requestAnimationFrame(drawFrame);
  if(!S.view?.classList.contains('active')||!resize()) return;
  const w=S.canvas.width,h=S.canvas.height,t=ts*.001;
  if(S.auto&&ts-S.lastMutate>11000)mutate(false);
  smooth(); energy(t);
  if(S.target){ S.target.a+=Math.sin(t*.17)*.0007; S.target.b+=Math.cos(t*.11)*.0008; S.target.spin+=Math.sin(t*.07)*.000015; }
  try{
    fade(w,h); S.ctx.save(); DRAW[PRESETS[S.preset][0]](w,h,t); S.ctx.restore();
  }catch(err){
    console.error('[AQ Visualizer v2] frame error',err);
    S.ctx.setTransform(1,0,0,1,0,0); S.ctx.globalCompositeOperation='source-over'; S.ctx.fillStyle='#00030b'; S.ctx.fillRect(0,0,w,h);
    S.ctx.strokeStyle='#5ce7ff'; S.ctx.lineWidth=1.2; S.ctx.beginPath(); for(let x=0;x<w;x+=3){ const y=h/2+Math.sin(x*.035+t*3)*h*.18; x?S.ctx.lineTo(x,y):S.ctx.moveTo(x,y);} S.ctx.stroke();
  }
  const m=document.getElementById('aqmp-visual-meter-fill'); if(m)m.style.width=`${clamp(S.energy.level*100,3,100)}%`;
}

function status(){ const e=document.getElementById('aqmp-visual-status'); if(e)e.textContent=`${PRESETS[S.preset][1]} // ${S.auto?'AUTO MUTATE':'MANUAL'} // ${S.reactive?'FFT ON':'FFT OFF'}`; }
function setPreset(n){ S.preset=((n%PRESETS.length)+PRESETS.length)%PRESETS.length; const sel=document.getElementById('aqmp-visual-preset'); if(sel)sel.value=String(S.preset); mutate(true); }
function wake(){ resize(); mutate(false); audioGraph(); if(!S.raf)S.raf=requestAnimationFrame(drawFrame); requestAnimationFrame(resize); }

function install(view){
  if(!view||view.dataset.visualV2==='1')return false;
  view.dataset.visualV2='1';
  view.innerHTML=`<div id="aqmp-visual-stage"><canvas id="aqmp-visual-canvas"></canvas><div id="aqmp-visual-scanlines"></div></div><div id="aqmp-visual-controls"><span class="aqmp-vis-label">PRESET</span><select id="aqmp-visual-preset"></select><button id="aqmp-visual-prev" class="aqmp-vis-btn">◀</button><button id="aqmp-visual-next" class="aqmp-vis-btn">▶</button><button id="aqmp-visual-mutate" class="aqmp-vis-btn">MUTATE</button><label><input id="aqmp-visual-auto" type="checkbox" checked> AUTO</label><label><input id="aqmp-visual-audio" type="checkbox" checked> FFT</label><label><input id="aqmp-visual-feedback" type="checkbox" checked> FEEDBACK</label><div id="aqmp-visual-meter"><div id="aqmp-visual-meter-fill"></div></div><span id="aqmp-visual-status"></span></div>`;
  if(!document.getElementById('aqmp-visualizer-v2-styles')){ const st=document.createElement('style'); st.id='aqmp-visualizer-v2-styles'; st.textContent=`#aqmp-visual-view{flex-direction:column!important;background:#00030b!important}#aqmp-visual-stage{position:relative;flex:1 1 auto;min-height:120px;overflow:hidden;background:#00030b;border-bottom:1px solid #486785}#aqmp-visual-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;background:#00030b}#aqmp-visual-scanlines{position:absolute;inset:0;pointer-events:none;opacity:.1;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.25) 0,rgba(255,255,255,.25) 1px,transparent 1px,transparent 3px);mix-blend-mode:screen}#aqmp-visual-controls{flex:0 0 38px;display:flex;align-items:center;gap:5px;padding:5px 7px;box-sizing:border-box;background:linear-gradient(to bottom,#c8d8e7,#6e8eab 48%,#456985 52%,#9bb5ca);color:#0b3158;font:8px Tahoma,sans-serif;white-space:nowrap}#aqmp-visual-controls select{height:22px;max-width:155px;border:1px solid #5d7b99;background:#f4f8fb;color:#0c3158;font:9px Tahoma,sans-serif}.aqmp-vis-label{font-weight:bold}.aqmp-vis-btn{height:22px;padding:0 7px;border:1px solid #607f9e;border-radius:8px;background:linear-gradient(to bottom,#fff,#d7e5ef 45%,#7297b8 52%,#eef5fa);color:#0d355e;font:bold 8px Tahoma,sans-serif;cursor:pointer}#aqmp-visual-meter{flex:1 1 60px;min-width:45px;max-width:110px;height:7px;overflow:hidden;border:1px inset #c7d8e7;border-radius:5px;background:#102136}#aqmp-visual-meter-fill{width:3%;height:100%;background:linear-gradient(to right,#4ba51f,#b7ef65,#e9ff8b);box-shadow:0 0 5px #b8ff72}#aqmp-visual-status{overflow:hidden;max-width:190px;text-overflow:ellipsis;color:#08294d;font-weight:bold}@media(max-width:840px){#aqmp-visual-controls label,#aqmp-visual-status{display:none}#aqmp-visual-controls select{max-width:120px}}`; document.head.appendChild(st); }
  S.view=view; S.stage=document.getElementById('aqmp-visual-stage'); S.canvas=document.getElementById('aqmp-visual-canvas'); S.ctx=S.canvas.getContext('2d'); S.back=document.createElement('canvas'); S.bctx=S.back.getContext('2d');
  const sel=document.getElementById('aqmp-visual-preset'); PRESETS.forEach((p,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=`${String(i+1).padStart(2,'0')} // ${p[1]}`;sel.appendChild(o);});
  sel.addEventListener('change',()=>setPreset(Number(sel.value))); document.getElementById('aqmp-visual-prev').addEventListener('click',()=>setPreset(S.preset-1)); document.getElementById('aqmp-visual-next').addEventListener('click',()=>setPreset(S.preset+1)); document.getElementById('aqmp-visual-mutate').addEventListener('click',()=>mutate(true));
  document.getElementById('aqmp-visual-auto').addEventListener('change',e=>{S.auto=e.target.checked;status();}); document.getElementById('aqmp-visual-audio').addEventListener('change',e=>{S.reactive=e.target.checked;status();}); document.getElementById('aqmp-visual-feedback').addEventListener('change',e=>S.feedback=e.target.checked);
  const mo=new MutationObserver(()=>{if(view.classList.contains('active'))wake();}); mo.observe(view,{attributes:true,attributeFilter:['class']});
  if('ResizeObserver'in window)new ResizeObserver(()=>{if(view.classList.contains('active'))resize();}).observe(S.stage);
  window.addEventListener('resize',resize,{passive:true}); audioGraph(); mutate(true); wake(); status(); return true;
}

function boot(){ const view=document.getElementById('aqmp-visual-view'); if(view)return install(view); return false; }
if(!boot()){ const mo=new MutationObserver(()=>{if(boot())mo.disconnect();}); mo.observe(document.documentElement,{childList:true,subtree:true}); }
window.AQVisualizer={presets:PRESETS.map(([id,name])=>({id,name})),next:()=>setPreset(S.preset+1),previous:()=>setPreset(S.preset-1),mutate:()=>mutate(true),setPreset,wake,resize,getPreset:()=>({id:PRESETS[S.preset][0],name:PRESETS[S.preset][1]})};
