import type { WriteRequest, ProcessingContext } from "@backporter/file-manager";
import type { ItemHandler } from "@backporter/handlers";

export class DisplayContextHandler implements ItemHandler {
  name = "display-context";

  canHandle(jsonNode: any, context: ProcessingContext): boolean {
    // Check if this item has display context switching
    return this.hasDisplayContextSelection(jsonNode);
  }

  process(jsonNode: any, context: ProcessingContext): WriteRequest[] {
    console.log(`🎯 DisplayContextHandler processing ${context.itemId}`);

    // Extract context mappings from the JSON
    const contextMappings = this.extractContextMappings(jsonNode);

    if (Object.keys(contextMappings).length === 0) {
      console.log(`⚠️  No context mappings found for ${context.itemId}`);
      return [];
    }

    // Extract texture from one of the models
    const texture = this.extractTexture(contextMappings, context);

    // Create a Pommel model with overrides
    const pommelModel = this.buildPommelModel(contextMappings, texture);

    return [
      {
        type: "pommel-model",
        path: `item/${context.itemId}.json`,
        content: pommelModel,
        merge: "merge-overrides",
        priority: 1,
      },
    ];
  }

  private hasDisplayContextSelection(jsonNode: any): boolean {
    return this.findDisplayContextSelector(jsonNode) !== null;
  }

  private findDisplayContextSelector(obj: any): any {
    if (typeof obj !== "object" || obj === null) return null;

    // Look for display context selection
    if (obj.property === "minecraft:display_context" && obj.cases) {
      return obj;
    }

    // Recursively search
    for (const value of Object.values(obj)) {
      const found = this.findDisplayContextSelector(value);
      if (found) return found;
    }

    return null;
  }

  private hasNestedComponentSelections(selector: any): boolean {
    // Check if any case contains component-based selections
    if (!selector.cases || !Array.isArray(selector.cases)) return false;

    for (const caseObj of selector.cases) {
      if (caseObj.model && typeof caseObj.model === "object") {
        // Check if the model contains component selections
        if (this.containsComponentSelection(caseObj.model)) {
          return true;
        }
      }
    }

    return false;
  }

  private containsComponentSelection(obj: any): boolean {
    if (typeof obj !== "object" || obj === null) return false;

    // Look for component-based selections
    if (obj.component && typeof obj.component === "string") return true;

    // Recursively search
    for (const value of Object.values(obj)) {
      if (this.containsComponentSelection(value)) return true;
    }

    return false;
  }

  private extractContextMappings(jsonNode: any): { [context: string]: string } {
    const mappings: { [context: string]: string } = {};
    const selector = this.findDisplayContextSelector(jsonNode);

    if (!selector) return mappings;

    // Check if this has nested component selections - if so, skip it
    if (this.hasNestedComponentSelections(selector)) {
      console.log(
        `🔍 Skipping complex nested component selection for display context handler`
      );
      return mappings;
    }

    // Process cases
    if (selector.cases && Array.isArray(selector.cases)) {
      for (const caseObj of selector.cases) {
        if (caseObj.when && caseObj.model) {
          const contexts = Array.isArray(caseObj.when)
            ? caseObj.when
            : [caseObj.when];
          const modelPath = caseObj.model.model || caseObj.model;

          for (const context of contexts) {
            if (typeof context === "string") {
              mappings[context] = modelPath;
            }
          }
        }
      }
    }

    // Process fallback
    if (selector.fallback && selector.fallback.model) {
      const fallbackModel = selector.fallback.model;

      // Add fallback for contexts not explicitly handled
      const standardContexts = [
        "gui",
        "fixed",
        "ground",
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ];

      for (const context of standardContexts) {
        if (!mappings[context]) {
          mappings[context] = fallbackModel;
        }
      }
    }

    return mappings;
  }

  private extractTexture(
    contextMappings: { [context: string]: string },
    context: ProcessingContext
  ): string {
    // Try to read texture from GUI model first
    const guiModel = contextMappings.gui || contextMappings.fixed;

    if (guiModel) {
      try {
        const modelPath =
          guiModel.replace("minecraft:", "assets/minecraft/models/") + ".json";

        // Find the model file in pack structure
        const found = context.packStructure.modelFiles.find((file) => {
          const normalizedFile = file.replace(/\\/g, "/");
          const normalizedModelPath = modelPath.replace(/\\/g, "/");

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
            console.log(
              `🎨 Extracted texture: ${modelContent.textures.layer0}`
            );
            return modelContent.textures.layer0;
          }
        }
      } catch (error) {
        console.log(`⚠️  Error reading model for texture: ${error.message}`);
      }
    }

    // Fallback to default texture
    return `minecraft:item/${context.itemId}`;
  }

  private buildPommelModel(
    contextMappings: { [context: string]: string },
    texture: string
  ): any {
    const overrides = [];

    // Map contexts to Pommel predicates
    const contextToPredicates: { [context: string]: any } = {
      firstperson_righthand: { "pommel:is_held": 1.0 },
      thirdperson_righthand: { "pommel:is_held": 1.0 },
      firstperson_lefthand: { "pommel:is_offhand": 1.0 },
      thirdperson_lefthand: { "pommel:is_offhand": 1.0 },
      head: { "pommel:is_offhand": 1.0 },
      ground: { "pommel:is_ground": 1.0 },
    };

    // Create overrides for contexts that Pommel can handle
    for (const [context, modelPath] of Object.entries(contextMappings)) {
      const predicate = contextToPredicates[context];
      if (predicate) {
        overrides.push({
          predicate,
          model: modelPath,
        });
      }
    }

    // Build the model - use handheld base for proper Pommel behavior
    return {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: texture,
      },
      overrides,
    };
  }
}
