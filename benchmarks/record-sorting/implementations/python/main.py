import json, hashlib, sys, time

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

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

samples = []
warmup = int(arg("--warmup"))
iterations = int(arg("--iterations"))
_perf = time.perf_counter_ns
output = None
for i in range(-warmup, iterations):
    state = [dict(r) for r in records_input]
    start = _perf()
    output = kernel(state)
    elapsed = _perf() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(output, f, separators=(",", ":"))
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
