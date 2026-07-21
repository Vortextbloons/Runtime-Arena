import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const input = JSON.parse(await readFile(arg("--input"), "utf8"));
const words = input.words;

function kernel(words) {
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const entries = [...freq.entries()];
  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const lines = new Array(entries.length);
  for (let i = 0; i < entries.length; i++) {
    const [w, c] = entries[i];
    lines[i] = w + "," + c;
  }
  const checksum = createHash("sha256").update(lines.join("\n") + "\n").digest("hex");
  const topWords = entries.slice(0, 10).map(([word, count]) => ({ word, count }));
  return { benchmark: "word-frequency", version: 1, totalWords: words.length, uniqueWords: entries.length, topWords, checksum };
}

const digestOutput = (output) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output;
for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "run") {
    output = kernel(words);
    emit({ type: "result", requestId: request.requestId, digest: digestOutput(output) });
  } else if (request.type === "finish") {
    const digest = digestOutput(output);
    await writeFile(arg("--output"), JSON.stringify(output));
    emit({ type: "finish", digest });
    break;
  }
}
