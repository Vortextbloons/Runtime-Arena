import hashlib
import json
import multiprocessing as mp
import sys

MASK32 = 0xFFFFFFFF
MASK64 = 0xFFFFFFFFFFFFFFFF
MIX_MUL = 0x9E3779B1
MIX_ADD = 0x85EBCA77


def arg(name: str) -> str:
    try:
        return sys.argv[sys.argv.index(name) + 1]
    except (ValueError, IndexError) as exc:
        raise ValueError(f"missing required argument: {name}") from exc


def compact_json_bytes(obj: object) -> bytes:
    return json.dumps(obj, separators=(",", ":")).encode()


def respond(obj: object) -> None:
    sys.stdout.buffer.write(compact_json_bytes(obj) + b"\n")
    sys.stdout.buffer.flush()


def compute_shard_r4(phase_seed: int, bases: tuple[int, ...]) -> tuple[int, int]:
    """Specialized hot path for the current barrier-wave fixtures (4 rounds)."""
    lx = 0
    ls = 0
    mask = MASK32
    mul = MIX_MUL
    add = MIX_ADD

    for base in bases:
        x = phase_seed ^ base

        x ^= x << 13
        x &= mask
        x ^= x >> 17
        x ^= x << 5
        x &= mask
        x = (x * mul + add) & mask

        x ^= x << 13
        x &= mask
        x ^= x >> 17
        x ^= x << 5
        x &= mask
        x = (x * mul + add) & mask

        x ^= x << 13
        x &= mask
        x ^= x >> 17
        x ^= x << 5
        x &= mask
        x = (x * mul + add) & mask

        x ^= x << 13
        x &= mask
        x ^= x >> 17
        x ^= x << 5
        x &= mask
        x = (x * mul + add) & mask

        lx ^= x
        ls += x

    return lx, ls & MASK64


def compute_shard_generic(
    phase_seed: int, bases: tuple[int, ...], rounds_per_item: int
) -> tuple[int, int]:
    lx = 0
    ls = 0
    mask = MASK32
    mul = MIX_MUL
    add = MIX_ADD
    rounds = range(rounds_per_item)

    for base in bases:
        x = phase_seed ^ base
        for _ in rounds:
            x ^= x << 13
            x &= mask
            # x is already 32-bit, so this right-shift XOR cannot exceed 32 bits.
            x ^= x >> 17
            x ^= x << 5
            x &= mask
            x = (x * mul + add) & mask
        lx ^= x
        ls += x

    return lx, ls & MASK64


def worker(
    worker_id: int,
    items_per_worker: int,
    rounds_per_item: int,
    phase_seed,
    start_sem,
    done_sem,
    ready_sem,
    stopping,
    results,
) -> None:
    worker_mul = (worker_id * 0x9E3779B9) & MASK32
    first_gid = worker_id * items_per_worker

    # Input-invariant preparation is completed before the parent emits `ready`.
    bases = tuple(
        (((first_gid + local_id) & MASK32) ^ worker_mul)
        for local_id in range(items_per_worker)
    )
    compute = compute_shard_r4 if rounds_per_item == 4 else None
    ready_sem.release()

    while True:
        start_sem.acquire()
        if stopping.value:
            return

        seed = phase_seed.value
        if compute is not None:
            local_xor, local_sum = compute(seed, bases)
        else:
            local_xor, local_sum = compute_shard_generic(
                seed, bases, rounds_per_item
            )

        offset = worker_id * 2
        results[offset] = local_xor
        results[offset + 1] = local_sum
        done_sem.release()


def rotate_left64(value: int, shift: int) -> int:
    return ((value << shift) | (value >> (64 - shift))) & MASK64


def main() -> None:
    if arg("--protocol-version") != "2.0.0":
        raise ValueError("unsupported protocol version")

    with open(arg("--input"), encoding="utf-8") as input_file:
        data = json.load(input_file)

    worker_count = int(data["workerCount"])
    phase_count = int(data["phaseCount"])
    items_per_worker = int(data["itemsPerWorker"])
    rounds_per_item = int(data["roundsPerItem"])
    initial_seed = int(data["initialSeed"], 16)
    output_path = arg("--output")

    if worker_count <= 0 or phase_count < 0 or items_per_worker < 0 or rounds_per_item < 0:
        raise ValueError("barrier-wave counts must be non-negative and workerCount positive")

    ctx = mp.get_context()
    phase_seed = ctx.RawValue("I", 0)
    stopping = ctx.RawValue("I", 0)
    results = ctx.RawArray("Q", worker_count * 2)
    start_sems = [ctx.Semaphore(0) for _ in range(worker_count)]
    done_sem = ctx.Semaphore(0)
    ready_sem = ctx.Semaphore(0)

    processes = [
        ctx.Process(
            target=worker,
            args=(
                worker_id,
                items_per_worker,
                rounds_per_item,
                phase_seed,
                start_sems[worker_id],
                done_sem,
                ready_sem,
                stopping,
                results,
            ),
        )
        for worker_id in range(worker_count)
    ]

    for process in processes:
        process.start()

    # Worker process creation and shard preparation are outside the timed kernel.
    for _ in range(worker_count):
        ready_sem.acquire()

    worker_ids = range(worker_count)
    items_processed = worker_count * phase_count * items_per_worker

    def kernel() -> dict[str, object]:
        seed = initial_seed
        digest64 = 0x6A09E667F3BCC909

        for phase in range(phase_count):
            phase_seed.value = seed
            for start_sem in start_sems:
                start_sem.release()

            # This is the phase barrier: every worker must finish before reduction.
            for _ in worker_ids:
                done_sem.acquire()

            next_seed = (seed ^ phase) & MASK32
            phase_sum = 0

            # Deterministic reduction order is worker ID 0..N-1.
            for worker_id in worker_ids:
                offset = worker_id * 2
                local_xor = results[offset]
                local_sum = results[offset + 1]

                mixed = (
                    next_seed
                    ^ local_xor
                    ^ (local_sum & MASK32)
                    ^ (local_sum >> 32)
                    ^ worker_id
                )
                mixed ^= mixed >> 16
                mixed = (mixed * 0x21F0AAAD) & MASK32
                mixed ^= mixed >> 15
                mixed = (mixed * 0x735A2D97) & MASK32
                mixed ^= mixed >> 15
                next_seed = mixed & MASK32
                phase_sum += local_sum

            seed = next_seed
            digest64 = rotate_left64(digest64, 7)
            digest64 ^= next_seed
            digest64 = (digest64 + phase_sum) & MASK64

        return {
            "schemaVersion": "1.0.0",
            "benchmark": "barrier-wave",
            "workerCount": worker_count,
            "phaseCount": phase_count,
            "itemsProcessed": items_processed,
            "finalSeed": f"{seed:08x}",
            "digest": f"{digest64:016x}",
        }

    respond({"type": "ready", "protocolVersion": "2.0.0"})

    last_payload: bytes | None = None
    last_digest: str | None = None

    try:
        for line in sys.stdin.buffer:
            request = json.loads(line)
            request_type = request.get("type")

            if request_type == "run":
                result = kernel()
                last_payload = compact_json_bytes(result)
                last_digest = hashlib.sha256(last_payload).hexdigest()
                respond(
                    {
                        "type": "result",
                        "requestId": request["requestId"],
                        "digest": last_digest,
                    }
                )
                continue

            if request_type == "finish":
                if last_payload is None or last_digest is None:
                    raise ValueError("finish received before any run")
                with open(output_path, "wb") as output_file:
                    output_file.write(last_payload)
                respond({"type": "finish", "digest": last_digest})
                break

            raise ValueError(f"unsupported request type: {request_type!r}")
    finally:
        stopping.value = 1
        for start_sem in start_sems:
            start_sem.release()
        for process in processes:
            process.join(timeout=1.0)
            if process.is_alive():
                process.terminate()
                process.join()


if __name__ == "__main__":
    mp.freeze_support()
    main()