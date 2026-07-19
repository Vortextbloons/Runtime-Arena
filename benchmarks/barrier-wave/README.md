# Barrier Wave

Barrier Wave measures steady-state structured parallel concurrency through a
persistent worker pool, deterministic fan-out/fan-in, and a barrier between
every phase.

Each worker owns a fixed shard. During every phase it applies a 32-bit integer
mixing kernel to that shard and returns a local XOR and sum. The coordinator
reduces results in worker-ID order, updates the seed and rolling digest, and
only then starts the next phase.

Worker creation and shutdown are outside the kernel timing boundary.
Communication, computation, synchronization, waiting, and reduction are
inside it. Implementations must use real parallel workers; event-loop tasks,
coroutines, or a serial loop do not satisfy the benchmark.

See [IMPLEMENTING.md](IMPLEMENTING.md) for the complete language-independent
contract. Checker validation and committed datasets are in place. Language
implementations under `implementations/` are in progress and not yet complete
across all five arena languages.
