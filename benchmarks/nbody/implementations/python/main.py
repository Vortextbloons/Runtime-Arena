import json, hashlib, sys, math

def arg(name):
    return sys.argv[sys.argv.index(name) + 1]

def respond(obj):
    sys.stdout.write(json.dumps(obj, separators=(',', ':')) + '\n')
    sys.stdout.flush()

def digest(obj):
    return hashlib.sha256(json.dumps(obj, separators=(',', ':')).encode()).hexdigest()

with open(arg("--input")) as f:
    data = json.load(f)

bodies_input = data["bodies"]
n = len(bodies_input)
dt = data["deltaTime"]
steps = data["steps"]
SQRT = math.sqrt

def build_state():
    buf = [0.0] * (n * 7)
    for i in range(n):
        b = bodies_input[i]
        base = i * 7
        buf[base] = b["mass"]
        buf[base + 1] = b["position"][0]
        buf[base + 2] = b["position"][1]
        buf[base + 3] = b["position"][2]
        buf[base + 4] = b["velocity"][0]
        buf[base + 5] = b["velocity"][1]
        buf[base + 6] = b["velocity"][2]
    return buf

def simulate(buf):
    _dt = dt
    _sqrt = SQRT
    for _ in range(steps):
        i = 0
        bi = 0
        while i < n - 1:
            mi = buf[bi]
            pix = buf[bi + 1]
            piy = buf[bi + 2]
            piz = buf[bi + 3]
            vix = buf[bi + 4]
            viy = buf[bi + 5]
            viz = buf[bi + 6]
            j = i + 1
            bj = j * 7
            while j < n:
                mj = buf[bj]
                dx = buf[bj + 1] - pix
                dy = buf[bj + 2] - piy
                dz = buf[bj + 3] - piz
                r2 = dx * dx + dy * dy + dz * dz
                m = _dt / (r2 * _sqrt(r2))
                dxm = dx * m
                dym = dy * m
                dzm = dz * m
                vix += dxm * mj
                viy += dym * mj
                viz += dzm * mj
                buf[bj + 4] -= dxm * mi
                buf[bj + 5] -= dym * mi
                buf[bj + 6] -= dzm * mi
                j += 1
                bj += 7
            buf[bi + 4] = vix
            buf[bi + 5] = viy
            buf[bi + 6] = viz
            i += 1
            bi += 7
        i = 0
        base = 0
        while i < n:
            buf[base + 1] += _dt * buf[base + 4]
            buf[base + 2] += _dt * buf[base + 5]
            buf[base + 3] += _dt * buf[base + 6]
            i += 1
            base += 7

def compute_result(buf):
    energy = 0.0
    pos_parts = []
    vel_parts = []
    append_pos = pos_parts.append
    append_vel = vel_parts.append
    for i in range(n):
        base = i * 7
        mass = buf[base]
        px = buf[base + 1]
        py = buf[base + 2]
        pz = buf[base + 3]
        vx = buf[base + 4]
        vy = buf[base + 5]
        vz = buf[base + 6]
        append_pos(f"{px:.9f},{py:.9f},{pz:.9f},")
        append_vel(f"{vx:.9f},{vy:.9f},{vz:.9f},")
        energy += 0.5 * mass * (vx * vx + vy * vy + vz * vz)
        for j in range(i + 1, n):
            bj = j * 7
            dx = px - buf[bj + 1]
            dy = py - buf[bj + 2]
            dz = pz - buf[bj + 3]
            energy -= mass * buf[bj] / SQRT(dx * dx + dy * dy + dz * dz)
    return {
        "benchmark": "nbody",
        "version": 1,
        "bodyCount": n,
        "finalEnergy": energy,
        "positionChecksum": hashlib.sha256("".join(pos_parts).encode()).hexdigest(),
        "velocityChecksum": hashlib.sha256("".join(vel_parts).encode()).hexdigest(),
    }

def kernel(buf):
    simulate(buf)
    return compute_result(buf)

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
        state = build_state()
        last = kernel(state)
        respond({"type": "result", "requestId": req["requestId"], "digest": digest(last)})
