import json, hashlib, sys

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

with open(arg("--input")) as f:
    data = json.load(f)

n = data["dimension"]
a = data["left"]
b = data["right"]

def kernel():
    c = [0] * (n * n)
    value_sum = 0
    diagonal_sum = 0
    for i in range(n):
        for j in range(n):
            s = 0
            for k in range(n):
                s += a[i * n + k] * b[k * n + j]
            c[i * n + j] = s
            value_sum += s
            if i == j:
                diagonal_sum += s
    parts = ["dimension=" + str(n) + "\n"]
    append = parts.append
    for v in c:
        append(str(v) + ",")
    append("\n")
    checksum = hashlib.sha256("".join(parts).encode()).hexdigest()
    return {
        "benchmark": "matrix-multiplication",
        "version": 1,
        "dimension": n,
        "elementCount": n * n,
        "valueSum": value_sum,
        "diagonalSum": diagonal_sum,
        "checksum": checksum,
    }

output = kernel()

samples = []
warmup = int(arg("--warmup"))
iterations = int(arg("--iterations"))
for i in range(-warmup, iterations):
    start = __import__("time").perf_counter_ns()
    kernel()
    elapsed = __import__("time").perf_counter_ns() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(output, f)
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
