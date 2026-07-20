import csv, json, sys, hashlib
from collections import defaultdict

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

def digest(obj):
    return hashlib.sha256(json.dumps(obj, separators=(',', ':')).encode()).hexdigest()

with open(arg("--input"), newline="") as f:
    reader = csv.reader(f)
    next(reader)
    rows = [(r[1], r[2], int(r[3]), int(r[4])) for r in reader if len(r) >= 5]

def kernel():
    total_quantity = total_value = 0
    minimum = float("inf")
    maximum = 0
    categories = defaultdict(lambda: [0, 0])
    accounts = defaultdict(int)
    for account, category, quantity, price in rows:
        value = quantity * price
        total_quantity += quantity
        total_value += value
        if value < minimum:
            minimum = value
        if value > maximum:
            maximum = value
        e = categories[category]
        e[0] += quantity
        e[1] += value
        accounts[account] += value
    category_list = [{"category": k, "quantity": v[0], "valueMinorUnits": v[1]} for k, v in sorted(categories.items())]
    top = sorted(accounts.items(), key=lambda x: (-x[1], x[0]))[:10]
    top_accounts = [{"accountId": k, "valueMinorUnits": v} for k, v in top]
    checksum = hashlib.sha256((json.dumps({"Categories": category_list, "TopAccounts": top_accounts}, separators=(",", ":")) + "\n").encode()).hexdigest()
    return {
        "benchmark": "aggregation",
        "version": 1,
        "recordCount": len(rows),
        "totalQuantity": total_quantity,
        "totalValueMinorUnits": total_value,
        "categories": category_list,
        "topAccounts": top_accounts,
        "minimumTransactionMinorUnits": int(minimum),
        "maximumTransactionMinorUnits": maximum,
        "checksum": checksum,
    }

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
