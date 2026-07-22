import{$,clamp,rand,dist2,lerp}from'./utils.js';
import{NOTE_SPECIMEN,NOTE_START,NOTE_DORM,NOTE_COLLINS,NOTE_NEWS,NOTE_MED}from'./config.js';
import{G,keys,doors,hideSpots,interactables,powerScreens,addNoise}from'./state.js';
import{AudioSys}from'./audio.js';
import{scene}from'./gfx.js';
import{M,box,cyl,addCollider,doorUnlock,setPower,L,worldRefs,power}from'./world.js';
import{showToast,updateObjective,openNote,closeNote,drawMap,flashRed}from'./ui.js';
import{Player}from'./entities/player.js';
import{Monster,makeSilhouetteRig}from'./entities/monster.js';

/* ================= NOISE EVENTS ================= */
function eventNoise(x,z,strength){
  addNoise(strength*0.5);
  if(G.alarmT>0)return;   // the fire alarm buries every other sound
  Monster.onNoise(x,z,strength*0.34);
}

/* ================= INTERACTABLES ================= */
function addInteract(x,z,y,label,cond,cb,mesh){
  const it={x,z,y,label,cond,cb,active:true,mesh:mesh||null};
  interactables.push(it);return it;
}
let promptIt=null;
function updatePrompt(){
  promptIt=null;
  if(G.hidden){
    $('prompt').innerHTML='<span class="k">E</span>STAY QUIET — LEAVE';
    return;
  }
  let best=null,bd=2.2;
  for(const it of interactables){
    if(!it.active||!it.cond())continue;
    const d=dist2(Player.x,Player.z,it.x,it.z);
    if(d<bd){bd=d;best=it;}
  }
  // locker prompts
  let bestSpot=null;
  for(const s of hideSpots){
    const d=dist2(Player.x,Player.z,s.ex,s.ez);
    if(d<1.3&&d<bd){bd=d;best=null;bestSpot=s;}
  }
  let hot=null;
  if(bestSpot){
    promptIt={spot:bestSpot};
    $('prompt').innerHTML='<span class="k">E</span>HIDE IN LOCKER';
  }else if(best){
    promptIt={it:best};
    $('prompt').innerHTML='<span class="k">E</span>'+best.label;
    hot=best.mesh;
  }else $('prompt').innerHTML='';
  setHighlight(hot);
  $('crosshair').classList.toggle('hot',!!promptIt);
}
// gently pulse the targeted pickup so you can spot what you're about to grab
let hlMesh=null,hlBase=1;
function setHighlight(mesh){
  if(mesh!==hlMesh){ if(hlMesh)hlMesh.scale.setScalar(hlBase); hlMesh=mesh||null; if(hlMesh)hlBase=hlMesh.scale.x; }
  if(hlMesh)hlMesh.scale.setScalar(hlBase*(1+0.05*(0.5+0.5*Math.sin(performance.now()*0.006))));
}
function onKeyPress(code){
  if(G.state!=='play'&&G.state!=='intro')return;
  if(G.paused)return;
  if(code==='KeyE'){
    if(G.noteOpen){closeNote();return;}
    if(G.hidden){exitLocker();return;}
    if(promptIt){
      if(promptIt.spot)enterLocker(promptIt.spot);
      else if(promptIt.it){promptIt.it.cb();}
    }
  }
  else if(code==='KeyC'){
    if(keys.ShiftLeft)Player.trySlide();                 // SHIFT+C while sprinting = slide
    else if(!G.hidden){Player.crouched=!Player.crouched;AudioSys.footstep(0.07,0.2);}
  }
  else if(code==='KeyF'){
    Player.flashOn=!Player.flashOn;
    L.flash.intensity=Player.flashOn?2.2:0;
    AudioSys.relay();
  }
  else if(code==='KeyM'){
    if(!G.hasMap){showToast('You have no map. There was one on the hallway wall.',2.4);return;}
    G.mapOpen=!G.mapOpen;
    $('mapOverlay').style.display=G.mapOpen?'block':'none';
    if(G.mapOpen)drawMap();
  }
}

/* ================= LOCKERS ================= */
function enterLocker(spot){
  G.hidden=true;G.hiddenSpot=spot;
  Player.vx=Player.vz=0;Player.slideT=0;
  Player.yaw=spot.yaw;Player.pitch=0;
  addNoise(10);AudioSys.lockerClunk();
  $('lockerView').style.display='block';
  G.doomed=Monster.onPlayerHide(spot);
}
function exitLocker(){
  if(G.doomed)return; // too late
  G.hidden=false;
  Player.x=G.hiddenSpot.ex;Player.z=G.hiddenSpot.ez;
  G.hiddenSpot=null;
  AudioSys.lockerClunk();addNoise(10);
  $('lockerView').style.display='none';
}

/* ================= PICKUPS & PUZZLE OBJECTS ================= */
const switchLevers=[];
function makeSyringe(x,z,y,fluidMat){
  const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
  const body=cyl(0.04,0.04,0.3,M.syringe,0,0,0,8);body.rotation.z=Math.PI/2;g.add(body);
  const fl=cyl(0.03,0.03,0.2,fluidMat,0,0,0,8);fl.rotation.z=Math.PI/2;g.add(fl);
  const ndl=cyl(0.006,0.006,0.14,M.syringe,0.2,0,0,6);ndl.rotation.z=Math.PI/2;g.add(ndl);
  return g;
}
function makeNote(x,z,y,rz,text,label){
  const note=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.4),M.paper);
  note.rotation.x=-Math.PI/2;note.rotation.z=rz;
  note.position.set(x,y,z);scene.add(note);
  addInteract(x,z,y,label||'READ NOTE',()=>true,()=>openNote(text),note);
}
function buildGameplayObjects(){
  // ---- start room desk: facility map + Alden's first entry ----
  const mapBoard=new THREE.Mesh(new THREE.PlaneGeometry(0.7,0.55),M.paper);
  mapBoard.rotation.x=-Math.PI/2;mapBoard.rotation.z=0.15;
  mapBoard.position.set(27.3,0.97,30.1);scene.add(mapBoard);
  addInteract(27.3,30.1,0.97,'TAKE FACILITY MAP',()=>!G.hasMap,()=>{
    G.hasMap=true;mapBoard.visible=false;
    AudioSys.pickup();showToast('Facility map acquired.  [ M ] to view.',3);
  },mapBoard);
  makeNote(28.5,30.4,0.97,0.5,NOTE_START,'READ JOURNAL');
  // ---- RED keycard in RECORDS (real BP_Key3 spot) ----
  const keycardMesh=box(0.17,0.02,0.11,M.keycard,-15.2,0.99,-1.85,0.4);
  addInteract(-15.2,-1.85,0.99,'TAKE RED KEYCARD',()=>!G.hasKeycard,()=>{
    G.hasKeycard=true;keycardMesh.visible=false;
    AudioSys.pickup();showToast('RED keycard — SPECIMEN ROOM access.',2.6);
    doorUnlock(doors.find(d=>d.id==='spec'));
    updateObjective();
  },keycardMesh);
  // ---- SPECIMEN: fuse + memo + speed serum (real BP_Syringe_Speed room) ----
  const fuseMesh=cyl(0.055,0.055,0.24,M.fuse,10.4,1.03,6.9,10);
  fuseMesh.rotation.z=Math.PI/2;
  addInteract(10.4,6.9,1,'TAKE GENERATOR FUSE',()=>!G.hasFuse&&!G.fuseIn,()=>{
    G.hasFuse=true;fuseMesh.visible=false;
    AudioSys.pickup();showToast('Generator fuse acquired.',2.6);
    updateObjective();
  },fuseMesh);
  makeNote(11.8,6.95,1.0,0.4,NOTE_SPECIMEN,'READ MEMO');
  box(0.7,0.06,0.3,M.darkMetal,13.6,1.15,-0.2,0); // wall shelf
  const spdSyr=makeSyringe(13.6,-0.2,1.25,M.syrFluid);
  addInteract(13.6,-0.2,1.25,'INJECT SPEED SERUM',()=>!G.syringe,()=>{
    G.syringe=true;spdSyr.visible=false;
    AudioSys.inject();flashRed(0.45,900);
    showToast('SPEED SERUM: +40% speed / +50% noise.\nYour heart is pounding.',3.6);
  },spdSyr);
  // ---- REGEN serum on the lab north bench (real BP_Syringe_Regen2) ----
  const regenMat=new THREE.MeshStandardMaterial({color:0x0d5a2a,emissive:0x1a7a3a,emissiveIntensity:0.9});
  const regSyr=makeSyringe(-5.2,-9.0,1.02,regenMat);
  addInteract(-5.2,-9.0,1.02,'INJECT REGEN SERUM',()=>!G.regen,()=>{
    G.regen=true;regSyr.visible=false;
    AudioSys.inject();flashRed(0.35,900);
    showToast('REGEN SERUM: you will survive one attack.\nYour skin crawls as it knits.',3.8);
  },regSyr);
  // ---- GENERATOR 1: switchboard on the east wall (real BP_Switcboard) ----
  box(0.14,1.9,3.2,M.metal,11.05,1.1,-16.4,0);          // switchboard body
  box(0.1,0.42,0.34,M.darkMetal,10.97,1.15,-12.9,0);    // fuse box
  addInteract(10.8,-12.9,1.1,'INSERT FUSE',()=>G.hasFuse&&!G.fuseIn,()=>{
    G.fuseIn=true;G.hasFuse=false;
    const f=cyl(0.05,0.05,0.2,M.fuse,10.9,1.15,-12.9,8);f.rotation.z=Math.PI/2;
    AudioSys.relay();AudioSys.clank();
    showToast('Fuse seated. Now flip all 4 breakers.\nWARNING: they are LOUD.',3.6);
    updateObjective();
  });
  for(let i=0;i<4;i++){
    const z=-14.2-i*1.5;
    const panel=box(0.12,0.72,0.5,M.metal,10.95,1.4,z,0);
    const lever=box(0.09,0.3,0.12,M.darkMetal,0,0,0,0);
    lever.position.set(-0.1,-0.12,0);panel.add(lever);
    const sw={i,z,lever,on:false};
    switchLevers.push(sw);
    addInteract(10.75,z,1.4,'FLIP BREAKER '+(i+1),()=>G.fuseIn&&!sw.on,()=>{
      sw.on=true;G.switches++;
      lever.position.y=0.12;
      AudioSys.clank();
      eventNoise(10.75,z,100);
      showToast('BREAKER '+G.switches+' / 4 — it heard that.',2.6);
      updateObjective();
      if(G.switches>=4){
        setTimeout(()=>{
          setPower();
          setTimeout(()=>{
            doorUnlock(doors.find(d=>d.id==='auto'));
            const ex=doors.find(d=>d.id==='exit');
            if(G.hasExitKey)doorUnlock(ex);
            else ex.lockMsg='POWER OK — BLUE KEYCARD REQUIRED';
            showToast('POWER RESTORED.\nThe north corridors are open.',4);
            updateObjective();
          },2400);
        },900);
      }
    });
  }
  // ---- BLUE keycard, west corridor dead end (real BP_Key2) ----
  const key2Mesh=box(0.17,0.02,0.11,M.keycard,-24.9,0.995,-40.6,0.3);
  key2Mesh.material=new THREE.MeshStandardMaterial({color:0x1a5ab0,emissive:0x1a4a9a,emissiveIntensity:1.1,roughness:0.4});
  addInteract(-24.9,-40.6,0.995,'TAKE BLUE KEYCARD',()=>!G.hasExitKey,()=>{
    G.hasExitKey=true;key2Mesh.visible=false;
    AudioSys.pickup();showToast('BLUE keycard — NORTH EXIT access.',2.6);
    if(power.on)doorUnlock(doors.find(d=>d.id==='exit'));
    updateObjective();
  },key2Mesh);
  // ---- DORM: Mara's email + a kept photograph ----
  makeNote(9.5,-65.1,0.965,0.3,NOTE_DORM,'READ EMAIL');
  { const frame=box(0.16,0.2,0.02,M.darkMetal,15.88,0.82,-60.6,-0.4);
    frame.rotation.x=-0.15;
    const photo=new THREE.Mesh(new THREE.PlaneGeometry(0.13,0.16),M.paper);
    photo.position.set(0,0,0.012);frame.add(photo);
    addInteract(15.88,-60.6,0.82,'LOOK AT PHOTOGRAPH',()=>true,()=>{
      AudioSys.pickup();
      showToast('A wedding photo. The glass is cracked.\nSomeone kept it beside their bunk until the end.',4.5);
    },frame);
  }
  // ---- MEDICAL: noise serum (real BP_Syringe_Noise) + resignation letter ----
  const noiseMat=new THREE.MeshStandardMaterial({color:0x5a5a10,emissive:0x6a6a1a,emissiveIntensity:0.8});
  const nzSyr=makeSyringe(-71.9,-85.15,1.0,noiseMat);
  addInteract(-71.9,-85.15,1.0,'INJECT SUPPRESSOR SERUM',()=>!G.noiseBuff,()=>{
    G.noiseBuff=true;nzSyr.visible=false;
    AudioSys.inject();flashRed(0.3,800);
    showToast('SUPPRESSOR SERUM: -35% noise.\nYour footsteps sound... muffled.',3.6);
  },nzSyr);
  makeNote(-71.9,-86.0,0.965,-0.4,NOTE_MED,'READ LETTER');
  // ---- searchable supply crates (loud, but they hold the rest of the story) ----
  function searchable(x,z,text,label){
    let used=false;
    addInteract(x,z,0.8,'SEARCH SUPPLY CRATE',()=>!used,()=>{
      used=true;
      AudioSys.lockerClunk();
      eventNoise(x,z,45);
      showToast('You rummage through the crate. It is not quiet.',2.4);
      setTimeout(()=>openNote(text),650);
    });
  }
  searchable(-25.3,-83.5,NOTE_COLLINS);
  searchable(-57,-104,NOTE_NEWS);
  // ---- NORTH HALL: vision serum on a crate (real BP_Syringe_Vision) ----
  const visMat=new THREE.MeshStandardMaterial({color:0x0c3a6a,emissive:0x1a5a9a,emissiveIntensity:0.9});
  const visSyr=makeSyringe(-20.3,-105.4,0.9,visMat);
  addInteract(-20.3,-105.4,0.9,'INJECT VISION SERUM',()=>!G.vision,()=>{
    G.vision=true;visSyr.visible=false;
    AudioSys.inject();flashRed(0.3,800);
    L.amb.intensity+=0.12;L.hemi.intensity+=0.06;
    showToast('VISION SERUM: eyes adjust to the dark, it shows on your map.\n-10% speed.',4);
  },visSyr);
  // ---- DORM RADIO: a loud decoy you can lure it with ----
  const radio=box(0.34,0.16,0.14,M.darkMetal,8.9,1.03,-65.35,0.2);
  const ant=cyl(0.006,0.006,0.32,M.metal,8.76,1.24,-65.4,6);ant.rotation.z=0.5;ant.castShadow=false;
  const dial=box(0.08,0.06,0.012,M.screenOff,0.06,0.02,0.077,0);radio.add(dial);
  addInteract(8.9,-65.35,1.03,'SWITCH ON RADIO',()=>G.radioOn<=0&&G.radioCD<=0,()=>{
    G.radioOn=12;
    AudioSys.radioStart(12);
    dial.material=M.screenOn;
    Monster.onNoise(8.9,-65.35,22);
    showToast('The radio coughs static into the dark.\nEverything nearby will come to look.',3.8);
    G._radioDial=dial;
  });
  // ---- FIRE ALARM (west wing): one pull, one chance ----
  const alarmMat=new THREE.MeshStandardMaterial({color:0x8a1418,emissive:0x4a0a0c,emissiveIntensity:0.7,roughness:0.5});
  box(0.24,0.32,0.1,alarmMat,-45,1.45,-71.7,0);
  box(0.06,0.14,0.04,M.metal,-45,1.4,-71.63,0);
  addInteract(-45,-71.7,1.45,'PULL FIRE ALARM',()=>!G.alarmUsed,()=>{
    G.alarmUsed=true;G.alarmT=8;G.ambSave=L.amb.intensity;
    AudioSys.alarmStart();
    Monster.onNoise(-45,-71.7,999);  // heard everywhere
    showToast('FIRE ALARM — the whole facility knows where THIS is.\nYour own sounds are buried while it rings.',4.5);
  });
  // ---- vending machine in Generator 1 ----
  box(0.95,1.9,0.5,M.darkMetal,-6,0.95,-22.65,0);
  addCollider(-6,-22.65,0.95,0.5,false);
  const vendPanel=box(0.66,1.15,0.04,M.screenOff,-6,1.2,-22.38,0);
  powerScreens.push(vendPanel);
  let vended=false;
  addInteract(-6,-22.4,1.1,'SHAKE VENDING MACHINE',()=>!vended,()=>{
    vended=true;
    AudioSys.canDrop();
    eventNoise(-6,-22.6,30);
    showToast('The machine is dead — but a warm can drops anyway.\nYou drink it. It changes nothing.',3.6);
  });
  // ---- filing cabinets in RECORDS ----
  const FILES=[
    [-14.5,'Personnel files. Half of them end with the same stamp:\nRESIGNED.'],
    [-13,'Shipment logs. The final delivery was never signed for.'],
    [-11.5,"Unopened letters addressed to Dr. Southam's wife.\nAll marked RETURN TO SENDER."],
  ];
  for(const[fx,text]of FILES){
    let used=false;
    addInteract(fx,-5.75,1.1,'SEARCH FILES',()=>!used,()=>{
      used=true;
      AudioSys.drawer();
      eventNoise(fx,-5.75,18);
      showToast(text,4.2);
    });
  }
  // ---- specimen tank drain valve ----
  const wheel=cyl(0.1,0.1,0.05,M.metal,9.15,0.55,-3.35,10);
  wheel.rotation.z=Math.PI/2;
  addInteract(9.15,-3.35,0.55,'OPEN DRAIN VALVE',()=>G.drainT<=0,()=>{
    G.drainT=0.001;
    AudioSys.gurgle();
    eventNoise(9.7,-3.9,22);
    showToast('The tank drains slowly.\nThe thing inside settles against the glass.',3.6);
  });
}
/* ---- powered gadgets tick (radio / alarm / tank drain) ---- */
function updateGadgets(dt){
  if(G.radioOn>0){
    G.radioOn-=dt;
    const d=dist2(Player.x,Player.z,8.9,-65.35);
    AudioSys.radioGain(clamp(7/(d+1),0.05,1));
    G._radioPing=(G._radioPing||0)-dt;
    if(G._radioPing<=0){
      G._radioPing=1.6;
      Monster.onNoise(8.9,-65.35,20);
    }
    if(G.radioOn<=0){
      AudioSys.radioStop();G.radioCD=45;
      if(G._radioDial)G._radioDial.material=M.screenOff;
      showToast('The radio dies with a squeal.',2.4);
    }
  }
  if(G.radioCD>0)G.radioCD-=dt;
  if(G.alarmT>0){
    G.alarmT-=dt;
    G._alarmPing=(G._alarmPing||0)-dt;
    if(G._alarmPing<=0){
      G._alarmPing=2;
      Monster.onNoise(-45,-71.7,999);
    }
    const k=Math.abs(Math.sin(performance.now()*0.011));
    const r=$('redFlash');r.style.transition='none';r.style.opacity=0.04+0.07*k;
    L.amb.intensity=G.ambSave*(0.85+0.35*k);
    if(G.alarmT<=0){
      AudioSys.alarmStop();
      r.style.opacity=0;
      L.amb.intensity=G.ambSave;
    }
  }
  if(G.drainT>0&&G.drainT<1){
    G.drainT=Math.min(1,G.drainT+dt*0.22);
    const k=G.drainT;
    const tankA=worldRefs.tankA;
    if(tankA){
      tankA.fl.scale.y=1-k*0.92;
      tankA.fl.position.y=1.16-k*0.72;
      tankA.blob.position.y=1.05-k*0.42;
      tankA.blob.rotation.z+=dt*0.12;
    }
  }
}

/* ================= SILHOUETTE EVENT ================= */
let silFigure=null,silParts=null,silT=-1;
function buildSilhouette(){
  const rig=makeSilhouetteRig();
  silFigure=rig.root;silParts=rig.parts;
  silFigure.position.set(11.7,0,20.6);silFigure.visible=false;
  scene.add(silFigure);
}
function updateSilhouette(dt){
  if(G.silDone||G.state!=='play')return;
  if(silT<0){
    if(Player.x>5.5&&Player.x<14.5&&Player.z>21.6&&Player.z<24.4){
      silT=0;silFigure.visible=true;AudioSys.sting();
    }
    return;
  }
  silT+=dt;
  L.alcove.intensity=(Math.random()<0.5?rand(0.6,1.6):rand(0.1,0.5));   // strobe red
  const dur=4.6;
  const k=clamp(silT/dur,0,1);
  // slow, deliberate prowl across the alcove, seen in profile
  silFigure.position.x=lerp(12.5,7.5,k);
  const A=silT*3.0,phL=A,phR=A+Math.PI+0.3;       // legs half a stride apart
  silFigure.position.y=(0.5-Math.cos(2*A)*0.5)*0.05;
  silFigure.rotation.y=-Math.PI/2;                 // faces its direction of travel (down the corridor)
  silFigure.rotation.x=0.32;                        // hunched (YXZ order -> leans along the walk)
  const P=silParts;
  P.legL.rotation.x=Math.sin(phL)*0.6-0.05;
  P.legR.rotation.x=Math.sin(phR)*0.6;
  P.shinL.rotation.x=Math.max(0,Math.sin(phL-1.9))*0.7;
  P.shinR.rotation.x=Math.max(0,Math.sin(phR-1.9))*0.7;
  // long arms hang close and swing counter to the legs, forearms trailing — not splayed out
  P.armL.rotation.x=0.3-Math.sin(phL)*0.28;
  P.armR.rotation.x=0.3-Math.sin(phR)*0.28;
  P.armL.rotation.z=0.13;P.armR.rotation.z=-0.13;
  P.foreL.rotation.x=0.5-Math.sin(phL-0.6)*0.25;
  P.foreR.rotation.x=0.5-Math.sin(phR-0.6)*0.25;
  // head mostly forward, but turns to STARE at you through the glass as it passes the middle
  const stare=Math.exp(-Math.pow((k-0.5)*4.5,2));  // bell curve peaking mid-pass
  P.head.rotation.y=stare*1.5+Math.sin(A*0.6)*0.08;
  P.head.rotation.x=0.18+Math.sin(2*A)*0.04;
  if(silT>dur+0.3){
    G.silDone=true;silFigure.visible=false;L.alcove.intensity=0;
    showToast('...something is in here with you.',3);
  }
}

export{eventNoise,addInteract,updatePrompt,onKeyPress,enterLocker,exitLocker,buildGameplayObjects,updateGadgets,buildSilhouette,updateSilhouette};
