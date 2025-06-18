import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";
import type { ItemHandler, JsonNode } from "@backporter/handlers";

export class StoredEnchanmentsHandler implements ItemHandler {
  name = "stored-enchantments";

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private hasProperty<K extends string>(
    obj: Record<string, unknown>,
    key: K
  ): obj is Record<string, unknown> & Record<K, unknown> {
    return key in obj;
  }

  private hasStringProperty<K extends string>(
    obj: Record<string, unknown>,
    key: K
  ): obj is Record<string, unknown> & Record<K, string> {
    return key in obj && typeof obj[key] === "string";
  }

  canHandle(jsonNode: JsonNode, _context: ProcessingContext): boolean {
    // Check if this item has stored_enchantments component
    return this.hasStoredEnchantments(jsonNode);
  }

  process(jsonNode: JsonNode, context: ProcessingContext): WriteRequest[] {
    // Extract enchantment variants from the JSON
    const enchantmentVariants = this.extractEnchantmentVariants(jsonNode, context);

    if (enchantmentVariants.length === 0) {
      return [];
    }

    // Generate both CIT properties AND individual Pommel models for each variant
    const requests: WriteRequest[] = [];

    for (const variant of enchantmentVariants) {
      // Generate CIT properties
      requests.push({
        type: "cit-properties",
        path: `cit/${variant.name}.properties`,
        content: this.buildCITProperties(variant, context),
        merge: "replace",
        priority: 1,
      });

      // Generate individual Pommel model for this enchantment
      requests.push({
        type: "pommel-model",
        path: `item/enchanted_books/${variant.name}.json`,
        content: this.buildPommelModel(variant, context),
        merge: "merge-overrides",
        priority: 2,
      });
    }

    return requests;
  }

  private hasStoredEnchantments(jsonNode: JsonNode): boolean {
    return this.findStoredEnchantmentsSelector(jsonNode) !== null;
  }

  private findStoredEnchantmentsSelector(obj: unknown): unknown {
    if (!this.isObject(obj)) return null;

    // Look for stored_enchantments component selection
    if (
      this.hasStringProperty(obj, "component") &&
      obj.component === "minecraft:stored_enchantments" &&
      this.hasProperty(obj, "cases")
    ) {
      return obj;
    }

    // Recursively search
    for (const value of Object.values(obj)) {
      const found = this.findStoredEnchantmentsSelector(value);
      if (found) return found;
    }

    return null;
  }

  private extractEnchantmentVariants(
    jsonNode: JsonNode,
    context: ProcessingContext
  ): EnchantmentVariant[] {
    const variants: EnchantmentVariant[] = [];
    const selector = this.findStoredEnchantmentsSelector(jsonNode);

    if (!this.isObject(selector) || !Array.isArray(selector.cases)) return variants;

    // Process cases to extract enchantment conditions
    for (const caseObj of selector.cases) {
      if (
        !this.isObject(caseObj) ||
        !this.hasProperty(caseObj, "when") ||
        !this.hasProperty(caseObj, "model")
      ) {
        continue;
      }

      const conditions = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];
      const modelPath =
        this.isObject(caseObj.model) && this.hasStringProperty(caseObj.model, "model")
          ? caseObj.model.model
          : caseObj.model;

      for (const condition of conditions) {
        if (!this.isObject(condition)) continue;

        // Extract enchantment and level from condition
        for (const [enchantment, level] of Object.entries(condition)) {
          if (typeof enchantment === "string" && typeof level === "number") {
            const enchantmentName = enchantment.replace("minecraft:", "");
            const variantName = `${enchantmentName}_${level}`;

            // Find texture for this variant
            const texture = this.determineEnchantmentTexture(
              enchantmentName,
              level,
              typeof modelPath === "string" ? modelPath : "",
              context
            );

            variants.push({
              name: variantName,
              enchantment,
              level,
              modelPath: typeof modelPath === "string" ? modelPath : "",
              texture,
            });
          }
        }
      }
    }

    return variants;
  }

  private determineEnchantmentTexture(
    enchantmentName: string,
    level: number,
    modelPath: string,
    context: ProcessingContext
  ): string {
    // Try to read texture from the model file
    if (modelPath && typeof modelPath === "string") {
      try {
        const fullModelPath = `${modelPath.replace("minecraft:", "assets/minecraft/models/")}.json`;

        // Find the model file in pack structure
        const found = context.packStructure.modelFiles.find((file) => {
          const normalizedFile = file.replace(/\\/g, "/");
          const normalizedModelPath = fullModelPath.replace(/\\/g, "/");

          // Skip output directories
          if (
            normalizedFile.includes("/dist/") ||
            normalizedFile.includes("/build/") ||
            normalizedFile.includes("/out/")
          ) {
            return false;
          }

          return (
            normalizedFile.endsWith(normalizedModelPath) &&
            (normalizedFile === normalizedModelPath ||
              normalizedFile.endsWith(`/${normalizedModelPath}`))
          );
        });

        if (found) {
          const fs = require("node:fs");
          const modelContent = JSON.parse(fs.readFileSync(found, "utf-8"));
          if (modelContent.textures?.layer0) {
            return modelContent.textures.layer0;
          }
        }
      } catch {
        // Silently continue to fallback
      }
    }

    // Fallback to texture directory search
    const possibleDirs = Object.keys(context.packStructure.textureDirectories).filter(
      (dir) => dir.includes("enchant") || dir.includes("book")
    );

    for (const dir of possibleDirs) {
      const textures = context.packStructure.textureDirectories[dir];
      if (!textures) continue;

      // Try different naming patterns
      const patterns = [
        `${enchantmentName}_${level}.png`,
        `${enchantmentName}.png`,
        `curse_of_${enchantmentName}.png`, // Handle curse transformations
      ];

      for (const pattern of patterns) {
        const found = textures.find((texture) => texture.endsWith(pattern));
        if (found) {
          return found
            .replace(/^.*assets\/minecraft\/textures\//, "minecraft:")
            .replace(/\.png$/, "");
        }
      }
    }

    // Final fallback
    return `minecraft:item/${this.getTextureBaseName(enchantmentName, level)}`;
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

  private buildCITProperties(
    variant: EnchantmentVariant,
    context: ProcessingContext
  ): Record<string, unknown> {
    // CIT properties format should match OptiFine expectations
    return {
      type: "item",
      items: context.itemId, // No minecraft: prefix for items
      model: `assets/minecraft/models/item/enchanted_books/${variant.name}`, // Full path with assets prefix
      enchantmentIDs: variant.enchantment, // Use enchantmentIDs instead of NBT
      enchantmentLevels: variant.level, // Use enchantmentLevels instead of NBT
    };
  }

  private buildPommelModel(
    variant: EnchantmentVariant,
    _context: ProcessingContext
  ): Record<string, unknown> {
    // Get the base enchantment name for 3D model references
    const enchantmentName = variant.enchantment.replace("minecraft:", "");

    return {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: variant.texture,
      },
      overrides: [
        {
          predicate: { "pommel:is_ground": 1 },
          model: `minecraft:item/enchanted_books/${variant.name}`,
        },
        {
          predicate: { "pommel:is_held": 1 },
          model: `minecraft:item/books_3d/${enchantmentName}_3d_open`,
        },
        {
          predicate: { "pommel:is_offhand": 1 },
          model: `minecraft:item/books_3d/${enchantmentName}_3d`,
        },
      ],
    };
  }
}

interface EnchantmentVariant {
  name: string;
  enchantment: string;
  level: number;
  modelPath: string;
  texture: string;
}
