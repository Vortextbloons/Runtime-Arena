import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (n) => process.argv[process.argv.indexOf(n) + 1];
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const csv = (await readFile(arg("--input"), "utf8")).trim().split(/\r?\n/);
const rows = [];
for (let i = 1; i < csv.length; i++) {
  const row = csv[i];
  let end = row.indexOf(",");
  let start = end + 1;
  end = row.indexOf(",", start);
  const accountId = row.substring(start, end);
  start = end + 1;
  end = row.indexOf(",", start);
  const category = row.substring(start, end);
  start = end + 1;
  end = row.indexOf(",", start);
  const quantity = +row.substring(start, end);
  start = end + 1;
  const unitPrice = +row.substring(start);
  rows.push({ accountId, category, quantity, unitPrice });
}

function kernel() {
  let totalQuantity = 0, totalValueMinorUnits = 0, min = Number.MAX_SAFE_INTEGER, max = 0;
  const cm = new Map(), am = new Map();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], q = row.quantity, v = q * row.unitPrice;
    totalQuantity += q;
    totalValueMinorUnits += v;
    if (v < min) min = v;
    if (v > max) max = v;
    let x = cm.get(row.category);
    if (!x) { x = { quantity: 0, valueMinorUnits: 0 }; cm.set(row.category, x); }
    x.quantity += q;
    x.valueMinorUnits += v;
    let acct = am.get(row.accountId);
    if (acct === undefined) acct = 0;
    am.set(row.accountId, acct + v);
  }
  const cats = [];
  for (const [category, x] of cm.entries()) cats.push({ category, quantity: x.quantity, valueMinorUnits: x.valueMinorUnits });
  cats.sort((a, b) => a.category.localeCompare(b.category));
  const accts = [];
  for (const [k, v] of am.entries()) accts.push({ k, v });
  accts.sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const top = [];
  for (let i = 0; i < 10 && i < accts.length; i++) top.push({ accountId: accts[i].k, valueMinorUnits: accts[i].v });
  let cstr = '{"Categories":[';
  for (let i = 0; i < cats.length; i++) {
    if (i > 0) cstr += ",";
    cstr += '{"category":"' + cats[i].category + '","quantity":' + cats[i].quantity + ',"valueMinorUnits":' + cats[i].valueMinorUnits + "}";
  }
  cstr += '],"TopAccounts":[';
  for (let i = 0; i < top.length; i++) {
    if (i > 0) cstr += ",";
    cstr += '{"accountId":"' + top[i].accountId + '","valueMinorUnits":' + top[i].valueMinorUnits + "}";
  }
  cstr += "]}";
  cstr += "\n";
  const checksum = createHash("sha256").update(cstr).digest("hex");
  return { benchmark: "aggregation", version: 1, recordCount: rows.length, totalQuantity, totalValueMinorUnits, categories: cats, topAccounts: top, minimumTransactionMinorUnits: min, maximumTransactionMinorUnits: max, checksum };
}

const digestOutput = (output) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output;
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
