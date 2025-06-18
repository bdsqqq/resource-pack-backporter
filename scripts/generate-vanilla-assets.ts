#!/usr/bin/env bun

import { writeFile, mkdir } from "node:fs/promises";

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
  path = ""
): Promise<GitHubTreeItem[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;

  console.log(`Fetching tree from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as GitHubTreeResponse;

  if (data.truncated) {
    console.warn(
      "Warning: GitHub tree response was truncated, some files may be missing"
    );
  }

  return data.tree.filter(
    (item) => item.type === "blob" && item.path.startsWith(path)
  );
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

async function generateVanillaAssets(version: string): Promise<void> {
  console.log(
    `Generating vanilla asset dictionaries for Minecraft ${version}...`
  );

  try {
    // Fetch all texture and model files from minecraft-assets
    const [textureFiles, modelFiles] = await Promise.all([
      fetchGitHubTree(
        "InventivetalentDev",
        "minecraft-assets",
        version,
        "assets/minecraft/textures/"
      ),
      fetchGitHubTree(
        "InventivetalentDev",
        "minecraft-assets",
        version,
        "assets/minecraft/models/"
      ),
    ]);

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

    console.log(
      `Found ${blockTextures.size} block textures, ${itemTextures.size} item textures`
    );
    console.log(
      `Found ${blockModels.size} block models, ${itemModels.size} item models`
    );

    // Generate TypeScript file
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
  
  // Remove leading path segments to get texture name
  const textureName = path.split("/").pop() || "";
  
  // Check if it's a block or item texture
  return VANILLA_ASSETS.textures.blocks.has(textureName) || VANILLA_ASSETS.textures.items.has(textureName);
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
  
  // Remove leading path segments to get model name
  const modelName = path.split("/").pop() || "";
  
  // Check if it's a block or item model
  return VANILLA_ASSETS.models.blocks.has(modelName) || VANILLA_ASSETS.models.items.has(modelName);
}
`;

    // Ensure output directory exists
    await mkdir("tools/mc-paths/src", { recursive: true });

    // Write generated file
    const outputPath = "tools/mc-paths/src/vanilla-assets.generated.ts";
    await writeFile(outputPath, generatedCode);

    console.log(`✅ Generated vanilla assets for Minecraft ${version}`);
    console.log(`📄 Output: ${outputPath}`);
    console.log(
      `📊 Block textures: ${blockTextures.size}, Item textures: ${itemTextures.size}`
    );
    console.log(
      `📊 Block models: ${blockModels.size}, Item models: ${itemModels.size}`
    );
  } catch (error) {
    console.error("❌ Failed to generate vanilla assets:", error);
    process.exit(1);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const version = args[0] || "1.21.5";

  console.log(`Minecraft version: ${version}`);
  await generateVanillaAssets(version);
}

if (import.meta.main) {
  main();
}
