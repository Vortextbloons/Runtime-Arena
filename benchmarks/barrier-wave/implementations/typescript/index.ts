import{readFile,writeFile}from"node:fs/promises";import{Worker}from"node:worker_threads";
const arg=(n:string)=>process.argv[process.argv.indexOf(n)+1]!;
const wu=Number(arg("--warmup")),it=Number(arg("--iterations"));
const inp=JSON.parse(await readFile(arg("--input"),"utf8"));
const{workerCount:wc,phaseCount:pc,itemsPerWorker:ipw,roundsPerItem:rpi,initialSeed:is}=inp as any;
let ps=Number.parseInt(is,16)>>>0;
function m32(x:number):number{x=(x^(x>>>16))>>>0;x=Math.imul(x,0x21f0aaad)>>>0;x=(x^(x>>>15))>>>0;x=Math.imul(x,0x735a2d97)>>>0;x=(x^(x>>>15))>>>0;return x}
function rl64(x:bigint,n:bigint):bigint{return(x<<n)|(x>>(64n-n))}
const ws:Worker[]=Array.from({length:wc},(_,i)=>{const w=new Worker(new URL("./worker.js",import.meta.url));w.postMessage({cmd:"init",workerId:i,itemsPerWorker:ipw,roundsPerItem:rpi});return w});
async function kernel(ps0:number):Promise<{fs:string;dg:string}>{
  let dg=0x6a09e667f3bcc909n;let p=ps0;
  for(let ph=0;ph<pc;ph++){
    const rs=await Promise.all(ws.map(w=>new Promise<any>(r=>{w.once("message",r);w.postMessage({cmd:"work",phaseSeed:p})})));rs.sort((a,b)=>a.workerId-b.workerId);
    let ns=(p^ph)>>>0;let sum=0n;
    for(const r of rs){const ls=BigInt(r.localSum);ns=m32((ns^r.localXor^Number(ls&0xFFFFFFFFn)>>>0^Number(ls>>32n&0xFFFFFFFFn)>>>0^r.workerId)>>>0);sum=BigInt.asUintN(64,sum+ls)}
    p=ns;dg=rl64(dg,7n);dg^=BigInt(ns);dg=BigInt.asUintN(64,dg+sum)
  }
  return{fs:p.toString(16).padStart(8,"0"),dg:dg.toString(16).padStart(16,"0")}
}
let out!:any;const sa:any[]=[];for(let i=-wu;i<it;i++){const st=process.hrtime.bigint();out=await kernel(ps);const el=process.hrtime.bigint()-st;if(i>=0)sa.push({iteration:i+1,kernelTimeNanoseconds:Number(el)})}
await Promise.all(ws.map(w=>w.terminate()));
await writeFile(arg("--output"),JSON.stringify({schemaVersion:"1.0.0",benchmark:"barrier-wave",workerCount:wc,phaseCount:pc,itemsProcessed:wc*pc*ipw,finalSeed:out.fs,digest:out.dg}));
await writeFile(arg("--timing-output"),JSON.stringify({samples:sa}));
