import hashlib
import json
import sys


def arg(name: str) -> str:
    try:
        return sys.argv[sys.argv.index(name) + 1]
    except (ValueError, IndexError) as exc:
        raise ValueError(f"missing required argument: {name}") from exc


def compact(obj: object) -> bytes:
    return json.dumps(obj, separators=(",", ":")).encode()


def respond(obj: object) -> None:
    sys.stdout.buffer.write(compact(obj) + b"\n")
    sys.stdout.buffer.flush()


def digest_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


if arg("--protocol-version") != "2.0.0":
    raise ValueError("unsupported protocol version")

with open(arg("--input"), encoding="utf-8") as input_file:
    data = json.load(input_file)

n = int(data["dimension"])
a = data["left"]
b = data["right"]
nn = n * n
output_path = arg("--output")


def kernel() -> dict[str, object]:
    # Transpose B (O(n^2)) so the cubic loop streams both operands sequentially.
    bt = [0] * nn
    for i in range(n):
        base = i * n
        row = b[base : base + n]
        for j in range(n):
            bt[j * n + i] = row[j]

    # Row/row dot products, 4x unrolled to cut interpreter loop overhead.
    c = [0] * nn
    k_lim = n & ~3
    for i in range(n):
        abase = i * n
        arow = a[abase : abase + n]
        cbase = i * n
        for j in range(n):
            bbase = j * n
            s0 = s1 = s2 = s3 = 0
            for k in range(0, k_lim, 4):
                s0 += arow[k] * bt[bbase + k]
                s1 += arow[k + 1] * bt[bbase + k + 1]
                s2 += arow[k + 2] * bt[bbase + k + 2]
                s3 += arow[k + 3] * bt[bbase + k + 3]
            s = (s0 + s1) + (s2 + s3)
            for k in range(k_lim, n):
                s += arow[k] * bt[bbase + k]
            c[cbase + j] = s

    # Sums and checksum body run in C speed (sum/map/join/sha256).
    value_sum = sum(c)
    diagonal_sum = 0
    for i in range(n):
        diagonal_sum += c[i * n + i]
    payload = ("dimension=%d\n" % n).encode() + (",".join(map(str, c)) + ",\n").encode()
    checksum = hashlib.sha256(payload).hexdigest()
    return {
        "benchmark": "matrix-multiplication",
        "version": 1,
        "dimension": n,
        "elementCount": nn,
        "valueSum": value_sum,
        "diagonalSum": diagonal_sum,
        "checksum": checksum,
    }


respond({"type": "ready", "protocolVersion": "2.0.0"})

last_payload: bytes | None = None
last_digest: str | None = None

for line in sys.stdin.buffer:
    if not line.strip():
        continue
    request = json.loads(line)
    request_type = request.get("type")
    if request_type == "run":
        last_payload = compact(kernel())
        last_digest = digest_bytes(last_payload)
        respond({"type": "result", "requestId": request["requestId"], "digest": last_digest})
    elif request_type == "finish":
        if last_payload is None or last_digest is None:
            raise ValueError("finish received before any run")
        with open(output_path, "wb") as output_file:
            output_file.write(last_payload)
        respond({"type": "finish", "digest": last_digest})
        break
    else:
        raise ValueError(f"unsupported request type: {request_type!r}")
