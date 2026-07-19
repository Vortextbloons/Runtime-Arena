import{readFile,writeFile}from"node:fs/promises";import{Worker}from"node:worker_threads";
const arg=(n)=>process.argv[process.argv.indexOf(n)+1];
const wu=Number(arg("--warmup")),it=Number(arg("--iterations"));
const inp=JSON.parse(await readFile(arg("--input"),"utf8"));
const{workerCount:wc,phaseCount:pc,itemsPerWorker:ipw,roundsPerItem:rpi,initialSeed:is}=inp;
let ps=Number.parseInt(is,16)>>>0;
function m32(x){x=(x^(x>>>16))>>>0;x=Math.imul(x,0x21f0aaad)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x735a2d97)>>>0;x=(x^(x>>>15))>>>0;return x}
function rl64(lo,hi,n){const s=32-n;return[((lo<<n)|(hi>>>s))|0,((hi<<n)|(lo>>>s))|0]}
function add64(aLo,aHi,bLo,bHi){const lo=(aLo+bLo)|0;return[lo,(aHi+bHi+((lo>>>0)<(bLo>>>0)?1:0))|0]}
function toHex8(n){return(n>>>0).toString(16).padStart(8,"0")}
function toHex16(lo,hi){return toHex8(hi)+toHex8(lo)}
const ws=Array.from({length:wc},(_,i)=>{const w=new Worker(new URL("./worker.mjs",import.meta.url));w.postMessage({cmd:"init",workerId:i,itemsPerWorker:ipw,roundsPerItem:rpi});return w});
async function kernel(ps0){
  let dgLo=0xf3bcc909,dgHi=0x6a09e667;let p=ps0;
  for(let ph=0;ph<pc;ph++){
    const rs=await Promise.all(ws.map(w=>new Promise(r=>{w.once("message",r);w.postMessage({cmd:"work",phaseSeed:p})})));rs.sort((a,b)=>a.workerId-b.workerId);
    let ns=(p^ph)>>>0;let sumLo=0,sumHi=0;
    for(const r of rs){ns=m32((ns^r.localXor^r.localSumLo^r.localSumHi^r.workerId)>>>0);[sumLo,sumHi]=add64(sumLo,sumHi,r.localSumLo,r.localSumHi)}
    p=ns;[dgLo,dgHi]=rl64(dgLo,dgHi,7);dgLo^=ns;[dgLo,dgHi]=add64(dgLo,dgHi,sumLo,sumHi)
  }
  return{fs:toHex8(p),dg:toHex16(dgLo,dgHi)}
}
let out;const sa=[];for(let i=-wu;i<it;i++){const st=process.hrtime.bigint();out=await kernel(ps);const el=process.hrtime.bigint()-st;if(i>=0)sa.push({iteration:i+1,kernelTimeNanoseconds:Number(el)})}
await Promise.all(ws.map(w=>w.terminate()));
await writeFile(arg("--output"),JSON.stringify({schemaVersion:"1.0.0",benchmark:"barrier-wave",workerCount:wc,phaseCount:pc,itemsProcessed:wc*pc*ipw,finalSeed:out.fs,digest:out.dg}));
await writeFile(arg("--timing-output"),JSON.stringify({samples:sa}));
