import json,hashlib,sys,math,time
def arg(name): return sys.argv[sys.argv.index(name)+1]
with open(arg("--input")) as f: data=json.load(f)
def kernel(b):
    for _ in range(data["steps"]):
        for i in range(len(b)):
            for j in range(i+1,len(b)):
                d=[b[j]["position"][k]-b[i]["position"][k] for k in range(3)];r2=sum(x*x for x in d);m=data["deltaTime"]/(r2*math.sqrt(r2))
                for k in range(3): b[i]["velocity"][k]+=d[k]*b[j]["mass"]*m;b[j]["velocity"][k]-=d[k]*b[i]["mass"]*m
        for body in b:
            for k in range(3): body["position"][k]+=data["deltaTime"]*body["velocity"][k]
    energy=0.0
    for i in range(len(b)):
        energy+=.5*b[i]["mass"]*sum(v*v for v in b[i]["velocity"])
        for j in range(i+1,len(b)): energy-=b[i]["mass"]*b[j]["mass"]/math.sqrt(sum((b[i]["position"][k]-b[j]["position"][k])**2 for k in range(3)))
    digest=lambda key:hashlib.sha256("".join(f"{x:.9f}," for body in b for x in body[key]).encode()).hexdigest()
    return{"benchmark":"nbody","version":1,"bodyCount":len(b),"finalEnergy":energy,"positionChecksum":digest("position"),"velocityChecksum":digest("velocity")}
samples=[];output=None
for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
    state=[{"mass":x["mass"],"position":list(x["position"]),"velocity":list(x["velocity"])} for x in data["bodies"]];start=time.perf_counter_ns();output=kernel(state);elapsed=time.perf_counter_ns()-start
    if i>=0:samples.append({"iteration":i+1,"kernelTimeNanoseconds":elapsed})
with open(arg("--output"),"w") as f:json.dump(output,f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
