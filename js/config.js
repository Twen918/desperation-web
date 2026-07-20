/* static level data & story text */
const H=3.2, T=0.32;

const ROOMS={ // for the map overlay
  START:{x1:20.45,z1:26.79,x2:29.45,z2:39.19,name:'CELL'},
  CORRA:{x1:23.85,z1:24.29,x2:26.45,z2:26.79,name:''},
  CORRB:{x1:-0.75,z1:21.69,x2:26.45,z2:24.29,name:'HALLWAY'},
  CORRC:{x1:-0.75,z1:9.49,x2:1.85,z2:21.69,name:''},
  LAB:{x1:-8.65,z1:-9.46,x2:8.25,z2:9.49,name:'MAIN LABORATORY'},
  REC:{x1:-16.04,z1:-6.13,x2:-8.65,z2:7.67,name:'RECORDS'},
  SPEC:{x1:8.25,z1:-5.8,x2:13.99,z2:7.8,name:'SPECIMEN'},
  SWITCH:{x1:-10.19,z1:-23.12,x2:11.21,z2:-9.92,name:'GENERATOR 1'},
  SPINE:{x1:-3.46,z1:-71.47,x2:1.94,z2:-23.12,name:''},
  V14:{x1:-18.19,z1:-44.35,x2:-3.46,z2:-38.75,name:''},
  V15:{x1:-26.19,z1:-102.89,x2:-18.19,z2:-38.75,name:''},
  DORM:{x1:1.94,z1:-66,x2:16.42,z2:-46.2,name:'DORMITORY'},
  V16:{x1:-60.4,z1:-78.07,x2:1.94,z2:-71.47,name:'WEST WING'},
  V18:{x1:-60.4,z1:-102.89,x2:-54.93,z2:-78.07,name:''},
  MED:{x1:-72.96,z1:-99.86,x2:-60.4,z2:-84.46,name:'MEDICAL'},
  V19:{x1:-60.4,z1:-108.09,x2:-18.19,z2:-102.89,name:'NORTH HALL'},
  EXIT:{x1:-39.93,z1:-111.5,x2:-37.93,z2:-108.09,name:'EXIT'},
};

const NODES=[
  [24.9,33],[25.15,23],[13,23],[0.55,23],[0.55,17.5],   // 0 cell 1 corrA 2 corrB-mid 3 corrB-W 4 corrC
  [0.55,8.0],[-7.0,8.0],[6.5,8.0],                      // 5 labS 6 labSW 7 labSE
  [-7.0,-0.6],[6.5,-0.6],[-7.0,-8.0],[6.5,-8.0],        // 8 labW 9 labE 10 labNW 11 labNE
  [0.55,-8.0],[0,-0.6],                                 // 12 labN 13 labC (spawn)
  [-13,0.5],[11.3,0.2],                                 // 14 records 15 specimen
  [0.55,-16.5],[9,-16.5],                               // 16 switchC 17 switchboard
  [0.55,-26],[-0.75,-41.5],[-12,-41.5],[-22.2,-41.5],   // 18 spineS 19 spineJ 20 corr14 21 v15S(key2)
  [-22.2,-58],[-0.75,-55.7],[9,-56],                    // 22 v15mid 23 spineDorm 24 dorm
  [-0.75,-74.7],[-22.2,-74.7],[-40,-74.7],[-57.5,-74.7],// 25 spineN 26 v16x15 27 v16mid 28 v16W
  [-57.5,-92],[-67,-92],[-57.5,-104.5],                 // 29 v18 30 medical 31 v18N
  [-38.9,-105.5],[-22.2,-90],[-23,-105.5],[-38.9,-110], // 32 v19door 33 v15N 34 v19E 35 exit
];
const EDGES=[[0,1,'cell'],[1,2],[2,3],[3,4],[4,5,'labS'],
  [5,6],[5,7],[6,8],[7,9],[8,10],[9,11],[10,12],[11,12],
  [13,5],[13,8],[13,9],[13,12],
  [8,14,'rec'],[9,15,'spec'],
  [12,16,'lab5'],[16,17],[16,18,'auto'],
  [18,19],[19,20],[21,22],[19,23],[23,24,'dorm'],[23,25],   // 20-21 cut by the duct: player-only shortcut
  [25,26],[26,27],[27,28],[28,29],[29,30,'med'],[29,31],[31,32],
  [22,26],[26,33],[33,34],[34,32],[32,35,'exit']];
const ADJ=NODES.map(()=>[]);
for(const[a,b,d]of EDGES){ADJ[a].push({n:b,door:d});ADJ[b].push({n:a,door:d});}

const NOTE_SPECIMEN=
"INTERNAL MEMO — CONFIDENTIAL\n\n"+
"Dr. Southam's condition is worsening. He has ordered all remission research doubled. "+
"The new regeneration serum shows... unnatural results. Tissue knitting in under a minute. "+
"He says he is racing his own body.\n\n"+
"We are not curing anymore. We are chasing something else.\n\n"+
"                                        — J. Collins";
const NOTE_START=
"ENTRY 1\n\n"+
"A horrifying creature has breached the laboratory. Vaguely human in shape, but its movements "+
"are animalistic, erratic, predatory... wrong. We sealed it inside Dr. Southam's private lab.\n\n"+
"Six are confirmed dead. Dr. Southam is missing.\n\n"+
"I've initiated a full lockdown and ordered every remaining soldier to arm up. Once they're "+
"ready, we'll breach the lab and end this nightmare.\n\n"+
"                                        — Dr. Alden";
const NOTE_DORM=
"From: Dr. Mara Ellison\nTo: Dr. Jonathan Collins\nSubject: Concerns About Recent Protocols\n\n"+
"Jonathan,\n\n"+
"I assisted with the Procedure 7B necropsies this morning. Three of the test dogs were still "+
"conscious when we opened the restraints.\n\n"+
"These animals are suffering. And I worry that we're beginning to justify any action so long "+
"as we can tie it to 'the cure.'\n\n"+
"Are we really still on the right path?\n\n"+
"                                        — Mara";
const NOTE_COLLINS=
"From: Dr. Jonathan Collins\nTo: Dr. Mara Ellison\nSubject: Re: Concerns About Recent Protocols\n\n"+
"Mara,\n\n"+
"You saw the results from Regeneration Serum Iteration 3B. Tissue knitting in under a minute. "+
"A total reversal of cellular degradation that shouldn't be scientifically possible.\n\n"+
"I'm not blind to the suffering. But Southam is racing a disease that wants him dead, and he's "+
"doing it because he genuinely believes he can end all afflictions. For everyone.\n\n"+
"History won't remember the pain... only the cure.\n\n"+
"                                        — Jonathan Collins";
const NOTE_NEWS=
"RIVERTON HERALD — TUESDAY, MARCH 14\n\n"+
"LOCAL WOMAN FOUND DEAD IN APARTMENT —\nPOLICE INVESTIGATING POSSIBLE TARGETED ATTACK\n\n"+
"Police identified the victim as Mara Ellison, a biomedical research assistant. Investigators "+
"confirmed the injuries were consistent with homicide. A spokesperson stated there is currently "+
"'no indication of a random act of violence.'\n\n"+
"Neighbors described Ellison as quiet and private. 'She seemed scared lately. Always checking "+
"the hallway before unlocking her door.'";
const NOTE_MED=
"To: Human Resources Division\nSubject: Formal Resignation — Effective Immediately\n\n"+
"Over the past several months our work has shifted from ethically questionable to outright "+
"inhumane. The confinement of human subjects was the moment I realized we had crossed a moral "+
"line we could never step back over.\n\n"+
"This place is no longer a laboratory. It is a crime scene.\n\n"+
"                                        — Dr. Mara Ellison";

export{H,T,ROOMS,NODES,EDGES,ADJ,NOTE_SPECIMEN,NOTE_START,NOTE_DORM,NOTE_COLLINS,NOTE_NEWS,NOTE_MED};
