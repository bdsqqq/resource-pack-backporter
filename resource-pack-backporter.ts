#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// =============================================
// Core Data Structures
// =============================================

interface ResourcePackStructure {
  itemFiles: string[];
  modelFiles: string[];
  textureFiles: string[];
  textureDirectories: { [directory: string]: string[] };
  modelDirectories: { [directory: string]: string[] };
}

interface ComponentAnalysis {
  itemId: string;
  filePath: string;
  componentsUsed: string[];
  displayContexts: string[];
  conditionalModels: ConditionalModel[];
}

interface ConditionalModel {
  component: string;
  conditions: any[];
  contextMappings: { [context: string]: string }; // context -> modelPath
}

// =============================================
// Strategy Interfaces
// =============================================

interface ComponentStrategy {
  name: string;
  canHandle(component: string): boolean;
  extractVariants(analysis: ComponentAnalysis, packStructure: ResourcePackStructure): ItemVariant[];
}

interface ContextMappingStrategy {
  name: string;
  mapContext(context: string): PredicateMapping | null;
}

interface FileGenerationStrategy {
  name: string;
  generateFiles(
    variant: ItemVariant,
    outputDir: string,
    packStructure: ResourcePackStructure
  ): Promise<void>;
}

interface PredicateMapping {
  type: "cit" | "pommel" | "custom";
  predicates: Record<string, any>;
}

interface ItemVariant {
  itemId: string;
  variantId: string;
  textureRef: string;
  modelMappings: { [context: string]: string };
  metadata: Record<string, any>;
}

// =============================================
// Resource Pack Introspector
// =============================================

class ResourcePackIntrospector {
  async analyzeStructure(packDir: string): Promise<ResourcePackStructure> {
    const structure: ResourcePackStructure = {
      itemFiles: [],
      modelFiles: [],
      textureFiles: [],
      textureDirectories: {},
      modelDirectories: {},
    };

    await this.scanDirectory(packDir, structure);
    return structure;
  }

  private async scanDirectory(dir: string, structure: ResourcePackStructure, basePath = "") {
    if (!existsSync(dir)) return;

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = join(basePath, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, structure, relativePath);
      } else if (entry.isFile()) {
        await this.categorizeFile(fullPath, relativePath, structure);
      }
    }
  }

  private async categorizeFile(
    fullPath: string,
    relativePath: string,
    structure: ResourcePackStructure
  ) {
    if (relativePath.includes("assets/minecraft/items/") && relativePath.endsWith(".json")) {
      structure.itemFiles.push(fullPath);
    } else if (
      relativePath.includes("assets/minecraft/models/") &&
      relativePath.endsWith(".json")
    ) {
      structure.modelFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.modelDirectories[dir]) structure.modelDirectories[dir] = [];
      structure.modelDirectories[dir].push(relativePath);
    } else if (
      relativePath.includes("assets/minecraft/textures/") &&
      this.isImageFile(relativePath)
    ) {
      structure.textureFiles.push(fullPath);
      const dir = relativePath.substring(0, relativePath.lastIndexOf("/"));
      if (!structure.textureDirectories[dir]) structure.textureDirectories[dir] = [];
      structure.textureDirectories[dir].push(relativePath);
    }
  }

  private isImageFile(path: string): boolean {
    return path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg");
  }

  async analyzeComponent(itemFilePath: string): Promise<ComponentAnalysis> {
    const content = JSON.parse(await readFile(itemFilePath, "utf-8"));
    const itemId = itemFilePath.split("/").pop()?.replace(".json", "") || "";

    const analysis: ComponentAnalysis = {
      itemId,
      filePath: itemFilePath,
      componentsUsed: [],
      displayContexts: [],
      conditionalModels: [],
    };

    this.extractComponentInfo(content, analysis);
    return analysis;
  }

  private extractComponentInfo(
    obj: any,
    analysis: ComponentAnalysis,
    path = "",
    currentContexts: string[] = []
  ) {
    if (typeof obj !== "object" || obj === null) return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Track components being used
      if (key === "component" && typeof value === "string") {
        if (!analysis.componentsUsed.includes(value)) {
          analysis.componentsUsed.push(value);
        }
      }

      // Track display context selectors and extract their mappings
      if (key === "property" && value === "minecraft:display_context") {
        this.extractDisplayContextMappings(obj, analysis, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Track component selectors within display contexts
      if (key === "component" && obj.cases) {
        this.extractConditionalModels(obj, analysis, currentPath, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Handle minecraft:condition with on_true/on_false branches
      if (key === "type" && value === "minecraft:condition") {
        this.extractConditionModels(obj, analysis, currentPath, currentContexts);
        return; // Don't recurse further as we've handled this branch
      }

      // Recurse with updated context
      if (typeof value === "object") {
        this.extractComponentInfo(value, analysis, currentPath, currentContexts);
      }
    }
  }

  private extractDisplayContextMappings(
    selectObj: any,
    analysis: ComponentAnalysis,
    _parentContexts: string[]
  ) {
    if (selectObj.cases && Array.isArray(selectObj.cases)) {
      for (const caseObj of selectObj.cases) {
        if (caseObj.when && caseObj.model) {
          const contexts = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];

          // Add to global context list
          for (const context of contexts) {
            if (typeof context === "string" && !analysis.displayContexts.includes(context)) {
              analysis.displayContexts.push(context);
            }
          }

          // Check if this is a direct model reference (no further component selection)
          if (caseObj.model.type === "minecraft:model" && caseObj.model.model) {
            // This is a direct context->model mapping, create a conditional model for it
            const contextMappings: { [context: string]: string } = {};
            for (const context of contexts) {
              contextMappings[context] = caseObj.model.model;
            }

            analysis.conditionalModels.push({
              component: "pure_display_context",
              conditions: [{}], // Empty condition for pure context mapping
              contextMappings,
            });
          } else if (typeof caseObj.model === "object") {
            // Recurse into the model with the current contexts
            this.extractComponentInfo(caseObj.model, analysis, "", contexts);
          }
        }
      }
    }
  }

  private extractConditionalModels(
    selectObj: any,
    analysis: ComponentAnalysis,
    _path: string,
    parentContexts: string[] = []
  ) {
    const component = selectObj.component || "unknown";

    if (selectObj.cases && Array.isArray(selectObj.cases)) {
      for (const caseObj of selectObj.cases) {
        if (caseObj.when && caseObj.model) {
          const conditions = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];
          const modelPath = caseObj.model.model || caseObj.model;

          // Build context mappings - each condition gets mapped to specific contexts with specific models
          const contextMappings: { [context: string]: string } = {};
          for (const context of parentContexts) {
            contextMappings[context] = modelPath;
          }

          analysis.conditionalModels.push({
            component,
            conditions,
            contextMappings,
          });
        }
      }
    }
  }

  private extractConditionModels(
    condition: any,
    analysis: ComponentAnalysis,
    _path: string,
    currentContexts: string[]
  ) {
    // Handle minecraft:condition with on_true/on_false branches
    // Add the component being used to analysis
    if (condition.property === "minecraft:component" && condition.predicate) {
      if (!analysis.componentsUsed.includes(condition.predicate)) {
        analysis.componentsUsed.push(condition.predicate);
      }
    }

    // Extract models from both branches and add them to current contexts
    if (condition.on_true) {
      this.extractModelsFromBranch(condition.on_true, analysis, currentContexts);
    }
    if (condition.on_false) {
      this.extractModelsFromBranch(condition.on_false, analysis, currentContexts);
    }
  }

  private extractModelsFromBranch(
    branch: any,
    analysis: ComponentAnalysis,
    currentContexts: string[]
  ) {
    if (branch.type === "minecraft:model" && branch.model) {
      // Build context mappings for all current contexts
      const contextMappings: { [context: string]: string } = {};
      for (const context of currentContexts) {
        contextMappings[context] = branch.model;
      }

      analysis.conditionalModels.push({
        component: "pure_display_context", // This is just for context switching
        conditions: [], // No additional conditions for simple model refs
        contextMappings,
      });
    } else if (typeof branch === "object") {
      // Recurse to find nested models
      this.extractComponentInfo(branch, analysis, "", currentContexts);
    }
  }
}

// =============================================
// Component Strategies
// =============================================

class DisplayContextStrategy implements ComponentStrategy {
  name = "display_context";

  canHandle(component: string): boolean {
    // Handle items with pure display context selection (no components)
    return component === "pure_display_context";
  }

  extractVariants(
    analysis: ComponentAnalysis,
    packStructure: ResourcePackStructure
  ): ItemVariant[] {
    const variants: ItemVariant[] = [];

    // Only handle items with no actual components but with display contexts
    if (analysis.componentsUsed.length > 0) return variants;
    if (analysis.conditionalModels.length === 0) return variants;

    // Collect all context mappings from conditional models first
    const modelMappings: { [context: string]: string } = {};
    for (const conditionalModel of analysis.conditionalModels) {
      Object.assign(modelMappings, conditionalModel.contextMappings);
    }

    // Create a single variant that consolidates all context mappings
    const variant: ItemVariant = {
      itemId: analysis.itemId,
      variantId: analysis.itemId,
      textureRef: this.determineTextureRef(analysis.itemId, packStructure, modelMappings),
      modelMappings,
      metadata: {
        strategy: this.name,
      },
    };

    if (Object.keys(variant.modelMappings).length > 0) {
      variants.push(variant);
    }

    return variants;
  }

  private determineTextureRef(
    itemId: string,
    packStructure: ResourcePackStructure,
    modelMappings: { [context: string]: string }
  ): string {
    console.log(`🔍 determineTextureRef called for ${itemId}`);
    console.log("🔍 modelMappings:", modelMappings);

    // Extract texture from the GUI model specified in the pack
    // Look for GUI context mapping first
    const guiModel = modelMappings.gui || modelMappings.fixed;
    console.log(`🔍 guiModel: ${guiModel}`);
    if (guiModel) {
      // Try to read the actual model file to get its texture
      const modelPath = guiModel.replace("minecraft:", "assets/minecraft/models/");
      const modelFile = `${modelPath}.json`;

      // Look for the model file in the pack structure with exact path matching
      // IMPORTANT: Only search in source files, never in output directories
      const found = packStructure.modelFiles.find((file) => {
        // Normalize paths and check for exact structural match
        const normalizedFile = file.replace(/\\/g, "/");
        const normalizedModelFile = modelFile.replace(/\\/g, "/");

        // Skip any files in output directories (dist/, build/, out/, etc.)
        if (
          normalizedFile.includes("/dist/") ||
          normalizedFile.includes("/build/") ||
          normalizedFile.includes("/out/") ||
          normalizedFile.startsWith("dist/") ||
          normalizedFile.startsWith("build/") ||
          normalizedFile.startsWith("out/")
        ) {
          return false;
        }

        // Check if the full path ends with the model file path AND has correct path separator before it
        const matches =
          normalizedFile.endsWith(normalizedModelFile) &&
          (normalizedFile === normalizedModelFile ||
            normalizedFile.endsWith(`/${normalizedModelFile}`));
        if (matches) {
          console.log(`🔍 FOUND MATCH: ${normalizedFile} for ${normalizedModelFile}`);
        }
        return matches;
      });
      if (found) {
        try {
          // Read the model file synchronously to get texture
          const fs = require("node:fs");
          console.log(`🔍 About to read file: ${found}`);
          const modelContent = JSON.parse(fs.readFileSync(found, "utf-8"));
          console.log("🔍 File content:", modelContent);
          if (modelContent.textures?.layer0) {
            console.log(`🔍 Extracted texture: ${modelContent.textures.layer0}`);
            return modelContent.textures.layer0;
          }
          console.log("🔍 No layer0 texture found in model file");
        } catch (error) {
          console.log(`🔍 Error reading model file: ${error.message}`);
          // Fallback if model can't be read
        }
      }
    }

    // Fallback to looking for texture files
    const possibleDirs = Object.keys(packStructure.textureDirectories);
    for (const dir of possibleDirs) {
      const textures = packStructure.textureDirectories[dir];
      const found = textures.find((texture) => texture.endsWith(`${itemId}.png`));
      if (found) {
        return found
          .replace(/^.*assets\/minecraft\/textures\//, "minecraft:")
          .replace(/\.png$/, "");
      }
    }

    return `minecraft:item/${itemId}`;
  }
}

class WritableBookContentStrategy implements ComponentStrategy {
  name = "writable_book_content";

  canHandle(component: string): boolean {
    return component === "minecraft:writable_book_content";
  }

  extractVariants(
    analysis: ComponentAnalysis,
    packStructure: ResourcePackStructure
  ): ItemVariant[] {
    // For writable_book, create a single variant that maps all contexts properly
    // The writable_book_content condition just picks between 3D models but doesn't affect GUI

    // Extract model mappings from the conditional models
    const modelMappings: { [context: string]: string } = {};

    // Build mappings from analysis of the writable_book item structure
    for (const conditionalModel of analysis.conditionalModels) {
      if (conditionalModel.contextMappings) {
        for (const [context, model] of Object.entries(conditionalModel.contextMappings)) {
          modelMappings[context] = model;
        }
      }
    }

    // If we didn't get all mappings from conditional models, fill in defaults
    if (Object.keys(modelMappings).length === 0) {
      // Use the GUI model we can extract from enchanted_books directory
      const guiModel = "minecraft:item/enchanted_books/writable_book";
      const rightHandModel = "minecraft:item/books_3d/writable_book_3d_open"; // Default to open book
      const leftHandModel = "minecraft:item/books_3d/writable_book_3d";

      modelMappings.gui = guiModel;
      modelMappings.fixed = guiModel;
      modelMappings.ground = guiModel;
      modelMappings.firstperson_righthand = rightHandModel;
      modelMappings.thirdperson_righthand = rightHandModel;
      modelMappings.firstperson_lefthand = leftHandModel;
      modelMappings.thirdperson_lefthand = leftHandModel;
      modelMappings.head = leftHandModel;
    }

    return [
      {
        itemId: analysis.itemId,
        variantId: analysis.itemId,
        modelMappings,
        textureRef: this.determineTextureRef(analysis.itemId, packStructure, modelMappings),
        metadata: {},
      },
    ];
  }

  private determineTextureRef(
    itemId: string,
    packStructure: ResourcePackStructure,
    modelMappings: { [context: string]: string }
  ): string {
    // Extract texture from the GUI model specified in the pack
    const guiModel = modelMappings.gui || modelMappings.fixed;
    if (guiModel) {
      // Try to read the actual model file to get its texture
      const modelPath = guiModel.replace("minecraft:", "assets/minecraft/models/");
      const modelFile = `${modelPath}.json`;

      // Look for the model file in the pack structure
      const found = packStructure.modelFiles.find((file) => {
        const normalizedFile = file.replace(/\\/g, "/");
        const normalizedModelFile = modelFile.replace(/\\/g, "/");
        return (
          normalizedFile.endsWith(normalizedModelFile) &&
          (normalizedFile === normalizedModelFile ||
            normalizedFile.endsWith(`/${normalizedModelFile}`))
        );
      });

      if (found) {
        try {
          // Read the model file synchronously to get texture
          const fs = require("node:fs");
          const modelContent = JSON.parse(fs.readFileSync(found, "utf-8"));
          if (modelContent.textures?.layer0) {
            return modelContent.textures.layer0;
          }
        } catch (_error) {
          // Fallback if model can't be read
        }
      }
    }

    // Fallback to item-based texture
    return `minecraft:item/${itemId}`;
  }
}

class StoredEnchanmentsStrategy implements ComponentStrategy {
  name = "stored_enchantments";

  canHandle(component: string): boolean {
    return component === "minecraft:stored_enchantments";
  }

  extractVariants(
    analysis: ComponentAnalysis,
    packStructure: ResourcePackStructure
  ): ItemVariant[] {
    const variantMap = new Map<string, ItemVariant>();

    for (const conditionalModel of analysis.conditionalModels) {
      if (conditionalModel.component !== "minecraft:stored_enchantments") continue;

      for (const condition of conditionalModel.conditions) {
        if (typeof condition !== "object") continue;

        for (const [enchantment, level] of Object.entries(condition)) {
          if (typeof enchantment !== "string" || typeof level !== "number") continue;

          const enchantmentName = enchantment.replace("minecraft:", "");
          const variantKey = `${enchantmentName}_${level}`;

          // Get existing variant or create new one
          let variant = variantMap.get(variantKey);
          if (!variant) {
            variant = {
              itemId: analysis.itemId,
              variantId: variantKey,
              textureRef: "", // Will be determined after all context mappings are collected
              modelMappings: {},
              metadata: {
                enchantment,
                level,
                strategy: this.name,
              },
            };
            variantMap.set(variantKey, variant);
          }

          // Merge context mappings from all conditional models for this enchantment
          Object.assign(variant.modelMappings, conditionalModel.contextMappings);
        }
      }
    }

    // Update texture references after all context mappings are collected
    const variants = Array.from(variantMap.values());
    for (const variant of variants) {
      variant.textureRef = this.determineEnchantmentTextureRef(
        variant.metadata.enchantment?.replace("minecraft:", "") || "",
        variant.metadata.level || 0,
        packStructure,
        variant.modelMappings
      );
    }

    return variants;
  }

  private determineEnchantmentTextureRef(
    enchantmentName: string,
    level: number,
    packStructure: ResourcePackStructure,
    modelMappings: { [context: string]: string }
  ): string {
    // Extract texture from the GUI model specified in the pack
    const guiModel = modelMappings.gui || modelMappings.fixed;
    if (guiModel) {
      const modelPath = guiModel.replace("minecraft:", "assets/minecraft/models/");
      const modelFile = `${modelPath}.json`;

      const found = packStructure.modelFiles.find((file) => {
        const normalizedFile = file.replace(/\\/g, "/");
        const normalizedModelFile = modelFile.replace(/\\/g, "/");
        return (
          normalizedFile.endsWith(normalizedModelFile) &&
          (normalizedFile === normalizedModelFile ||
            normalizedFile.endsWith(`/${normalizedModelFile}`))
        );
      });

      if (found) {
        try {
          const fs = require("node:fs");
          const modelContent = JSON.parse(fs.readFileSync(found, "utf-8"));
          if (modelContent.textures?.layer0) {
            return modelContent.textures.layer0;
          }
        } catch (_error) {
          // Fallback to heuristic approach
        }
      }
    }

    // Fallback to existing heuristic approach
    // Look for texture directories that might contain enchantment textures
    const possibleDirs = Object.keys(packStructure.textureDirectories).filter(
      (dir) => dir.includes("enchant") || dir.includes("book")
    );

    for (const dir of possibleDirs) {
      const textures = packStructure.textureDirectories[dir];

      // Try different naming patterns
      const patterns = [
        `${enchantmentName}_${level}.png`,
        `${enchantmentName}.png`,
        `curse_of_${enchantmentName}.png`, // Handle curse transformations
      ];

      for (const pattern of patterns) {
        const found = textures.find((texture) => texture.endsWith(pattern));
        if (found) {
          // Convert path to texture reference
          return found
            .replace(/^.*assets\/minecraft\/textures\//, "minecraft:")
            .replace(/\.png$/, "");
        }
      }
    }

    // Fallback - guess based on first available texture directory
    const firstTextureDir = possibleDirs[0];
    if (firstTextureDir) {
      const baseName = this.getTextureBaseName(enchantmentName, level);
      return `${firstTextureDir.replace(/^.*assets\/minecraft\/textures\//, "minecraft:")}/${baseName}`;
    }

    return `minecraft:item/${enchantmentName}`;
  }

  private getTextureBaseName(enchantmentName: string, level: number): string {
    // Handle known transformations
    if (enchantmentName === "binding_curse") return "curse_of_binding";
    if (enchantmentName === "vanishing_curse") return "curse_of_vanishing";

    // Check if this enchantment typically has level suffixes
    const noLevelSuffix = [
      "aqua_affinity",
      "channeling",
      "flame",
      "infinity",
      "mending",
      "multishot",
      "silk_touch",
    ];
    if (noLevelSuffix.includes(enchantmentName)) {
      return enchantmentName;
    }

    return `${enchantmentName}_${level}`;
  }
}

// =============================================
// Context Mapping Strategies
// =============================================

class PommelContextStrategy implements ContextMappingStrategy {
  name = "pommel";

  mapContext(context: string): PredicateMapping | null {
    const mappings: Record<string, any> = {
      firstperson_righthand: { "pommel:is_held": 1.0 },
      thirdperson_righthand: { "pommel:is_held": 1.0 },
      firstperson_lefthand: { "pommel:is_offhand": 1.0 },
      thirdperson_lefthand: { "pommel:is_offhand": 1.0 },
      head: { "pommel:is_offhand": 1.0 },
      ground: { "pommel:is_ground": 1.0 },
    };

    const predicate = mappings[context];
    return predicate ? { type: "pommel", predicates: predicate } : null;
  }
}

class CITContextStrategy implements ContextMappingStrategy {
  name = "cit";

  mapContext(_context: string): PredicateMapping | null {
    // CIT doesn't map contexts directly, it uses item properties
    return { type: "cit", predicates: {} };
  }
}

// =============================================
// File Generation Strategies
// =============================================

class PurePommelGenerationStrategy implements FileGenerationStrategy {
  name = "pure_pommel";

  async generateFiles(
    variant: ItemVariant,
    outputDir: string,
    packStructure: ResourcePackStructure
  ): Promise<void> {
    // Only generate Pommel model with context overrides, no CIT files
    await this.generatePommelModel(variant, outputDir, packStructure);
  }

  private async generatePommelModel(
    variant: ItemVariant,
    outputDir: string,
    _packStructure: ResourcePackStructure
  ): Promise<void> {
    // Generate the base model file that Minecraft will use directly (no CIT needed)
    const modelPath = `assets/minecraft/models/item/${variant.itemId}.json`;
    const fullModelPath = join(outputDir, modelPath);

    // Ensure directory exists
    await mkdir(fullModelPath.substring(0, fullModelPath.lastIndexOf("/")), { recursive: true });

    const overrides: any[] = [];

    // Use a context mapping strategy to create overrides
    const contextStrategy = new PommelContextStrategy();

    for (const [context, modelPath] of Object.entries(variant.modelMappings)) {
      const mapping = contextStrategy.mapContext(context);
      if (mapping && mapping.type === "pommel") {
        overrides.push({
          predicate: mapping.predicates,
          model: modelPath,
        });
      }
    }

    const model = {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: variant.textureRef,
      },
      overrides,
    };

    await writeFile(fullModelPath, JSON.stringify(model, null, 2));
  }
}

class CombinedGenerationStrategy implements FileGenerationStrategy {
  name = "cit_pommel";

  async generateFiles(
    variant: ItemVariant,
    outputDir: string,
    packStructure: ResourcePackStructure
  ): Promise<void> {
    await this.generateCITFile(variant, outputDir, packStructure);
    await this.generatePommelModel(variant, outputDir, packStructure);
  }

  private async generateCITFile(
    variant: ItemVariant,
    outputDir: string,
    packStructure: ResourcePackStructure
  ): Promise<void> {
    const citDir = join(outputDir, "assets/minecraft/optifine/cit");
    await mkdir(citDir, { recursive: true });

    const lines = ["type=item", `items=${variant.itemId}`];

    // Add item-specific model reference
    const modelPath = `assets/minecraft/models/item/${this.getModelOutputPath(variant, packStructure)}`;
    lines.push(`model=${modelPath}`);

    // Add metadata-based properties
    if (variant.metadata.enchantment && variant.metadata.level !== undefined) {
      lines.push(`enchantmentIDs=${variant.metadata.enchantment}`);
      lines.push(`enchantmentLevels=${variant.metadata.level}`);
    }

    const content = lines.join("\n");
    await writeFile(join(citDir, `${variant.variantId}.properties`), content);
  }

  private async generatePommelModel(
    variant: ItemVariant,
    outputDir: string,
    packStructure: ResourcePackStructure
  ): Promise<void> {
    const modelsDir = join(
      outputDir,
      "assets/minecraft/models/item",
      this.getModelOutputDir(variant, packStructure)
    );
    await mkdir(modelsDir, { recursive: true });

    const overrides: any[] = [];

    // Use a context mapping strategy
    const contextStrategy = new PommelContextStrategy();

    for (const [context, modelPath] of Object.entries(variant.modelMappings)) {
      const mapping = contextStrategy.mapContext(context);
      if (mapping && mapping.type === "pommel") {
        overrides.push({
          predicate: mapping.predicates,
          model: modelPath,
        });
      }
    }

    const model = {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: variant.textureRef,
      },
      overrides,
    };

    const modelFile = join(modelsDir, `${variant.variantId}.json`);
    await writeFile(modelFile, JSON.stringify(model, null, 2));
  }

  private getModelOutputDir(variant: ItemVariant, _packStructure: ResourcePackStructure): string {
    // Introspect the pack to find where models should be placed
    // Look at the model mappings to determine the appropriate directory structure
    if (Object.keys(variant.modelMappings).length > 0) {
      const firstModelPath = Object.values(variant.modelMappings)[0];
      // Extract directory structure from the model path
      // e.g. "minecraft:item/books_3d/sharpness_3d" -> look for similar patterns in pack
      const pathParts = firstModelPath.replace("minecraft:", "").split("/");
      if (pathParts.length > 2) {
        // Use the parent directory pattern: item/books_3d -> books
        const modelSubdir = pathParts[pathParts.length - 2]; // books_3d
        const baseDir = modelSubdir.replace("_3d", "").replace("_open", ""); // books
        return baseDir;
      }
    }

    // Fallback to item ID
    return variant.itemId;
  }

  private getModelOutputPath(variant: ItemVariant, packStructure: ResourcePackStructure): string {
    return `${this.getModelOutputDir(variant, packStructure)}/${variant.variantId}`;
  }
}

// =============================================
// CORE PRINCIPLES FOR UNIVERSAL BACKPORTING
// =============================================
//
// 1. PURE PACK INTROSPECTION: All decisions are made by analyzing the original
//    pack structure and contents. No hardcoded assumptions about specific packs.
//
// 2. MINIMAL STRATEGY SELECTION: Use the simplest approach that covers all cases:
//    - Pure Pommel: When ALL variation is context-based (gui vs hand positions)
//    - Pure CIT: When ALL variation is NBT/component-based (enchantments, etc.)
//    - Combined CIT + Pommel: When BOTH types of variation exist
//
// 3. MOD COMPATIBILITY UNDERSTANDING:
//    - Pommel: Handles context switching (gui, firstperson_righthand, etc.)
//    - CIT: Handles NBT/component switching (stored_enchantments, etc.)
//    - Don't generate unnecessary files - each mod handles its domain
//
// 4. TEXTURE EXTRACTION: Always read actual model files to get texture references,
//    never use fallback heuristics or assumptions about naming patterns.
//
// =============================================
// Strategy Coordinator
// =============================================

class BackportCoordinator {
  private componentStrategies: ComponentStrategy[] = [];
  private contextStrategies: ContextMappingStrategy[] = [];
  private generationStrategies: FileGenerationStrategy[] = [];

  constructor() {
    // Register default strategies
    this.componentStrategies.push(
      new DisplayContextStrategy(),
      new StoredEnchanmentsStrategy(),
      new WritableBookContentStrategy()
    );
    this.contextStrategies.push(new PommelContextStrategy(), new CITContextStrategy());
    // Generation strategies are selected dynamically based on analysis
  }

  async backport(inputDir: string, outputDir: string): Promise<void> {
    console.log("🔍 Analyzing resource pack structure...");

    // Clear output directory to prevent contamination from previous runs
    console.log("🧹 Clearing output directory...");
    const fs = require("node:fs");
    if (fs.existsSync(outputDir)) {
      await fs.promises.rm(outputDir, { recursive: true, force: true });
    }

    const introspector = new ResourcePackIntrospector();
    const packStructure = await introspector.analyzeStructure(inputDir);

    console.log(`📁 Found ${packStructure.itemFiles.length} item files`);
    console.log(`🎨 Found ${packStructure.textureFiles.length} texture files`);
    console.log(`📦 Found ${packStructure.modelFiles.length} model files`);

    // Copy base assets
    await this.copyBaseAssets(inputDir, outputDir, packStructure);

    // Process each item file
    for (const itemFile of packStructure.itemFiles) {
      await this.processItemFile(itemFile, outputDir, packStructure, introspector);
    }

    console.log("✅ Backport complete!");
  }

  private selectGenerationStrategy(
    analysis: ComponentAnalysis,
    _variants: ItemVariant[]
  ): FileGenerationStrategy {
    // Apply core principle: Use minimal strategy selection based on pack introspection

    // Components that are just for internal 3D model selection should be treated as context-only
    const internalComponents = ["minecraft:writable_book_content"];
    const hasSignificantComponents =
      analysis.componentsUsed.length > 0 &&
      !analysis.componentsUsed.every(
        (c) => c === "pure_display_context" || internalComponents.includes(c)
      );
    const hasContextSwitching = analysis.displayContexts.length > 1;

    if (hasSignificantComponents && hasContextSwitching) {
      // Both NBT/component-based AND context-based variation -> Combined CIT + Pommel
      console.log(
        `🎯 Using combined CIT + Pommel strategy (components: ${analysis.componentsUsed.join(", ")}, contexts: ${analysis.displayContexts.length})`
      );
      return new CombinedGenerationStrategy();
    }
    if (hasSignificantComponents && !hasContextSwitching) {
      // Only NBT/component-based variation -> Pure CIT (not implemented yet)
      console.log(
        `🎯 Using pure CIT strategy (components only: ${analysis.componentsUsed.join(", ")})`
      );
      return new CombinedGenerationStrategy(); // Fallback for now
    }
    if (!hasSignificantComponents && hasContextSwitching) {
      // Only context-based variation -> Pure Pommel
      console.log(
        `🎯 Using pure Pommel strategy (contexts only: ${analysis.displayContexts.length} contexts, components: ${analysis.componentsUsed.join(", ")})`
      );
      return new PurePommelGenerationStrategy();
    }
    // No variation detected -> fallback
    console.log("🎯 Using fallback combined strategy (no clear variation pattern)");
    return new CombinedGenerationStrategy();
  }

  private async processItemFile(
    itemFile: string,
    outputDir: string,
    packStructure: ResourcePackStructure,
    introspector: ResourcePackIntrospector
  ): Promise<void> {
    const analysis = await introspector.analyzeComponent(itemFile);

    console.log(`🔄 Processing ${analysis.itemId}...`);
    console.log(`  Components: ${analysis.componentsUsed.join(", ")}`);
    console.log(`  Contexts: ${analysis.displayContexts.join(", ")}`);

    // Find applicable component strategies
    const componentsToProcess =
      analysis.componentsUsed.length > 0 ? analysis.componentsUsed : ["pure_display_context"]; // Handle items with no components but display contexts

    for (const component of componentsToProcess) {
      const strategy = this.componentStrategies.find((s) => s.canHandle(component));
      if (!strategy) {
        console.log(`⚠️  No strategy found for component: ${component}`);
        continue;
      }

      console.log(`🎯 Using ${strategy.name} strategy for ${component}`);
      console.log(`🔍 Found ${analysis.conditionalModels.length} conditional model groups`);
      const variants = strategy.extractVariants(analysis, packStructure);

      console.log(`📦 Generated ${variants.length} variants`);

      // Generate files for each variant using the appropriate strategy
      for (const variant of variants) {
        const generationStrategy = this.selectGenerationStrategy(analysis, variants);
        await generationStrategy.generateFiles(variant, outputDir, packStructure);
      }
    }
  }

  private async copyBaseAssets(
    inputDir: string,
    outputDir: string,
    _packStructure: ResourcePackStructure
  ): Promise<void> {
    console.log("📋 Copying base assets...");

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Copy metadata files
    for (const file of ["pack.mcmeta", "pack.png"]) {
      const srcPath = join(inputDir, file);
      if (existsSync(srcPath)) {
        const destPath = join(outputDir, file);
        await writeFile(destPath, await readFile(srcPath));
      }
    }

    // Copy all textures and models
    const assetPaths = ["assets/minecraft/models", "assets/minecraft/textures"];
    for (const assetPath of assetPaths) {
      const srcPath = join(inputDir, assetPath);
      if (existsSync(srcPath)) {
        const destPath = join(outputDir, assetPath);
        await mkdir(destPath, { recursive: true });
        const { cp } = await import("node:fs/promises");
        await cp(srcPath, destPath, { recursive: true });
      }
    }

    // Fix model compatibility
    await this.fixModelCompatibility(outputDir);
  }

  private async fixModelCompatibility(outputDir: string): Promise<void> {
    console.log("🔧 Fixing model compatibility...");

    const modelsDir = join(outputDir, "assets/minecraft/models");
    if (!existsSync(modelsDir)) return;

    await this.fixModelsInDirectory(modelsDir);
  }

  private async fixModelsInDirectory(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.fixModelsInDirectory(fullPath);
      } else if (entry.name.endsWith(".json")) {
        await this.fixSingleModel(fullPath);
      }
    }
  }

  private async fixSingleModel(modelPath: string): Promise<void> {
    try {
      const content = await readFile(modelPath, "utf-8");
      const model = JSON.parse(content);
      let hasChanges = false;

      // Remove problematic builtin/entity parent
      if (model.parent === "builtin/entity") {
        model.parent = undefined;
        hasChanges = true;
      }

      // Fix zero-thickness elements
      if (model.elements) {
        for (const element of model.elements) {
          if (!element.from || !element.to) continue;

          for (let axis = 0; axis < 3; axis++) {
            if (element.from[axis] === element.to[axis]) {
              element.to[axis] = element.to[axis] + 0.01;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        await writeFile(modelPath, JSON.stringify(model, null, "\t"));
      }
    } catch (_error) {
      // Skip files that can't be processed
    }
  }
}

// =============================================
// CLI Entry Point
// =============================================

// CLI entry point
async function main() {
  const args = process?.argv || [];
  const [inputDir = ".", outputDir = "dist/backported"] = args.slice(2);

  const coordinator = new BackportCoordinator();
  try {
    await coordinator.backport(inputDir, outputDir);
  } catch (error: any) {
    console.error("❌ Backport failed:", error.message);
    process?.exit?.(1);
  }
}

// Export for testing
export { BackportCoordinator };

// Run if this is the main module
if (typeof window === "undefined" && import.meta.main) {
  main();
}
