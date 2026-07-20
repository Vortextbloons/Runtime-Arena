import { runWorker } from "../../../languages/protocol/worker.mjs";

await runWorker({
  inputPath: process.argv[process.argv.indexOf("--input") + 1],
  outputPath: process.argv[process.argv.indexOf("--output") + 1],
  kernel: () => ({ benchmark: "minimal", version: 1, value: 42 })
});
