import json
import multiprocessing as mp
import struct
import sys
import time

MASK32 = 0xFFFFFFFF
MASK64 = 0xFFFFFFFFFFFFFFFF


def worker(wid, items_per_worker, rounds_per_item, conn):
    worker_mul = (wid * 0x9E3779B9) & MASK32
    seed_buf = bytearray(4)
    result_buf = bytearray(12)
    try:
        while True:
            conn.recv_bytes_into(seed_buf)
            phase_seed = struct.unpack('<I', seed_buf)[0]
            lx = 0
            ls = 0
            for li in range(items_per_worker):
                gid = (wid * items_per_worker + li) & MASK32
                x = (phase_seed ^ gid ^ worker_mul) & MASK32
                for _ in range(rounds_per_item):
                    x = (x ^ (x << 13)) & MASK32
                    x = (x ^ (x >> 17)) & MASK32
                    x = (x ^ (x << 5)) & MASK32
                    x = (x * 0x9E3779B1 + 0x85EBCA77) & MASK32
                lx ^= x
                ls = (ls + x) & MASK64
            struct.pack_into('<IQ', result_buf, 0, lx, ls)
            conn.send_bytes(result_buf)
    except EOFError:
        pass
    finally:
        conn.close()


def rotate_left64(x, n):
    return ((x << n) | (x >> (64 - n))) & MASK64


def main():
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
    min_it = int(arg("--min-iterations"))
    max_it = int(arg("--max-iterations"))
    target_ci = float(arg("--target-relative-ci"))

    with open(arg("--input")) as f:
        data = json.load(f)

    wc = data["workerCount"]
    pc = data["phaseCount"]
    iwp = data["itemsPerWorker"]
    rpi = data["roundsPerItem"]

    parent_conns = []
    child_conns = []
    for _ in range(wc):
        parent, child = mp.Pipe(duplex=True)
        parent_conns.append(parent)
        child_conns.append(child)

    procs = []
    for w in range(wc):
        p = mp.Process(target=worker, args=(w, iwp, rpi, child_conns[w]))
        procs.append(p)
        p.start()

    for conn in child_conns:
        conn.close()

    def kernel():
        ps = int(data["initialSeed"], 16)
        d = 0x6A09E667F3BCC909
        seed_buf = bytearray(4)
        result_buf = bytearray(12)
        for phase in range(pc):
            struct.pack_into('<I', seed_buf, 0, ps)
            for conn in parent_conns:
                conn.send_bytes(seed_buf)
            ns = (ps ^ phase) & MASK32
            psum = 0
            for w in range(wc):
                parent_conns[w].recv_bytes_into(result_buf)
                lx, ls = struct.unpack('<IQ', result_buf)
                t = ns ^ lx ^ (ls & MASK32) ^ ((ls >> 32) & MASK32) ^ w
                t = (t ^ (t >> 16)) & MASK32
                t = (t * 0x21F0AAAD) & MASK32
                t = (t ^ (t >> 15)) & MASK32
                t = (t * 0x735A2D97) & MASK32
                t = (t ^ (t >> 15)) & MASK32
                ns = t
                psum = (psum + ls) & MASK64
            ps = ns
            d = rotate_left64(d, 7)
            d ^= ns
            d = (d + psum) & MASK64
        return {
            "schemaVersion": "1.0.0",
            "benchmark": "barrier-wave",
            "workerCount": wc,
            "phaseCount": pc,
            "itemsProcessed": wc * pc * iwp,
            "finalSeed": f"{ps:08x}",
            "digest": f"{d:016x}",
        }

    samples = []
    output = None
    times = []
    for i in range(-int(arg("--warmup")), 10**9):
        start = time.perf_counter_ns()
        output = kernel()
        elapsed = time.perf_counter_ns() - start
        if i >= 0:
            times.append(elapsed)
            samples.append({"iteration": len(samples) + 1, "kernelTimeNanoseconds": max(1, elapsed)})
            if len(times) >= max_it or (len(times) >= min_it and _ci_w(times) <= target_ci):
                break

    for conn in parent_conns:
        conn.close()
    for p in procs:
        p.join()

    with open(arg("--output"), "w") as f:
        json.dump(output, f)
    with open(arg("--timing-output"), "w") as f:
        json.dump({"samples": samples}, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
