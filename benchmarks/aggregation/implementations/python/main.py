import csv, json, sys, hashlib
from functools import partial

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

_dumps = partial(json.dumps, separators=(",", ":"))
_sha256 = hashlib.sha256

def digest(obj):
    return _sha256(_dumps(obj).encode()).hexdigest()

with open(arg("--input"), newline="") as f:
    reader = csv.reader(f)
    next(reader)
    rows = [(r[1], r[2], int(r[3]), int(r[4])) for r in reader if len(r) >= 5]

def kernel():
    total_quantity = 0
    total_value = 0
    minimum = 1 << 62
    maximum = 0
    # Plain dicts of mutable cells: single hash lookup per key on the hot
    # path (no defaultdict factory, no load-then-store double hashing).
    categories = {}
    cget = categories.get
    accounts = {}
    aget = accounts.get
    for account, category, quantity, price in rows:
        value = quantity * price
        total_quantity += quantity
        total_value += value
        if value < minimum:
            minimum = value
        if value > maximum:
            maximum = value
        e = cget(category)
        if e is None:
            e = [0, 0]
            categories[category] = e
        e[0] += quantity
        e[1] += value
        a = aget(account)
        if a is None:
            accounts[account] = [value]
        else:
            a[0] += value
    category_list = [{"category": k, "quantity": v[0], "valueMinorUnits": v[1]} for k, v in sorted(categories.items())]
    top = sorted(accounts.items(), key=lambda x: (-x[1][0], x[0]))[:10]
    top_accounts = [{"accountId": k, "valueMinorUnits": v[0]} for k, v in top]
    checksum = _sha256((_dumps({"Categories": category_list, "TopAccounts": top_accounts}) + "\n").encode()).hexdigest()
    return {
        "benchmark": "aggregation",
        "version": 1,
        "recordCount": len(rows),
        "totalQuantity": total_quantity,
        "totalValueMinorUnits": total_value,
        "categories": category_list,
        "topAccounts": top_accounts,
        "minimumTransactionMinorUnits": minimum,
        "maximumTransactionMinorUnits": maximum,
        "checksum": checksum,
    }

if arg("--protocol-version") != "2.0.0": raise ValueError("unsupported protocol version")
respond({"type": "ready", "protocolVersion": "2.0.0"})
last = None
last_digest = ""
loads = json.loads
for line in sys.stdin:
    req = loads(line)
    if req["type"] == "finish":
        with open(arg("--output"), "w") as f:
            f.write(_dumps(last))
        respond({"type": "finish", "digest": last_digest})
        break
    if req["type"] == "run":
        last = kernel()
        last_digest = digest(last)
        respond({"type": "result", "requestId": req["requestId"], "digest": last_digest})
