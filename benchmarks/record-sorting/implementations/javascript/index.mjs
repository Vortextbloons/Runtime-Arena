import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name)=>process.argv[process.argv.indexOf(name)+1];
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a)=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};
const warmups=Number(arg("--warmup")),minIt=Number(arg("--min-iterations")),maxIt=Number(arg("--max-iterations")),targetCi=Number(arg("--target-relative-ci"));
const input=JSON.parse(await readFile(arg("--input"),"utf8"));
const inputRecords=input.records;
const rc=inputRecords.length;
const ids=new Int32Array(rc);
const scores=new Int32Array(rc);
const timestamps=new Float64Array(rc);
for(let i=0;i<rc;i++){ids[i]=inputRecords[i].id;scores[i]=inputRecords[i].score;timestamps[i]=inputRecords[i].timestamp}
const idx=new Array(rc);
function kernel(){
  for(let i=0;i<rc;i++)idx[i]=i;
  idx.sort((a,b)=>{
    const d=scores[b]-scores[a];
    if(d!==0)return d;
    const t=timestamps[a]-timestamps[b];
    if(t!==0)return t;
    return ids[a]-ids[b];
  });
  const take=Math.min(rc,10);
  const firstRecords=[];
  const lastRecords=[];
  for(let i=0;i<take;i++){const k=idx[i];firstRecords.push({id:ids[k],score:scores[k],timestamp:timestamps[k]})}
  for(let i=rc-take;i<rc;i++){const k=idx[i];lastRecords.push({id:ids[k],score:scores[k],timestamp:timestamps[k]})}
  let data="";
  for(let i=0;i<rc;i++){const k=idx[i];data+=ids[k]+","+scores[k]+","+timestamps[k]+"\n"}
  const checksum=createHash("sha256").update(data).digest("hex");
  return{benchmark:"record-sorting",version:1,recordCount:rc,firstRecords,lastRecords,checksum};
}
let output;const samples=[];
const _ts=[];for(let i=-warmups;;i++){
  const start=process.hrtime.bigint();
  output=kernel();
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0){const ns=Number(elapsed);samples.push({iteration:samples.length+1,kernelTimeNanoseconds:ns});_ts.push(ns);if(_ts.length>=maxIt||(_ts.length>=minIt&&_ciW(_ts)<=targetCi))break};
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
