import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

export const PROTOCOL_VERSION = "2.0.0";

export function arg(name, argv = process.argv) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) throw new Error(`missing ${name}`);
  return argv[index + 1];
}

export function digestBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function digestJson(value) {
  return digestBytes(Buffer.from(JSON.stringify(value)));
}

export function emitLine(value) {
  const line = typeof value === "string" ? value : JSON.stringify(value);
  process.stdout.write(`${line}\n`);
}

/**
 * Run the harness protocol loop.
 * @param {{ inputPath: string, outputPath: string, kernel: () => unknown }} options
 */
export async function runWorker({ inputPath, outputPath, kernel }) {
  if (arg("--protocol-version") !== PROTOCOL_VERSION) {
    throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);
  }

  await readFile(inputPath, "utf8");
  emitLine({ type: "ready", protocolVersion: PROTOCOL_VERSION });

  const reader = createInterface({ input: process.stdin });
  let lastBytes = Buffer.alloc(0);

  for await (const line of reader) {
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.type === "run") {
      lastBytes = Buffer.from(JSON.stringify(kernel()));
      emitLine({ type: "result", requestId: message.requestId, digest: digestBytes(lastBytes) });
    } else if (message.type === "finish") {
      await writeFile(outputPath, lastBytes);
      emitLine({ type: "finish", digest: digestBytes(lastBytes) });
      break;
    } else {
      throw new Error(`unknown protocol message type ${message.type}`);
    }
  }
}
