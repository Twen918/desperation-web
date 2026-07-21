import{clamp,rand,dist2}from'../utils.js';
import{NODES}from'../config.js';
import{G,refs}from'../state.js';
import{AudioSys}from'../audio.js';
import{scene}from'../gfx.js';
import{collideCircle,hasLOS,findPath,nearestNode,power,M}from'../world.js';
import{Player}from'./player.js';

/* ================= CREATURE RIG (shared by the monster & the silhouette) =====
   No CapsuleGeometry on three r128, so a capsule is a tapered cylinder plus a
   sphere at each end. Limbs are pivot groups: origin at the joint, body hanging
   down to -len, so a parent's tip is the child's socket. */
function capLimb(len,rTop,rBot,mat,seg=8){
  const g=new THREE.Group();                       // pivot at top (y=0)
  const body=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBot,len,seg),mat);
  body.position.y=-len/2;g.add(body);
  const top=new THREE.Mesh(new THREE.SphereGeometry(rTop,seg,6),mat);g.add(top);
  const bot=new THREE.Mesh(new THREE.SphereGeometry(rBot,seg,6),mat);bot.position.y=-len;g.add(bot);
  return g;
}
function ellip(rx,ry,rz,mat,seg=10){               // squashed sphere = ribcage / skull
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,seg,seg),mat);
  m.scale.set(rx,ry,rz);return m;
}
function buildCreatureRig(mat){
  const flesh=mat.flesh,sinew=mat.sinew,eyeMat=mat.eye;
  const r=new THREE.Group();
  const P={spine:[]};
  // gaunt, hunched frame: narrow ribcage, bony shoulders, exposed sternum
  const torso=ellip(0.18,0.42,0.135,flesh);torso.position.y=1.6;torso.rotation.x=0.26;r.add(torso);P.torso=torso;
  const shoulder=ellip(0.32,0.1,0.15,flesh);shoulder.position.set(0,2.0,0.05);shoulder.rotation.x=0.2;r.add(shoulder);
  const chest=ellip(0.13,0.16,0.1,sinew);chest.position.set(0,1.82,0.12);chest.rotation.x=0.2;r.add(chest);
  const hips=ellip(0.15,0.13,0.12,flesh);hips.position.y=1.2;r.add(hips);
  // segmented spine that can writhe (each vertebra animated in syncMesh)
  for(let i=0;i<7;i++){
    const seg=new THREE.Group();
    const vert=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.11,5),sinew);
    vert.rotation.x=-2.5;seg.add(vert);
    seg.position.set(0,1.28+i*0.13,-0.14-i*0.012);
    r.add(seg);P.spine.push(seg);
  }
  // head thrust forward on a stub neck — an elongated skull with a muzzle
  const headP=new THREE.Group();headP.position.set(0,2.14,0.2);headP.rotation.x=0.16;r.add(headP);P.head=headP;
  const skull=ellip(0.115,0.15,0.185,flesh);skull.position.set(0,0.07,0.03);headP.add(skull);
  const jaw=new THREE.Group();jaw.position.set(0,0.0,0.06);headP.add(jaw);P.jaw=jaw;   // hinge pivot
  const jawMesh=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.055,0.2),sinew);
  jawMesh.position.set(0,-0.03,0.06);jaw.add(jawMesh);
  for(const s of[-1,1]){                                    // sunken, glowing eyes on the muzzle
    const eye=new THREE.Mesh(new THREE.SphereGeometry(0.032,7,7),eyeMat);
    eye.position.set(s*0.05,0.05,0.17);headP.add(eye);
  }
  // arms (long, spidery) + forearms + claws
  P.armL=capLimb(0.7,0.07,0.05,flesh);P.armL.position.set(-0.28,2.0,0.06);r.add(P.armL);
  P.armR=capLimb(0.7,0.07,0.05,flesh);P.armR.position.set(0.28,2.0,0.06);r.add(P.armR);
  P.foreL=capLimb(0.78,0.05,0.035,flesh);P.foreL.position.y=-0.7;P.armL.add(P.foreL);
  P.foreR=capLimb(0.78,0.05,0.035,flesh);P.foreR.position.y=-0.7;P.armR.add(P.foreR);
  for(const fore of[P.foreL,P.foreR])
    for(let i=0;i<3;i++){
      const claw=new THREE.Mesh(new THREE.ConeGeometry(0.016,0.2,5),sinew);
      claw.position.set((i-1)*0.04,-0.84,0.02);claw.rotation.x=Math.PI;fore.add(claw);
    }
  // legs + shins
  P.legL=capLimb(0.6,0.09,0.06,flesh);P.legL.position.set(-0.13,1.12,0);r.add(P.legL);
  P.legR=capLimb(0.6,0.09,0.06,flesh);P.legR.position.set(0.13,1.12,0);r.add(P.legR);
  P.shinL=capLimb(0.62,0.06,0.04,flesh);P.shinL.position.y=-0.6;P.legL.add(P.shinL);
  P.shinR=capLimb(0.62,0.06,0.04,flesh);P.shinR.position.y=-0.6;P.legR.add(P.shinR);
  return{root:r,parts:P};
}
/* pure-black, unlit clone used behind the frosted glass */
function makeSilhouetteRig(){
  const rig=buildCreatureRig({flesh:M.black,sinew:M.black,eye:M.black});
  rig.root.traverse(o=>{o.castShadow=false;});
  return rig;
}

/* ================= MONSTER ================= */
const Monster={
  // real spawn: Monster_NBC at UE (-2995,3469) = the middle of the lab ring
  state:'dormant',x:0,z:-0.6,yaw:Math.PI,
  path:null,pathI:0,patrolI:0,
  investX:0,investZ:0,scanT:0,lostT:0,stepAcc:0,animT:0,twitchT:0,
  senseT:0,repathT:0,ripSpot:null,ripPhase:0,stuckT:0,
  root:null,parts:{},
  baseRoute:[13,9,11,12,10,8,6,5,7,15,16],   // lab ring + side rooms + gen 1
  northRoute:[13,9,12,16,18,19,23,24,23,25,26,22,21,20,19,18,16,5],
  get patrolRoute(){return power.on?this.northRoute:this.baseRoute;},
  build(){
    const eyeMat=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff2018,emissiveIntensity:3.4});
    const rig=buildCreatureRig({flesh:M.flesh,sinew:M.sinew,eye:eyeMat});
    this.root=rig.root;this.parts=rig.parts;
    this.root.traverse(o=>{o.castShadow=true;});
    scene.add(this.root);
    this.syncMesh(0);
  },
  reset(){
    this.state='dormant';this.x=0;this.z=-0.6;this.yaw=Math.PI;
    this.path=null;this.patrolI=0;this.ripSpot=null;
    AudioSys.stopChase();
    if(G.labEntered)this.activate();
    this.syncMesh(0);
  },
  activate(){
    if(this.state!=='dormant')return;
    this.state='patrol';
    this.goToNode(this.patrolRoute[0]);
    AudioSys.growl(0.4);
  },
  speed(){
    switch(this.state){
      case 'chase':return power.on?5.8:5.0;
      case 'investigate':return 3.5;
      case 'ripping':return 5.2;
      case 'search':return 2.6;
      default:return 2.2;
    }
  },
  goToNode(n){
    const from=nearestNode(this.x,this.z);
    this.path=findPath(from,n);this.pathI=0;
  },
  goToPoint(x,z){
    this.investX=x;this.investZ=z;
    this.goToNode(nearestNode(x,z));
  },
  onNoise(x,z,radius){
    if(this.state==='dormant'||this.state==='chase'||this.state==='ripping')return;
    if(dist2(this.x,this.z,x,z)<radius+2){
      this.state='investigate';this.scanT=0;this.goToPoint(x,z);
    }
  },
  onPlayerHide(spot){
    if(this.state==='chase'&&dist2(this.x,this.z,Player.x,Player.z)<6){
      this.state='ripping';this.ripSpot=spot;this.ripPhase=0;
      this.goToPoint(spot.ex,spot.ez);
      return true;   // doomed — saw you climb in
    }
    if(this.state==='chase'){
      this.state='investigate';this.scanT=0;
      this.goToPoint(spot.ex,spot.ez);
      AudioSys.stopChase();
    }
    return false;
  },
  canSeePlayer(){
    if(G.hidden||G.state!=='play')return false;
    const d=dist2(this.x,this.z,Player.x,Player.z);
    const vd=(Player.flashOn?17:13)*(Player.crouched?0.75:1);
    if(d>vd)return false;
    const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);
    const dx=(Player.x-this.x)/d,dz=(Player.z-this.z)/d;
    if(d>1.6&&fx*dx+fz*dz<0.57)return false;   // ~110° cone
    return hasLOS(this.x,this.z,Player.x,Player.z);
  },
  update(dt){
    if(this.state==='dormant'){
      // stands in the corner, barely moving
      this.twitchT-=dt;
      if(this.twitchT<=0){this.twitchT=rand(2,5);this.yaw+=rand(-0.15,0.15);}
      this.syncMesh(dt);
      return;
    }
    const pd=dist2(this.x,this.z,Player.x,Player.z);
    // --- senses (10 Hz) ---
    this.senseT-=dt;
    if(this.senseT<=0){
      this.senseT=0.1;
      if(this.state!=='ripping'){
        if(this.canSeePlayer()){
          if(this.state!=='chase'){AudioSys.startChase();AudioSys.growl(0.55);}
          this.state='chase';this.lostT=0;
          this.investX=Player.x;this.investZ=Player.z;
        }else if(this.state==='chase'){
          this.lostT+=0.1;
        }
        // continuous hearing (deafened while the fire alarm rings)
        if(this.state!=='chase'&&G.alarmT<=0){
          const hr=1.5+G.noise*0.16;
          if(!G.hidden&&pd<hr){this.state='investigate';this.scanT=0;this.goToPoint(Player.x,Player.z);}
        }
      }
    }
    // --- state behaviour ---
    let tx=null,tz=null;
    if(this.state==='chase'){
      if(this.lostT>2.5){
        this.state='search';this.scanT=4;
        this.goToPoint(this.investX,this.investZ);
        AudioSys.stopChase();
      }else{
        if(hasLOS(this.x,this.z,Player.x,Player.z)&&!G.hidden){
          this.investX=Player.x;this.investZ=Player.z;
          tx=Player.x;tz=Player.z;this.path=null;
        }else{
          this.repathT-=dt;
          if(!this.path||this.repathT<=0){this.repathT=0.6;this.goToPoint(this.investX,this.investZ);}
        }
      }
    }
    else if(this.state==='investigate'||this.state==='search'||this.state==='ripping'){
      if(!this.path||this.pathI>=this.path.length){
        if(this.state==='ripping'){
          // reached the locker — rip it open
          this.ripPhase+=dt;
          const s=this.ripSpot;
          this.yaw=Math.atan2(s.x-this.x,s.z-this.z);
          if(this.ripPhase>0.35&&this.ripPhase<0.45)AudioSys.lockerClunk();
          if(this.ripPhase>0.9){refs.catchPlayer();return;}
        }else{
          // arrived: look around
          this.scanT-=dt;
          this.yaw+=dt*1.4*Math.sin(this.scanT*2.1);
          if(this.scanT<=-3){this.state='patrol';this.nextPatrol();}
          else if(this.scanT<=0&&this.state==='investigate'){this.state='search';this.scanT=3.5;}
        }
      }
    }
    else if(this.state==='patrol'){
      if(!this.path||this.pathI>=this.path.length)this.nextPatrol();
    }
    // --- follow path ---
    if(tx===null&&this.path&&this.pathI<this.path.length){
      const n=NODES[this.path[this.pathI]];
      tx=n[0];tz=n[1];
      if(dist2(this.x,this.z,tx,tz)<0.55){this.pathI++;tx=null;}
    }
    // --- move ---
    if(tx!==null){
      const d=dist2(this.x,this.z,tx,tz);
      if(d>0.05){
        const sp=this.speed();
        const wy=Math.atan2(tx-this.x,tz-this.z);
        let dy=wy-this.yaw;
        while(dy>Math.PI)dy-=Math.PI*2;while(dy<-Math.PI)dy+=Math.PI*2;
        this.yaw+=clamp(dy,-dt*6,dt*6);
        const mv=Math.min(sp*dt,d);
        let nx=this.x+Math.sin(this.yaw)*mv, nz=this.z+Math.cos(this.yaw)*mv;
        [nx,nz]=collideCircle(nx,nz,0.42);
        const moved=dist2(this.x,this.z,nx,nz);
        this.x=nx;this.z=nz;
        // anti-stuck: grinding against furniture for >1.1s -> skip ahead / repath
        if(moved<mv*0.25)this.stuckT+=dt;else this.stuckT=0;
        if(this.stuckT>1.1){
          this.stuckT=0;
          if(this.path&&this.pathI<this.path.length-1)this.pathI++;
          else if(this.state==='chase'){this.repathT=0;this.goToPoint(this.investX,this.investZ);}
          else if(this.state==='patrol')this.nextPatrol();
          else{this.path=null;this.scanT=Math.min(this.scanT,0.5);}
        }
        this.stepAcc+=moved;
        if(this.stepAcc>1.3){
          this.stepAcc=0;
          AudioSys.monsterStep(clamp(8/(pd+1.5),0.06,0.85));
        }
      }
    }
    // --- catch ---
    if(!G.hidden&&G.state==='play'&&pd<1.15&&this.state==='chase')refs.catchPlayer();
    else if(!G.hidden&&G.state==='play'&&pd<0.8&&this.state!=='dormant')refs.catchPlayer();
    this.syncMesh(dt);
  },
  nextPatrol(){
    this.patrolI=(this.patrolI+1)%this.patrolRoute.length;
    this.goToNode(this.patrolRoute[this.patrolI]);
  },
  syncMesh(dt){
    const r=this.root,P=this.parts;
    if(!r)return;
    r.position.set(this.x,0,this.z);
    r.rotation.y=this.yaw;
    const chasing=this.state==='chase'||this.state==='ripping';
    const sp=this.state==='dormant'?0:this.speed();
    this.animT+=dt*sp*2.4;
    const swing=(this.state==='dormant')?0:(chasing?0.62:0.38);
    const A=this.animT;
    // high-frequency tremor — it can never hold still
    const tremor=(Math.sin(A*18.7)*0.6+Math.sin(A*7.3)*0.4)*(chasing?0.05:0.028)+(this.state==='dormant'?Math.sin(A*11)*0.006:0);
    // asymmetric limp: the LEFT leg is ruined — shallow swing, dragging hitch
    const gaitL=Math.sin(A), gaitR=Math.sin(A+0.4);   // phase offset makes the step uneven
    P.legL.rotation.x=gaitL*swing*0.5-0.08;
    P.legR.rotation.x=-gaitR*swing;
    P.shinL.rotation.x=Math.max(0,-gaitL)*0.4;        // barely bends
    P.shinR.rotation.x=Math.max(0,gaitR)*0.8;
    // arms: reach forward to grab while chasing; hang and sway otherwise
    P.armL.rotation.x=(chasing?-1.75:0.15)-gaitL*swing*(chasing?0.15:0.7);
    P.armR.rotation.x=(chasing?-1.75:0.15)+gaitR*swing*(chasing?0.15:0.85);
    P.armL.rotation.z=(chasing?0.34:0.06)+tremor;
    P.armR.rotation.z=(chasing?-0.34:-0.06)-tremor;
    P.foreL.rotation.x=chasing?-0.35:-0.25;
    P.foreR.rotation.x=chasing?-0.3:-0.25;
    // body: limp bob (favours the good leg), a permanent list, and tremor
    r.position.y=Math.abs(Math.sin(A))*0.05-Math.max(0,gaitL)*0.025;
    r.rotation.x=(chasing?0.2:0.06)+tremor*0.5;
    r.rotation.z=Math.sin(A)*0.03+0.02+tremor;
    // head: thrust forward; tips its face down to fix its eyes on you (it's taller)
    P.head.rotation.y=Math.sin(A*0.4)*0.2+tremor*2;
    P.head.rotation.x=(chasing?0.05:0.14)+tremor*1.6;
    P.head.rotation.z=tremor;
    P.torso.rotation.z=tremor*1.2;
    // spine: a lateral wave writhing down the back
    for(let i=0;i<P.spine.length;i++)
      P.spine[i].rotation.z=Math.sin(A*3+i*0.9)*0.10+tremor;
    // jaw
    P.jaw.rotation.x=chasing?0.55+Math.sin(A*2)*0.18:0.08+Math.abs(tremor)*2;
  },
};

refs.monster=Monster;
export{Monster,makeSilhouetteRig};
