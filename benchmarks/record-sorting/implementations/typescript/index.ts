import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a:number[])=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};
const warmups=Number(arg("--warmup")),minIt=Number(arg("--min-iterations")),maxIt=Number(arg("--max-iterations")),targetCi=Number(arg("--target-relative-ci"));
interface Record{id:number;score:number;timestamp:number}
interface Input{records:Record[]}
const input=JSON.parse(await readFile(arg("--input"),"utf8"))as Input;
const records=input.records;
function kernel(recs:Record[]){
  recs.sort((a,b)=>b.score-a.score||a.timestamp-b.timestamp||a.id-b.id);
  const n=recs.length;const take=Math.min(n,10);
  const first=recs.slice(0,take);const last=recs.slice(n-take);
  let data="";for(const r of recs)data+=r.id+","+r.score+","+r.timestamp+"\n";
  const checksum=createHash("sha256").update(data).digest("hex");
  return{benchmark:"record-sorting"as const,version:1 as const,recordCount:n,firstRecords:first,lastRecords:last,checksum};
}
let output;const samples:Array<{iteration:number;kernelTimeNanoseconds:number}>=[];
const _ts:number[]=[];for(let i=-warmups;;i++){
  const state=records.map(r=>({...r}));
  const start=process.hrtime.bigint();
  output=kernel(state);
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0){const ns=Number(elapsed);samples.push({iteration:samples.length+1,kernelTimeNanoseconds:ns});_ts.push(ns);if(_ts.length>=maxIt||(_ts.length>=minIt&&_ciW(_ts)<=targetCi))break};
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
