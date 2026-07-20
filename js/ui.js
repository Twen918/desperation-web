import{$}from'./utils.js';
import{ROOMS}from'./config.js';
import{G,doors,refs}from'./state.js';
import{AudioSys}from'./audio.js';

/* ================= NOTES ================= */
function openNote(text){
  G.noteOpen=true;
  $('notePaper').textContent=text;
  $('noteOverlay').style.display='block';
  AudioSys.pickup();
}
function closeNote(){
  G.noteOpen=false;
  $('noteOverlay').style.display='none';
}

/* ================= HUD / UI ================= */
let toastT=0;
function showToast(text,dur){
  $('toast').textContent=text;
  $('toast').style.opacity=1;toastT=dur||2.5;
}
function updateObjective(){
  let t;
  if(!G.cellOpened)t='<span class="tag">OBJECTIVE</span><br/><b>Wake up. Figure out where you are.</b>';
  else if(!G.leftCell)t='<span class="tag">OBJECTIVE</span><br/><b>Leave the room.</b>';
  else if(!G.labEntered)t='<span class="tag">OBJECTIVE</span><br/><b>Follow the hallway to the MAIN LABORATORY.</b>';
  else if(!G.hasKeycard)t='<span class="tag">OBJECTIVE</span><br/><b>Find the RED keycard — RECORDS room, west side.</b>';
  else if(!G.hasFuse&&!G.fuseIn)t='<span class="tag">OBJECTIVE</span><br/><b>Open the SPECIMEN ROOM (east) — find a fuse.</b>';
  else if(!G.fuseIn)t='<span class="tag">OBJECTIVE</span><br/><b>Take the fuse to GENERATOR ROOM 1 (north of the lab).</b>';
  else if(G.switches<4)t='<span class="tag">OBJECTIVE</span><br/><b>Flip the breakers ('+G.switches+'/4).</b><br/>Hide when it comes to look.';
  else if(!G.hasExitKey)t='<span class="tag">OBJECTIVE</span><br/><b>Power is on. Find the BLUE keycard in the west corridors,<br/>then escape through the far north door.</b>';
  else if(!G.ended)t='<span class="tag">OBJECTIVE</span><br/><b>Escape — NORTH HALL exit door.</b>';
  $('objective').innerHTML=t;
}
function updateHUD(dt){
  if(toastT>0){toastT-=dt;if(toastT<=0)$('toast').style.opacity=0;}
  const n=G.noise;
  const bar=$('noiseBar');
  bar.style.width=n+'%';
  bar.style.background=n>66?'#c33636':(n>33?'#b99a3a':'#5f9f6f');
  let inv='';
  if(G.hasMap)inv+='MAP [M]<br/>';
  if(G.hasKeycard)inv+='<span style="color:#d06a6a">RED KEYCARD</span><br/>';
  if(G.hasExitKey)inv+='<span style="color:#6a8ad0">BLUE KEYCARD</span><br/>';
  if(G.hasFuse)inv+='FUSE<br/>';
  if(G.syringe)inv+='<span class="buff">SPEED +40% / NOISE +50%</span><br/>';
  if(G.regen&&!G.regenUsed)inv+='<span style="color:#4ab87a">REGEN — one free escape</span><br/>';
  if(G.noiseBuff)inv+='<span style="color:#b8b84a">SUPPRESSOR — NOISE -35%</span><br/>';
  if(G.vision)inv+='<span style="color:#5a9ad8">VISION — map ping / -10% speed</span><br/>';
  if(refs.player.crouched)inv+='<span style="color:#7f8f92">CROUCHED</span><br/>';
  $('inv').innerHTML=inv;
  if(refs.monster){
    $('hearInd').style.opacity=(refs.monster.state==='investigate'||refs.monster.state==='search')?1:0;
    $('chaseInd').style.opacity=refs.monster.state==='chase'?1:0;
  }
}
function flashRed(op,ms){
  const r=$('redFlash');
  r.style.transition='none';r.style.opacity=op;
  requestAnimationFrame(()=>{r.style.transition='opacity '+ms+'ms';r.style.opacity=0;});
}
function fadeTo(op,ms){
  const f=$('fade');
  f.style.transition='opacity '+ms+'ms';f.style.opacity=op;
}

/* ================= MAP OVERLAY ================= */
function drawMap(){
  const c=$('mapCanvas'),x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height);
  const s=4.5;
  const X=v=>(v+74)*s+15, Z=v=>(v+112.5)*s+7;
  x.strokeStyle='rgba(140,170,175,0.85)';x.fillStyle='rgba(40,60,66,0.25)';x.lineWidth=1.5;
  x.font='10px Consolas,monospace';
  for(const k in ROOMS){
    const r=ROOMS[k];
    x.fillRect(X(r.x1),Z(r.z1),(r.x2-r.x1)*s,(r.z2-r.z1)*s);
    x.strokeRect(X(r.x1),Z(r.z1),(r.x2-r.x1)*s,(r.z2-r.z1)*s);
    if(r.name){
      x.fillStyle='rgba(170,195,200,0.9)';
      x.fillText(r.name,X(r.x1)+5,Z(r.z1)+13);
      x.fillStyle='rgba(40,60,66,0.25)';
    }
  }
  // doors
  x.fillStyle='rgba(210,160,60,0.95)';
  for(const d of doors){
    x.fillRect(X(d.cx)-(d.alongX?d.w*s/2:2.5),Z(d.cz)-(d.alongX?2.5:d.w*s/2),
               d.alongX?d.w*s:5,d.alongX?5:d.w*s);
  }
  // vision serum: the creature shows on the map
  if(G.vision&&refs.monster&&refs.monster.state!=='dormant'){
    x.fillStyle='rgba(255,40,40,0.9)';
    x.beginPath();x.arc(X(refs.monster.x),Z(refs.monster.z),4.5,0,7);x.fill();
  }
  // player arrow
  x.save();
  x.translate(X(refs.player.x),Z(refs.player.z));
  x.rotate(-refs.player.yaw);
  x.fillStyle='#e5383b';
  x.beginPath();x.moveTo(0,-7);x.lineTo(4.6,5);x.lineTo(-4.6,5);x.closePath();x.fill();
  x.restore();
  x.fillStyle='rgba(150,165,168,0.8)';
  x.font='11px Consolas,monospace';
  x.fillText('N ↑',c.width-44,24);
}

/* ================= FILM GRAIN ================= */
const grainC=$('grain'),grainX=grainC.getContext('2d');
let grainT=0;
function updateGrain(dt){
  grainT-=dt;
  if(grainT>0)return;grainT=0.07;
  const id=grainX.createImageData(160,90);
  const d=id.data;
  for(let i=0;i<d.length;i+=4){
    const v=(Math.random()*255)|0;
    d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
  }
  grainX.putImageData(id,0,0);
}

export{openNote,closeNote,showToast,updateObjective,updateHUD,flashRed,fadeTo,drawMap,updateGrain};
