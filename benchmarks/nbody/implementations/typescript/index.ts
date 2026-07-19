import{createHash}from"node:crypto";import{readFile,writeFile}from"node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
const warmups=Number(arg("--warmup")),iterations=Number(arg("--iterations"));
type Body={mass:number;position:[number,number,number];velocity:[number,number,number]};
type Input={steps:number;deltaTime:number;bodies:Body[]};
const input=JSON.parse(await readFile(arg("--input"),"utf8"))as Input;
function kernel(b:Body[]){
  for(let step=0;step<input.steps;step++){
    for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){
      const dx=b[j]!.position[0]!-b[i]!.position[0]!,dy=b[j]!.position[1]!-b[i]!.position[1]!,dz=b[j]!.position[2]!-b[i]!.position[2]!;
      const r2=dx*dx+dy*dy+dz*dz,m=input.deltaTime/(r2*Math.sqrt(r2));
      const mix=dx*b[j]!.mass*m,miy=dy*b[j]!.mass*m,miz=dz*b[j]!.mass*m;
      const mjx=dx*b[i]!.mass*m,mjy=dy*b[i]!.mass*m,mjz=dz*b[i]!.mass*m;
      b[i]!.velocity[0]!+=mix;b[i]!.velocity[1]!+=miy;b[i]!.velocity[2]!+=miz;
      b[j]!.velocity[0]!-=mjx;b[j]!.velocity[1]!-=mjy;b[j]!.velocity[2]!-=mjz;
    }
    for(const x of b){x.position[0]!+=input.deltaTime*x.velocity[0]!;x.position[1]!+=input.deltaTime*x.velocity[1]!;x.position[2]!+=input.deltaTime*x.velocity[2]!}
  }
  let energy=0;for(let i=0;i<b.length;i++){energy+=.5*b[i]!.mass*(b[i]!.velocity[0]!**2+b[i]!.velocity[1]!**2+b[i]!.velocity[2]!**2);for(let j=i+1;j<b.length;j++){const dx=b[i]!.position[0]!-b[j]!.position[0]!,dy=b[i]!.position[1]!-b[j]!.position[1]!,dz=b[i]!.position[2]!-b[j]!.position[2]!;energy-=b[i]!.mass*b[j]!.mass/Math.sqrt(dx*dx+dy*dy+dz*dz)}}
  const hash=(key:"position"|"velocity")=>createHash("sha256").update(b.flatMap(x=>x[key]).map(x=>x.toFixed(9)+",").join("")).digest("hex");
  return{benchmark:"nbody",version:1,bodyCount:b.length,finalEnergy:energy,positionChecksum:hash("position"),velocityChecksum:hash("velocity")};
}
let output;const samples=[];for(let i=-warmups;i<iterations;i++){const state=input.bodies.map(b=>({mass:b.mass,position:[...b.position]as[number,number,number],velocity:[...b.velocity]as[number,number,number]}));const start=process.hrtime.bigint();output=kernel(state);const elapsed=process.hrtime.bigint()-start;if(i>=0)samples.push({iteration:i+1,kernelTimeNanoseconds:Number(elapsed)})}
await writeFile(arg("--output"),JSON.stringify(output));await writeFile(arg("--timing-output"),JSON.stringify({samples}));
