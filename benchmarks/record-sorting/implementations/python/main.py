import json, hashlib, sys
from collections import deque

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

def digest(obj):
    return hashlib.sha256(json.dumps(obj, separators=(',', ':')).encode()).hexdigest()

with open(arg("--input")) as f:
    data = json.load(f)

records_input = data["records"]
del data

n = len(records_input)
ids = [0] * n
scores = [0] * n
tss = [0] * n
for i, r in enumerate(records_input):
    ids[i] = r["id"]
    scores[i] = r["score"]
    tss[i] = r["timestamp"]
del records_input

if n:
    smin = min(scores)
    smax = max(scores)
else:
    smin = smax = 0
span = smax - smin + 1
# Counting-sort buckets only pay off for a modest score range; otherwise
# fall back to a single C-speed tuple sort (still no per-element key func).
use_bucket = span <= 2000000

def finish_output(record_count, first, tail, checksum):
    return {
        "benchmark": "record-sorting",
        "version": 1,
        "recordCount": record_count,
        "firstRecords": first,
        "lastRecords": list(tail),
        "checksum": checksum,
    }

def kernel_bucket():
    sc = scores
    ts = tss
    il = ids
    off = smin
    bk = [[] for _ in range(span)]
    for i in range(n):
        bk[sc[i] - off].append((ts[i], il[i]))
    for b in bk:
        if len(b) > 1:
            b.sort()
    take = n if n < 10 else 10
    first = []
    tail = deque(maxlen=take if take else 1)
    parts = []
    ap = parts.append
    fap = first.append
    tap = tail.append
    got = 0
    for o in range(span - 1, -1, -1):
        b = bk[o]
        if not b:
            continue
        s = o + off
        for t, i in b:
            ap(f"{i},{s},{t}\n")
            if got < take:
                fap({"id": i, "score": s, "timestamp": t})
                got += 1
            tap({"id": i, "score": s, "timestamp": t})
    checksum = hashlib.sha256("".join(parts).encode()).hexdigest()
    if take == 0:
        tail.clear()
    return finish_output(n, first, tail, checksum)

def kernel_generic():
    sc = scores
    ts = tss
    il = ids
    tmp = [(-sc[i], ts[i], il[i]) for i in range(n)]
    tmp.sort()
    take = n if n < 10 else 10
    first = []
    tail = deque(maxlen=take if take else 1)
    parts = []
    ap = parts.append
    fap = first.append
    tap = tail.append
    got = 0
    for ns, t, i in tmp:
        s = -ns
        ap(f"{i},{s},{t}\n")
        if got < take:
            fap({"id": i, "score": s, "timestamp": t})
            got += 1
        tap({"id": i, "score": s, "timestamp": t})
    checksum = hashlib.sha256("".join(parts).encode()).hexdigest()
    if take == 0:
        tail.clear()
    return finish_output(n, first, tail, checksum)

kernel = kernel_bucket if use_bucket else kernel_generic

if arg("--protocol-version") != "2.0.0": raise ValueError("unsupported protocol version")
respond({"type": "ready", "protocolVersion": "2.0.0"})
last = None
for line in sys.stdin:
    req = json.loads(line)
    if req["type"] == "finish":
        with open(arg("--output"), "w") as f:
            json.dump(last, f, separators=(",", ":"))
        respond({"type": "finish", "digest": digest(last)})
        break
    if req["type"] == "run":
        last = kernel()
        respond({"type": "result", "requestId": req["requestId"], "digest": digest(last)})
