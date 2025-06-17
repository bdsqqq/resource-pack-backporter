import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

export function walkAssets(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];

  try {
    for (const file of readdirSync(dir)) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        files.push(...walkAssets(full));
      } else {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

export function walkModels(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];

  try {
    for (const file of readdirSync(dir)) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        files.push(...walkModels(full));
      } else if (extname(full) === ".json" && full.includes("/models/")) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

export function walkTextures(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];

  try {
    for (const file of readdirSync(dir)) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        files.push(...walkTextures(full));
      } else if (extname(full) === ".png" && full.includes("/textures/")) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}

export function walkBlockstates(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];

  try {
    for (const file of readdirSync(dir)) {
      const full = join(dir, file);
      if (statSync(full).isDirectory()) {
        files.push(...walkBlockstates(full));
      } else if (extname(full) === ".json" && full.includes("/blockstates/")) {
        files.push(full);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return files;
}
