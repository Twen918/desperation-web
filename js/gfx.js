import{$}from'./utils.js';

/* ================= RENDERER / SCENE ================= */
const canvas=$('game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const maxAniso=renderer.capabilities.getMaxAnisotropy();

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x04060a);
scene.fog=new THREE.FogExp2(0x05070b,0.055);

const camera=new THREE.PerspectiveCamera(72,window.innerWidth/window.innerHeight,0.08,90);
camera.rotation.order='YXZ';

export{canvas,renderer,scene,camera,maxAniso};
