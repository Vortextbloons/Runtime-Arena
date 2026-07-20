# Minimal protocol workers

Tiny implementations that return fixed JSON. Use them to learn the harness
protocol or verify tooling without running a full benchmark kernel.

## Run conformance

```bash
npm run build:cli
npm run arena -- protocol test --language javascript --minimal
```

Test a real benchmark implementation:

```bash
npm run arena -- protocol test --language rust --benchmark nbody
```

## Layout

| Language | Entry | Helper source |
|----------|-------|---------------|
| JavaScript | `javascript/main.mjs` | `languages/protocol/worker.mjs` |
| TypeScript | `typescript/index.ts` | compiles to same pattern as JS |
| Python | `python/main.py` | `languages/protocol/worker.py` |
| Go | `go/main.go` | `languages/protocol/go` module |
| Rust | `rust/src/main.rs` | `languages/protocol/rust` crate |
| C | `c/main.c` | `languages/c/include/protocol.h` |
| C++ | `cpp/main.cpp` | `languages/c/include/protocol.h` |
| C# | `c-sharp/Program.cs` | `languages/protocol/Worker.cs` |
| Java | `java/Main.java` | `languages/protocol/Protocol.java` |
| LuaJIT | `lua/main.lua` | copy `languages/protocol/worker.lua` + `json.lua`/`sha256.lua` from nbody |
| Lua | `lua-interpreted/main.lua` | same as LuaJIT |

Expected output JSON (compact):

```json
{"benchmark":"minimal","version":1,"value":42}
```

The checker is **not** invoked for minimal workers — only the harness protocol is tested.
