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
            c_local[i_base + j] = 0
        for k in _range(_n):
            a_ik = a_local[i_base + k]
            for j in _range(_n):
                c_local[i_base + j] += a_ik * b_local[k * _n + j]
        for j in _range(_n):
            value_sum += c_local[i_base + j]
            if i == j:
                diagonal_sum += c_local[i_base + j]
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
