import json, sys, heapq

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

def digest(obj):
    import hashlib
    return hashlib.sha256(json.dumps(obj, separators=(',', ':')).encode()).hexdigest()

with open(arg("--input")) as f:
    data = json.load(f)

vertex_count = data["vertexCount"]
adj = [[] for _ in range(vertex_count)]
for e in data["edges"]:
    adj[e["from"]].append((e["to"], e["weight"]))
queries = data["queries"]

dist = [0.0] * vertex_count
prev = [-1] * vertex_count

def kernel():
    results = []
    for q in queries:
        src = q["source"]
        dst = q["destination"]
        for i in range(vertex_count):
            dist[i] = float("inf")
            prev[i] = -1
        dist[src] = 0
        heap = [(0, src)]
        while heap:
            cost, node = heapq.heappop(heap)
            if cost != dist[node]:
                continue
            for to, w in adj[node]:
                nc = cost + w
                if nc < dist[to]:
                    dist[to] = nc
                    prev[to] = node
                    heapq.heappush(heap, (nc, to))
        if dist[dst] == float("inf"):
            results.append({"queryId": q["id"], "distance": None, "path": []})
        else:
            path = []
            n = dst
            while n != -1:
                path.append(n)
                n = prev[n]
            path.reverse()
            results.append({"queryId": q["id"], "distance": dist[dst], "path": path})
    return results

respond({"type": "ready", "protocolVersion": "2.0.0"})
last = None
for line in sys.stdin:
    req = json.loads(line)
    if req["type"] == "finish":
        last_out = {"benchmark": "shortest-path", "version": 1, "results": last}
        with open(arg("--output"), "w") as f:
            json.dump(last_out, f, separators=(",", ":"))
        respond({"type": "finish", "digest": digest(last_out)})
        break
    if req["type"] == "run":
        last = kernel()
        last_out = {"benchmark": "shortest-path", "version": 1, "results": last}
        respond({"type": "result", "requestId": req["requestId"], "digest": digest(last_out)})
