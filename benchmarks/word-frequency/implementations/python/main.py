import json, hashlib, sys
from collections import Counter

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

def digest(obj):
    return hashlib.sha256(json.dumps(obj, separators=(',', ':')).encode()).hexdigest()

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
        last = kernel(words)
        respond({"type": "result", "requestId": req["requestId"], "digest": digest(last)})
