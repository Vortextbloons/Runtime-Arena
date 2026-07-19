import json,sys,heapq,time
def arg(name):return sys.argv[sys.argv.index(name)+1]
with open(arg("--input")) as f:data=json.load(f)
def kernel():
    adjacency=[[] for _ in range(data["vertexCount"])]
    for edge in data["edges"]:adjacency[edge["from"]].append(edge)
    results=[]
    for query in data["queries"]:
        distance=[float("inf")]*data["vertexCount"];previous=[-1]*data["vertexCount"];distance[query["source"]]=0;heap=[(0,query["source"])]
        while heap:
            cost,node=heapq.heappop(heap)
            if cost!=distance[node]:continue
            for edge in adjacency[node]:
                next_cost=cost+edge["weight"]
                if next_cost<distance[edge["to"]]:distance[edge["to"]]=next_cost;previous[edge["to"]]=node;heapq.heappush(heap,(next_cost,edge["to"]))
        path=[];node=query["destination"]
        if distance[node]==float("inf"):results.append({"queryId":query["id"],"distance":None,"path":[]})
        else:
            while node!=-1:path.append(node);node=previous[node]
            results.append({"queryId":query["id"],"distance":distance[query["destination"]],"path":list(reversed(path))})
    return results
samples=[];results=None
for i in range(-int(arg("--warmup")),int(arg("--iterations"))):
    start=time.perf_counter_ns();results=kernel();elapsed=time.perf_counter_ns()-start
    if i>=0:samples.append({"iteration":i+1,"kernelTimeNanoseconds":elapsed})
with open(arg("--output"),"w") as f:json.dump({"benchmark":"shortest-path","version":1,"results":results},f)
with open(arg("--timing-output"),"w") as f:json.dump({"samples":samples},f,separators=(",",":"))
