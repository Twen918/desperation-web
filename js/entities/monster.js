import{clamp,rand,dist2}from'../utils.js';
import{NODES}from'../config.js';
import{G,refs,Settings}from'../state.js';
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
  r.rotation.order='YXZ';   // yaw first, so a forward lean tilts along the facing, not sideways
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
      case 'chase':return (power.on?5.8:5.0)*Settings.mSpeed;
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
          const hr=(1.5+G.noise*0.16)*Settings.mHear;
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
    const dormant=this.state==='dormant';
    const sp=dormant?0:this.speed();
    this.animT+=dt*sp*1.9;
    const A=this.animT;
    const moving=sp>0.1;
    const swing=chasing?0.72:0.5;
    // nervous twitch — brief GATED bursts, not a constant buzz (fixes the "seizure" look)
    const gate=Math.pow(Math.max(0,Math.sin(A*0.5+1.3)),8);
    const jerk=gate*Math.sin(A*22)*(chasing?0.07:0.045)+(dormant?Math.sin(A*0.7)*0.012:0);
    const sway=Math.sin(A*(dormant?0.5:1.0))*(dormant?0.02:0.0);
    // === LEGS — alternating cycle (half a stride apart) with a limp on the LEFT ===
    const phL=A, phR=A+Math.PI+0.3;      // ~PI apart = true alternating step; +0.3 skews it (limp)
    const bad=0.6;                        // ruined left leg: short stride
    P.legL.rotation.x=Math.sin(phL)*swing*bad-0.05;
    P.legR.rotation.x=Math.sin(phR)*swing;
    P.shinL.rotation.x=Math.max(0,Math.sin(phL-1.9))*0.5*bad;   // knee barely bends
    P.shinR.rotation.x=Math.max(0,Math.sin(phR-1.9))*1.0;
    // === BODY — weight bob (twice a stride), side-to-side shift, forward hunch, limp hitch
    const bob=(0.5-Math.cos(2*A-0.5)*0.5)*0.05*(moving?1:0.25);
    const hitch=Math.max(0,Math.sin(phL))*0.03;                 // dips onto the bad leg
    r.position.y=bob*0.7-hitch;
    r.rotation.x=(chasing?0.22:0.08)+jerk*0.3;
    r.rotation.z=Math.sin(A)*0.05+0.02;                          // weight shift + a permanent list
    if(P.torso){P.torso.rotation.y=Math.sin(A)*0.06;P.torso.rotation.z=jerk*0.4;} // shoulder counter-twist
    // === ARMS — counter-swing to the legs; forearms LAG behind (follow-through) ===
    if(chasing){
      // arms outstretched straight ahead, zombie-style — parallel, not crossed
      P.armL.rotation.x=-1.5+Math.sin(phL)*0.07;   // ~horizontal forward, faint lurch
      P.armR.rotation.x=-1.5+Math.sin(phR)*0.07;
      P.armL.rotation.z=0.05+jerk*0.5;P.armR.rotation.z=-0.05-jerk*0.5;  // nearly parallel
      P.foreL.rotation.x=0.06;P.foreR.rotation.x=0.06;   // straight, hands droop a touch
    }else{
      P.armL.rotation.x=-Math.sin(phL)*swing*0.7+0.12;           // opposite the same-side leg
      P.armR.rotation.x=-Math.sin(phR)*swing*0.7+0.12;
      P.armL.rotation.z=0.07+sway;P.armR.rotation.z=-0.07-sway;
      P.foreL.rotation.x=-0.3-Math.sin(phL-0.6)*swing*0.4;       // trails the upper arm
      P.foreR.rotation.x=-0.3-Math.sin(phR-0.6)*swing*0.4;
    }
    // === HEAD — slow scan + gentle bob (lags the body), rare twitch ===
    P.head.rotation.y=Math.sin(A*0.45)*0.16+jerk*1.4;
    P.head.rotation.x=(chasing?0.05:0.14)+Math.sin(2*A-1.2)*0.03+jerk*0.8;
    P.head.rotation.z=sway*0.5+jerk*0.7;
    // === SPINE — slow lateral undulation down the back (not a fast buzz) ===
    for(let i=0;i<P.spine.length;i++)
      P.spine[i].rotation.z=Math.sin(A*1.4-i*0.7)*0.06;
    // === JAW ===
    P.jaw.rotation.x=chasing?0.5+Math.sin(A*3)*0.14:0.08+Math.abs(jerk)*1.3;
  },
};

refs.monster=Monster;
export{Monster,makeSilhouetteRig};
