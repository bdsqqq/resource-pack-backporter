import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuredTracer } from "@logger/index";
import { err, ok, type Result } from "neverthrow";

// pack_format to minecraft version mapping
// based on https://minecraft.wiki/w/Pack_format
const PACK_FORMAT_VERSION_MAP: Record<number, string> = {
  // Modern versions
  63: "1.21.6",
  55: "1.21.5",
  46: "1.21.4",
  42: "1.21.2",
  34: "1.21",
  32: "1.20.5",
  22: "1.20.3",
  18: "1.20.2",
  15: "1.20",
  13: "1.19.4",
  12: "1.19.3",
  9: "1.19",
  8: "1.18",
  7: "1.17",
  6: "1.16.2",
  5: "1.15",
  // Older versions
  4: "1.13",
  3: "1.11",
  2: "1.9",
  1: "1.6.1",
};

// determine the exact version to use for asset generation
function getAssetVersion(
  packFormat: number,
  supportedFormats?: { min_inclusive: number; max_inclusive: number }
): string {
  // if pack has supported_formats, use the latest version within that range
  if (supportedFormats) {
    const availableFormats = Object.keys(PACK_FORMAT_VERSION_MAP)
      .map(Number)
      .sort((a, b) => b - a);
    for (const format of availableFormats) {
      if (format >= supportedFormats.min_inclusive && format <= supportedFormats.max_inclusive) {
        return PACK_FORMAT_VERSION_MAP[format] || "1.21.5";
      }
    }
  }

  const version = PACK_FORMAT_VERSION_MAP[packFormat];
  if (!version) {
    // fallback to latest supported version for unknown pack formats
    return "1.21.5";
  }

  // use the exact version for accurate asset validation
  return version;
}

export interface PackMetadata {
  pack: {
    pack_format: number;
    description: string;
    supported_formats?: {
      min_inclusive: number;
      max_inclusive: number;
    };
  };
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  url: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  ref: string,
  path = "",
  tracer?: StructuredTracer
): Promise<GitHubTreeItem[]> {
  const span = tracer?.startSpan("GitHub API Fetch");
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;

  span?.setAttributes({ owner, repo, ref, path, url });
  span?.debug("Fetching tree from GitHub API");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const error = `GitHub API error: ${response.status} ${response.statusText}`;
      span?.error(error);
      span?.end({ success: false, status: response.status });
      throw new Error(error);
    }

    const data = (await response.json()) as GitHubTreeResponse;

    if (data.truncated) {
      span?.warn("GitHub tree response was truncated, some files may be missing");
    }

    const filteredItems = data.tree.filter(
      (item) => item.type === "blob" && item.path.startsWith(path)
    );

    span?.info(`Fetched ${filteredItems.length} items from GitHub`);
    span?.end({ success: true, itemCount: filteredItems.length });

    return filteredItems;
  } catch (error: any) {
    span?.error(`Failed to fetch from GitHub: ${error.message}`);
    span?.end({ success: false, error: error.message });
    throw error;
  }
}

function extractAssetName(path: string): string {
  const parts = path.split("/");
  const filename = parts[parts.length - 1];
  if (!filename) {
    throw new Error(`Invalid asset path: ${path}`);
  }
  return filename.replace(/\.(png|json)$/, "");
}

function categorizeTexture(path: string): "block" | "item" | "other" {
  if (path.includes("/textures/block/")) return "block";
  if (path.includes("/textures/item/")) return "item";
  return "other";
}

function categorizeModel(path: string): "block" | "item" | "other" {
  if (path.includes("/models/block/")) return "block";
  if (path.includes("/models/item/")) return "item";
  return "other";
}

async function generateVanillaAssetsInline(
  version: string,
  tracer?: StructuredTracer
): Promise<void> {
  const span = tracer?.startSpan("Asset Generation");
  span?.setAttributes({ version });
  span?.info(`Generating vanilla asset dictionaries for Minecraft ${version}`);

  try {
    // Fetch all texture and model files from minecraft-assets
    const fetchSpan = span?.startChild("Fetch Assets");
    fetchSpan?.info("Fetching texture and model files from GitHub");

    const [textureFiles, modelFiles] = await Promise.all([
      fetchGitHubTree(
        "InventivetalentDev",
        "minecraft-assets",
        version,
        "assets/minecraft/textures/",
        tracer
      ),
      fetchGitHubTree(
        "InventivetalentDev",
        "minecraft-assets",
        version,
        "assets/minecraft/models/",
        tracer
      ),
    ]);

    fetchSpan?.end({
      success: true,
      textureCount: textureFiles.length,
      modelCount: modelFiles.length,
    });

    const processSpan = span?.startChild("Process Assets");
    processSpan?.info("Processing and categorizing assets");

    const blockTextures = new Set<string>();
    const itemTextures = new Set<string>();
    const blockModels = new Set<string>();
    const itemModels = new Set<string>();

    // Process textures
    for (const file of textureFiles) {
      if (!file.path.endsWith(".png")) continue;

      const assetName = extractAssetName(file.path);
      const category = categorizeTexture(file.path);

      if (category === "block") {
        blockTextures.add(assetName);
      } else if (category === "item") {
        itemTextures.add(assetName);
      }
    }

    // Process models
    for (const file of modelFiles) {
      if (!file.path.endsWith(".json")) continue;

      const assetName = extractAssetName(file.path);
      const category = categorizeModel(file.path);

      if (category === "block") {
        blockModels.add(assetName);
      } else if (category === "item") {
        itemModels.add(assetName);
      }
    }

    processSpan?.info(
      `Processed ${blockTextures.size} block textures, ${itemTextures.size} item textures`
    );
    processSpan?.info(`Processed ${blockModels.size} block models, ${itemModels.size} item models`);
    processSpan?.setAttributes({
      blockTextures: blockTextures.size,
      itemTextures: itemTextures.size,
      blockModels: blockModels.size,
      itemModels: itemModels.size,
    });
    processSpan?.end({ success: true });

    // Generate TypeScript file
    const writeSpan = span?.startChild("Write Generated File");
    writeSpan?.info("Writing generated TypeScript file");

    const generatedCode = `// Auto-generated vanilla asset registry for Minecraft ${version}
// Generated on ${new Date().toISOString()}
// DO NOT EDIT MANUALLY - regenerate with: bun run scripts/generate-vanilla-assets.ts

export interface VanillaAssetRegistry {
  textures: {
    blocks: Set<string>;
    items: Set<string>;
  };
  models: {
    blocks: Set<string>;
    items: Set<string>;
  };
  version: string;
}

// Block textures that exist in vanilla minecraft ${version}
const VANILLA_BLOCK_TEXTURES = new Set([
${Array.from(blockTextures)
  .sort()
  .map((name) => `  "${name}"`)
  .join(",\n")}
]);

// Item textures that exist in vanilla minecraft ${version}
const VANILLA_ITEM_TEXTURES = new Set([
${Array.from(itemTextures)
  .sort()
  .map((name) => `  "${name}"`)
  .join(",\n")}
]);

// Block models that exist in vanilla minecraft ${version}
const VANILLA_BLOCK_MODELS = new Set([
${Array.from(blockModels)
  .sort()
  .map((name) => `  "${name}"`)
  .join(",\n")}
]);

// Item models that exist in vanilla minecraft ${version}
const VANILLA_ITEM_MODELS = new Set([
${Array.from(itemModels)
  .sort()
  .map((name) => `  "${name}"`)
  .join(",\n")}
]);

export const VANILLA_ASSETS: VanillaAssetRegistry = {
  textures: {
    blocks: VANILLA_BLOCK_TEXTURES,
    items: VANILLA_ITEM_TEXTURES,
  },
  models: {
    blocks: VANILLA_BLOCK_MODELS,
    items: VANILLA_ITEM_MODELS,
  },
  version: "${version}",
};

export function isVanillaTexture(textureRef: string): boolean {
  // Handle namespace:path format
  let namespace = "minecraft";
  let path = textureRef;
  
  if (textureRef.includes(":")) {
    const parts = textureRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || textureRef;
  }
  
  // Only check minecraft namespace textures
  if (namespace !== "minecraft") {
    return false;
  }
  
  // Remove minecraft: prefix if present for lookup
  const cleanPath = path.replace(/^minecraft:/, "");
  
  // Check if it's a block texture (with block/ prefix)
  if (cleanPath.startsWith("block/")) {
    const blockName = cleanPath.replace(/^block\\//, "");
    return VANILLA_ASSETS.textures.blocks.has(blockName);
  }
  
  // Check if it's an item texture (with item/ prefix)  
  if (cleanPath.startsWith("item/")) {
    const itemName = cleanPath.replace(/^item\\//, "");
    return VANILLA_ASSETS.textures.items.has(itemName);
  }
  
  // For non-prefixed paths, check both block and item textures
  return VANILLA_ASSETS.textures.blocks.has(cleanPath) || 
         VANILLA_ASSETS.textures.items.has(cleanPath);
}

export function isVanillaModel(modelRef: string): boolean {
  // Handle namespace:path format
  let namespace = "minecraft";
  let path = modelRef;
  
  if (modelRef.includes(":")) {
    const parts = modelRef.split(":", 2);
    namespace = parts[0] || "minecraft";
    path = parts[1] || modelRef;
  }
  
  // Only check minecraft namespace models
  if (namespace !== "minecraft") {
    return false;
  }
  
  // Remove minecraft: prefix if present for lookup
  const cleanPath = path.replace(/^minecraft:/, "");
  
  // Check if it's a block model (with block/ prefix)
  if (cleanPath.startsWith("block/")) {
    const blockName = cleanPath.replace(/^block\\//, "");
    return VANILLA_ASSETS.models.blocks.has(blockName);
  }
  
  // Check if it's an item model (with item/ prefix)
  if (cleanPath.startsWith("item/")) {
    const itemName = cleanPath.replace(/^item\\//, "");
    return VANILLA_ASSETS.models.items.has(itemName);
  }
  
  // For non-prefixed paths, check both block and item models
  return VANILLA_ASSETS.models.blocks.has(cleanPath) || 
         VANILLA_ASSETS.models.items.has(cleanPath);
}
`;

    const outputPath = join(
      process.cwd(),
      "tools",
      "mc-paths",
      "src",
      "vanilla-assets.generated.ts"
    );

    // Ensure directory exists
    await mkdir(join(process.cwd(), "tools", "mc-paths", "src"), {
      recursive: true,
    });

    // Write the generated file
    await writeFile(outputPath, generatedCode, "utf-8");

    writeSpan?.info(`Generated vanilla assets file: ${outputPath}`);
    writeSpan?.end({ success: true, outputPath });

    span?.info(`Successfully generated vanilla assets for Minecraft ${version}`);
    span?.end({
      success: true,
      version,
      totalAssets: blockTextures.size + itemTextures.size + blockModels.size + itemModels.size,
    });
  } catch (error: any) {
    span?.error(`Failed to generate vanilla assets: ${error.message}`);
    span?.end({ success: false, error: error.message });
    throw error;
  }
}

export async function ensureVanillaAssetsGenerated(
  packDir: string,
  tracer?: StructuredTracer
): Promise<Result<boolean, string>> {
  const span = tracer?.startSpan("Vanilla Assets Check");

  try {
    // check if generated assets already exist
    const vanillaAssetsPath = join(
      process.cwd(),
      "tools",
      "mc-paths",
      "src",
      "vanilla-assets.generated.ts"
    );

    if (existsSync(vanillaAssetsPath)) {
      span?.debug("Vanilla assets already exist, skipping generation");
      span?.end({ success: true, cached: true });
      return ok(false); // didn't need to generate
    }

    // read pack.mcmeta to determine version
    const packMetaPath = join(packDir, "pack.mcmeta");
    if (!existsSync(packMetaPath)) {
      const error =
        "pack.mcmeta not found - cannot determine minecraft version for asset generation";
      span?.error(error);
      span?.end({ success: false, error });
      return err(error);
    }

    let packMeta: PackMetadata;
    try {
      const packMetaContent = await Bun.file(packMetaPath).text();
      packMeta = JSON.parse(packMetaContent);
    } catch (parseError: any) {
      const error = `Failed to parse pack.mcmeta: ${parseError.message}`;
      span?.error(error);
      span?.end({ success: false, error });
      return err(error);
    }

    const packFormat = packMeta.pack?.pack_format;
    if (!packFormat) {
      const error = "pack.mcmeta missing pack_format field";
      span?.error(error);
      span?.end({ success: false, error });
      return err(error);
    }

    const supportedFormats = packMeta.pack?.supported_formats;
    const targetVersion = getAssetVersion(packFormat, supportedFormats);
    span?.info(
      `Detected pack_format ${packFormat}, generating assets for minecraft ${targetVersion}`
    );
    span?.setAttributes({ packFormat, targetVersion });

    // run the generation inline with proper span nesting
    try {
      await generateVanillaAssetsInline(targetVersion, tracer);

      // verify the generated file exists
      if (!existsSync(vanillaAssetsPath)) {
        const error = "Asset generation completed but output file not found";
        span?.error(error);
        span?.end({ success: false, error });
        return err(error);
      }

      span?.info("Vanilla assets generated successfully");
      span?.end({ success: true, generated: true });
      return ok(true); // successfully generated
    } catch (generationError: any) {
      const error = `Asset generation failed: ${generationError.message}`;
      span?.error(error);
      span?.end({ success: false, error });
      return err(error);
    }
  } catch (error: any) {
    const errorMsg = `Unexpected error in vanilla asset generation: ${error.message}`;
    span?.error(errorMsg);
    span?.end({ success: false, error: errorMsg });
    return err(errorMsg);
  }
}

export function getSupportedVersions(): string[] {
  return Object.values(PACK_FORMAT_VERSION_MAP).sort();
}

export function getPackFormatForVersion(version: string): number | undefined {
  for (const [format, ver] of Object.entries(PACK_FORMAT_VERSION_MAP)) {
    if (ver === version) {
      return Number.parseInt(format, 10);
    }
  }
  return undefined;
}
