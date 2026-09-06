import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.cwd(), "dist");
const forbiddenNames = new Set([".dev.vars", ".env", ".env.local", ".DS_Store"]);

async function sanitize(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (forbiddenNames.has(entry.name) || entry.name.startsWith(".env.")) {
      await rm(path, { recursive: entry.isDirectory(), force: true });
      return;
    }
    if (entry.isDirectory()) await sanitize(path);
  }));
}

await sanitize(outputDirectory);
