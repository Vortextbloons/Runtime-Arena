import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const arg=(name:string)=>process.argv[process.argv.indexOf(name)+1]!;
type Body={mass:number;position:[number,number,number];velocity:[number,number,number]};
const input=JSON.parse(await readFile(arg("--input"),"utf8")) as {steps:number;deltaTime:number;bodies:Body[]};
const b=structuredClone(input.bodies);
for(let step=0;step<input.steps;step++){for(let i=0;i<b.length;i++)for(let j=i+1;j<b.length;j++){const d=[0,1,2].map(k=>b[j]!.position[k]!-b[i]!.position[k]!);const r2=d.reduce((s,x)=>s+x*x,0),m=input.deltaTime/(r2*Math.sqrt(r2));for(let k=0;k<3;k++){b[i]!.velocity[k]!+=d[k]!*b[j]!.mass*m;b[j]!.velocity[k]!-=d[k]!*b[i]!.mass*m}}for(const x of b)for(let k=0;k<3;k++)x.position[k]!+=input.deltaTime*x.velocity[k]!}
let energy=0;for(let i=0;i<b.length;i++){energy+=.5*b[i]!.mass*b[i]!.velocity.reduce((s,x)=>s+x*x,0);for(let j=i+1;j<b.length;j++){const r=Math.sqrt([0,1,2].reduce((s,k)=>s+(b[i]!.position[k]!-b[j]!.position[k]!)**2,0));energy-=b[i]!.mass*b[j]!.mass/r}}
const hash=(key:"position"|"velocity")=>createHash("sha256").update(b.flatMap(x=>x[key]).map(x=>x.toFixed(9)+",").join("")).digest("hex");
await writeFile(arg("--output"),JSON.stringify({benchmark:"nbody",version:1,bodyCount:b.length,finalEnergy:energy,positionChecksum:hash("position"),velocityChecksum:hash("velocity")}));
