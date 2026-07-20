import { createHash } from "node:crypto";
import { access, chmod, copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", "__pycache__", ".arena"]);

async function pathExists(file: string) {
  return access(file).then(() => true, () => false);
}

export class RunnerCache {
  private readonly fileBytes = new Map<string, Buffer>();
  private readonly datasetHashes = new Map<string, string>();
  private readonly treeBytes = new Map<string, Buffer>();

  constructor(private readonly root: string) {}

  async readFile(file: string): Promise<Buffer> {
    const key = path.resolve(file);
    if (!this.fileBytes.has(key)) this.fileBytes.set(key, await readFile(key));
    return this.fileBytes.get(key)!;
  }

  async sha256(file: string): Promise<string> {
    const key = path.resolve(file);
    if (!this.datasetHashes.has(key)) {
      this.datasetHashes.set(key, createHash("sha256").update(await this.readFile(file)).digest("hex"));
    }
    return this.datasetHashes.get(key)!;
  }

  private async collectTreeBytes(directory: string, relativeRoot: string, chunks: Buffer[]) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await this.collectTreeBytes(file, relativeRoot, chunks);
      else if (!entry.name.endsWith(".exe") && !entry.name.endsWith(".pyc")) {
        chunks.push(Buffer.from(path.relative(relativeRoot, file).replaceAll("\\", "/")));
        chunks.push(await this.readFile(file));
      }
    }
  }

  async appendTreeHash(directory: string, hash: ReturnType<typeof createHash>, relativeRoot = this.root) {
    if (!await pathExists(directory)) return;
    const key = `${path.resolve(relativeRoot)}\0${path.resolve(directory)}`;
    let bytes = this.treeBytes.get(key);
    if (!bytes) {
      const chunks: Buffer[] = [];
      await this.collectTreeBytes(directory, relativeRoot, chunks);
      bytes = Buffer.concat(chunks);
      this.treeBytes.set(key, bytes);
    }
    hash.update(bytes);
  }
}

export async function stageIsolatedDatasets(
  cells: Array<{ benchmark: { id: string }; input: string }>,
  tempRoot: string
): Promise<Map<string, string>> {
  const staged = new Map<string, string>();
  for (const cell of cells) {
    if (staged.has(cell.input)) continue;
    const dest = path.join(tempRoot, "datasets", cell.benchmark.id, path.basename(cell.input));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(cell.input, dest);
    await chmod(dest, 0o444);
    staged.set(cell.input, dest);
  }
  return staged;
}
