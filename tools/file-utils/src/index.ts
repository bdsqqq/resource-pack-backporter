import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { err, ok, type Result } from "neverthrow";

export async function walkModels(dir: string): Promise<Result<string[], string>> {
  try {
    const files = await walkDirectory(
      dir,
      (file) => extname(file) === ".json" && file.includes("/models/")
    );
    return ok(files);
  } catch (error: any) {
    return err(`Failed to walk models in ${dir}: ${error.message}`);
  }
}

export async function walkTextures(dir: string): Promise<Result<string[], string>> {
  try {
    const files = await walkDirectory(
      dir,
      (file) => extname(file) === ".png" && file.includes("/textures/")
    );
    return ok(files);
  } catch (error: any) {
    return err(`Failed to walk textures in ${dir}: ${error.message}`);
  }
}

export async function walkAssets(dir: string): Promise<Result<string[], string>> {
  try {
    const files = await walkDirectory(dir, () => true);
    return ok(files);
  } catch (error: any) {
    return err(`Failed to walk assets in ${dir}: ${error.message}`);
  }
}

export async function walkBlockstates(dir: string): Promise<Result<string[], string>> {
  try {
    const files = await walkDirectory(
      dir,
      (file) => extname(file) === ".json" && file.includes("/blockstates/")
    );
    return ok(files);
  } catch (error: any) {
    return err(`Failed to walk blockstates in ${dir}: ${error.message}`);
  }
}

async function walkDirectory(dir: string, filter: (file: string) => boolean): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Skip output directories
        if (entry === "dist" || entry === "build" || entry === "out") {
          continue;
        }

        const subFiles = await walkDirectory(fullPath, filter);
        files.push(...subFiles);
      } else if (filter(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch (error: any) {
    // If directory doesn't exist or can't be read, return empty array
    if (error.code === "ENOENT" || error.code === "EACCES") {
      return [];
    }
    throw error;
  }

  return files;
}
