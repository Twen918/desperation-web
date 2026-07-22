import{$,rand,dist2,lerp}from'./utils.js';
import{HEAL_TIME}from'./config.js';
import{G,refs,doors}from'./state.js';
import{AudioSys}from'./audio.js';
import{camera}from'./gfx.js';
import{collideCircle,doorUnlock,power}from'./world.js';
import{showToast,updateObjective,flashRed,fadeTo,damagePunch,resetBlood}from'./ui.js';
import{Player}from'./entities/player.js';
import{Monster}from'./entities/monster.js';

/* ================= CATCH / DAMAGE / JUMPSCARE ================= */
let caughtT=0;
const caughtCam=new THREE.Vector3();   // frozen camera anchor for the death shake

/* shove the monster off the player and send it searching — gives an escape window */
function shoveMonster(distm){
  let dx=Monster.x-Player.x,dz=Monster.z-Player.z;
  const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
  let mx=Player.x+dx*distm,mz=Player.z+dz*distm;
  [mx,mz]=collideCircle(mx,mz,0.42);
  Monster.x=mx;Monster.z=mz;
  Monster.state='search';Monster.scanT=3.2;Monster.path=null;Monster.lostT=0;
  AudioSys.stopChase();
}
function freeFromLocker(){
  if(!G.hidden)return;
  G.hidden=false;
  if(G.hiddenSpot){Player.x=G.hiddenSpot.ex;Player.z=G.hiddenSpot.ez;G.hiddenSpot=null;}
  $('lockerView').style.display='none';
}
function catchPlayer(){
  if(G.state!=='play')return;
  if(G.hurtT>0)return;   // i-frames: ignore repeated grabs right after a hit
  freeFromLocker();
  G.doomed=false;
  G.hp--;G.healT=0;
  // --- survived the hit: wound, knockback, mercy window ---
  if(G.hp>0){
    G.hurtT=1.3;
    damagePunch();
    flashRed(0.55,900);
    AudioSys.growl(0.65);AudioSys.clank();
    shoveMonster(4);
    showToast('It struck you! One more hit and you are dead — RUN.',3.2);
    return;
  }
  // --- would die: regen serum is the last save ---
  if(G.regen&&!G.regenUsed){
    G.regenUsed=true;G.hp=1;G.hurtT=1.4;
    damagePunch();
    flashRed(0.7,1400);
    AudioSys.growl(0.7);AudioSys.clank();
    shoveMonster(4);
    showToast('The regen serum knits your wounds shut —\nyou tear yourself free!',3.2);
    return;
  }
  // --- death → jumpscare → respawn ---
  G.state='caught';caughtT=0;caughtCam.copy(camera.position);
  AudioSys.scream();AudioSys.stopChase();
  damagePunch();
  flashRed(0.85,1500);
  // slam the monster right into the lens
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  Monster.x=camera.position.x+dir.x*0.75;
  Monster.z=camera.position.z+dir.z*0.75;
  Monster.yaw=Math.atan2(camera.position.x-Monster.x,camera.position.z-Monster.z);
  Monster.state='ripping';Monster.path=null;
  Monster.parts.jaw.rotation.x=0.9;
  Monster.syncMesh(0);
}
/* per-frame: i-frame countdown and slow heal back to full */
function updateVitals(dt){
  if(G.state!=='play')return;
  if(G.hurtT>0)G.hurtT-=dt;
  if(G.hp<G.hpMax){
    if(G.hurtT<=0){
      G.healT+=dt;
      if(G.healT>=HEAL_TIME){
        G.hp=G.hpMax;G.healT=0;
        showToast('Your wounds have closed. You feel steady again.',2.8);
      }
    }
  }else G.healT=0;
}
function updateCaught(dt){
  caughtT+=dt;
  const t=caughtT;
  // violent shake around the frozen catch position (ramps up)
  const amp=Math.min(0.02+t*0.11,0.11);
  camera.position.set(caughtCam.x+rand(-amp,amp),caughtCam.y+rand(-amp,amp),caughtCam.z+rand(-amp,amp)*0.6);
  camera.rotation.z=rand(-amp,amp)*0.9;
  // FOV punches inward toward the face
  const fovT=lerp(72,44,Math.min(t*2.4,1));
  camera.fov+=(fovT-camera.fov)*Math.min(1,dt*16);
  camera.updateProjectionMatrix();
  // head lunges into the lens, jaw yawns wide with a chomping wobble
  Monster.parts.head.position.z=0.22+Math.min(t*0.55,0.4);
  Monster.parts.jaw.rotation.x=Math.min(0.9+t*1.3,1.7)+Math.sin(t*38)*0.09;
  if(t>1.0&&t<1.06)fadeTo(1,500);
  if(t>1.9){
    // respawn in the cell — items kept, monster reset, wounds healed
    G.deaths++;G.noise=0;
    G.hp=G.hpMax;G.hurtT=0;G.healT=0;resetBlood();
    camera.fov=72;camera.rotation.z=0;camera.updateProjectionMatrix();
    Player.reset();
    Monster.parts.jaw.rotation.x=0.08;
    Monster.parts.head.position.z=0.22;
    Monster.reset();
    G.state='play';
    fadeTo(0,1000);
    showToast('You wake up on the cell floor.\nIt dragged you back... but your pockets are untouched.',4);
    updateObjective();
  }
}

/* ================= TRIGGERS / FLOW ================= */
let hintSprint=false,hintHall=false,hintDuct=false,bangDone=false;
function updateTriggers(dt){
  if(G.state==='intro'){
    G.introT+=dt;
    if(G.introT>1&&G.introT<1.05)showToast('W A S D — move   ·   mouse — look',3.4);
    if(G.introT>6&&!G.cellOpened){
      G.cellOpened=true;
      doorUnlock(doors.find(d=>d.id==='cell'));
      showToast('The cell door just unlocked itself.',3);
      updateObjective();
    }
    if(G.cellOpened&&Player.z<26.5){
      G.state='play';G.leftCell=true;updateObjective();
    }
  }
  if(G.state!=='play')return;
  if(!hintSprint&&G.leftCell){
    hintSprint=true;
    showToast('SHIFT — sprint (loud) · SHIFT+C — slide · C — crouch (quiet) · SPACE — jump',4.6);
  }
  if(!hintHall&&Player.z<24.4){
    hintHall=true;
    showToast('F — flashlight.  Grab the facility map from the desk if you missed it.',3.6);
  }
  if(!G.labEntered&&Player.z<9.4&&Player.x>-8.7&&Player.x<8.3){
    G.labEntered=true;
    Monster.activate();
    updateObjective();
  }
  if(!hintDuct&&dist2(Player.x,Player.z,-16,-41.5)<6.5){
    hintDuct=true;
    showToast('The vent has collapsed across the corridor.\nCrouch [C] or slide [SHIFT+C] under — it cannot follow.',4.5);
  }
  if(!bangDone&&Player.x<-54.9&&Player.x>-60.5&&Player.z<-78&&Player.z>-103){
    bangDone=true;
    AudioSys.clank();AudioSys.growl(0.5);
    showToast('...a door slams somewhere far behind you.',3.2);
  }
  // end trigger (exit vestibule past the north-hall door)
  if(power.on&&Player.z<-109&&Player.x>-40&&Player.x<-37.8&&!G.ended){
    G.ended=true;G.state='end';
    fadeTo(1,1400);
    AudioSys.stopChase();
    setTimeout(()=>{
      document.exitPointerLock&&document.exitPointerLock();
      $('hud').style.display='none';
      $('endScreen').style.display='flex';
    },1500);
  }
}

refs.catchPlayer=catchPlayer;
export{catchPlayer,updateCaught,updateTriggers,updateVitals};
