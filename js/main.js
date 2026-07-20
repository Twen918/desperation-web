import{$,dist2,clamp}from'./utils.js';
import{G,keys,doors,colliders,hideSpots}from'./state.js';
import{AudioSys}from'./audio.js';
import{canvas,renderer,scene,camera}from'./gfx.js';
import{buildLevel,buildLights,updateDoors,updateFlicker,setPower,doorUnlock,L,collideCircle,findPath,power}from'./world.js';
import{updateObjective,updateHUD,updateGrain,drawMap,fadeTo}from'./ui.js';
import{Player,updateFlashlight}from'./entities/player.js';
import{Monster}from'./entities/monster.js';
import{onKeyPress,updatePrompt,buildGameplayObjects,buildSilhouette,updateSilhouette,updateGadgets,enterLocker,exitLocker,eventNoise}from'./gameplay.js';
import{updateCaught,updateTriggers}from'./gameflow.js';

/* ================= INPUT ================= */
let pointerLocked=false;
let lookSettle=0;   // frames of mouse input to swallow right after (re)acquiring pointer lock
document.addEventListener('keydown',e=>{
  if(e.code==='Space')e.preventDefault();
  if(keys[e.code])return; keys[e.code]=true;
  onKeyPress(e.code);
});
document.addEventListener('keyup',e=>{keys[e.code]=false;});
document.addEventListener('mousemove',e=>{
  if(!pointerLocked||G.state!=='play'&&G.state!=='intro')return;
  if(G.noteOpen||G.mapOpen)return;
  // Chrome delivers one huge bogus delta right after pointer lock engages, and
  // occasionally after a click that re-focuses the canvas: swallow those.
  if(lookSettle>0){lookSettle--;return;}
  let mx=e.movementX||0, my=e.movementY||0;
  if(mx*mx+my*my>40000)return;                 // >200px in one event = teleport spike
  const s=0.0022;
  // NOTE: min/max inlined on purpose — this handler must never depend on an
  // import, or a failure would silently kill vertical look while yaw still works.
  const cl=(v,a,b)=>v<a?a:(v>b?b:v);
  if(G.hidden){
    Player.yaw=cl(Player.yaw-mx*s*0.4,G.hiddenSpot.yaw-0.4,G.hiddenSpot.yaw+0.4);
    Player.pitch=cl(Player.pitch-my*s*0.4,-0.3,0.3);
  }else{
    Player.yaw-=mx*s;
    Player.pitch=cl(Player.pitch-my*s,-1.45,1.45);
  }
});
document.addEventListener('pointerlockchange',()=>{
  pointerLocked=document.pointerLockElement===canvas;
  if(pointerLocked)lookSettle=2;
  if(!pointerLocked&&(G.state==='play'||G.state==='intro')&&!G.ended){
    G.paused=true;$('pauseScreen').style.display='flex';
  }
});
function lockPointer(){ canvas.requestPointerLock&&canvas.requestPointerLock(); }

/* ================= MAIN LOOP ================= */
const clock=new THREE.Clock();
let mapRedrawT=0;
function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),0.05);
  updateGrain(dt);
  if(G.state==='title'){renderer.render(scene,camera);return;}
  if(G.state==='end'){renderer.render(scene,camera);return;}
  if(G.paused){renderer.render(scene,camera);return;}
  if(G.state==='caught'){
    updateCaught(dt);
    renderer.render(scene,camera);
    return;
  }
  if(!G.noteOpen){
    Player.update(dt);
    updateDoors(dt,Player.x,Player.z,Monster.x,Monster.z,Monster.state!=='dormant');
    Monster.update(dt);
    updateSilhouette(dt);
    updateGadgets(dt);
    updateTriggers(dt);
    updateFlicker(dt);
    if(!G.hidden&&G.noise>0&&Math.hypot(Player.vx,Player.vz)<0.5)
      G.noise=Math.max(0,G.noise-26*dt);
  }
  updateFlashlight(dt);
  AudioSys.update(dt,{
    monsterDist:dist2(Player.x,Player.z,Monster.x,Monster.z),
    monsterActive:Monster.state!=='dormant',
    chasing:Monster.state==='chase',
    hidden:G.hidden,
  });
  updatePrompt();
  updateHUD(dt);
  if(G.mapOpen){mapRedrawT-=dt;if(mapRedrawT<=0){mapRedrawT=0.2;drawMap();}}
  renderer.render(scene,camera);
}

/* ================= BOOT / SCREENS ================= */
function startGame(){
  AudioSys.init();
  $('titleScreen').style.display='none';
  $('hud').style.display='block';
  fadeTo(1,0);
  setTimeout(()=>{
    G.state='intro';
    updateObjective();
    fadeTo(0,2600);
  },150);
  lockPointer();
}
$('btnStart').addEventListener('click',startGame);
$('btnResume').addEventListener('click',()=>{
  G.paused=false;$('pauseScreen').style.display='none';lockPointer();
});
$('btnRestart').addEventListener('click',()=>location.reload());
canvas.addEventListener('click',()=>{
  if((G.state==='play'||G.state==='intro')&&!pointerLocked&&!G.paused)lockPointer();
});
window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});
if(('ontouchstart'in window)&&Math.min(window.innerWidth,window.innerHeight)<720){
  $('mobileWarn').style.display='flex';
}

buildLevel();
buildLights();
buildGameplayObjects();
buildSilhouette();
Monster.build();
camera.position.set(24.9,1.62,34);
camera.rotation.set(0,0,0);
$('fade').style.opacity=0;   // title screen covers the scene
tick();

/* ---- debug hooks (harmless in production) ---- */
window.dbg={
  tp(room){
    const p={cell:[24.9,34],hall:[13,23],lab:[0.55,8],labc:[0,4],rec:[-13,0.5],spec:[11.3,0.2],
             gen1:[0.55,-16.5],spine:[-0.75,-40],dorm:[9,-56],v16:[-30,-74.7],
             med:[-67,-92],hall2:[-40,-105.5],exit:[-38.9,-109.5]}[room];
    if(p){Player.x=p[0];Player.z=p[1];}
  },
  power(){G.fuseIn=true;G.switches=4;setPower();doorUnlock(doors.find(d=>d.id==='auto'));doorUnlock(doors.find(d=>d.id==='exit'));},
  give(){G.hasMap=G.hasKeycard=G.hasExitKey=true;doorUnlock(doors.find(d=>d.id==='spec'));},
  start(){startGame();},
  look(yaw,pitch){Player.yaw=yaw;Player.pitch=pitch||0;},
  flash(){Player.flashOn=true;L.flash.intensity=2.2;},
  state(){return{p:[Player.x.toFixed(1),Player.z.toFixed(1)],m:[Monster.x.toFixed(1),Monster.z.toFixed(1)],ms:Monster.state,g:G.state,noise:G.noise|0};},
};

/* console/testing access (same objects, not copies) */
window.__game={G,keys,Player,Monster,AudioSys,doors,colliders,hideSpots,L,power,camera,renderer,scene,updateDoors,updateFlicker,updatePrompt,updateHUD,updateGadgets,updateSilhouette,updateTriggers,updateFlashlight,updateCaught,collideCircle,findPath,dist2,setPower,doorUnlock,enterLocker,exitLocker,eventNoise};
