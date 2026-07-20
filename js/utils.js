/* shared helpers */
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const dist2=(x1,z1,x2,z2)=>{const dx=x1-x2,dz=z1-z2;return Math.sqrt(dx*dx+dz*dz);};

export{$,clamp,lerp,rand,dist2};
