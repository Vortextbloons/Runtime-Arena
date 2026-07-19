import json,sys,heapq,time
def arg(name):return sys.argv[sys.argv.index(name)+1]
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
for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
    start=time.perf_counter_ns();results=kernel();elapsed=time.perf_counter_ns()-start
    if i>=0:samples.append({"iteration":i+1,"kernelTimeNanoseconds":elapsed})
with open(arg("--output"),"w") as f:json.dump({"benchmark":"shortest-path","version":1,"results":results},f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
