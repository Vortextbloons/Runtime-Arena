import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const warmups=Number(arg("--warmup")),iterations=Number(arg("--iterations"));
const input=JSON.parse(await readFile(arg("--input"),"utf8"))as{words:string[]};
const words=input.words;

function kernel(words:string[]){
  const freq=new Map<string,number>();
  for(const w of words)freq.set(w,(freq.get(w)??0)+1);
  const entries=[...freq.entries()];
  entries.sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  let checksumData="";
  for(const[w,c]of entries)checksumData+=w+","+c+"\n";
  const checksum=createHash("sha256").update(checksumData).digest("hex");
  const topWords=entries.slice(0,10).map(([word,count])=>({word,count}));
  return{benchmark:"word-frequency"as const,version:1 as const,totalWords:words.length,uniqueWords:entries.length,topWords,checksum};
}

let output;const samples:Array<{iteration:number;kernelTimeNanoseconds:number}>=[];
for(let i=-warmups;i<iterations;i++){
  const start=process.hrtime.bigint();
  output=kernel(words);
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0)samples.push({iteration:i+1,kernelTimeNanoseconds:Number(elapsed)});
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
