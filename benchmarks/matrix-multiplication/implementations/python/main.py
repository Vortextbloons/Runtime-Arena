import json, hashlib, sys, time

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

with open(arg("--input")) as f:
    data = json.load(f)

n = data["dimension"]
a = data["left"]
b = data["right"]

_nn = n * n
_range = range
_str = str

def kernel():
    c = [0] * _nn
    value_sum = 0
    diagonal_sum = 0
    a_local = a
    b_local = b
    c_local = c
    _n = n
    for i in _range(_n):
        i_base = i * _n
        for j in _range(_n):
            s = 0
            for k in _range(_n):
                s += a_local[i_base + k] * b_local[k * _n + j]
            c_local[i_base + j] = s
            value_sum += s
            if i == j:
                diagonal_sum += s
    h = hashlib.sha256()
    h.update(f"dimension={_n}\n".encode())
    _str_v = _str
    for v in c_local:
        h.update(_str_v(v).encode())
        h.update(b',')
    h.update(b'\n')
    checksum = h.hexdigest()
    return {
        "benchmark": "matrix-multiplication",
        "version": 1,
        "dimension": _n,
        "elementCount": _nn,
        "valueSum": value_sum,
        "diagonalSum": diagonal_sum,
        "checksum": checksum,
    }

output = kernel()

samples = []
warmup = int(arg("--warmup"))
iterations = int(arg("--iterations"))
_perf = time.perf_counter_ns
for i in range(-warmup, iterations):
    start = _perf()
    kernel()
    elapsed = _perf() - start
    if i >= 0:
        samples.append({"iteration": i + 1, "kernelTimeNanoseconds": elapsed})

with open(arg("--output"), "w") as f:
    json.dump(output, f)
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
