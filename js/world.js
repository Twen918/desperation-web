import{clamp,lerp,rand,dist2}from'./utils.js';
import{H,T,ROOMS,NODES,ADJ}from'./config.js';
import{colliders,doors,hideSpots,flickerLights,preLights,postLights,powerScreens}from'./state.js';
import{AudioSys}from'./audio.js';
import{scene,renderer,maxAniso}from'./gfx.js';
import{showToast}from'./ui.js';

/* ================= PROCEDURAL TEXTURES ================= */
function makeTex(w,h,draw,rx,ry,srgb=true){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const x=c.getContext('2d');draw(x,w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(rx)t.repeat.set(rx,ry||rx);
  t.anisotropy=maxAniso;
  if(srgb)t.encoding=THREE.sRGBEncoding;
  return t;
}
function speckle(x,w,h,n,a){
  for(let i=0;i<n;i++){
    const v=Math.random();
    x.fillStyle=v>0.5?`rgba(255,255,255,${a*Math.random()})`:`rgba(0,0,0,${a*1.4*Math.random()})`;
    x.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);
  }
}
function stains(x,w,h,n,dark=0.30){
  for(let i=0;i<n;i++){
    const r=rand(14,70),cx=Math.random()*w,cy=Math.random()*h;
    const gr=x.createRadialGradient(cx,cy,2,cx,cy,r);
    gr.addColorStop(0,`rgba(8,8,6,${dark*Math.random()})`);
    gr.addColorStop(1,'rgba(8,8,6,0)');
    x.fillStyle=gr;x.beginPath();x.arc(cx,cy,r,0,7);x.fill();
  }
}
function grime(x,w,h,n){ // vertical drip streaks (soft in/out)
  for(let i=0;i<n;i++){
    const sx=Math.random()*w,sy=Math.random()*h*0.4,len=rand(40,h*0.7);
    const a=rand(0.04,0.12);
    const gr=x.createLinearGradient(0,sy,0,sy+len);
    gr.addColorStop(0,'rgba(10,12,8,0)');
    gr.addColorStop(0.2,`rgba(10,12,8,${a})`);
    gr.addColorStop(1,'rgba(10,12,8,0)');
    x.fillStyle=gr;x.fillRect(sx,sy,rand(5,16),len);
  }
}
function scratches(x,w,h,n,light){
  x.strokeStyle=light?'rgba(200,205,200,0.10)':'rgba(0,0,0,0.16)';
  for(let i=0;i<n;i++){
    x.lineWidth=Math.random()*1.2+0.3;x.beginPath();
    const sx=Math.random()*w,sy=Math.random()*h;
    x.moveTo(sx,sy);x.lineTo(sx+rand(-50,50),sy+rand(-14,14));x.stroke();
  }
}
const floorTex=makeTex(512,512,(x,w,h)=>{
  x.fillStyle='#2b2f2e';x.fillRect(0,0,w,h);
  speckle(x,w,h,2600,0.05);
  x.strokeStyle='rgba(0,0,0,0.5)';x.lineWidth=3;
  for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*128,0);x.lineTo(i*128,h);x.stroke();
    x.beginPath();x.moveTo(0,i*128);x.lineTo(w,i*128);x.stroke();}
  x.strokeStyle='rgba(120,126,120,0.09)';x.lineWidth=1;
  for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*128+2,0);x.lineTo(i*128+2,h);x.stroke();}
  scratches(x,w,h,40,true);stains(x,w,h,26,0.42);
});
const wallTex=makeTex(512,512,(x,w,h)=>{
  x.fillStyle='#59615c';x.fillRect(0,0,w,h);
  x.fillStyle='#333a37';x.fillRect(0,h*0.66,w,h*0.34);          // dark wainscot
  x.fillStyle='rgba(122,44,40,0.55)';x.fillRect(0,h*0.64,w,4);   // trim stripe
  speckle(x,w,h,1800,0.045);
  x.strokeStyle='rgba(0,0,0,0.34)';x.lineWidth=2;
  for(let i=0;i<=2;i++){x.beginPath();x.moveTo(i*256,0);x.lineTo(i*256,h);x.stroke();}
  grime(x,w,h,20);stains(x,w,h,9,0.16);scratches(x,w,h,12,false);
});
const ceilTex=makeTex(512,512,(x,w,h)=>{
  x.fillStyle='#1e2224';x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(0,0,0,0.55)';x.lineWidth=3;
  for(let i=0;i<=4;i++){x.beginPath();x.moveTo(i*128,0);x.lineTo(i*128,h);x.stroke();
    x.beginPath();x.moveTo(0,i*128);x.lineTo(w,i*128);x.stroke();}
  x.fillStyle='rgba(0,0,0,0.5)';
  for(let i=0;i<6;i++){const vx=rand(20,w-84),vy=rand(20,h-40);
    for(let s=0;s<5;s++)x.fillRect(vx,vy+s*7,64,3);}
  speckle(x,w,h,900,0.04);stains(x,w,h,10,0.3);
});
const metalTex=makeTex(256,256,(x,w,h)=>{
  x.fillStyle='#575e62';x.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=2){x.fillStyle=`rgba(${Math.random()>0.5?255:0},255,255,${Math.random()*0.05})`;x.fillRect(i,0,1,h);}
  scratches(x,w,h,26,true);grime(x,w,h,8);stains(x,w,h,6,0.28);
});
const lockerTex=makeTex(256,512,(x,w,h)=>{
  x.fillStyle='#4c5458';x.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=2){x.fillStyle=`rgba(255,255,255,${Math.random()*0.04})`;x.fillRect(i,0,1,h);}
  x.fillStyle='rgba(6,8,9,0.9)';
  for(let gset=0;gset<2;gset++)for(let s=0;s<5;s++)x.fillRect(w*0.24,h*(0.14+gset*0.14)+s*10,w*0.52,4);
  x.fillStyle='#2c3134';x.fillRect(w*0.78,h*0.5-16,10,32);       // handle
  x.strokeStyle='rgba(0,0,0,0.5)';x.lineWidth=3;x.strokeRect(6,6,w-12,h-12);
  grime(x,w,h,12);stains(x,w,h,7,0.34);scratches(x,w,h,16,false);
});
const crateTex=makeTex(256,256,(x,w,h)=>{
  x.fillStyle='#46493a';x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(0,0,0,0.5)';x.lineWidth=8;x.strokeRect(10,10,w-20,h-20);
  x.strokeRect(50,50,w-100,h-100);
  speckle(x,w,h,700,0.05);stains(x,w,h,6,0.3);
});
const paperTex=makeTex(128,160,(x,w,h)=>{
  x.fillStyle='#cfc49b';x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(60,50,30,0.55)';x.lineWidth=1;
  for(let i=3;i<14;i++){x.beginPath();x.moveTo(12,i*11);x.lineTo(w-10,i*11);x.stroke();}
  stains(x,w,h,3,0.25);
});
const bloodTex=makeTex(256,256,(x,w,h)=>{
  x.clearRect(0,0,w,h);
  for(let i=0;i<7;i++){
    const cx=w/2+rand(-40,40),cy=h/2+rand(-40,40),r=rand(16,52);
    const gr=x.createRadialGradient(cx,cy,2,cx,cy,r);
    gr.addColorStop(0,'rgba(66,8,8,0.85)');gr.addColorStop(0.7,'rgba(48,5,6,0.55)');gr.addColorStop(1,'rgba(40,4,5,0)');
    x.fillStyle=gr;x.beginPath();x.arc(cx,cy,r,0,7);x.fill();
  }
  for(let i=0;i<12;i++){x.fillStyle='rgba(52,6,7,0.7)';
    x.fillRect(w/2+rand(-70,70),h/2+rand(-70,70),rand(2,6),rand(2,18));}
},1,1);
bloodTex.wrapS=bloodTex.wrapT=THREE.ClampToEdgeWrapping;
/* mutant flesh — mottled skin, dark branching veins, blood, wet noise */
const fleshTex=makeTex(256,256,(x,w,h)=>{
  x.fillStyle='#6b5a52';x.fillRect(0,0,w,h);                 // greyish flesh base
  for(let i=0;i<44;i++){                                     // mottled blotches
    const cx=Math.random()*w,cy=Math.random()*h,r=rand(8,42);
    const c=Math.random()<0.5?'84,62,58':'46,28,30';
    const gr=x.createRadialGradient(cx,cy,1,cx,cy,r);
    gr.addColorStop(0,`rgba(${c},${rand(0.10,0.34)})`);gr.addColorStop(1,`rgba(${c},0)`);
    x.fillStyle=gr;x.beginPath();x.arc(cx,cy,r,0,7);x.fill();
  }
  x.lineCap='round';                                         // branching veins
  for(let i=0;i<30;i++){
    let px=Math.random()*w,py=Math.random()*h;
    x.strokeStyle=`rgba(${rand(58,112)|0},${rand(4,22)|0},${rand(20,44)|0},${rand(0.18,0.5)})`;
    x.lineWidth=rand(0.6,2.4);x.beginPath();x.moveTo(px,py);
    const steps=3+(Math.random()*5|0);
    for(let s=0;s<steps;s++){px+=rand(-28,28);py+=rand(-28,28);x.lineTo(px,py);}
    x.stroke();
  }
  for(let i=0;i<12;i++){                                     // blood smears
    const cx=Math.random()*w,cy=Math.random()*h,r=rand(6,24);
    const gr=x.createRadialGradient(cx,cy,1,cx,cy,r);
    gr.addColorStop(0,`rgba(72,6,9,${rand(0.2,0.5)})`);gr.addColorStop(1,'rgba(72,6,9,0)');
    x.fillStyle=gr;x.beginPath();x.arc(cx,cy,r,0,7);x.fill();
  }
  speckle(x,w,h,1500,0.06);
});

/* ================= MATERIALS ================= */
const M={
  floor:new THREE.MeshStandardMaterial({map:floorTex,bumpMap:floorTex,bumpScale:0.02,roughness:0.92,metalness:0.05}),
  wall:new THREE.MeshStandardMaterial({map:wallTex,bumpMap:wallTex,bumpScale:0.015,roughness:0.9,metalness:0.03}),
  ceil:new THREE.MeshStandardMaterial({map:ceilTex,roughness:0.95,metalness:0.05}),
  metal:new THREE.MeshStandardMaterial({map:metalTex,bumpMap:metalTex,bumpScale:0.01,roughness:0.42,metalness:0.55}),
  darkMetal:new THREE.MeshStandardMaterial({color:0x2b3033,roughness:0.5,metalness:0.6}),
  locker:new THREE.MeshStandardMaterial({map:lockerTex,bumpMap:lockerTex,bumpScale:0.012,roughness:0.5,metalness:0.45}),
  crate:new THREE.MeshStandardMaterial({map:crateTex,roughness:0.85,metalness:0.05}),
  sheet:new THREE.MeshStandardMaterial({color:0x8d948d,roughness:0.95}),
  pillow:new THREE.MeshStandardMaterial({color:0x9aa09a,roughness:0.95}),
  glass:new THREE.MeshStandardMaterial({color:0x9fb4b8,transparent:true,opacity:0.32,roughness:0.75,metalness:0.1,depthWrite:false}),
  tankGlass:new THREE.MeshStandardMaterial({color:0x7fd8a8,transparent:true,opacity:0.24,roughness:0.25,metalness:0.1,depthWrite:false}),
  fluid:new THREE.MeshStandardMaterial({color:0x0d2a1b,emissive:0x174a2c,emissiveIntensity:0.5,transparent:true,opacity:0.42,roughness:0.6}),
  blob:new THREE.MeshStandardMaterial({color:0x241f1a,roughness:0.95}),
  paper:new THREE.MeshStandardMaterial({map:paperTex,roughness:0.95,side:THREE.DoubleSide}),
  blood:new THREE.MeshStandardMaterial({map:bloodTex,transparent:true,roughness:0.6,depthWrite:false}),
  flesh:new THREE.MeshStandardMaterial({map:fleshTex,bumpMap:fleshTex,bumpScale:0.02,roughness:0.52,metalness:0.02}),
  sinew:new THREE.MeshStandardMaterial({map:fleshTex,bumpMap:fleshTex,bumpScale:0.02,color:0x7a2a24,roughness:0.42,metalness:0.03}),
  black:new THREE.MeshBasicMaterial({color:0x000000}),
  keycard:new THREE.MeshStandardMaterial({color:0x8a1418,emissive:0x5a0c0f,emissiveIntensity:0.5,roughness:0.4}),
  fuse:new THREE.MeshStandardMaterial({color:0xa85a18,emissive:0x542a08,emissiveIntensity:0.4,roughness:0.5}),
  syringe:new THREE.MeshStandardMaterial({color:0xb8bcc0,roughness:0.3,metalness:0.6}),
  syrFluid:new THREE.MeshStandardMaterial({color:0x7a1015,emissive:0x8a1218,emissiveIntensity:0.9}),
  lampOff:new THREE.MeshStandardMaterial({color:0x22262a,roughness:0.6}),
  lampOn:new THREE.MeshStandardMaterial({color:0xdfe8ea,emissive:0xcfe0e8,emissiveIntensity:1.6}),
  lampRed:new THREE.MeshStandardMaterial({color:0x3a0d0d,emissive:0xff2418,emissiveIntensity:1.8}),
  lampWarm:new THREE.MeshStandardMaterial({color:0x6a5a3a,emissive:0xffd9a0,emissiveIntensity:1.2}),
  screenOff:new THREE.MeshStandardMaterial({color:0x0a0d10,roughness:0.3}),
  screenOn:new THREE.MeshStandardMaterial({color:0x0a1a14,emissive:0x2a8858,emissiveIntensity:0.9,roughness:0.3}),
  exitSign:new THREE.MeshStandardMaterial({color:0x0a2a12,emissive:0x2aff66,emissiveIntensity:0.8}),
};

/* registries live in state.js; H/T in config.js */

function addCollider(cx,cz,sx,sz,occl){
  const c={x1:cx-sx/2,z1:cz-sz/2,x2:cx+sx/2,z2:cz+sz/2,active:true,occl:!!occl};
  colliders.push(c);return c;
}
function uvScale(geo,kx,ky){
  const uv=geo.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*kx,uv.getY(i)*ky);
  uv.needsUpdate=true;
}
function box(sx,sy,sz,mat,x,y,z,ry){
  const geo=new THREE.BoxGeometry(sx,sy,sz);
  if(mat===M.wall)uvScale(geo,Math.max(sx,sz)/3.2,sy/3.2);
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z);if(ry)m.rotation.y=ry;
  m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}
function cyl(rt,rb,hh,mat,x,y,z,seg=10){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,hh,seg),mat);
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}
function solid(cx,cz,sx,sz,h,mat,y=0,collide=true){
  const m=box(sx,h,sz,mat,cx,y+h/2,cz);
  if(collide)addCollider(cx,cz,sx,sz,h>1.6);
  return m;
}
function wall(x1,z1,x2,z2){
  if(Math.abs(x1-x2)<0.01) solid((x1+x2)/2,(z1+z2)/2,T,Math.abs(z2-z1)+T,H,M.wall);
  else solid((x1+x2)/2,(z1+z2)/2,Math.abs(x2-x1)+T,T,H,M.wall);
}
function floorPatch(x1,z1,x2,z2){
  const g1=new THREE.PlaneGeometry(x2-x1,z2-z1);
  uvScale(g1,(x2-x1)/4,(z2-z1)/4);
  const m=new THREE.Mesh(g1,M.floor);
  m.rotation.x=-Math.PI/2;m.position.set((x1+x2)/2,0,(z1+z2)/2);
  m.receiveShadow=true;scene.add(m);
  const g2=new THREE.PlaneGeometry(x2-x1,z2-z1);
  uvScale(g2,(x2-x1)/4,(z2-z1)/4);
  const c=new THREE.Mesh(g2,M.ceil);
  c.rotation.x=Math.PI/2;c.position.set((x1+x2)/2,H,(z1+z2)/2);
  c.receiveShadow=true;scene.add(c);
}

/* ---- doors ---- */
function makeDoor(cx,cz,alongX,w,opts){
  const o=Object.assign({locked:false,type:'normal',id:'',lockMsg:'LOCKED'},opts||{});
  const g=new THREE.Group();g.position.set(cx,0,cz);
  if(!alongX)g.rotation.y=Math.PI/2;
  scene.add(g);
  // lintel above doorway
  const lin=new THREE.Mesh(new THREE.BoxGeometry(w+0.5,H-2.62,T),M.wall);
  lin.position.set(0,2.62+(H-2.62)/2,0);lin.castShadow=lin.receiveShadow=true;g.add(lin);
  // frame posts
  for(const s of[-1,1]){
    const p=new THREE.Mesh(new THREE.BoxGeometry(0.14,2.62,T+0.12),M.darkMetal);
    p.position.set(s*(w/2+0.07),1.31,0);g.add(p);
  }
  // sliding panel
  const panel=new THREE.Mesh(new THREE.BoxGeometry(w,2.58,0.12),M.metal);
  panel.position.set(0,1.29,0);panel.castShadow=panel.receiveShadow=true;g.add(panel);
  // status stripe
  const stripeMat=new THREE.MeshStandardMaterial({
    color:0x111111,
    emissive:o.type==='key'?0xcc1620:(o.locked?0x8a5510:0x1a6a2a),
    emissiveIntensity:1.2});
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(w*0.72,0.06,0.13),stripeMat);
  stripe.position.set(0,2.1,0);panel.add(stripe);
  const col=alongX?addCollider(cx,cz,w,T,true):addCollider(cx,cz,T,w,true);
  const d={cx,cz,alongX,w,panel,stripeMat,col,openT:0,locked:o.locked,type:o.type,
           id:o.id,lockMsg:o.lockMsg,lockHintT:0,wasOpen:false};
  doors.push(d);return d;
}
function doorUnlock(d){
  if(!d.locked)return;
  d.locked=false;d.stripeMat.emissive.setHex(0x1a6a2a);
  AudioSys.beepOk();
}
function updateDoors(dt,px,pz,mx,mz,monsterActive){
  for(const d of doors){
    const pd=dist2(px,pz,d.cx,d.cz);
    const md=monsterActive?dist2(mx,mz,d.cx,d.cz):99;
    let want=0;
    if(!d.locked&&(pd<2.5||md<2.7))want=1;
    if(d.locked&&pd<2.2){
      if(d.lockHintT<=0){d.lockHintT=2.5;AudioSys.beepErr();showToast(d.lockMsg,2.2);}
    }
    d.lockHintT-=dt;
    const prev=d.openT;
    d.openT=clamp(d.openT+(want?dt*1.6:-dt*1.3),0,1);
    if(prev<=0&&d.openT>0)AudioSys.doorSlide();
    if(prev>=1&&d.openT<1)AudioSys.doorSlide();
    const k=d.openT*d.openT*(3-2*d.openT);
    d.panel.position.x=-k*(d.w-0.12);
    d.col.active=d.openT<0.45;
  }
}

/* ---- lockers (hide spots) ---- */
function makeLocker(x,z,facing){ // facing: unit vector out of the locker
  const ry=Math.atan2(facing.x,facing.z);
  const body=box(0.78,2.08,0.62,M.locker,x,1.04,z,ry);
  const front=new THREE.Mesh(new THREE.BoxGeometry(0.7,1.96,0.05),M.locker);
  front.position.set(0,0,0.33);body.add(front);
  addCollider(x,z,0.8,0.8,true);
  hideSpots.push({x,z,ex:x+facing.x*0.85,ez:z+facing.z*0.85,yaw:Math.atan2(-facing.x,-facing.z)+Math.PI,body});
}

/* ---- props ---- */
function bed(x,z,ry){
  const gp=new THREE.Group();gp.position.set(x,0,z);gp.rotation.y=ry||0;scene.add(gp);
  const fr=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.3,2.0),M.darkMetal);fr.position.y=0.32;
  fr.castShadow=fr.receiveShadow=true;gp.add(fr);
  const mat=new THREE.Mesh(new THREE.BoxGeometry(0.88,0.14,1.9),M.sheet);mat.position.y=0.53;
  mat.castShadow=mat.receiveShadow=true;gp.add(mat);
  const pil=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.09,0.4),M.pillow);
  pil.position.set(0,0.63,-0.68);gp.add(pil);
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const l=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.35,0.07),M.darkMetal);
    l.position.set(sx*0.42,0.17,sz*0.9);gp.add(l);
  }
  const c=Math.cos(ry||0),s=Math.sin(ry||0);
  addCollider(x,z,Math.abs(c)*0.95+Math.abs(s)*2.0,Math.abs(s)*0.95+Math.abs(c)*2.0,false);
}
function table(x,z,w,dep,ry){
  const gp=new THREE.Group();gp.position.set(x,0,z);gp.rotation.y=ry||0;scene.add(gp);
  const top=new THREE.Mesh(new THREE.BoxGeometry(w,0.07,dep),M.metal);top.position.y=0.92;
  top.castShadow=top.receiveShadow=true;gp.add(top);
  for(const sx of[-1,1])for(const sz of[-1,1]){
    const l=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.92,0.07),M.darkMetal);
    l.position.set(sx*(w/2-0.09),0.46,sz*(dep/2-0.09));gp.add(l);
  }
  const c=Math.cos(ry||0),s=Math.sin(ry||0);
  addCollider(x,z,Math.abs(c)*w+Math.abs(s)*dep,Math.abs(s)*w+Math.abs(c)*dep,false);
  return gp;
}
function cabinet(x,z,w,ry){ solid(x,z,ry?0.55:w,ry?w:0.55,2.05,M.darkMetal); }
function crate(x,z,s,ry){
  box(s,s,s,M.crate,x,s/2,z,ry||0);
  addCollider(x,z,s,s,false);
}
function shelfRow(x,z,len,alongX){
  const sx=alongX?len:0.62,sz=alongX?0.62:len;
  addCollider(x,z,sx,sz,true);
  for(let i=0;i<3;i++){
    const b=box(sx,0.06,sz,M.darkMetal,x,0.35+i*0.78,z);
    b.castShadow=true;
  }
  const n=Math.floor(len/1.1);
  for(let i=0;i<n;i++)for(let lvl=0;lvl<3;lvl++){
    if(Math.random()<0.4)continue;
    const off=-len/2+0.6+i*1.1+rand(-0.15,0.15),s=rand(0.34,0.52);
    box(s,s,s,M.crate,x+(alongX?off:rand(-0.1,0.1)),0.38+lvl*0.78+s/2,z+(alongX?rand(-0.1,0.1):off),rand(0,3));
  }
  for(const e of[-len/2+0.05,len/2-0.05]){
    const u1=box(0.06,2.1,0.62,M.darkMetal,x+(alongX?e:-0.28),1.05,z+(alongX?-0.28:e));
    const u2=box(0.06,2.1,0.62,M.darkMetal,x+(alongX?e:0.28),1.05,z+(alongX?0.28:e));
    if(!alongX){u1.scale.set(10,1,0.097);u2.scale.set(10,1,0.097);}
  }
}
function tank(x,z){
  cyl(0.6,0.66,0.3,M.darkMetal,x,0.15,z,14);
  const gl=cyl(0.5,0.5,1.75,M.tankGlass,x,1.18,z,14);gl.castShadow=false;
  const fl=cyl(0.44,0.44,1.6,M.fluid,x,1.16,z,14);fl.castShadow=false;
  const blob=new THREE.Mesh(new THREE.SphereGeometry(0.3,8,7),M.blob);
  blob.position.set(x,1.05,z);blob.scale.set(0.8,1.35,0.75);blob.rotation.z=rand(-0.4,0.4);scene.add(blob);
  cyl(0.62,0.56,0.22,M.darkMetal,x,2.14,z,14);
  addCollider(x,z,1.15,1.15,false);
  return {fl,blob};
}
const worldRefs={tankA:null};
function lamp(x,z,kind){ // kind: 'off' 'warm' 'red'  — fixture mesh; light added separately
  const f=box(1.15,0.09,0.32,kind==='red'?M.lampRed:(kind==='warm'?M.lampWarm:M.lampOff),x,H-0.06,z);
  f.castShadow=false;return f;
}
function pointL(x,y,z,color,intensity,dist){
  const l=new THREE.PointLight(color,intensity,dist);
  l.position.set(x,y,z);scene.add(l);return l;
}

/* ================= LEVEL LAYOUT =================
   Faithful reconstruction of LabLevel.umap (UE cm -> m,
   web x=(ue_x+2995)/100, web z=(3469-ue_y)/100, north = -z).
   Rooms come from the map's NavMeshBoundsVolumes; doors,
   closets, keys, syringes, beds sit at their real spots.   */

function machineIsland(x1,z1,x2,z2){ // lab centre equipment blocks (real layout: the ring runs around these)
  const cx=(x1+x2)/2,cz=(z1+z2)/2,sx=x2-x1,sz=z2-z1;
  addCollider(cx,cz,sx,sz,true);
  box(sx,1.0,sz,M.metal,cx,0.5,cz);
  box(sx*0.9,1.2,sz*0.55,M.locker,cx,1.6,cz+sz*0.18);     // rack on top blocks LOS
  for(let i=0;i<3;i++){
    const scr=box(0.5,0.34,0.07,M.screenOff,x1+0.5+i*(sx-1)/2,1.25,z1+0.35,0);
    powerScreens.push(scr);
  }
  const p=cyl(0.09,0.09,H-2.2,M.darkMetal,cx,2.2+(H-2.2)/2,cz,8);p.castShadow=false;
}
function buildLevel(){
  // ---- floors & ceilings (one per nav-volume room) ----
  for(const k in ROOMS){const r=ROOMS[k];floorPatch(r.x1,r.z1,r.x2,r.z2);}
  // ---- START ROOM (cell/office, PlayerStart -590,-163) ----
  wall(20.45,39.19,29.45,39.19); wall(20.45,26.79,20.45,39.19); wall(29.45,26.79,29.45,39.19);
  wall(20.45,26.79,24.25,26.79); wall(26.05,26.79,29.45,26.79);
  makeDoor(25.15,26.79,true,1.8,{locked:true,id:'cell',type:'normal',lockMsg:'DOOR SEALED'});
  bed(24.22,34.92,Math.PI/2);
  table(27.9,30.2,1.9,0.9,0);      // desk: map + note + old keycard
  // ---- CORRIDOR A (north from cell) ----
  wall(23.85,24.29,23.85,26.79); wall(26.45,24.29,26.45,26.79);
  // ---- CORRIDOR B (long east-west hallway; lockers sit in recessed alcoves) ----
  wall(-0.75,24.29,3.6,24.29); wall(4.7,24.29,22.4,24.29); wall(23.5,24.29,23.85,24.29);
  wall(26.45,21.69,26.45,24.29); wall(-0.75,21.69,-0.75,24.29);
  for(const ax of[4.15,22.95]){
    wall(ax-0.55,24.29,ax-0.55,25.2); wall(ax+0.55,24.29,ax+0.55,25.2); wall(ax-0.55,25.2,ax+0.55,25.2);
    floorPatch(ax-0.55,24.29,ax+0.55,25.2);
    makeLocker(ax,24.78,{x:0,z:-1});
  }
  wall(1.85,21.69,8,21.69); wall(12,21.69,26.45,21.69);
  { // frosted glass section (silhouette alcove behind, x 8..12)
    const gl=new THREE.Mesh(new THREE.BoxGeometry(4,H-0.6,0.1),M.glass);
    gl.position.set(10,(H-0.6)/2+0.3,21.69);gl.castShadow=false;scene.add(gl);
    const fr=new THREE.Mesh(new THREE.BoxGeometry(4.1,0.3,0.16),M.darkMetal);fr.position.set(10,0.15,21.69);scene.add(fr);
    const fr2=fr.clone();fr2.position.y=H-0.15;scene.add(fr2);
    const c=addCollider(10,21.69,4,T,false); c.glass=true;
    wall(8,19.49,12,19.49); wall(8,19.49,8,21.69); wall(12,19.49,12,21.69);
    floorPatch(8,19.49,12,21.69);
  }
  // ---- CORRIDOR C (north to lab, mid-corridor door) ----
  wall(-0.75,9.49,-0.75,21.69); wall(1.85,9.49,1.85,21.69);
  makeDoor(0.55,14.36,true,2,{locked:false,id:'labS'});
  // ---- MAIN LAB (ring around 4 machine islands — monster spawns centre) ----
  wall(-8.65,9.49,-0.75,9.49); wall(1.85,9.49,8.25,9.49);
  wall(-8.65,-9.46,-0.45,-9.46); wall(1.55,-9.46,8.25,-9.46);
  makeDoor(0.55,-9.46,true,2,{locked:false,id:'lab5'});
  wall(8.25,-9.46,8.25,-0.8); wall(8.25,1.2,8.25,9.49);
  makeDoor(8.25,0.2,false,2,{locked:true,id:'spec',type:'key',lockMsg:'LOCKED — RED KEYCARD REQUIRED'});
  wall(-8.65,-9.46,-8.65,-2.81); wall(-8.65,-0.81,-8.65,9.49);
  makeDoor(-8.65,-1.81,false,2,{locked:false,id:'rec'});
  machineIsland(-5.99,0.36,-2.82,5.6);  machineIsland(2.58,0.36,5.34,5.6);
  machineIsland(-5.99,-6.19,-2.82,-1.64); machineIsland(2.58,-6.19,5.34,-1.64);
  makeLocker(-8.2,7.4,{x:1,z:0});                        // BP_Closet_6 (west wall)
  makeLocker(7.55,-9.03,{x:0,z:1}); makeLocker(5.46,-9.03,{x:0,z:1}); // BP_Closet_3 + child, flush to wall
  table(-5.2,-9.05,2.2,0.6,0);                           // north bench (regen serum), out of the patrol lane
  { const b=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),M.blood);
    b.rotation.x=-Math.PI/2;b.position.set(6.6,0.012,7.2);b.receiveShadow=true;scene.add(b); }
  // ---- RECORDS ROOM (west — red keycard, BP_Key3) ----
  wall(-16.04,-6.13,-8.65,-6.13); wall(-16.04,7.67,-8.65,7.67); wall(-16.04,-6.13,-16.04,7.67);
  table(-15.2,-1.85,1,1.9,0);
  cabinet(-14.5,-5.75,1.4); cabinet(-13,-5.75,1.4); cabinet(-11.5,-5.75,1.4);
  cabinet(-15.7,3,1.6,true);
  makeLocker(-11.66,7.2,{x:0,z:-1});                     // BP_Closet_7
  // ---- SPECIMEN ROOM (east — fuse, memo, speed serum) ----
  wall(8.25,-5.8,13.99,-5.8); wall(8.25,7.8,13.99,7.8); wall(13.99,-5.8,13.99,7.8);
  worldRefs.tankA=tank(9.7,-3.9); tank(12.6,-3.9); tank(12.6,3.6);
  table(11,6.9,3,0.95,0);
  { const b=new THREE.Mesh(new THREE.PlaneGeometry(3,3),M.blood);
    b.rotation.x=-Math.PI/2;b.position.set(11,0.012,0.5);scene.add(b);
    const b2=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.6),M.blood);
    b2.position.set(13.8,1.3,-1);b2.rotation.y=-Math.PI/2;scene.add(b2); }
  // ---- GENERATOR ROOM 1 (switchboard room, BP_Switcboard -1835,5105) ----
  wall(-10.19,-9.92,-0.45,-9.92); wall(1.55,-9.92,11.21,-9.92);
  wall(-10.19,-23.12,-0.45,-23.12); wall(1.55,-23.12,11.21,-23.12);
  makeDoor(0.55,-23.12,true,2,{locked:true,id:'auto',type:'power',lockMsg:'NO POWER — DOOR OFFLINE'});
  wall(-10.19,-23.12,-10.19,-9.92); wall(11.21,-23.12,11.21,-9.92);
  { // generator machine on the west side
    solid(-8,-16.5,2.4,1.5,1.5,M.darkMetal);
    cyl(0.5,0.5,0.9,M.metal,-8,1.95,-16.5,12);
    cyl(0.12,0.12,1.6,M.darkMetal,-7.2,2.5,-16.5,8);
    cyl(0.12,0.12,1.6,M.darkMetal,-8.8,2.5,-16.5,8);
  }
  table(4,-21.5,2.2,0.95,0);
  // ---- SPINE corridor (north from gen 1) ----
  wall(-3.46,-38.75,-3.46,-23.12); wall(-3.46,-71.47,-3.46,-44.35);
  wall(1.94,-54.71,1.94,-23.12); wall(1.94,-71.47,1.94,-56.71);
  makeDoor(1.94,-55.71,false,2,{locked:false,id:'dorm'});
  makeLocker(1.35,-69.46,{x:-1,z:0});                    // BP_Closet_11
  // ---- V14 west corridor (blue keycard alcove at real BP_Key2 spot) ----
  wall(-18.19,-44.35,-3.46,-44.35); wall(-18.19,-38.75,-3.46,-38.75);
  { // collapsed vent duct: players slide under it, the creature cannot follow
    const duct=box(1.1,1.05,6.1,M.metal,-16,1.55,-41.55,0);
    duct.rotation.z=0.03;
    box(1.15,0.25,6.1,M.darkMetal,-16,2.25,-41.55,0).castShadow=false;
    for(const dz of[-44,-42.5,-40.8,-39.2]){
      const strap=cyl(0.04,0.04,1.0,M.darkMetal,-16+rand(-0.2,0.2),2.7,dz,6);strap.castShadow=false;
    }
    crate(-15.2,-43.6,0.55,0.4); crate(-16.7,-39.5,0.5,0.9);
    const c=addCollider(-16,-41.55,1.15,6.2,false); c.low=true;
  }
  // ---- V15 long west north-south corridor ----
  wall(-26.19,-38.75,-18.19,-38.75);
  wall(-18.19,-71.47,-18.19,-44.35); wall(-18.19,-102.89,-18.19,-78.07);
  wall(-26.19,-71.47,-26.19,-38.75); wall(-26.19,-102.89,-26.19,-78.07);
  table(-24.9,-40.5,1.6,0.8,0);                          // BP_Key2 table
  makeLocker(-25.55,-47.32,{x:1,z:0});                   // BP_Closet_12
  makeLocker(-18.75,-99.5,{x:-1,z:0});                   // BP_Closet_8, flush against the east wall
  crate(-19.2,-45.5,0.6,0.4); crate(-25.3,-83.5,0.65,0.9);
  // ---- DORMITORY (real beds of BP_Bed2..6) ----
  wall(1.94,-66,16.42,-66); wall(1.94,-46.2,16.42,-46.2); wall(16.42,-66,16.42,-46.2);
  bed(15.08,-63.62,Math.PI/2); bed(15.08,-56.64,Math.PI/2); bed(15.08,-49.75,Math.PI/2);
  bed(4.21,-63.62,-Math.PI/2); bed(4.21,-49.75,-Math.PI/2);
  table(9.5,-65.3,1.8,0.8,0);
  makeLocker(6.2,-65.5,{x:0,z:1});   // faces into the room (was facing the wall — unusable)
  box(0.5,0.62,0.5,M.metal,15.9,0.31,-60.6,0); addCollider(15.9,-60.6,0.5,0.5,false); // nightstand
  box(0.5,0.62,0.5,M.metal,3.6,-0+0.31,-60.6,0); addCollider(3.6,-60.6,0.5,0.5,false);
  crate(12.9,-47.1,0.6,0.5);
  // ---- V16 east-west corridor ----
  wall(-60.4,-71.47,-26.19,-71.47); wall(-18.19,-71.47,-3.46,-71.47);
  wall(-54.93,-78.07,-26.19,-78.07); wall(-18.19,-78.07,1.94,-78.07);
  wall(1.94,-78.07,1.94,-71.47); wall(-60.4,-78.07,-60.4,-71.47);
  makeLocker(-33.35,-77.5,{x:0,z:1});                    // BP_Closet_9
  crate(-45,-72.3,0.7,0.2); crate(-45.8,-72.5,0.5,1);
  // ---- V18 north-south link ----
  wall(-54.93,-102.89,-54.93,-78.07);
  wall(-60.4,-92.26,-60.4,-78.07); wall(-60.4,-102.89,-60.4,-94.26);
  makeDoor(-60.4,-93.26,false,2,{locked:false,id:'med'});
  // ---- MEDICAL (west wing — noise serum, real BP_Syringe_Noise) ----
  wall(-72.96,-99.86,-60.4,-99.86); wall(-72.96,-84.46,-60.4,-84.46); wall(-72.96,-99.86,-72.96,-84.46);
  shelfRow(-66.5,-86.2,4.5,true);
  table(-71.9,-85.6,0.9,1.7,0);
  makeLocker(-61.05,-88.3,{x:-1,z:0});                   // BP_Closet_10
  makeLocker(-68.65,-99.2,{x:0,z:1});                    // BP_Closet_14
  crate(-71.9,-97.5,0.7,0.5); crate(-71.2,-97.2,0.5,1.2);
  bed(-63.6,-96.2,0.12); bed(-66.6,-96.6,-0.08);         // gurneys
  for(const[gx,gz]of[[-64.9,-95.3],[-62.4,-97.3]]){
    const iv=cyl(0.02,0.02,1.8,M.darkMetal,gx,0.9,gz,6);iv.castShadow=false;
    const bag=box(0.12,0.2,0.05,M.tankGlass,gx,1.62,gz,0);bag.castShadow=false;
  }
  { const b=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.8),M.blood);
    b.position.set(-72.76,1.2,-92);b.rotation.y=Math.PI/2;scene.add(b); }
  // ---- V19 north hall + exit ----
  wall(-54.93,-102.89,-26.19,-102.89);
  wall(-60.4,-108.09,-39.93,-108.09); wall(-37.93,-108.09,-18.19,-108.09);
  makeDoor(-38.93,-108.09,true,2,{locked:true,id:'exit',type:'power',lockMsg:'NO POWER — DOOR OFFLINE'});
  wall(-60.4,-108.09,-60.4,-102.89); wall(-18.19,-108.09,-18.19,-102.89);
  crate(-20.3,-105.4,0.75,0.3);                          // vision serum crate
  crate(-57,-104,0.6,0.7);
  { // toppled shelf barricade (walk around it)
    const sh=box(3,0.5,0.75,M.darkMetal,-50,0.26,-103.9,0.25);
    addCollider(-50,-103.9,3,1.2,false);
    crate(-48.6,-104.4,0.5,1.1); crate(-51.5,-103.5,0.45,0.3);
  }
  wall(-39.93,-111.5,-39.93,-108.09); wall(-37.93,-111.5,-37.93,-108.09); wall(-39.93,-111.5,-37.93,-111.5);
  { const s=box(0.9,0.32,0.08,M.exitSign,-38.93,2.72,-107.95,0); s.castShadow=false; }
  // ---- ceiling pipes (dressing along main routes) ----
  for(const[px,pz1,pz2]of[[-2.9,-70,-24],[1.4,-70,-24],[0.2,10,21],[-25.6,-102,-40]]){
    const p=cyl(0.08,0.08,Math.abs(pz2-pz1),M.darkMetal,px,H-0.28,(pz1+pz2)/2,8);
    p.rotation.x=Math.PI/2;p.castShadow=false;
  }
  for(const[px1,px2,pz]of[[-60,1.5,-74.8],[-8.4,8,-9.9],[0,26,22.9]]){
    const p=cyl(0.07,0.07,px2-px1,M.darkMetal,(px1+px2)/2,H-0.42,pz,8);
    p.rotation.z=Math.PI/2;p.castShadow=false;
  }
}

/* ================= LIGHTING ================= */
const L={};
function buildLights(){
  L.amb=new THREE.AmbientLight(0x1c232b,0.5);scene.add(L.amb);
  L.hemi=new THREE.HemisphereLight(0x232b33,0x0a0c0e,0.24);scene.add(L.hemi);
  // flashlight (the star of the show)
  L.flash=new THREE.SpotLight(0xe7e2cf,0,26,0.55,0.68,1.6);
  L.flash.castShadow=true;
  L.flash.shadow.mapSize.set(1024,1024);
  L.flash.shadow.camera.near=0.2;L.flash.shadow.camera.far=26;
  L.flash.shadow.bias=-0.004;
  scene.add(L.flash);scene.add(L.flash.target);
  // faint player glow so pitch black stays readable
  L.glow=new THREE.PointLight(0x2a3038,0.5,3.5);scene.add(L.glow);
  // --- pre-power ---
  const cellW=pointL(24.9,2.8,33,0xffd9a0,0.85,8); lamp(24.9,33,'warm');
  preLights.push({l:cellW,base:0.85});
  const redDefs=[[13,2.85,23],[0.55,2.85,17.5],[0,2.9,7.3],[0,2.9,-7.2],[0.55,2.85,-16.5]];
  for(const[a,b,c]of redDefs){
    const rl=pointL(a,b,c,0xff2418,0.8,10); lamp(a,c,'red');
    preLights.push({l:rl,base:0.8});flickerLights.push({l:rl,base:0.8,t:0});
  }
  const specG=pointL(11.2,2.4,0.5,0x46ff9a,0.55,9);
  preLights.push({l:specG,base:0.55,keep:true});
  // --- post-power (start dark) ---
  const postDefs=[[-5,3,-0.6,0.9,13],[5,3,-0.6,0.9,13],[0.55,3,-16.5,0.85,14],
                  [-0.75,3,-32,0.7,13],[-0.75,3,-62,0.7,13],[9,3,-56,0.85,13],
                  [-11,3,-41.5,0.65,12],[-30,3,-74.8,0.7,13],[-52,3,-74.8,0.7,13],
                  [-22.2,3,-90,0.6,12],[-66.7,3,-92,0.85,13],[-40,3,-105.5,0.8,13],
                  [-38.9,2.7,-109.8,1.2,6]];
  for(const[a,b,c,i,d]of postDefs){
    const wl=pointL(a,b,c,0xcfe2ec,0,d);
    const f=lamp(a,c,'off');
    postLights.push({l:wl,base:i,fixture:f});
  }
  // silhouette alcove light (event only)
  L.alcove=pointL(10,2.4,20.5,0xff2418,0,7);
}
const power={on:false};
function setPower(){
  if(power.on)return;power.on=true;
  AudioSys.powerOn();
  let i=0;
  for(const p of postLights){
    setTimeout(()=>{
      // stutter-on like real fluorescents
      let n=0;
      const iv=setInterval(()=>{
        n++;p.l.intensity=(n%2?p.base:p.base*0.15);
        p.fixture.material=n%2?M.lampOn:M.lampOff;
        if(n>5){clearInterval(iv);p.l.intensity=p.base;p.fixture.material=M.lampOn;AudioSys.relay();}
      },70+Math.random()*60);
    },400+i*420);
    i++;
  }
  for(const p of preLights){ if(!p.keep)setTimeout(()=>{p.l.intensity=0;},600); }
  flickerLights.length=0;
  setTimeout(()=>{
    scene.fog.density=0.038;
    L.amb.intensity=0.62;L.hemi.intensity=0.3;
    renderer.toneMappingExposure=1.2;
    for(const s of powerScreens)s.material=M.screenOn;
    // one fixture in the west wing never recovered — it flickers
    const broken=postLights[7];
    if(broken)flickerLights.push({l:broken.l,base:broken.base,t:0});
  },1600);
}
function updateFlicker(dt){
  for(const f of flickerLights){
    f.t-=dt;
    if(f.t<=0){f.t=rand(0.05,0.4);f.l.intensity=f.base*(Math.random()<0.12?rand(0.05,0.3):rand(0.75,1.1));}
  }
}

/* ================= COLLISION / LOS ================= */
function collideCircle(px,pz,r,sliding=false){
  for(const w of colliders){
    if(!w.active)continue;
    if(w.low&&sliding)continue;   // collapsed ducts: slide under
    const cx=clamp(px,w.x1,w.x2),cz=clamp(pz,w.z1,w.z2);
    let dx=px-cx,dz=pz-cz;const d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2<1e-8){
        const pl=px-w.x1+r,pr=w.x2-px+r,pt=pz-w.z1+r,pb=w.z2-pz+r;
        const m=Math.min(pl,pr,pt,pb);
        if(m===pl)px=w.x1-r;else if(m===pr)px=w.x2+r;
        else if(m===pt)pz=w.z1-r;else pz=w.z2+r;
      }else{
        const d=Math.sqrt(d2),k=(r-d)/d;px+=dx*k;pz+=dz*k;
      }
    }
  }
  return[px,pz];
}
function segHitsAABB(ax,az,bx,bz,w){
  let tmin=0,tmax=1;
  const dx=bx-ax,dz=bz-az;
  if(Math.abs(dx)<1e-9){if(ax<w.x1||ax>w.x2)return false;}
  else{
    let t1=(w.x1-ax)/dx,t2=(w.x2-ax)/dx;
    if(t1>t2){const t=t1;t1=t2;t2=t;}
    tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);
    if(tmin>tmax)return false;
  }
  if(Math.abs(dz)<1e-9){if(az<w.z1||az>w.z2)return false;}
  else{
    let t1=(w.z1-az)/dz,t2=(w.z2-az)/dz;
    if(t1>t2){const t=t1;t1=t2;t2=t;}
    tmin=Math.max(tmin,t1);tmax=Math.min(tmax,t2);
    if(tmin>tmax)return false;
  }
  return true;
}
function hasLOS(ax,az,bx,bz){
  for(const w of colliders){
    if(!w.occl||!w.active)continue;
    if(segHitsAABB(ax,az,bx,bz,w))return false;
  }
  return true;
}

/* ================= WAYPOINT GRAPH ================= */

function doorOpenFor(id){
  if(!id)return true;
  const d=doors.find(x=>x.id===id);
  return d&&!d.locked;
}
function findPath(from,to){
  if(from===to)return[to];
  const prev=new Array(NODES.length).fill(-1);
  const q=[from];prev[from]=from;
  while(q.length){
    const c=q.shift();
    for(const e of ADJ[c]){
      if(prev[e.n]!==-1||!doorOpenFor(e.door))continue;
      prev[e.n]=c;
      if(e.n===to){
        const path=[to];let k=to;
        while(k!==from){k=prev[k];path.unshift(k);}
        return path;
      }
      q.push(e.n);
    }
  }
  return null;
}
function nearestNode(x,z){
  let best=0,bd=1e9;
  for(let i=0;i<NODES.length;i++){
    const d=dist2(x,z,NODES[i][0],NODES[i][1]);
    if(d<bd){bd=d;best=i;}
  }
  return best;
}

export{M,uvScale,box,cyl,solid,wall,floorPatch,addCollider,makeDoor,doorUnlock,updateDoors,makeLocker,bed,table,cabinet,crate,shelfRow,tank,lamp,pointL,machineIsland,buildLevel,worldRefs,L,buildLights,power,setPower,updateFlicker,collideCircle,segHitsAABB,hasLOS,doorOpenFor,findPath,nearestNode};
