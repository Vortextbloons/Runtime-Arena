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
min_it = int(arg("--min-iterations"))
max_it = int(arg("--max-iterations"))
target_ci = float(arg("--target-relative-ci"))
_perf = time.perf_counter_ns
times = []
for i in range(-warmup, 10**9):
    start = _perf()
    kernel()
    elapsed = _perf() - start
    if i >= 0:
        times.append(elapsed)
        samples.append({"iteration": len(samples) + 1, "kernelTimeNanoseconds": elapsed})
        if len(times) >= max_it or (len(times) >= min_it and _ci_w(times) <= target_ci):
            break

with open(arg("--output"), "w") as f:
    json.dump(output, f)
with open(arg("--timing-output"), "w") as f:
    json.dump({"samples": samples}, f, separators=(",", ":"))
