import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string" },
    output: { type: "string" },
    "protocol-version": { type: "string" },
    behavior: { type: "string" }
  }
});

const payload = { benchmark: "fake", version: 1, value: 42 };
const bytes = Buffer.from(JSON.stringify(payload));
const digest = createHash("sha256").update(bytes).digest("hex");

process.stdout.write(`${JSON.stringify({ type: "ready", protocolVersion: "2.0.0" })}\n${values.behavior === "extra-output" ? "unexpected output\n" : ""}`);

for await (const line of process.stdin) {
  const message = JSON.parse(String(line));
  if (message.type === "run") {
    process.stdout.write(`${JSON.stringify({ type: "result", requestId: message.requestId, digest })}\n`);
  } else if (message.type === "finish") {
    writeFileSync(values.output, bytes);
    process.stdout.write(`${JSON.stringify({ type: "finish", digest })}\n`);
    if (values.behavior === "nonzero-exit") process.exitCode = 7;
    break;
  }
}
