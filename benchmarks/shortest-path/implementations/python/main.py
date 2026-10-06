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
V = vertex_count
INF = 10 ** 18

# Flat CSR: offsets[v]..offsets[v+1] indexes into dst/wgt
_n = V
_degree = [0] * _n
for e in data["edges"]:
    _degree[e["from"]] += 1
offsets = [0] * (_n + 1)
for v in range(_n):
    offsets[v + 1] = offsets[v] + _degree[v]
E = len(data["edges"])
dst = [0] * E
wgt = [0] * E
_fill = offsets[:-1].copy() if _n else []
for e in data["edges"]:
    s = _fill[e["from"]]
    dst[s] = e["to"]
    wgt[s] = e["weight"]
    _fill[e["from"]] = s + 1
del _degree, _fill

queries = data["queries"]
Q = len(queries)
q_src = [q["source"] for q in queries]
q_dst = [q["destination"] for q in queries]
q_id = [q["id"] for q in queries]

# Group query indices by source
_groups = {}
for i, s in enumerate(q_src):
    _groups.setdefault(s, []).append(i)

dist = [INF] * V
prev = [-1] * V
seen = [0] * V  # epoch stamp: valid iff seen[v] == cur
_cur = 0

def kernel():
    global _cur
    out_dist = [None] * Q
    out_path = [None] * Q
    heappush = heapq.heappush
    heappop = heapq.heappop
    for src, idxs in _groups.items():
        _cur += 1
        cur = _cur
        # distinct destinations still unsettled
        remaining = set()
        for i in idxs:
            d = q_dst[i]
            if d != src:
                remaining.add(d)
        dist[src] = 0
        seen[src] = cur
        prev[src] = -1
        # queries with source == destination resolve trivially
        heap = [(0, src)]
        rem = len(remaining)
        is_target = remaining  # set lookup
        while heap and rem:
            cost, node = heappop(heap)
            if seen[node] != cur or cost != dist[node]:
                continue
            if node in is_target:
                # node settled optimally; remove (may appear once)
                is_target.discard(node)
                rem -= 1
                if rem == 0:
                    break
            base = offsets[node]
            end = offsets[node + 1]
            dn = dist[node]
            for ei in range(base, end):
                to = dst[ei]
                nc = dn + wgt[ei]
                if seen[to] != cur or nc < dist[to]:
                    if seen[to] != cur:
                        seen[to] = cur
                    dist[to] = nc
                    prev[to] = node
                    heappush(heap, (nc, to))
        for i in idxs:
            d = q_dst[i]
            if d == src:
                out_dist[i] = 0
                out_path[i] = [src]
            elif seen[d] != cur:
                out_dist[i] = None
                out_path[i] = []
            else:
                out_dist[i] = dist[d]
                # reconstruct path src..d
                rev = []
                x = d
                while x != -1:
                    rev.append(x)
                    if x == src:
                        break
                    x = prev[x]
                rev.reverse()
                out_path[i] = rev
    return [{"queryId": q_id[i], "distance": out_dist[i], "path": out_path[i]} for i in range(Q)]

if arg("--protocol-version") != "2.0.0": raise ValueError("unsupported protocol version")
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
