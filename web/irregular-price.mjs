// Stateless synthetic Brownian bridges at several resolutions. The hashed
// coefficients belong to absolute time, so every viewer receives the same path.
// The bounded coarse field permits random access after long closed-page gaps.
const SPAN=4096,LEVELS=17;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function uniform(seed,index,salt){
 let x=(seed^Math.imul(index>>>0,0x45d9f3b)^Math.imul(Math.floor(index/4294967296),0x27d4eb2d)^salt)>>>0;
 x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);
 return (((x^(x>>>16))>>>0)+.5)/4294967296;
}
function normal(seed,index,salt){return Math.sqrt(-2*Math.log(uniform(seed,index,salt)))*Math.cos(2*Math.PI*uniform(seed,index,salt^0x51a7c3))}
function smoothNoise(seed,time,span,salt){const i=Math.floor(time/span),f=time/span-i,s=f*f*(3-2*f);return 2*((1-s)*uniform(seed,i,salt)+s*uniform(seed,i+1,salt))-1}
export function createIrregularPath(seed,volatility){
 const coefficients=new Map(),regimes=new Map();
 const cached=(map,key,calculate)=>{if(map.has(key))return map.get(key);if(map.size>=8192)map.clear();const result=calculate();map.set(key,result);return result};
 const regime=t=>cached(regimes,t,()=>clamp(Math.exp(.85*smoothNoise(seed,t,73,0x7761)+.65*smoothNoise(seed,t,191,0xb539)),.3,3));
 const coefficient=(index,level,span)=>cached(coefficients,level+':'+index,()=>normal(seed,index,0x27ab+level*0x17f3)*regime((index+.5)*span));
 const value=time=>{
  const block=Math.floor(time/SPAN),fraction=time/SPAN-block;
  const endpoint=index=>cached(coefficients,'e:'+index,()=>normal(seed,index,0x39ca)*regime(index*SPAN)*Math.sqrt(SPAN/2));
  let result=endpoint(block)*(1-fraction)+endpoint(block+1)*fraction;
  for(let level=0;level<LEVELS;level++){
   const span=SPAN/2**level,index=Math.floor(time/span),f=time/span-index;
   result+=coefficient(index,level,span)*Math.sqrt(span)/2*(1-Math.abs(2*f-1));
  }
  // Sparse finite pulses create irregular bursts; onset and duration vary.
  const cell=Math.floor(time/17);
  for(let i=cell-10;i<=cell;i++){
   if(uniform(seed,i,0x8a31)>.055)continue;
   const onset=i*17+uniform(seed,i,0x6be7)*17,age=time-onset,duration=30+uniform(seed,i,0x9fa3)*130;
   if(age<=0||age>=duration)continue;
   const f=clamp(age/.35,0,1),attack=f*f*(3-2*f);
   result+=normal(seed,i,0x5d11)*(3+7*uniform(seed,i,0xa63d))*attack*(1-age/duration)**2;
  }
  return result*.000018*volatility;
 };
 return {value};
}
