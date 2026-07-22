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

/* ---- player-facing settings (persisted to localStorage) ---- */
const Settings={
  volume:0.85, brightness:1.0, sensitivity:1.0, difficulty:'normal',
  mSpeed:1.0, mHear:1.0,   // monster speed / hearing multipliers, derived from difficulty
};
const DIFF={easy:{s:0.9,h:0.72},normal:{s:1.0,h:1.0},nightmare:{s:1.12,h:1.4}};
function applyDifficulty(){const d=DIFF[Settings.difficulty]||DIFF.normal;Settings.mSpeed=d.s;Settings.mHear=d.h;}
function loadSettings(){
  try{const s=JSON.parse(localStorage.getItem('desp_settings')||'{}');
    for(const k of['volume','brightness','sensitivity','difficulty'])if(k in s)Settings[k]=s[k];
  }catch(e){}
  applyDifficulty();
}
function saveSettings(){
  try{localStorage.setItem('desp_settings',JSON.stringify({
    volume:Settings.volume,brightness:Settings.brightness,
    sensitivity:Settings.sensitivity,difficulty:Settings.difficulty}));}catch(e){}
}
loadSettings();

export{G,keys,colliders,doors,hideSpots,interactables,flickerLights,preLights,postLights,powerScreens,refs,addNoise,
  Settings,loadSettings,saveSettings,applyDifficulty};
