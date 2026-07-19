import{readFile,writeFile}from"node:fs/promises";import{Worker}from"node:worker_threads";
const arg=(n)=>process.argv[process.argv.indexOf(n)+1];
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a)=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};
const wu=Number(arg("--warmup")),minIt=Number(arg("--min-iterations")),maxIt=Number(arg("--max-iterations")),targetCi=Number(arg("--target-relative-ci"));
const inp=JSON.parse(await readFile(arg("--input"),"utf8"));
const{workerCount:wc,phaseCount:pc,itemsPerWorker:ipw,roundsPerItem:rpi,initialSeed:is}=inp;
let ps=Number.parseInt(is,16)>>>0;
function m32(x){x=(x^(x>>>16))>>>0;x=Math.imul(x,0x21f0aaad)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x735a2d97)>>>0;x=(x^(x>>>15))>>>0;return x}
function rl64(lo,hi,n){const s=32-n;return[((lo<<n)|(hi>>>s))|0,((hi<<n)|(lo>>>s))|0]}
function add64(aLo,aHi,bLo,bHi){const lo=(aLo+bLo)|0;return[lo,(aHi+bHi+((lo>>>0)<(bLo>>>0)?1:0))|0]}
function toHex8(n){return(n>>>0).toString(16).padStart(8,"0")}
function toHex16(lo,hi){return toHex8(hi)+toHex8(lo)}
const pending=new Map();
const ws=Array.from({length:wc},(_,i)=>{const w=new Worker(new URL("./worker.mjs",import.meta.url));w.on("message",(msg)=>{const resolve=pending.get(i);if(resolve){pending.delete(i);resolve(msg)}});w.postMessage({cmd:"init",workerId:i,itemsPerWorker:ipw,roundsPerItem:rpi});return w});
function dispatchPhase(phaseSeed){return Promise.all(ws.map((w,i)=>new Promise((resolve)=>{pending.set(i,resolve);w.postMessage({cmd:"work",phaseSeed})})))}
async function kernel(ps0){
  let dgLo=0xf3bcc909,dgHi=0x6a09e667;let p=ps0;
  for(let ph=0;ph<pc;ph++){
    const rs=await dispatchPhase(p);rs.sort((a,b)=>a.workerId-b.workerId);
    let ns=(p^ph)>>>0;let sumLo=0,sumHi=0;
    for(const r of rs){ns=m32((ns^r.localXor^r.localSumLo^r.localSumHi^r.workerId)>>>0);[sumLo,sumHi]=add64(sumLo,sumHi,r.localSumLo,r.localSumHi)}
    p=ns;[dgLo,dgHi]=rl64(dgLo,dgHi,7);dgLo^=ns;[dgLo,dgHi]=add64(dgLo,dgHi,sumLo,sumHi)
  }
  return{fs:toHex8(p),dg:toHex16(dgLo,dgHi)}
}
let out;const sa=[];const _ts=[];for(let i=-wu;;i++){const st=process.hrtime.bigint();out=await kernel(ps);const el=process.hrtime.bigint()-st;if(i>=0){const ns=Number(el);sa.push({iteration:sa.length+1,kernelTimeNanoseconds:ns});_ts.push(ns);if(_ts.length>=maxIt||(_ts.length>=minIt&&_ciW(_ts)<=targetCi))break}}
await Promise.all(ws.map(w=>w.terminate()));
await writeFile(arg("--output"),JSON.stringify({schemaVersion:"1.0.0",benchmark:"barrier-wave",workerCount:wc,phaseCount:pc,itemsProcessed:wc*pc*ipw,finalSeed:out.fs,digest:out.dg}));
await writeFile(arg("--timing-output"),JSON.stringify({samples:sa}));
