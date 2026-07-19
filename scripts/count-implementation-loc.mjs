import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const benchmarksRoot = path.join(root, "benchmarks");
const outputPath = path.join(root, "web", "src", "lib", "data", "implementation-lines.json");

const SKIP_DIRS = new Set(["node_modules", "target", "dist", "build", "__pycache__", ".arena"]);
const SKIP_FILES = new Set(["package-lock.json", "Cargo.lock", "go.sum"]);
const SOURCE_EXTENSIONS = new Set([
	".rs",
	".go",
	".py",
	".lua",
	".ts",
	".js",
	".mjs",
	".java",
	".cpp",
	".c",
	".h",
	".hpp"
]);

/** @param {string} extension */
function commentStyleForExtension(extension) {
	if (extension === ".py" || extension === ".lua") return "hash";
	return "c";
}

/**
 * Count non-empty logical source lines after stripping comments.
 * @param {string} source
 * @param {"hash" | "c"} style
 */
export function countLogicalLines(source, style) {
	const lines = source.replace(/\r\n/g, "\n").split("\n");
	let total = 0;
	let block = false;

	for (const rawLine of lines) {
		let line = rawLine;
		if (style === "c") {
			if (block) {
				const end = line.indexOf("*/");
				if (end >= 0) {
					line = line.slice(end + 2);
					block = false;
				} else {
					continue;
				}
			}
			while (true) {
				const start = line.indexOf("/*");
				if (start < 0) break;
				const end = line.indexOf("*/", start + 2);
				if (end >= 0) line = `${line.slice(0, start)}${line.slice(end + 2)}`;
				else {
					line = line.slice(0, start);
					block = true;
					break;
				}
			}
			const slash = line.indexOf("//");
			if (slash >= 0) line = line.slice(0, slash);
		} else {
			const hash = line.indexOf("#");
			if (hash >= 0) line = line.slice(0, hash);
		}
		if (line.trim().length > 0) total += 1;
	}

	return total;
}

/**
 * @param {string} directory
 * @returns {Promise<{ logicalLines: number; files: string[] }>}
 */
export async function countImplementationDirectory(directory) {
	let logicalLines = 0;
	/** @type {string[]} */
	const files = [];

	async function walk(current) {
		for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			if (SKIP_DIRS.has(entry.name)) continue;
			const filePath = path.join(current, entry.name);
			if (entry.isDirectory()) {
				await walk(filePath);
				continue;
			}
			if (SKIP_FILES.has(entry.name)) continue;
			if (entry.name.endsWith(".exe") || entry.name.endsWith(".pyc")) continue;
			const extension = path.extname(entry.name).toLowerCase();
			if (!SOURCE_EXTENSIONS.has(extension)) continue;
			const source = await readFile(filePath, "utf8");
			logicalLines += countLogicalLines(source, commentStyleForExtension(extension));
			files.push(path.relative(directory, filePath).replaceAll("\\", "/"));
		}
	}

	await walk(directory);
	return { logicalLines, files };
}

/**
 * @param {string} benchmarksDir
 */
export async function collectImplementationLines(benchmarksDir = benchmarksRoot) {
	/** @type {Record<string, { logicalLines: number; fileCount: number; files: string[]; sha256: string }>} */
	const cells = {};

	for (const benchmarkEntry of await readdir(benchmarksDir, { withFileTypes: true })) {
		if (!benchmarkEntry.isDirectory()) continue;
		const implementationsDir = path.join(benchmarksDir, benchmarkEntry.name, "implementations");
		let languageEntries = [];
		try {
			languageEntries = await readdir(implementationsDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const languageEntry of languageEntries) {
			if (!languageEntry.isDirectory()) continue;
			const implementationDir = path.join(implementationsDir, languageEntry.name);
			const counted = await countImplementationDirectory(implementationDir);
			if (!counted.files.length) continue;
			const sha256 = createHash("sha256")
				.update(counted.files.map((file) => `${file}\n`).join(""))
				.update(String(counted.logicalLines))
				.digest("hex");
			cells[`${benchmarkEntry.name}:${languageEntry.name}`] = {
				logicalLines: counted.logicalLines,
				fileCount: counted.files.length,
				files: counted.files,
				sha256
			};
		}
	}

	return cells;
}

async function main() {
	const cells = await collectImplementationLines();
	const manifest = {
		version: 1,
		generatedAt: new Date().toISOString(),
		cells
	};
	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
	console.log(`Wrote ${path.relative(root, outputPath)} (${Object.keys(cells).length} cells)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
