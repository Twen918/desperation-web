/* shared mutable game state — imported by everyone, imports only utils */
import{clamp}from'./utils.js';

const G={
  state:'title',            // title | intro | play | caught | end
  paused:false,
  hasMap:false,hasKeycard:false,hasExitKey:false,hasFuse:false,fuseIn:false,switches:0,
  syringe:false,regen:false,regenUsed:false,noiseBuff:false,vision:false,
  alarmT:0,alarmUsed:false,radioOn:0,radioCD:0,drainT:0,ambSave:0,
  hp:2,hpMax:2,hurtT:0,healT:0,   // two lives: first hit wounds, second kills
  noise:0,hidden:false,hiddenSpot:null,doomed:false,
  mapOpen:false,noteOpen:false,
  silDone:false,labEntered:false,cellOpened:false,leftCell:false,
  introT:0,deaths:0,ended:false,
};

const keys={};
const colliders=[]; // {x1,z1,x2,z2,active,occl}
const doors=[]; const hideSpots=[]; const interactables=[];
const flickerLights=[]; const preLights=[]; const postLights=[]; const powerScreens=[];
/* late-bound cross-module refs (breaks the only natural import cycles) */
const refs={player:null,monster:null,catchPlayer:null};

function addNoise(v){ G.noise=clamp(G.noise+v,0,100); }

export{G,keys,colliders,doors,hideSpots,interactables,flickerLights,preLights,postLights,powerScreens,refs,addNoise};
