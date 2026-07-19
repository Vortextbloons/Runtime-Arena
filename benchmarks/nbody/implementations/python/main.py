import json,hashlib,sys,math,time
def arg(name): return sys.argv[sys.argv.index(name)+1]
with open(arg("--input")) as f: data=json.load(f)

steps=data["steps"]; dt=data["deltaTime"]

def kernel(b):
    n=len(b)
    for _ in range(steps):
        # velocity update
        for i in range(n):
            bi=b[i]; pi=bi["position"]; vi=bi["velocity"]; mi=bi["mass"]
            pix,piy,piz=pi; vix,viy,viz=vi[0],vi[1],vi[2]
            for j in range(i+1,n):
                bj=b[j]; pj=bj["position"]; mj=bj["mass"]
                dx=pj[0]-pix; dy=pj[1]-piy; dz=pj[2]-piz
                r2=dx*dx+dy*dy+dz*dz; m=dt/(r2*math.sqrt(r2))
                mix=dx*mj*m; miy=dy*mj*m; miz=dz*mj*m
                mjx=dx*mi*m; mjy=dy*mi*m; mjz=dz*mi*m
                vix+=mix; viy+=miy; viz+=miz
                bj["velocity"][0]-=mjx; bj["velocity"][1]-=mjy; bj["velocity"][2]-=mjz
            vi[0]=vix; vi[1]=viy; vi[2]=viz
        # position update
        for bi in b: pi=bi["position"]; vi=bi["velocity"]; pi[0]+=dt*vi[0]; pi[1]+=dt*vi[1]; pi[2]+=dt*vi[2]
    energy=0.0
    pos_hash=hashlib.sha256(); vel_hash=hashlib.sha256()
    for i in range(n):
        bi=b[i]; mass=bi["mass"]; px,py,pz=bi["position"]; vx,vy,vz=bi["velocity"]
        pos_hash.update(f"{px:.9f},".encode()); pos_hash.update(f"{py:.9f},".encode()); pos_hash.update(f"{pz:.9f},".encode())
        vel_hash.update(f"{vx:.9f},".encode()); vel_hash.update(f"{vy:.9f},".encode()); vel_hash.update(f"{vz:.9f},".encode())
        energy+=.5*mass*(vx*vx+vy*vy+vz*vz)
        for j in range(i+1,n):
            bj=b[j]; dx=px-bj["position"][0]; dy=py-bj["position"][1]; dz=pz-bj["position"][2]
            energy-=mass*bj["mass"]/math.sqrt(dx*dx+dy*dy+dz*dz)
    return{"benchmark":"nbody","version":1,"bodyCount":n,"finalEnergy":energy,"positionChecksum":pos_hash.hexdigest(),"velocityChecksum":vel_hash.hexdigest()}

samples=[];output=None
for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
    state=[{"mass":x["mass"],"position":list(x["position"]),"velocity":list(x["velocity"])} for x in data["bodies"]]
    start=time.perf_counter_ns();output=kernel(state);elapsed=time.perf_counter_ns()-start
    if i>=0:samples.append({"iteration":i+1,"kernelTimeNanoseconds":elapsed})
with open(arg("--output"),"w") as f:json.dump(output,f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
