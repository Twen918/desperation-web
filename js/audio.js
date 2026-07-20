import{clamp,lerp,rand}from'./utils.js';

/* ================= AUDIO (procedural, WebAudio) ================= */
const AudioSys=(()=>{
  let ctx=null,master=null,inited=false;
  let noiseBuf=null,creakT=5,growlT=4,heartT=0,kickT=0,chaseG=null,humL=null;
  function init(){
    if(inited)return; inited=true;
    ctx=new (window.AudioContext||window.webkitAudioContext)();
    const comp=ctx.createDynamicsCompressor();
    comp.threshold.value=-20;comp.knee.value=18;comp.ratio.value=9;
    master=ctx.createGain();master.gain.value=0.85;
    master.connect(comp);comp.connect(ctx.destination);
    noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
    const d=noiseBuf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    startAmbient();
  }
  const now=()=>ctx.currentTime;
  function g(v){const n=ctx.createGain();n.gain.value=v;return n;}
  function filt(type,f,q){const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=f;if(q)n.Q.value=q;return n;}
  function noiseSrc(loop){const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=!!loop;return s;}
  // fire-and-forget noise hit: vol, seconds, filter chain builder
  function nHit(vol,dur,fType,f0,f1,q){
    const s=noiseSrc(false),fl=filt(fType,f0,q||1),gn=g(0);
    s.connect(fl);fl.connect(gn);gn.connect(master);
    gn.gain.setValueAtTime(0,now());
    gn.gain.linearRampToValueAtTime(vol,now()+0.012);
    gn.gain.exponentialRampToValueAtTime(0.001,now()+dur);
    if(f1)fl.frequency.exponentialRampToValueAtTime(f1,now()+dur);
    s.start();s.stop(now()+dur+0.05);
  }
  function tone(type,f0,f1,vol,dur,glideDur){
    const o=ctx.createOscillator(),gn=g(0);
    o.type=type;o.frequency.setValueAtTime(f0,now());
    if(f1)o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),now()+(glideDur||dur));
    o.connect(gn);gn.connect(master);
    gn.gain.linearRampToValueAtTime(vol,now()+0.01);
    gn.gain.exponentialRampToValueAtTime(0.001,now()+dur);
    o.start();o.stop(now()+dur+0.05);
    return o;
  }
  function startAmbient(){
    // deep facility hum: two detuned saws through a heavy lowpass
    const o1=ctx.createOscillator(),o2=ctx.createOscillator();
    o1.type='sawtooth';o1.frequency.value=46;
    o2.type='sawtooth';o2.frequency.value=46.55;
    const lf=filt('lowpass',95,0.7),hg=g(0.028);
    o1.connect(lf);o2.connect(lf);lf.connect(hg);hg.connect(master);
    o1.start();o2.start();humL=hg;
    // air / vent noise bed
    const s=noiseSrc(true),f=filt('lowpass',190,0.5),ng=g(0.045);
    s.connect(f);f.connect(ng);ng.connect(master);s.start();
  }
  function creak(){
    const p=ctx.createStereoPanner?ctx.createStereoPanner():null;
    const s=noiseSrc(false),f=filt('bandpass',rand(500,1400),9),gn=g(0);
    s.connect(f);f.connect(gn);
    if(p){gn.connect(p);p.pan.value=rand(-0.85,0.85);p.connect(master);}else gn.connect(master);
    const d=rand(0.35,0.9);
    gn.gain.linearRampToValueAtTime(rand(0.015,0.05),now()+d*0.4);
    gn.gain.linearRampToValueAtTime(0,now()+d);
    s.start();s.stop(now()+d+0.05);
  }
  function footstep(loud,speedK){
    if(!inited)return;
    nHit(0.05+loud*0.1,0.09,'lowpass',420+speedK*260,140,1);
    tone('sine',88,42,0.05+loud*0.09,0.1);
  }
  function monsterStep(vol){
    if(!inited)return;
    tone('sine',58,30,vol*0.85,0.24);
    nHit(vol*0.35,0.16,'lowpass',160,60,1);
  }
  function growl(vol){
    if(!inited)return;
    const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=rand(42,58);
    const lfo=ctx.createOscillator();lfo.frequency.value=rand(2.2,4.5);
    const lg=g(9);lfo.connect(lg);lg.connect(o.frequency);
    const f=filt('lowpass',260,2),gn=g(0);
    o.connect(f);f.connect(gn);gn.connect(master);
    const d=rand(1.2,2.1);
    gn.gain.linearRampToValueAtTime(vol,now()+0.35);
    gn.gain.linearRampToValueAtTime(0,now()+d);
    o.start();lfo.start();o.stop(now()+d+0.1);lfo.stop(now()+d+0.1);
    nHit(vol*0.5,d*0.8,'bandpass',300,120,2); // breath
  }
  function heartbeat(vol){
    if(!inited)return;
    tone('sine',62,34,vol,0.12);
    setTimeout(()=>{if(inited)tone('sine',56,30,vol*0.75,0.11);},150);
  }
  function sting(){
    if(!inited)return;
    for(const det of[0,7,13]){
      const o=ctx.createOscillator();o.type='sawtooth';
      o.frequency.setValueAtTime(190+det*4,now());
      o.frequency.linearRampToValueAtTime(310+det*7,now()+1.5);
      const f=filt('lowpass',2400,1),gn=g(0);
      o.connect(f);f.connect(gn);gn.connect(master);
      gn.gain.linearRampToValueAtTime(0.09,now()+1.15);
      gn.gain.linearRampToValueAtTime(0,now()+1.8);
      o.start();o.stop(now()+1.9);
    }
    nHit(0.16,1.6,'highpass',900,2600,1);
  }
  function scream(){
    if(!inited)return;
    const sh=ctx.createWaveShaper();
    const curve=new Float32Array(256);
    for(let i=0;i<256;i++){const x=i/128-1;curve[i]=Math.tanh(x*6);}
    sh.curve=curve;
    const o=ctx.createOscillator();o.type='sawtooth';
    o.frequency.setValueAtTime(480,now());
    o.frequency.exponentialRampToValueAtTime(1750,now()+0.55);
    o.frequency.exponentialRampToValueAtTime(700,now()+0.95);
    const gn=g(0);o.connect(sh);sh.connect(gn);gn.connect(master);
    gn.gain.linearRampToValueAtTime(0.5,now()+0.05);
    gn.gain.linearRampToValueAtTime(0,now()+1.0);
    o.start();o.stop(now()+1.05);
    nHit(0.55,0.9,'bandpass',1500,2800,0.8);
    tone('sine',52,26,0.6,0.9);
  }
  function clank(){
    if(!inited)return;
    tone('square',82,40,0.28,0.16);
    nHit(0.3,0.5,'bandpass',1900,900,8);
    nHit(0.18,0.7,'bandpass',2700,1400,10);
  }
  function relay(){if(!inited)return;tone('square',120,60,0.14,0.07);nHit(0.1,0.12,'bandpass',2300,1500,7);}
  function doorSlide(){
    if(!inited)return;
    nHit(0.13,0.55,'lowpass',700,260,1);
    setTimeout(()=>{if(inited)tone('sine',95,45,0.16,0.12);},420);
  }
  function lockerClunk(){if(!inited)return;tone('sine',135,55,0.22,0.13);nHit(0.14,0.4,'bandpass',1100,700,6);}
  function pickup(){if(!inited)return;tone('sine',620,0,0.05,0.09);setTimeout(()=>{if(inited)tone('sine',930,0,0.045,0.12);},70);}
  function beepErr(){if(!inited)return;tone('square',210,0,0.05,0.1);setTimeout(()=>{if(inited)tone('square',165,0,0.05,0.14);},130);}
  function beepOk(){if(!inited)return;tone('sine',880,0,0.05,0.08);setTimeout(()=>{if(inited)tone('sine',1180,0,0.045,0.1);},90);}
  function slideNoise(){if(!inited)return;nHit(0.2,0.38,'highpass',420,900,1);}
  function land(v){if(!inited)return;tone('sine',75,38,0.1*v,0.12);nHit(0.07*v,0.1,'lowpass',300,120,1);}
  function inject(){if(!inited)return;nHit(0.08,0.2,'highpass',2000,4000,2);setTimeout(()=>{if(inited)tone('sine',180,60,0.14,0.5);},180);}
  function powerOn(){
    if(!inited)return;
    tone('sawtooth',30,58,0.11,2.6,2.2);
    let t=0;
    for(let i=0;i<7;i++){t+=rand(90,320);setTimeout(()=>{if(inited){relay();nHit(0.06,0.1,'bandpass',3200,2400,6);}},t);}
    if(humL)humL.gain.linearRampToValueAtTime(0.045,now()+3);
  }
  let radioN=null,alarmN=null;
  function radioStart(dur){
    if(!inited||radioN)return;
    const o=ctx.createOscillator();o.type='square';
    const f=filt('bandpass',900,2),gn=g(0);
    const s=noiseSrc(true),nf=filt('lowpass',2600,1),ng=g(0.018);
    o.connect(f);f.connect(gn);gn.connect(master);
    s.connect(nf);nf.connect(ng);ng.connect(master);
    const notes=[330,392,440,494,370,415];
    for(let t=0;t<dur;t+=0.28)
      o.frequency.setValueAtTime(notes[(Math.random()*notes.length)|0]*(Math.random()<0.12?0.5:1),now()+t);
    gn.gain.linearRampToValueAtTime(0.055,now()+0.3);
    o.start();s.start();
    radioN={o,s,gn,ng};
  }
  function radioGain(v){ if(radioN)radioN.gn.gain.value=0.055*v; if(radioN)radioN.ng.gain.value=0.018*v; }
  function radioStop(){
    if(!radioN)return;
    const r=radioN;radioN=null;
    tone('sine',1400,2900,0.06,0.35,0.3);
    r.gn.gain.linearRampToValueAtTime(0,now()+0.25);
    r.ng.gain.linearRampToValueAtTime(0,now()+0.25);
    setTimeout(()=>{try{r.o.stop();r.s.stop();}catch(e){}},400);
  }
  function alarmStart(){
    if(!inited||alarmN)return;
    const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=720;
    const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=2.1;
    const lg=g(150);lfo.connect(lg);lg.connect(o.frequency);
    const f=filt('lowpass',2200,1),gn=g(0);
    o.connect(f);f.connect(gn);gn.connect(master);
    gn.gain.linearRampToValueAtTime(0.085,now()+0.2);
    o.start();lfo.start();
    alarmN={o,lfo,gn};
  }
  function alarmStop(){
    if(!alarmN)return;
    const a=alarmN;alarmN=null;
    a.gn.gain.linearRampToValueAtTime(0,now()+0.5);
    setTimeout(()=>{try{a.o.stop();a.lfo.stop();}catch(e){}},700);
  }
  function gurgle(){
    if(!inited)return;
    nHit(0.16,1.6,'lowpass',600,150,2);
    for(let i=0;i<6;i++)setTimeout(()=>{if(inited)tone('sine',rand(180,340),90,0.04,0.12);},i*220+rand(0,120));
  }
  function drawer(){ if(!inited)return; nHit(0.1,0.3,'bandpass',850,500,4); setTimeout(()=>{if(inited)tone('sine',110,60,0.08,0.08);},240); }
  function canDrop(){ if(!inited)return; tone('square',240,90,0.1,0.14); nHit(0.08,0.5,'bandpass',1700,900,7); setTimeout(()=>{if(inited)nHit(0.05,0.4,'bandpass',1400,800,7);},260); }
  function startChase(){
    if(!inited||chaseG)return;
    const o1=ctx.createOscillator(),o2=ctx.createOscillator();
    o1.type='sawtooth';o1.frequency.value=65;
    o2.type='sawtooth';o2.frequency.value=92.2;
    const f=filt('lowpass',520,1.5);chaseG=g(0);
    o1.connect(f);o2.connect(f);f.connect(chaseG);chaseG.connect(master);
    chaseG.gain.linearRampToValueAtTime(0.085,now()+0.4);
    o1.start();o2.start();chaseG._o=[o1,o2];
  }
  function stopChase(){
    if(!chaseG)return;
    const cg=chaseG;chaseG=null;
    cg.gain.linearRampToValueAtTime(0,now()+1.2);
    setTimeout(()=>{cg._o.forEach(o=>{try{o.stop();}catch(e){}});},1400);
  }
  // per-frame dynamic mix
  function update(dt,st){
    if(!inited)return;
    creakT-=dt;
    if(creakT<=0){creakT=rand(8,22);creak();}
    const d=st.monsterDist;
    if(st.monsterActive&&d<15){
      heartT-=dt;
      const iv=lerp(0.34,1.15,clamp(d/15,0,1));
      if(heartT<=0){heartT=iv;heartbeat(lerp(0.34,0.05,clamp(d/15,0,1))*(st.hidden?0.6:1));}
    }
    if(st.monsterActive&&d<22){
      growlT-=dt;
      if(growlT<=0){growlT=rand(3,7);growl(clamp(7/(d+2),0.05,0.5));}
    }
    if(st.chasing){
      kickT-=dt;
      if(kickT<=0){kickT=0.43;tone('sine',88,40,0.3,0.14);}
    }
  }
  return {init,footstep,monsterStep,growl,sting,scream,clank,relay,doorSlide,lockerClunk,
          pickup,beepErr,beepOk,slideNoise,land,inject,powerOn,startChase,stopChase,update,
          radioStart,radioStop,radioGain,alarmStart,alarmStop,gurgle,drawer,canDrop,
          get ready(){return inited;}};
})();

export{AudioSys};
