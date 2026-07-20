# Harness protocol helpers (measurement contract 2.0.0)

Reusable building blocks for benchmark workers. Each implementation still owns its
kernel; helpers handle argument parsing, NDJSON stdin/stdout, and SHA-256 digests.

## Contract summary

1. Parse `--input`, `--output`, `--protocol-version 2.0.0` before timing.
2. Emit one line: `{"type":"ready","protocolVersion":"2.0.0"}`.
3. For each harness `run` message, execute the kernel and reply with
   `{"type":"result","requestId":n,"digest":"<sha256-hex>"}` where the digest is
   the SHA-256 of the **compact JSON bytes** for that iteration's result object.
4. On `finish`, write the last result bytes to `--output` and emit
   `{"type":"finish","digest":"<same-as-last-result>"}`.

Logs and diagnostics go to **stderr** only.

## Helpers by language family

| Family | File | Notes |
|--------|------|-------|
| JavaScript / TypeScript | [`worker.mjs`](worker.mjs) | Node `import`; TypeScript can compile against it or copy |
| Python | [`worker.py`](worker.py) | `from worker import run_worker` (copy or add to `PYTHONPATH`) |
| Go | [`go/`](go/) | `go.mod` module `runtime-arena/protocol`; see `examples/minimal-workers/go` |
| Rust | [`rust/`](rust/) | Path dependency; see `examples/minimal-workers/rust` |
| C / C++ | [`../c/include/protocol.h`](../c/include/protocol.h) | Header-only helpers; include from implementations |
| C# | [`Worker.cs`](Worker.cs) | Copy into implementation directory |
| Java | [`Protocol.java`](Protocol.java) | Copy into implementation directory |
| Lua / LuaJIT | [`worker.lua`](worker.lua) | `dofile` or copy beside `main.lua` |

## Minimal workers

See [`examples/minimal-workers/`](../../examples/minimal-workers/). Each language
has a tiny program that returns fixed JSON — useful when learning the protocol or
running `arena protocol test`.

## Conformance testing

```bash
npm run build:cli
npm run arena -- protocol test --language javascript
npm run arena -- protocol test --language rust --benchmark nbody
```

Diagnoses missing `ready`, digest mismatches, malformed JSON, and manifest gaps.

## Provenance defaults

New language manifests can omit an explicit `provenance` block. The CLI merges
defaults from [`provenance.defaults.json`](provenance.defaults.json) and always
adds a `runtime` probe from `detect` when no probes are declared.
