import{clamp,lerp}from'../utils.js';
import{G,keys,refs,addNoise}from'../state.js';
import{AudioSys}from'../audio.js';
import{camera}from'../gfx.js';
import{collideCircle,L,surfaceAt}from'../world.js';

/* ================= PLAYER ================= */
const Player={
  x:24.9,z:34,y:0,vy:0,yaw:0,pitch:0,
  vx:0,vz:0,grounded:true,eyeH:1.62,
  slideT:0,slideCD:0,slideDx:0,slideDz:0,
  crouched:false,crouchK:0,
  bob:0,stepAcc:0,fovKick:0,flashOn:false,
  reset(){
    this.x=24.9;this.z=34;this.y=0;this.vy=0;this.yaw=0;this.pitch=0;
    this.vx=0;this.vz=0;this.slideT=0;this.slideCD=0;this.grounded=true;
    this.crouched=false;
  },
  speedMult(){ return (G.syringe?1.4:1)*(G.vision?0.9:1); },
  update(dt){
    if(G.hidden){ // parked inside a locker
      camera.position.set(G.hiddenSpot.x,1.5,G.hiddenSpot.z);
      camera.rotation.set(this.pitch,this.yaw,0);
      G.noise=Math.max(0,G.noise-30*dt);
      return;
    }
    const sprinting=keys.ShiftLeft&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD);
    if(sprinting&&this.crouched)this.crouched=false;   // sprinting stands you up
    // --- slide ---
    this.slideCD-=dt;
    if(this.slideT>0){
      this.slideT-=dt;
      const k=this.slideT/0.75;
      const sp=lerp(3.2,8.4,k*k)*this.speedMult();
      this.vx=this.slideDx*sp;this.vz=this.slideDz*sp;
    }else{
      // --- walk / sprint ---
      let ix=0,iz=0;
      if(keys.KeyW)iz-=1; if(keys.KeyS)iz+=1;
      if(keys.KeyA)ix-=1; if(keys.KeyD)ix+=1;
      const len=Math.hypot(ix,iz);
      let tx=0,tz=0;
      if(len>0){
        ix/=len;iz/=len;
        // camera-relative: forward=(-sin yaw,-cos yaw), right=(cos yaw,-sin yaw)
        const cs=Math.cos(this.yaw),sn=Math.sin(this.yaw);
        const spd=(sprinting?6.2:(this.crouched?1.8:3.6))*this.speedMult();
        tx=(ix*cs+iz*sn)*spd;
        tz=(-ix*sn+iz*cs)*spd;
      }
      const ac=this.grounded?12:4;
      this.vx=lerp(this.vx,tx,clamp(ac*dt,0,1));
      this.vz=lerp(this.vz,tz,clamp(ac*dt,0,1));
    }
    // --- jump / gravity ---
    if(keys.Space&&this.grounded&&this.slideT<=0){
      if(this.crouched)this.crouched=false;      // stand up first
      else{this.vy=4.8;this.grounded=false;}
    }
    if(!this.grounded||this.y>0){
      this.vy-=13*dt;this.y+=this.vy*dt;
      if(this.y<=0){
        this.y=0;this.grounded=true;
        const impact=clamp(-this.vy/6,0.2,1.4);
        this.vy=0;AudioSys.land(impact);
        addNoise(14*impact);this.fovKick=Math.max(this.fovKick,-0.5);
      }
    }
    // --- integrate + collide (sliding fits under collapsed ducts) ---
    let nx=this.x+this.vx*dt, nz=this.z+this.vz*dt;
    [nx,nz]=collideCircle(nx,nz,0.35,this.slideT>0||this.crouched);
    this.x=nx;this.z=nz;
    const speed=Math.hypot(this.vx,this.vz);
    // --- continuous noise ---
    const nm=(G.syringe?1.5:1)*(G.noiseBuff?0.65:1);
    let target=0;
    if(speed>0.6)target=(sprinting||this.slideT>0)?80:(this.crouched?8:(speed>4.2?60:30));
    target*=nm*(speed>0.6?1:0);
    if(target>G.noise)G.noise=Math.min(target,G.noise+70*dt);
    else G.noise=Math.max(target*0.3,G.noise-26*dt);
    // --- footsteps ---
    if(speed>0.8&&this.grounded&&this.slideT<=0){
      this.stepAcc+=speed*dt;
      const stride=sprinting?2.6:(this.crouched?1.7:2.1);
      if(this.stepAcc>stride){
        this.stepAcc=0;
        AudioSys.footstep(sprinting?1:(this.crouched?0.1:0.35),speed/6,surfaceAt(this.x,this.z));
      }
    }
    // --- camera ---
    const slideK=this.slideT>0?clamp(this.slideT/0.75,0,1):0;
    this.crouchK=lerp(this.crouchK,this.crouched?1:0,clamp(9*dt,0,1));
    const eye=lerp(lerp(1.62,1.08,this.crouchK),0.95,slideK);
    this.bob+=speed*dt*1.7;
    const bobA=(this.grounded?clamp(speed/6,0,1)*0.04:0)*(1-this.crouchK*0.45);
    camera.position.set(
      this.x+Math.cos(this.bob*0.5)*bobA*0.4,
      this.y+eye+Math.abs(Math.sin(this.bob))*bobA,
      this.z);
    camera.rotation.set(this.pitch,this.yaw,slideK*0.06+Math.cos(this.bob*0.5)*bobA*0.14);
    // --- fov feel ---
    this.fovKick=lerp(this.fovKick,0,clamp(6*dt,0,1));
    const fovT=72+(sprinting?5:0)+slideK*9+this.fovKick*6;
    camera.fov=lerp(camera.fov,fovT,clamp(8*dt,0,1));
    camera.updateProjectionMatrix();
  },
  trySlide(){
    if(this.slideT>0||this.slideCD>0||!this.grounded)return;
    const speed=Math.hypot(this.vx,this.vz);
    if(speed<4.5*this.speedMult()*0.9)return;
    this.slideT=0.75;this.slideCD=1.5;
    this.slideDx=this.vx/speed;this.slideDz=this.vz/speed;
    AudioSys.slideNoise();addNoise(28);
  },
};
/* flashlight follows camera with a little lag */
const flashPos=new THREE.Vector3(),flashTgt=new THREE.Vector3(),flashDir=new THREE.Vector3();
function updateFlashlight(dt){
  camera.getWorldDirection(flashDir);
  const px=camera.position.x,py=camera.position.y,pz=camera.position.z;
  flashPos.lerp(new THREE.Vector3(px,py-0.12,pz),clamp(20*dt,0,1));
  flashTgt.lerp(new THREE.Vector3(px+flashDir.x*10,py+flashDir.y*10,pz+flashDir.z*10),clamp(9*dt,0,1));
  L.flash.position.copy(flashPos);
  L.flash.target.position.copy(flashTgt);
  L.glow.position.set(px,py,pz);
}

refs.player=Player;
export{Player,updateFlashlight};
