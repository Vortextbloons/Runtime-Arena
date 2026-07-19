import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const warmups=Number(arg("--warmup")),iterations=Number(arg("--iterations"));
interface Input{dimension:number;left:number[];right:number[]}
const input=JSON.parse(await readFile(arg("--input"),"utf8"))as Input;
const n=input.dimension;
const a=input.left;
const b=input.right;
function kernel(){
  const c=new Array<number>(n*n);
  let valueSum=0,diagonalSum=0;
  for(let i=0;i<n;i++){
    for(let j=0;j<n;j++){
      let sum=0;
      for(let k=0;k<n;k++){
        sum+=a[i*n+k]!*b[k*n+j]!;
      }
      c[i*n+j]=sum;
      valueSum+=sum;
      if(i===j)diagonalSum+=sum;
    }
  }
  let s=`dimension=${n}\n`;
  for(let i=0;i<n*n;i++)s+=c[i]!.toString()+",";
  s+="\n";
  const checksum=createHash("sha256").update(s).digest("hex");
  return{benchmark:"matrix-multiplication"as const,version:1 as const,dimension:n,elementCount:n*n,valueSum,diagonalSum,checksum};
}
let output;const samples:Array<{iteration:number;kernelTimeNanoseconds:number}>=[];
for(let i=-warmups;i<iterations;i++){
  const start=process.hrtime.bigint();
  output=kernel();
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0)samples.push({iteration:i+1,kernelTimeNanoseconds:Number(elapsed)});
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
