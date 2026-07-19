import json, hashlib, sys, time

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

with open(arg("--input")) as f:
    data = json.load(f)

words = data["words"]

def kernel(words):
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    entries = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
    checksum_data = "".join(f"{w},{c}\n" for w, c in entries)
    checksum = hashlib.sha256(checksum_data.encode()).hexdigest()
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
for i in range(-warmup, iterations):
    start = time.perf_counter_ns()
    kernel(words)
    elapsed = time.perf_counter_ns() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(result, f)
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
