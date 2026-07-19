import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const warmups=Number(arg("--warmup")),iterations=Number(arg("--iterations"));
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
for(let i=-warmups;i<iterations;i++){
  const state=records.map(r=>({...r}));
  const start=process.hrtime.bigint();
  output=kernel(state);
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0)samples.push({iteration:i+1,kernelTimeNanoseconds:Number(elapsed)});
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
