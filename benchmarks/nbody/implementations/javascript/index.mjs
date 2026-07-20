import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { readFile, writeFile } from "node:fs/promises";

const PROTOCOL_VERSION = "2.0.0";
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (arg("--protocol-version") !== PROTOCOL_VERSION) throw new Error(`unsupported protocol version ${arg("--protocol-version")}`);

const input = JSON.parse(await readFile(arg("--input"), "utf8"));
const n = input.bodies.length;
const dt = input.deltaTime;
const steps = input.steps;
const inputBuf = new Float64Array(n * 7);
for (let i = 0; i < n; i++) {
  const b = input.bodies[i];
  const o = i * 7;
  inputBuf[o] = b.mass;
  inputBuf[o + 1] = b.position[0];
  inputBuf[o + 2] = b.position[1];
  inputBuf[o + 3] = b.position[2];
  inputBuf[o + 4] = b.velocity[0];
  inputBuf[o + 5] = b.velocity[1];
  inputBuf[o + 6] = b.velocity[2];
}

function kernel(buf) {
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < n; i++) {
      const bi = i * 7;
      const bix = buf[bi], bi1 = buf[bi + 1], bi2 = buf[bi + 2], bi3 = buf[bi + 3];
      for (let j = i + 1; j < n; j++) {
        const bj = j * 7;
        const dj0 = buf[bj + 1] - bi1, dj1 = buf[bj + 2] - bi2, dj2 = buf[bj + 3] - bi3;
        const r2 = dj0 * dj0 + dj1 * dj1 + dj2 * dj2;
        const m = dt / (r2 * Math.sqrt(r2));
        const mj = buf[bj] * m, mi = bix * m;
        buf[bi + 4] += dj0 * mj; buf[bi + 5] += dj1 * mj; buf[bi + 6] += dj2 * mj;
        buf[bj + 4] -= dj0 * mi; buf[bj + 5] -= dj1 * mi; buf[bj + 6] -= dj2 * mi;
      }
    }
    for (let i = 0; i < n; i++) {
      const bi = i * 7;
      buf[bi + 1] += dt * buf[bi + 4];
      buf[bi + 2] += dt * buf[bi + 5];
      buf[bi + 3] += dt * buf[bi + 6];
    }
  }
  let energy = 0;
  for (let i = 0; i < n; i++) {
    const bi = i * 7;
    const mx = buf[bi], px = buf[bi + 1], py = buf[bi + 2], pz = buf[bi + 3];
    const vx = buf[bi + 4], vy = buf[bi + 5], vz = buf[bi + 6];
    energy += 0.5 * mx * (vx * vx + vy * vy + vz * vz);
    for (let j = i + 1; j < n; j++) {
      const bj = j * 7;
      const dx = px - buf[bj + 1], dy = py - buf[bj + 2], dz = pz - buf[bj + 3];
      energy -= mx * buf[bj] / Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  const psArr = new Array(n * 3);
  const vsArr = new Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 7;
    const j = i * 3;
    psArr[j] = buf[o + 1].toFixed(9);
    psArr[j + 1] = buf[o + 2].toFixed(9);
    psArr[j + 2] = buf[o + 3].toFixed(9);
    vsArr[j] = buf[o + 4].toFixed(9);
    vsArr[j + 1] = buf[o + 5].toFixed(9);
    vsArr[j + 2] = buf[o + 6].toFixed(9);
  }
  const ps = psArr.join(",") + ",";
  const vs = vsArr.join(",") + ",";
  const hash = (s) => createHash("sha256").update(s).digest("hex");
  return { benchmark: "nbody", version: 1, bodyCount: n, finalEnergy: energy, positionChecksum: hash(ps), velocityChecksum: hash(vs) };
}

const digestOutput = (output) => createHash("sha256").update(JSON.stringify(output)).digest("hex");
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");

emit({ type: "ready", protocolVersion: PROTOCOL_VERSION });
const rl = createInterface({ input: process.stdin });
let output;
for await (const line of rl) {
  const request = JSON.parse(line);
  if (request.type === "run") {
    output = kernel(new Float64Array(inputBuf));
    emit({ type: "result", requestId: request.requestId, digest: digestOutput(output) });
  } else if (request.type === "finish") {
    const digest = digestOutput(output);
    await writeFile(arg("--output"), JSON.stringify(output));
    emit({ type: "finish", digest });
    break;
  }
}
