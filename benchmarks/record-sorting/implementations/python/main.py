import json, hashlib, sys

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
    for r in recs:
        parts.append(f"{r['id']},{r['score']},{r['timestamp']}\n")
    checksum = hashlib.sha256("".join(parts).encode()).hexdigest()
    return {
        "benchmark": "record-sorting",
        "version": 1,
        "recordCount": n,
        "firstRecords": first,
        "lastRecords": last,
        "checksum": checksum,
    }

import time

samples = []
warmup = int(arg("--warmup"))
iterations = int(arg("--iterations"))
output = None
for i in range(-warmup, iterations):
    state = [dict(r) for r in records_input]
    start = time.perf_counter_ns()
    output = kernel(state)
    elapsed = time.perf_counter_ns() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(output, f, separators=(",", ":"))
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
