import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name)=>process.argv[process.argv.indexOf(name)+1];
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a)=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};
const warmups=Number(arg("--warmup")),minIt=Number(arg("--min-iterations")),maxIt=Number(arg("--max-iterations")),targetCi=Number(arg("--target-relative-ci"));
const input=JSON.parse(await readFile(arg("--input"),"utf8"));
const n=input.dimension;
const a=input.left;
const b=input.right;
function kernel(){
  const c=new Array(n*n);
  let valueSum=0,diagonalSum=0;
  for(let i=0;i<n;i++){
    for(let j=0;j<n;j++){
      let sum=0;
      for(let k=0;k<n;k++){
        sum+=a[i*n+k]*b[k*n+j];
      }
      c[i*n+j]=sum;
      valueSum+=sum;
      if(i===j)diagonalSum+=sum;
    }
  }
  let s=`dimension=${n}\n`;
  for(let i=0;i<n*n;i++)s+=c[i].toString()+",";
  s+="\n";
  const checksum=createHash("sha256").update(s).digest("hex");
  return{benchmark:"matrix-multiplication",version:1,dimension:n,elementCount:n*n,valueSum,diagonalSum,checksum};
}
let output;const samples=[];
const _ts=[];for(let i=-warmups;;i++){
  const start=process.hrtime.bigint();
  output=kernel();
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0){const ns=Number(elapsed);samples.push({iteration:samples.length+1,kernelTimeNanoseconds:ns});_ts.push(ns);if(_ts.length>=maxIt||(_ts.length>=minIt&&_ciW(_ts)<=targetCi))break};
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
