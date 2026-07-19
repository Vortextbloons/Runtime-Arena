import json,sys,heapq,time
def arg(name):return sys.argv[sys.argv.index(name)+1]
min_it = int(arg("--min-iterations"))
max_it = int(arg("--max-iterations"))
target_ci = float(arg("--target-relative-ci"))
_T=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045]
def _ci_w(samples):
    n=len(samples)
    if n<2: return float("inf")
    mean=sum(samples)/n
    if mean<=0: return float("inf")
    var=sum((x-mean)**2 for x in samples)/(n-1)
    t=_T[n] if n<len(_T) else 2
    return 2*t*(var/n)**0.5/mean
with open(arg("--input")) as f:data=json.load(f)

vertex_count=data["vertexCount"]
adj=[[] for _ in range(vertex_count)]
for e in data["edges"]:
    adj[e["from"]].append((e["to"],e["weight"]))
queries=data["queries"]

dist=[0.0]*vertex_count
prev=[-1]*vertex_count

def kernel():
    results=[]
    for q in queries:
        src=q["source"]
        dst=q["destination"]
        for i in range(vertex_count):
            dist[i]=float("inf")
            prev[i]=-1
        dist[src]=0
        heap=[(0,src)]
        while heap:
            cost,node=heapq.heappop(heap)
            if cost!=dist[node]:continue
            for to,w in adj[node]:
                nc=cost+w
                if nc<dist[to]:
                    dist[to]=nc
                    prev[to]=node
                    heapq.heappush(heap,(nc,to))
        if dist[dst]==float("inf"):
            results.append({"queryId":q["id"],"distance":None,"path":[]})
        else:
            path=[]
            n=dst
            while n!=-1:
                path.append(n)
                n=prev[n]
            path.reverse()
            results.append({"queryId":q["id"],"distance":dist[dst],"path":path})
    return results

samples=[];results=None
times = []
for i in range(-int(arg("--warmup")), 10**9):
    start=time.perf_counter_ns();results=kernel();elapsed=time.perf_counter_ns()-start
    if i>=0:
        times.append(elapsed)
        samples.append({"iteration":len(samples)+1,"kernelTimeNanoseconds":elapsed})
        if len(times)>=max_it or (len(times)>=min_it and _ci_w(times)<=target_ci): break
with open(arg("--output"),"w") as f:json.dump({"benchmark":"shortest-path","version":1,"results":results},f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
