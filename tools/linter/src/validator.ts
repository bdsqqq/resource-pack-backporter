import { validateJson } from "@json-utils/index";
import { walkAssets, walkModels, walkTextures } from "@file-utils/index";
import { resolveTexturePath } from "@mc-paths/index";

export interface ValidationOptions {
  verbose?: boolean;
  fix?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    filesChecked: number;
    issues: number;
  };
}

export async function validateResourcePack(
  packDir: string,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const { verbose = false } = options;
  const errors: string[] = [];
  const warnings: string[] = [];
  let filesChecked = 0;

  if (verbose) {
    console.log(`🔍 Scanning pack directory: ${packDir}`);
  }

  // Check pack.mcmeta exists and is valid
  try {
    const packMeta = await validateJson(`${packDir}/pack.mcmeta`);
    if (!packMeta.isValid) {
      errors.push(`Invalid pack.mcmeta: ${packMeta.error}`);
    } else {
      if (verbose) {
        console.log("✅ pack.mcmeta is valid");
      }
    }
    filesChecked++;
  } catch (error) {
    errors.push(`Missing or unreadable pack.mcmeta: ${error}`);
  }

  // Find all model files
  const modelFiles = walkModels(`${packDir}/assets`);
  if (verbose) {
    console.log(`📄 Found ${modelFiles.length} model files`);
  }

  // Validate each model file
  for (const modelFile of modelFiles) {
    filesChecked++;

    const validation = await validateJson(modelFile);
    if (!validation.isValid) {
      errors.push(`Invalid JSON in ${modelFile}: ${validation.error}`);
      continue;
    }

    // Check texture references in model files
    if (validation.data && typeof validation.data === "object") {
      const textureRefs = extractTextureReferences(validation.data);

      for (const ref of textureRefs) {
        const texturePath = resolveTexturePath(packDir, ref);
        if (!texturePath.exists) {
          errors.push(`Missing texture: ${ref} (referenced in ${modelFile})`);
        }
      }
    }
  }

  // Find all texture files and check for unused ones
  const textureFiles = walkTextures(`${packDir}/assets`);
  if (verbose) {
    console.log(`🖼️  Found ${textureFiles.length} texture files`);
  }

  const isValid = errors.length === 0;
  const issues = errors.length + warnings.length;

  return {
    isValid,
    errors,
    warnings,
    stats: {
      filesChecked,
      issues,
    },
  };
}

function extractTextureReferences(modelData: any): string[] {
  const refs: string[] = [];

  if (modelData.textures && typeof modelData.textures === "object") {
    for (const [key, value] of Object.entries(modelData.textures)) {
      if (typeof value === "string") {
        refs.push(value);
      }
    }
  }

  return refs;
}
