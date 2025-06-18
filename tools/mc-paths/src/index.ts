import { existsSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";

export interface PathResolution {
  exists: boolean;
  fullPath: string;
  namespace: string;
  path: string;
  isVanilla: boolean;
  isNamespaced: boolean;
}

// dynamic vanilla asset loaders with fallbacks
let cachedVanillaFunctions: {
  isVanillaTexture: (ref: string) => boolean;
  isVanillaModel: (ref: string) => boolean;
} | null = null;

async function getVanillaAssetFunctions(): Promise<{
  isVanillaTexture: (ref: string) => boolean;
  isVanillaModel: (ref: string) => boolean;
}> {
  if (cachedVanillaFunctions) {
    return cachedVanillaFunctions;
  }

  try {
    const modulePath = join(
      process.cwd(),
      "tools",
      "mc-paths",
      "src",
      "vanilla-assets.generated.ts"
    );
    if (existsSync(modulePath)) {
      const module = await import(modulePath);
      cachedVanillaFunctions = {
        isVanillaTexture: module.isVanillaTexture,
        isVanillaModel: module.isVanillaModel,
      };
      return cachedVanillaFunctions;
    }
  } catch {
    // fallback if import fails
  }

  // fallback functions when generated assets don't exist
  // optimistic approach - assume minecraft: references are valid
  cachedVanillaFunctions = {
    isVanillaTexture: (ref: string) => ref.startsWith("minecraft:"),
    isVanillaModel: (ref: string) => ref.startsWith("minecraft:"),
  };

  return cachedVanillaFunctions;
}

export async function resolveTexturePath(
  packDir: string,
  textureRef: string
): Promise<Result<PathResolution, string>> {
  try {
    const { isVanillaTexture } = await getVanillaAssetFunctions();

    // Check if texture reference is properly namespaced
    const isNamespaced = textureRef.includes(":");

    // Handle namespace:path format (e.g., "minecraft:item/book")
    let namespace = "minecraft";
    let path = textureRef;

    if (isNamespaced) {
      const parts = textureRef.split(":", 2);
      namespace = parts[0] || "minecraft";
      path = parts[1] || textureRef;
    }

    // Check if it's a vanilla texture
    const isVanilla = isVanillaTexture(textureRef);

    // Construct the full path
    const fullPath = join(packDir, "assets", namespace, "textures", `${path}.png`);

    return ok({
      exists: existsSync(fullPath),
      fullPath,
      namespace,
      path,
      isVanilla,
      isNamespaced,
    });
  } catch (error: any) {
    return err(`Failed to resolve texture path for ${textureRef}: ${error.message}`);
  }
}

export async function resolveModelPath(
  packDir: string,
  modelRef: string
): Promise<Result<PathResolution, string>> {
  try {
    const { isVanillaModel } = await getVanillaAssetFunctions();

    // Check if model reference is properly namespaced
    const isNamespaced = modelRef.includes(":");

    // Handle namespace:path format (e.g., "minecraft:item/book")
    let namespace = "minecraft";
    let path = modelRef;

    if (isNamespaced) {
      const parts = modelRef.split(":", 2);
      namespace = parts[0] || "minecraft";
      path = parts[1] || modelRef;
    }

    // Check if it's a vanilla model
    const isVanilla = isVanillaModel(modelRef);

    // Construct the full path
    const fullPath = join(packDir, "assets", namespace, "models", `${path}.json`);

    return ok({
      exists: existsSync(fullPath),
      fullPath,
      namespace,
      path,
      isVanilla,
      isNamespaced,
    });
  } catch (error: any) {
    return err(`Failed to resolve model path for ${modelRef}: ${error.message}`);
  }
}

export function resolveBlockstatePath(packDir: string, blockstateRef: string): PathResolution {
  // Handle namespace:path format (e.g., "minecraft:stone")
  let namespace = "minecraft";
  let path = blockstateRef;

  if (blockstateRef.includes(":")) {
    const parts = blockstateRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || blockstateRef;
  }

  // Construct the full path
  const fullPath = join(packDir, "assets", namespace, "blockstates", `${path}.json`);

  return {
    exists: existsSync(fullPath),
    fullPath,
    namespace,
    path,
    isVanilla: false,
    isNamespaced: path.includes(":"),
  };
}

export function normalizeMinecraftPath(path: string): string {
  // Remove common prefixes that might be in texture references
  return path
    .replace(/^block\//, "")
    .replace(/^item\//, "")
    .replace(/^entity\//, "");
}
