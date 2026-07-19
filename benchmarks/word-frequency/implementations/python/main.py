import json, hashlib, sys, time
from collections import Counter

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

with open(arg("--input")) as f:
    data = json.load(f)

words = data["words"]

def kernel(words):
    freq = Counter(words)
    entries = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    h = hashlib.sha256()
    for w, c in entries:
        h.update(f"{w},{c}\n".encode())
    checksum = h.hexdigest()
    top_words = [{"word": w, "count": c} for w, c in entries[:10]]
    return {
        "benchmark": "word-frequency",
        "version": 1,
        "totalWords": len(words),
        "uniqueWords": len(entries),
        "topWords": top_words,
        "checksum": checksum,
    }

result = kernel(words)

samples = []
warmup = int(arg("--warmup"))
iterations = int(arg("--iterations"))
_perf = time.perf_counter_ns
for i in range(-warmup, iterations):
    start = _perf()
    kernel(words)
    elapsed = _perf() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(result, f)
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
