import { existsSync } from "node:fs";
import { join } from "node:path";

export interface PathResolution {
  exists: boolean;
  fullPath?: string;
  namespace?: string;
  path?: string;
}

export function resolveTexturePath(
  packDir: string,
  textureRef: string
): PathResolution {
  // Handle namespace:path format (e.g., "minecraft:item/book")
  let namespace = "minecraft";
  let path = textureRef;

  if (textureRef.includes(":")) {
    const parts = textureRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || textureRef;
  }

  // Construct the full path
  const fullPath = join(
    packDir,
    "assets",
    namespace,
    "textures",
    `${path}.png`
  );

  return {
    exists: existsSync(fullPath),
    fullPath,
    namespace,
    path,
  };
}

export function resolveModelPath(
  packDir: string,
  modelRef: string
): PathResolution {
  // Handle namespace:path format (e.g., "minecraft:item/book")
  let namespace = "minecraft";
  let path = modelRef;

  if (modelRef.includes(":")) {
    const parts = modelRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || modelRef;
  }

  // Construct the full path
  const fullPath = join(packDir, "assets", namespace, "models", `${path}.json`);

  return {
    exists: existsSync(fullPath),
    fullPath,
    namespace,
    path,
  };
}

export function resolveBlockstatePath(
  packDir: string,
  blockstateRef: string
): PathResolution {
  // Handle namespace:path format (e.g., "minecraft:stone")
  let namespace = "minecraft";
  let path = blockstateRef;

  if (blockstateRef.includes(":")) {
    const parts = blockstateRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || blockstateRef;
  }

  // Construct the full path
  const fullPath = join(
    packDir,
    "assets",
    namespace,
    "blockstates",
    `${path}.json`
  );

  return {
    exists: existsSync(fullPath),
    fullPath,
    namespace,
    path,
  };
}

export function normalizeMinecraftPath(path: string): string {
  // Remove common prefixes that might be in texture references
  return path
    .replace(/^block\//, "")
    .replace(/^item\//, "")
    .replace(/^entity\//, "");
}
