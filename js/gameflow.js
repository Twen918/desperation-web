import{$,rand,dist2}from'./utils.js';
import{G,refs,doors}from'./state.js';
import{AudioSys}from'./audio.js';
import{camera}from'./gfx.js';
import{collideCircle,doorUnlock,power}from'./world.js';
import{showToast,updateObjective,flashRed,fadeTo}from'./ui.js';
import{Player}from'./entities/player.js';
import{Monster}from'./entities/monster.js';

/* ================= CATCH / JUMPSCARE ================= */
let caughtT=0;
function catchPlayer(){
  if(G.state!=='play')return;
  // regen serum: tear free from one attack
  if(G.regen&&!G.regenUsed){
    G.regenUsed=true;
    if(G.hidden){G.hidden=false;G.hiddenSpot&&(Player.x=G.hiddenSpot.ex,Player.z=G.hiddenSpot.ez);G.hiddenSpot=null;$('lockerView').style.display='none';}
    G.doomed=false;
    flashRed(0.7,1400);
    AudioSys.growl(0.7);AudioSys.clank();
    let dx=Monster.x-Player.x,dz=Monster.z-Player.z;
    const d=Math.hypot(dx,dz)||1;dx/=d;dz/=d;
    let mx=Player.x+dx*4,mz=Player.z+dz*4;
    [mx,mz]=collideCircle(mx,mz,0.42);
    Monster.x=mx;Monster.z=mz;
    Monster.state='search';Monster.scanT=3.5;Monster.path=null;Monster.lostT=0;
    AudioSys.stopChase();
    showToast('The regen serum knits your wounds shut —\nyou tear yourself free!',3.2);
    return;
  }
  G.state='caught';caughtT=0;
  AudioSys.scream();AudioSys.stopChase();
  if(G.hidden){G.hidden=false;G.hiddenSpot=null;$('lockerView').style.display='none';}
  G.doomed=false;
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
function updateCaught(dt){
  caughtT+=dt;
  // camera shake + stare into the jaws
  camera.position.x+=rand(-0.02,0.02);
  camera.position.y+=rand(-0.02,0.02);
  Monster.parts.head.position.z=0.14+Math.min(caughtT*0.3,0.22);
  if(caughtT>1.0&&caughtT<1.06)fadeTo(1,500);
  if(caughtT>1.9){
    // respawn in the cell — items kept, monster reset
    G.deaths++;G.noise=0;
    Player.reset();
    Monster.parts.jaw.rotation.x=0.08;
    Monster.parts.head.position.z=0.14;
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
export{catchPlayer,updateCaught,updateTriggers};
