import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const _t=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045];
const _ciW=(a:number[])=>{const n=a.length;if(n<2)return Infinity;const m=a.reduce((x,y)=>x+y,0)/n;if(m<=0)return Infinity;const v=a.reduce((s,x)=>s+(x-m)**2,0)/(n-1);return 2*(n<_t.length?_t[n]:2)*Math.sqrt(v/n)/m};
const warmups=Number(arg("--warmup")),minIt=Number(arg("--min-iterations")),maxIt=Number(arg("--max-iterations")),targetCi=Number(arg("--target-relative-ci"));
interface Body{mass:number;position:[number,number,number];velocity:[number,number,number]}
interface Input{steps:number;deltaTime:number;bodies:Body[]}
const input=JSON.parse(await readFile(arg("--input"),"utf8"))as Input;
const n=input.bodies.length;
const dt=input.deltaTime;
const steps=input.steps;
const inputBuf=new Float64Array(n*7);
for(let i=0;i<n;i++){const b=input.bodies[i]!;const o=i*7;inputBuf[o]=b.mass;inputBuf[o+1]=b.position[0]!;inputBuf[o+2]=b.position[1]!;inputBuf[o+3]=b.position[2]!;inputBuf[o+4]=b.velocity[0]!;inputBuf[o+5]=b.velocity[1]!;inputBuf[o+6]=b.velocity[2]!}
function kernel(buf:Float64Array){
  for(let step=0;step<steps;step++){
    for(let i=0;i<n;i++){const bi=i*7;const bix=buf[bi]!,bi1=buf[bi+1]!,bi2=buf[bi+2]!,bi3=buf[bi+3]!;
      for(let j=i+1;j<n;j++){const bj=j*7;const dj0=buf[bj+1]!-bi1,dj1=buf[bj+2]!-bi2,dj2=buf[bj+3]!-bi3;
        const r2=dj0*dj0+dj1*dj1+dj2*dj2;const m=dt/(r2*Math.sqrt(r2));
        const mj=buf[bj]!*m,mi=bix*m;
        buf[bi+4]+=dj0*mj;buf[bi+5]+=dj1*mj;buf[bi+6]+=dj2*mj;
        buf[bj+4]-=dj0*mi;buf[bj+5]-=dj1*mi;buf[bj+6]-=dj2*mi;
      }
    }
    for(let i=0;i<n;i++){const bi=i*7;buf[bi+1]+=dt*buf[bi+4]!;buf[bi+2]+=dt*buf[bi+5]!;buf[bi+3]+=dt*buf[bi+6]!;}
  }
  let energy=0;
  for(let i=0;i<n;i++){const bi=i*7;const mx=buf[bi]!,px=buf[bi+1]!,py=buf[bi+2]!,pz=buf[bi+3]!,vx=buf[bi+4]!,vy=buf[bi+5]!,vz=buf[bi+6]!;
    energy+=.5*mx*(vx*vx+vy*vy+vz*vz);
    for(let j=i+1;j<n;j++){const bj=j*7;const dx=px-buf[bj+1]!,dy=py-buf[bj+2]!,dz=pz-buf[bj+3]!;energy-=mx*buf[bj]!/Math.sqrt(dx*dx+dy*dy+dz*dz)}
  }
  let ps="",vs="";
  for(let i=0;i<n;i++){const o=i*7;ps+=buf[o+1]!.toFixed(9)+",";ps+=buf[o+2]!.toFixed(9)+",";ps+=buf[o+3]!.toFixed(9)+",";vs+=buf[o+4]!.toFixed(9)+",";vs+=buf[o+5]!.toFixed(9)+",";vs+=buf[o+6]!.toFixed(9)+","}
  const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
  return{benchmark:"nbody"as const,version:1 as const,bodyCount:n,finalEnergy:energy,positionChecksum:hash(ps),velocityChecksum:hash(vs)};
}
let output;const samples:Array<{iteration:number;kernelTimeNanoseconds:number}>=[];
const _ts:number[]=[];for(let i=-warmups;;i++){
  const state=new Float64Array(inputBuf);
  const start=process.hrtime.bigint();
  output=kernel(state);
  const elapsed=process.hrtime.bigint()-start;
  if(i>=0){const ns=Number(elapsed);samples.push({iteration:samples.length+1,kernelTimeNanoseconds:ns});_ts.push(ns);if(_ts.length>=maxIt||(_ts.length>=minIt&&_ciW(_ts)<=targetCi))break};
}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
