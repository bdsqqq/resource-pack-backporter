import type { ExecutionPath, OutputTarget } from "./index";

interface GroupedPaths {
  pommel: ExecutionPath[];
  enchantmentSpecific: ExecutionPath[];
  animated: ExecutionPath[];
  base: ExecutionPath[];
}

export class TargetSystemMapper {
  mapPathsToTargets(paths: ExecutionPath[], itemId: string): OutputTarget[] {
    const targets: OutputTarget[] = [];

    // Group paths by target requirements
    const groupedPaths = this.groupPathsByTarget(paths);

    // Determine if this is a book item or other item type
    const isBookItem = this.isBookItem(itemId);

    if (isBookItem && groupedPaths.enchantmentSpecific.length > 0) {
      // Enchanted book - base model with no overrides (CIT will handle enchantment-specific models)
      targets.push(this.generateBaseModel(itemId));

      // Generate CIT properties that point to individual model files
      targets.push(
        ...this.generateCITProperties(groupedPaths.enchantmentSpecific, itemId)
      );

      // Generate individual model files for each enchantment (with Pommel overrides)
      targets.push(
        ...this.generateEnchantmentSpecificModels(
          groupedPaths.enchantmentSpecific,
          groupedPaths.pommel,
          itemId
        )
      );
    } else if (isBookItem) {
      // Regular book - base model with Pommel overrides
      targets.push(this.generateRegularBookModel(groupedPaths.pommel, itemId));
    } else {
      // Non-book item - generate generic model with correct texture paths
      targets.push(
        this.generateGenericItemModel(groupedPaths.pommel, paths, itemId)
      );
    }

    // Generate enhanced 3D models with animation data preserved
    targets.push(
      ...this.generateEnhanced3DModels(groupedPaths.animated, itemId)
    );

    return targets;
  }

  private groupPathsByTarget(paths: ExecutionPath[]): GroupedPaths {
    const grouped: GroupedPaths = {
      pommel: [],
      enchantmentSpecific: [],
      animated: [],
      base: [],
    };

    for (const path of paths) {
      // GUI context with enchantments → CIT properties
      if (
        this.isGUIContext(path.conditions.displayContext) &&
        path.conditions.enchantment
      ) {
        grouped.enchantmentSpecific.push(path);
      }
      // 3D contexts OR ground context → Pommel overrides
      else if (
        this.is3DContext(path.conditions.displayContext) ||
        this.isGroundContext(path.conditions.displayContext)
      ) {
        grouped.pommel.push(path);

        // Check if this is an animated enchantment model
        if (this.isAnimatedModel(path.targetModel)) {
          grouped.animated.push(path);
        }
      }
      // Base textures (gui, fixed)
      else {
        grouped.base.push(path);
      }
    }

    return grouped;
  }

  private generateBaseModel(itemId: string): OutputTarget {
    // Generate a base model with basic Pommel overrides as fallback
    // CIT will replace this for specific enchantments, but this provides a working fallback
    return {
      type: "pommel",
      file: `models/item/${itemId}.json`,
      content: {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: `minecraft:item/enchanted_books/${itemId}`,
        },
        overrides: [
          {
            predicate: {
              "pommel:is_held": 1,
            },
            model: `minecraft:item/books_3d/${itemId}_3d_open`,
          },
          {
            predicate: {
              "pommel:is_offhand": 1,
            },
            model: `minecraft:item/books_3d/${itemId}_3d`,
          },
        ],
      },
      priority: 1,
    };
  }

  private generateRegularBookModel(
    pommelPaths: ExecutionPath[],
    itemId: string
  ): OutputTarget {
    // Generate a base model with Pommel overrides for regular (non-enchanted) books
    const overrides = this.createRegularBookOverrides(pommelPaths);

    return {
      type: "pommel",
      file: `models/item/${itemId}.json`,
      content: {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: `minecraft:item/enchanted_books/${itemId}`,
        },
        overrides: overrides,
      },
      priority: 1,
    };
  }

  private generateEnchantmentSpecificModels(
    enchantmentPaths: ExecutionPath[],
    pommelPaths: ExecutionPath[],
    itemId: string
  ): OutputTarget[] {
    const targets: OutputTarget[] = [];
    const itemType = this.categorizeItem(itemId);

    // Group enchantment paths by enchantment type and level
    const enchantmentGroups = new Map<string, ExecutionPath[]>();

    for (const path of enchantmentPaths) {
      if (path.conditions.enchantment) {
        const key = `${path.conditions.enchantment.type}_${path.conditions.enchantment.level}`;
        if (!enchantmentGroups.has(key)) {
          enchantmentGroups.set(key, []);
        }
        enchantmentGroups.get(key)!.push(path);
      }
    }

    // Generate a model file for each enchantment
    for (const [enchantmentKey, enchantmentPaths] of enchantmentGroups) {
      const enchantment = enchantmentPaths[0].conditions.enchantment!;

      // Create Pommel overrides for this specific enchantment
      const overrides = this.createPommelOverrides(pommelPaths, enchantment);

      // Generate appropriate paths based on item type
      const modelPath =
        itemType === "book"
          ? `models/item/enchanted_books/${enchantmentKey}.json`
          : `models/item/${itemId}_${enchantmentKey}.json`;

      const enchantmentTexturePath = this.getEnchantmentTexturePath(
        itemId,
        enchantment,
        itemType
      );

      // For now, always use enchantment texture path (fallback can be added later with proper pack structure)
      const texturePath = enchantmentTexturePath;

      targets.push({
        type: "pommel",
        file: modelPath,
        content: {
          parent: "minecraft:item/handheld",
          textures: {
            layer0: texturePath,
          },
          overrides: overrides,
        },
        priority: 2,
      });
    }

    return targets;
  }

  private createPommelOverrides(
    pommelPaths: ExecutionPath[],
    enchantment: { type: string; level: number }
  ): any[] {
    const overrides: any[] = [];

    // Convert display contexts to Pommel predicates
    const contextMapping = {
      gui: null, // Base texture, no override needed
      fixed: null,
      ground: "pommel:is_ground",
      firstperson_righthand: "pommel:is_held",
      thirdperson_righthand: "pommel:is_held",
      firstperson_lefthand: "pommel:is_offhand",
      thirdperson_lefthand: "pommel:is_offhand",
      head: "pommel:is_offhand", // head context treated as offhand
    } as const;

    // Group paths by predicate to avoid duplicates
    const predicateGroups = new Map<string, ExecutionPath[]>();

    for (const path of pommelPaths) {
      for (const context of path.conditions.displayContext) {
        const predicate =
          contextMapping[context as keyof typeof contextMapping];
        if (predicate) {
          const key = predicate;
          if (!predicateGroups.has(key)) {
            predicateGroups.set(key, []);
          }
          predicateGroups.get(key)!.push(path);
        }
      }
    }

    // Always add ground predicate for enchanted books (points to 2D texture)
    overrides.push({
      predicate: { "pommel:is_ground": 1 },
      model: `minecraft:item/enchanted_books/${this.getTextureNameForEnchantment(
        enchantment
      )}`,
    });

    // Generate overrides from grouped predicates
    for (const [predicate, groupPaths] of predicateGroups) {
      // Skip ground predicate as we handle it above
      if (predicate === "pommel:is_ground") continue;

      // Find the appropriate 3D model for this enchantment and context
      const contextModel = this.findContextModelForEnchantment(
        groupPaths,
        enchantment,
        predicate
      );

      if (contextModel) {
        overrides.push({
          predicate: { [predicate]: 1 },
          model: contextModel,
        });
      }
    }

    // Deduplicate overrides
    return this.deduplicateOverrides(overrides);
  }

  private createRegularBookOverrides(pommelPaths: ExecutionPath[]): any[] {
    const overrides: any[] = [];

    // Convert display contexts to Pommel predicates
    const contextMapping = {
      gui: null, // Base texture, no override needed
      fixed: null,
      ground: "pommel:is_ground",
      firstperson_righthand: "pommel:is_held",
      thirdperson_righthand: "pommel:is_held",
      firstperson_lefthand: "pommel:is_offhand",
      thirdperson_lefthand: "pommel:is_offhand",
      head: "pommel:is_offhand", // head context treated as offhand
    } as const;

    // Group paths by predicate to avoid duplicates
    const predicateGroups = new Map<string, ExecutionPath[]>();

    for (const path of pommelPaths) {
      for (const context of path.conditions.displayContext) {
        const predicate =
          contextMapping[context as keyof typeof contextMapping];
        if (predicate) {
          const key = predicate;
          if (!predicateGroups.has(key)) {
            predicateGroups.set(key, []);
          }
          predicateGroups.get(key)!.push(path);
        }
      }
    }

    // Generate overrides from grouped predicates
    for (const [predicate, groupPaths] of predicateGroups) {
      // Find the appropriate model for this context
      const contextModel = this.findContextModelForRegularBook(
        groupPaths,
        predicate
      );

      if (contextModel) {
        overrides.push({
          predicate: { [predicate]: 1 },
          model: contextModel,
        });
      }
    }

    // Deduplicate overrides
    return this.deduplicateOverrides(overrides);
  }

  private findContextModelForRegularBook(
    paths: ExecutionPath[],
    predicate: string
  ): string | null {
    // Find the model path for this context from the execution paths
    for (const path of paths) {
      if (
        path.conditions.displayContext.some((ctx) => {
          const contextMapping = {
            ground: "pommel:is_ground",
            firstperson_righthand: "pommel:is_held",
            thirdperson_righthand: "pommel:is_held",
            firstperson_lefthand: "pommel:is_offhand",
            thirdperson_lefthand: "pommel:is_offhand",
            head: "pommel:is_offhand",
          } as const;
          return (
            contextMapping[ctx as keyof typeof contextMapping] === predicate
          );
        })
      ) {
        return path.targetModel;
      }
    }

    return null;
  }

  private findContextModelForEnchantment(
    paths: ExecutionPath[],
    enchantment: { type: string; level: number },
    predicate: string
  ): string | null {
    // Find the 3D model path for this enchantment and context
    for (const path of paths) {
      if (path.conditions.enchantment?.type === enchantment.type) {
        // Use the specific enchantment 3D model if available
        return path.targetModel;
      }
    }

    // Fallback to generic 3D models based on context
    if (predicate === "pommel:is_held") {
      return `minecraft:item/books_3d/${enchantment.type}_3d_open`;
    } else if (predicate === "pommel:is_offhand") {
      return `minecraft:item/books_3d/${enchantment.type}_3d`;
    } else if (predicate === "pommel:is_ground") {
      return `minecraft:item/enchanted_books/${this.getTextureNameForEnchantment(
        enchantment
      )}`;
    }

    return null;
  }

  private generatePommelModel_UNUSED(
    paths: ExecutionPath[],
    itemId: string
  ): OutputTarget {
    const overrides: any[] = [];

    // Convert display contexts to Pommel predicates
    const contextMapping = {
      gui: null, // Base texture, no override needed
      fixed: null,
      ground: "pommel:is_ground",
      firstperson_righthand: "pommel:is_held",
      thirdperson_righthand: "pommel:is_held",
      firstperson_lefthand: "pommel:is_offhand",
      thirdperson_lefthand: "pommel:is_offhand",
      head: "pommel:is_offhand", // head context treated as offhand
    } as const;

    // Group paths by predicate to avoid duplicates
    const predicateGroups = new Map<string, ExecutionPath[]>();

    for (const path of paths) {
      for (const context of path.conditions.displayContext) {
        const predicate =
          contextMapping[context as keyof typeof contextMapping];
        if (predicate) {
          const key = predicate;
          if (!predicateGroups.has(key)) {
            predicateGroups.set(key, []);
          }
          predicateGroups.get(key)!.push(path);
        }
      }
    }

    // Generate overrides from grouped predicates
    for (const [predicate, groupPaths] of predicateGroups) {
      // Choose the fallback model for this predicate (highest priority fallback)
      const fallbackPath = groupPaths
        .filter((p) => p.isFallback)
        .sort((a, b) => b.priority - a.priority)[0];

      if (fallbackPath) {
        overrides.push({
          predicate: { [predicate]: 1 },
          model: fallbackPath.targetModel,
        });
      }
    }

    // Deduplicate overrides
    const deduplicatedOverrides = this.deduplicateOverrides(overrides);

    return {
      type: "pommel",
      file: `models/item/${itemId}.json`,
      content: {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: `minecraft:item/enchanted_books/${itemId}`,
        },
        overrides: deduplicatedOverrides,
      },
      priority: 1,
    };
  }

  private generateCITProperties(
    paths: ExecutionPath[],
    itemId: string
  ): OutputTarget[] {
    const citProperties = new Map<string, OutputTarget>();

    for (const path of paths) {
      if (path.conditions.enchantment) {
        const enchantment = path.conditions.enchantment;
        const key = `${enchantment.type}_${enchantment.level}`;

        if (!citProperties.has(key)) {
          citProperties.set(key, {
            type: "cit_property",
            file: `optifine/cit/${key}.properties`,
            content: {
              type: "item",
              items: "enchanted_book",
              model: `assets/minecraft/models/item/enchanted_books/${key}`,
              enchantmentIDs: `minecraft:${enchantment.type}`,
              enchantmentLevels: enchantment.level,
            },
            priority: 2,
          });
        }
      }
    }

    return Array.from(citProperties.values());
  }

  private generateEnhanced3DModels(
    paths: ExecutionPath[],
    itemId: string
  ): OutputTarget[] {
    const targets: OutputTarget[] = [];

    for (const path of paths) {
      if (this.isAnimatedModel(path.targetModel)) {
        // For animated models, we need to preserve the model structure
        // but the actual model files should already exist in the source pack
        // We just need to ensure they get copied over
        targets.push({
          type: "enhanced_model",
          file: `${path.targetModel}.json`,
          content: null, // Will be copied from source
          priority: 3,
        });
      }
    }

    return targets;
  }

  private isGUIContext(contexts: string[]): boolean {
    return contexts.some((ctx) => ["gui", "fixed"].includes(ctx));
  }

  private isGroundContext(contexts: string[]): boolean {
    return contexts.some((ctx) => ctx === "ground");
  }

  private is3DContext(contexts: string[]): boolean {
    return contexts.some((ctx) =>
      [
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ].includes(ctx)
    );
  }

  private isAnimatedModel(modelPath: string): boolean {
    // Models with animation effects (like channeling with lightning)
    const animatedEnchantments = [
      "channeling",
      "flame",
      "fire_aspect",
      "riptide",
    ];

    return animatedEnchantments.some(
      (enchant) => modelPath.includes(enchant) && modelPath.includes("3d")
    );
  }

  private deduplicateOverrides(overrides: any[]): any[] {
    // Based on Pommel source analysis: when item is in offhand, BOTH
    // pommel:is_held and pommel:is_offhand return 1.0 simultaneously.
    // The reference pack uses duplicates to ensure correct model priority.
    // Pattern: 1x ground, 2x held, 3x offhand (offhand needs higher priority)

    const result: any[] = [];

    // Add ground predicate once
    const groundOverride = overrides.find(
      (o) => o.predicate["pommel:is_ground"]
    );
    if (groundOverride) {
      result.push(groundOverride);
    }

    // Add held predicate twice (for main hand priority)
    const heldOverride = overrides.find((o) => o.predicate["pommel:is_held"]);
    if (heldOverride) {
      result.push(heldOverride);
      result.push({ ...heldOverride }); // Duplicate for priority
    }

    // Add offhand predicate three times (needs highest priority to override held)
    const offhandOverride = overrides.find(
      (o) => o.predicate["pommel:is_offhand"]
    );
    if (offhandOverride) {
      result.push(offhandOverride);
      result.push({ ...offhandOverride }); // Duplicate 1
      result.push({ ...offhandOverride }); // Duplicate 2
    }

    console.log(
      `Generated ${result.length} overrides with Pommel-compatible duplicates`
    );
    if (result.length < 6) {
      console.log(
        "DEBUG: Overrides found:",
        overrides.map((o: any) => Object.keys(o.predicate)[0])
      );
      console.log(
        "DEBUG: Result predicates:",
        result.map((o: any) => Object.keys(o.predicate)[0])
      );
    }
    return result;

    // Original deduplication logic (commented out for testing)
    // const uniqueOverrides = new Map();
    //
    // for (const override of overrides) {
    //   const key = JSON.stringify(override.predicate);
    //   if (!uniqueOverrides.has(key)) {
    //     uniqueOverrides.set(key, override);
    //   } else {
    //     console.warn(`Duplicate predicate detected and skipped: ${key}`);
    //   }
    // }
    //
    // return Array.from(uniqueOverrides.values());
  }

  private getTextureNameForEnchantment(enchantment: {
    type: string;
    level: number;
  }): string {
    // Handle name mappings for curse enchantments
    const nameMapping = {
      binding_curse: "curse_of_binding",
      vanishing_curse: "curse_of_vanishing",
    } as const;

    const baseName =
      nameMapping[enchantment.type as keyof typeof nameMapping] ||
      enchantment.type;

    // Single-level enchantments (no level suffix)
    const singleLevelEnchantments = [
      "aqua_affinity",
      "channeling",
      "curse_of_binding",
      "curse_of_vanishing",
      "flame",
      "infinity",
      "mending",
      "multishot",
      "silk_touch",
    ];

    if (singleLevelEnchantments.includes(baseName)) {
      return baseName;
    }

    // Multi-level enchantments (with level suffix)
    return `${baseName}_${enchantment.level}`;
  }

  private isBookItem(itemId: string): boolean {
    return itemId.includes("book") || itemId === "enchanted_book";
  }

  private categorizeItem(
    itemId: string
  ): "book" | "tool" | "weapon" | "armor" | "other" {
    if (itemId.includes("book")) return "book";

    const tools = [
      "pickaxe",
      "axe",
      "shovel",
      "hoe",
      "shears",
      "flint_and_steel",
      "fishing_rod",
    ];
    if (tools.some((tool) => itemId.includes(tool))) return "tool";

    const weapons = ["sword", "bow", "crossbow", "trident", "mace"];
    if (weapons.some((weapon) => itemId.includes(weapon))) return "weapon";

    const armor = ["helmet", "chestplate", "leggings", "boots"];
    if (armor.some((piece) => itemId.includes(piece))) return "armor";

    return "other";
  }

  private generateGenericItemModel(
    pommelPaths: ExecutionPath[],
    allPaths: ExecutionPath[],
    itemId: string
  ): OutputTarget {
    // For non-book items, extract texture from the GUI model and generate proper Pommel overrides
    const textureRef = this.extractBaseTexture(allPaths, itemId);
    const overrides = this.createGenericPommelOverrides(pommelPaths, allPaths);

    return {
      type: "pommel",
      file: `models/item/${itemId}.json`,
      content: {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: textureRef,
        },
        overrides: overrides,
      },
      priority: 1,
    };
  }

  private extractBaseTexture(paths: ExecutionPath[], itemId: string): string {
    // Find the GUI model path to extract texture reference
    const guiPath = paths.find(
      (path) =>
        path.conditions.displayContext.includes("gui") ||
        path.conditions.displayContext.includes("fixed")
    );

    if (guiPath && guiPath.targetModel) {
      // Try to extract texture from the 2D model path
      const modelPath = guiPath.targetModel.replace("minecraft:", "");
      if (modelPath.endsWith("_2d")) {
        // Convert 2D model path to 3D texture path
        const baseName = modelPath.replace("item/", "").replace("_2d", "");
        return `minecraft:item/${baseName}_3d`;
      }
    }

    // Fallback to default
    return `minecraft:item/${itemId}`;
  }

  private createGenericPommelOverrides(
    pommelPaths: ExecutionPath[],
    allPaths: ExecutionPath[]
  ): any[] {
    const overrides: any[] = [];

    // Map ground context to Pommel predicate with the 3D model
    const groundPath = allPaths.find(
      (path) =>
        path.conditions.displayContext.includes("ground") ||
        (!path.conditions.displayContext.includes("gui") &&
          !path.conditions.displayContext.includes("fixed"))
    );

    if (groundPath && groundPath.targetModel) {
      overrides.push({
        predicate: {
          "pommel:is_ground": 1,
        },
        model: groundPath.targetModel,
      });
    }

    return overrides;
  }

  private getEnchantmentTexturePath(
    itemId: string,
    enchantment: { type: string; level: number },
    itemType: string
  ): string {
    switch (itemType) {
      case "book":
        return `minecraft:item/enchanted_books/${this.getTextureNameForEnchantment(
          enchantment
        )}`;
      case "tool":
      case "weapon":
        return `minecraft:item/enchanted_${itemId}_${enchantment.type}_${enchantment.level}`;
      case "armor":
        // Armor typically doesn't vary by level for visual purposes
        return `minecraft:item/enchanted_${itemId}_${enchantment.type}`;
      default:
        return `minecraft:item/${itemId}`;
    }
  }

  private textureExists(texturePath: string, packStructure?: any): boolean {
    if (!packStructure?.textureFiles) return false;

    // Convert texture reference to file path
    const filePath =
      texturePath
        .replace("minecraft:item/", "assets/minecraft/textures/item/")
        .replace("minecraft:", "assets/minecraft/textures/") + ".png";

    return packStructure.textureFiles.some((file: string) =>
      file.replace(/\\/g, "/").endsWith(filePath.replace(/\\/g, "/"))
    );
  }
}
