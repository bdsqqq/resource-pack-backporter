import { join } from "node:path";
import { walkModels, walkTextures } from "@file-utils/index";
import { validateJson } from "@json-utils/index";
import type { StructuredTracer } from "@logger/index";
import { resolveModelPath, resolveTexturePath } from "@mc-paths/index";
import { ok, type Result } from "neverthrow";
import { ensureVanillaAssetsGenerated } from "./pack-format-utils";

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

// dynamic import helper for vanilla assets
async function getVanillaAssetFunctions() {
  try {
    const modulePath = join(
      process.cwd(),
      "tools",
      "mc-paths",
      "src",
      "vanilla-assets.generated.ts"
    );
    const module = await import(modulePath);
    return {
      isVanillaTexture: module.isVanillaTexture as (ref: string) => boolean,
      isVanillaModel: module.isVanillaModel as (ref: string) => boolean,
    };
  } catch (error: any) {
    throw new Error(`Failed to load vanilla assets: ${error.message}`);
  }
}

export async function validateResourcePack(
  packDir: string,
  options: ValidationOptions = {},
  tracer?: StructuredTracer
): Promise<Result<ValidationResult, string>> {
  const { verbose = false } = options;
  const errors: string[] = [];
  const warnings: string[] = [];
  let filesChecked = 0;

  const validationSpan = tracer?.startSpan("Pack Directory Scan");
  validationSpan?.setAttributes({ packDir, verbose });
  validationSpan?.info("Starting pack validation");

  // ensure vanilla assets are generated before validation
  const assetsResult = await ensureVanillaAssetsGenerated(packDir, tracer);
  if (assetsResult.isErr()) {
    const error = `Failed to ensure vanilla assets: ${assetsResult.error}`;
    validationSpan?.error(error);
    validationSpan?.end({ success: false, error });
    return ok({
      isValid: false,
      errors: [error],
      warnings,
      stats: { filesChecked: 0, issues: 1 },
    });
  }

  if (assetsResult.value) {
    validationSpan?.info("Generated vanilla assets for validation");
  } else if (verbose) {
    validationSpan?.debug("Using existing vanilla assets");
  }

  // load vanilla asset functions after ensuring they exist
  let isVanillaTexture: (ref: string) => boolean;
  let isVanillaModel: (ref: string) => boolean;

  try {
    const vanillaAssets = await getVanillaAssetFunctions();
    isVanillaTexture = vanillaAssets.isVanillaTexture;
    isVanillaModel = vanillaAssets.isVanillaModel;
  } catch (error: any) {
    const errorMsg = `Failed to load vanilla asset validators: ${error.message}`;
    validationSpan?.error(errorMsg);
    validationSpan?.end({ success: false, error: errorMsg });
    return ok({
      isValid: false,
      errors: [errorMsg],
      warnings,
      stats: { filesChecked: 0, issues: 1 },
    });
  }

  // Check pack.mcmeta exists and is valid
  const packMetaResult = await validateJson(`${packDir}/pack.mcmeta`);
  if (packMetaResult.isErr()) {
    errors.push(`pack.mcmeta error: ${packMetaResult.error}`);
  } else {
    const validation = packMetaResult.value;
    if (!validation.isValid) {
      errors.push(`Invalid pack.mcmeta: ${validation.error}`);
    } else if (verbose) {
      validationSpan?.info("pack.mcmeta is valid");
    }
  }
  filesChecked++;

  // Find all model files
  const modelFilesResult = await walkModels(`${packDir}/assets`);
  if (modelFilesResult.isErr()) {
    errors.push(`Failed to scan models: ${modelFilesResult.error}`);
    const isValid = errors.length === 0;
    const issues = errors.length + warnings.length;

    validationSpan?.end({
      success: isValid,
      filesChecked,
      issues,
      errors: errors.length,
      warnings: warnings.length,
    });

    return ok({
      isValid,
      errors,
      warnings,
      stats: { filesChecked, issues },
    });
  }

  const modelFiles = modelFilesResult.value;
  if (verbose) {
    validationSpan?.info(`Found ${modelFiles.length} model files`);
  }

  // Validate each model file
  for (const modelFile of modelFiles) {
    filesChecked++;

    const validation = await validateJson(modelFile);
    if (validation.isErr()) {
      errors.push(`Failed to read ${modelFile}: ${validation.error}`);
      continue;
    }

    const validationResult = validation.value;
    if (!validationResult.isValid) {
      errors.push(`Invalid JSON in ${modelFile}: ${validationResult.error}`);
      continue;
    }

    // Check model parent and texture references
    if (validationResult.data && typeof validationResult.data === "object") {
      const modelData = validationResult.data as any;

      // Validate parent model reference
      if (modelData.parent && typeof modelData.parent === "string") {
        const parentRef = modelData.parent;
        const modelPathResult = await resolveModelPath(packDir, parentRef);

        if (modelPathResult.isOk()) {
          const modelPath = modelPathResult.value;
          if (!modelPath.exists) {
            // Check if it's a builtin reference first
            if (parentRef.startsWith("builtin/")) {
              // builtin/ references are special minecraft model references - they're valid
              if (verbose) {
                validationSpan?.debug(
                  `Builtin model reference: ${parentRef} (referenced in ${modelFile})`
                );
              }
            } else if (modelPath.namespace === "minecraft") {
              // Only flag as error if it's not a valid vanilla model
              if (!isVanillaModel(parentRef)) {
                errors.push(
                  `Invalid model reference: ${parentRef} does not exist in the pack or vanilla Minecraft (referenced in ${modelFile})`
                );
              } else if (verbose) {
                validationSpan?.debug(
                  `Vanilla model reference: ${parentRef} (referenced in ${modelFile})`
                );
              }
            } else {
              // Custom model that should exist but doesn't
              errors.push(`Missing model: ${parentRef} (referenced in ${modelFile})`);
            }
          }
        }
      }

      const textureRefs = extractTextureReferences(validationResult.data);

      for (const ref of textureRefs) {
        const texturePathResult = await resolveTexturePath(packDir, ref);
        if (texturePathResult.isErr()) {
          errors.push(`Error resolving texture ${ref}: ${texturePathResult.error}`);
          continue;
        }

        const texturePath = texturePathResult.value;

        // Check texture existence and validity
        if (!texturePath.exists) {
          // Check if it's a minecraft namespace reference
          if (texturePath.namespace === "minecraft") {
            if (isVanillaTexture(ref)) {
              // Valid vanilla texture - this is expected to not exist in resource pack
              if (verbose) {
                validationSpan?.debug(
                  `Vanilla texture reference: ${ref} (referenced in ${modelFile})`
                );
              }
            } else {
              // Invalid texture reference - doesn't exist in pack or vanilla
              errors.push(
                `Invalid texture reference: ${ref} does not exist in the pack or vanilla Minecraft (referenced in ${modelFile})`
              );
            }
          } else {
            // Custom texture that should exist but doesn't
            errors.push(`Missing texture: ${ref} (referenced in ${modelFile})`);
          }
        } else {
          // Texture exists in the pack - only warn about namespacing if it could be ambiguous
          if (!texturePath.isNamespaced && isVanillaTexture(ref)) {
            warnings.push(
              'Texture "' +
                ref +
                "\" isn't namespaced. While it exists in your pack, it could fallback to vanilla minecraft:" +
                ref +
                " in some contexts. " +
                "Consider explicitly namespacing textures to avoid ambiguity. " +
                "(referenced in " +
                modelFile +
                ")"
            );
          }
        }
      }
    }
  }

  // Find all texture files and check for unused ones
  if (verbose) {
    const textureCountResult = await walkTextures(`${packDir}/assets`);
    if (textureCountResult.isOk()) {
      validationSpan?.info(`Found ${textureCountResult.value.length} texture files`);
    }
  }

  const isValid = errors.length === 0;
  const issues = errors.length + warnings.length;

  validationSpan?.end({
    success: isValid,
    filesChecked,
    issues,
    errors: errors.length,
    warnings: warnings.length,
  });

  return ok({
    isValid,
    errors,
    warnings,
    stats: {
      filesChecked,
      issues,
    },
  });
}

function extractTextureReferences(modelData: any): string[] {
  const refs: string[] = [];

  if (modelData.textures && typeof modelData.textures === "object") {
    for (const [_, value] of Object.entries(modelData.textures)) {
      if (typeof value === "string") {
        refs.push(value);
      }
    }
  }

  return refs;
}
