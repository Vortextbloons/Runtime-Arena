import json, hashlib, sys, time

_T=[0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045]
def _ci_w(samples):
    n=len(samples)
    if n<2: return float("inf")
    mean=sum(samples)/n
    if mean<=0: return float("inf")
    var=sum((x-mean)**2 for x in samples)/(n-1)
    t=_T[n] if n<len(_T) else 2
    return 2*t*(var/n)**0.5/mean
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
min_it = int(arg("--min-iterations"))
max_it = int(arg("--max-iterations"))
target_ci = float(arg("--target-relative-ci"))
_perf = time.perf_counter_ns
output = None
times = []
for i in range(-warmup, 10**9):
    state = [dict(r) for r in records_input]
    start = _perf()
    output = kernel(state)
    elapsed = _perf() - start
    if i >= 0:
        times.append(elapsed)
        samples.append({"iteration": len(samples) + 1, "kernelTimeNanoseconds": elapsed})
        if len(times) >= max_it or (len(times) >= min_it and _ci_w(times) <= target_ci):
            break

with open(arg("--output"), "w") as f:
    json.dump(output, f, separators=(",", ":"))
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
