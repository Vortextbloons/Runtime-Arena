import json, hashlib, sys

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

def kernel(recs):
    recs.sort(key=lambda r: (-r["score"], r["timestamp"], r["id"]))
    n = len(recs)
    take = min(n, 10)
    first = recs[:take]
    last = recs[n - take:]
    parts = []
    append = parts.append
    for r in recs:
        append(f"{r['id']},{r['score']},{r['timestamp']}\n")
    checksum = hashlib.sha256("".join(parts).encode()).hexdigest()
    return {
        "benchmark": "record-sorting",
        "version": 1,
        "recordCount": n,
        "firstRecords": first,
        "lastRecords": last,
        "checksum": checksum,
    }

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
        state = [dict(r) for r in records_input]
        last = kernel(state)
        respond({"type": "result", "requestId": req["requestId"], "digest": digest(last)})
