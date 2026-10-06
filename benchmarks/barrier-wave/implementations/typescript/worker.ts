import { parentPort } from "node:worker_threads";
let wId = 0, ipw = 0, rpi = 0, wMul = 0, base = 0;
parentPort!.on("message", (msg: { cmd: string; workerId?: number; itemsPerWorker?: number; roundsPerItem?: number; phaseSeed?: number }) => {
  if (msg.cmd === "init") {
    wId = msg.workerId!; ipw = msg.itemsPerWorker!; rpi = msg.roundsPerItem!;
    wMul = Math.imul(wId, 0x9e3779b9) >>> 0;
    base = (wId * ipw) >>> 0;
  } else if (msg.cmd === "work") {
    const phaseSeed = msg.phaseSeed! >>> 0;
    const n = ipw, rounds = rpi;
    const n4 = n - (n & 3);
    let x0 = 0, x1 = 0, x2 = 0, x3 = 0;
    let lx = 0, lsLo = 0, lsHi = 0;
    // 4-wide unrolled items: four independent chains feed the ILP window.
    for (let it = 0; it < n4; it += 4) {
      const b = (base + it) >>> 0;
      x0 = (phaseSeed ^ b ^ wMul) >>> 0;
      x1 = (phaseSeed ^ ((b + 1) >>> 0) ^ wMul) >>> 0;
      x2 = (phaseSeed ^ ((b + 2) >>> 0) ^ wMul) >>> 0;
      x3 = (phaseSeed ^ ((b + 3) >>> 0) ^ wMul) >>> 0;
      for (let r = 0; r < rounds; r++) {
        x0 = (x0 ^ (x0 << 13)) >>> 0; x0 = (x0 ^ (x0 >>> 17)) >>> 0; x0 = (x0 ^ (x0 << 5)) >>> 0; x0 = (Math.imul(x0, 0x9e3779b1) + 0x85ebca77) >>> 0;
        x1 = (x1 ^ (x1 << 13)) >>> 0; x1 = (x1 ^ (x1 >>> 17)) >>> 0; x1 = (x1 ^ (x1 << 5)) >>> 0; x1 = (Math.imul(x1, 0x9e3779b1) + 0x85ebca77) >>> 0;
        x2 = (x2 ^ (x2 << 13)) >>> 0; x2 = (x2 ^ (x2 >>> 17)) >>> 0; x2 = (x2 ^ (x2 << 5)) >>> 0; x2 = (Math.imul(x2, 0x9e3779b1) + 0x85ebca77) >>> 0;
        x3 = (x3 ^ (x3 << 13)) >>> 0; x3 = (x3 ^ (x3 >>> 17)) >>> 0; x3 = (x3 ^ (x3 << 5)) >>> 0; x3 = (Math.imul(x3, 0x9e3779b1) + 0x85ebca77) >>> 0;
      }
      lx ^= x0 ^ x1 ^ x2 ^ x3;
      // Accumulate the 64-bit sum with exact unsigned carry (values stay
      // below 2^33, so doubles hold them exactly).
      let old: number = lsLo >>> 0, s: number = (old + x0) >>> 0;
      lsLo = s | 0; if (s < old) lsHi = (lsHi + 1) | 0;
      old = lsLo >>> 0; s = (old + x1) >>> 0;
      lsLo = s | 0; if (s < old) lsHi = (lsHi + 1) | 0;
      old = lsLo >>> 0; s = (old + x2) >>> 0;
      lsLo = s | 0; if (s < old) lsHi = (lsHi + 1) | 0;
      old = lsLo >>> 0; s = (old + x3) >>> 0;
      lsLo = s | 0; if (s < old) lsHi = (lsHi + 1) | 0;
    }
    for (let it = n4; it < n; it++) {
      const gid = (base + it) >>> 0;
      let x = (phaseSeed ^ gid ^ wMul) >>> 0;
      for (let r = 0; r < rounds; r++) {
        x = (x ^ (x << 13)) >>> 0; x = (x ^ (x >>> 17)) >>> 0; x = (x ^ (x << 5)) >>> 0;
        x = (Math.imul(x, 0x9e3779b1) + 0x85ebca77) >>> 0;
      }
      lx ^= x;
      const old: number = lsLo >>> 0, s: number = (old + x) >>> 0;
      lsLo = s | 0; if (s < old) lsHi = (lsHi + 1) | 0;
    }
    parentPort!.postMessage({ workerId: wId, localXor: lx, localSumLo: lsLo, localSumHi: lsHi });
  }
});
