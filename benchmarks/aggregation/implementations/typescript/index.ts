import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (n: string) => process.argv[process.argv.indexOf(n) + 1]!;
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const csv = (await readFile(arg("--input"), "utf8")).trim().split(/\r?\n/);
// Structure-of-arrays: sequential numeric scans stay in dense fast storage
// and avoid per-row object shapes in the hot loop.
const n = csv.length - 1;
const accountIds: string[] = new Array(n);
const categoriesArr: string[] = new Array(n);
const quantities: number[] = new Array(n);
const prices: number[] = new Array(n);
for (let i = 1; i < csv.length; i++) {
  const row = csv[i];
  let end = row.indexOf(",");
  let start = end + 1;
  end = row.indexOf(",", start);
  accountIds[i - 1] = row.substring(start, end);
  start = end + 1;
  end = row.indexOf(",", start);
  categoriesArr[i - 1] = row.substring(start, end);
  start = end + 1;
  end = row.indexOf(",", start);
  quantities[i - 1] = +row.substring(start, end);
  start = end + 1;
  prices[i - 1] = +row.substring(start);
}

const lt = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function kernel() {
  let totalQuantity = 0, totalValueMinorUnits = 0, min = Number.MAX_SAFE_INTEGER, max = 0;
  const cm = new Map<string, { quantity: number; valueMinorUnits: number }>(), am = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const q = quantities[i], v = q * prices[i];
    totalQuantity += q;
    totalValueMinorUnits += v;
    if (v < min) min = v;
    if (v > max) max = v;
    const cat = categoriesArr[i];
    let x = cm.get(cat);
    if (x === undefined) { x = { quantity: 0, valueMinorUnits: 0 }; cm.set(cat, x); }
    x.quantity += q;
    x.valueMinorUnits += v;
    const id = accountIds[i];
    const acct = am.get(id);
    am.set(id, acct === undefined ? v : acct + v);
  }
  const cats: { category: string; quantity: number; valueMinorUnits: number }[] = [];
  for (const [category, x] of cm.entries()) cats.push({ category, quantity: x.quantity, valueMinorUnits: x.valueMinorUnits });
  // Ordinal compare: localeCompare drags in ICU collation for ASCII keys.
  cats.sort((a, b) => lt(a.category, b.category));
  const accts: { k: string; v: number }[] = [];
  for (const [k, v] of am.entries()) accts.push({ k, v });
  accts.sort((a, b) => b.v - a.v || lt(a.k, b.k));
  const top: { accountId: string; valueMinorUnits: number }[] = [];
  for (let i = 0; i < 10 && i < accts.length; i++) top.push({ accountId: accts[i].k, valueMinorUnits: accts[i].v });
  const parts: string[] = ['{"Categories":['];
  for (let i = 0; i < cats.length; i++) {
    if (i > 0) parts.push(",");
    const c = cats[i];
    parts.push('{"category":"', c.category, '","quantity":', String(c.quantity), ',"valueMinorUnits":', String(c.valueMinorUnits), "}");
  }
  parts.push('],"TopAccounts":[');
  for (let i = 0; i < top.length; i++) {
    if (i > 0) parts.push(",");
    const t = top[i];
    parts.push('{"accountId":"', t.accountId, '","valueMinorUnits":', String(t.valueMinorUnits), "}");
  }
  parts.push("]}\n");
  const checksum = createHash("sha256").update(parts.join("")).digest("hex");
  return { benchmark: "aggregation", version: 1, recordCount: n, totalQuantity, totalValueMinorUnits, categories: cats, topAccounts: top, minimumTransactionMinorUnits: min, maximumTransactionMinorUnits: max, checksum };
}

const digestOutput = (output: unknown) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output!: ReturnType<typeof kernel>;
for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "run") {
    output = kernel();
    emit({ type: "result", requestId: request.requestId, digest: digestOutput(output) });
  } else if (request.type === "finish") {
    const digest = digestOutput(output);
    await writeFile(arg("--output"), JSON.stringify(output));
    emit({ type: "finish", digest });
    break;
  }
}
