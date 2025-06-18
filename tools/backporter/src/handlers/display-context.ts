import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";
import type { ItemHandler, JsonNode } from "@backporter/handlers";

export class DisplayContextHandler implements ItemHandler {
  name = "display-context";

  canHandle(jsonNode: JsonNode, _context: ProcessingContext): boolean {
    // Check if this item has display context switching
    return this.hasDisplayContextSelection(jsonNode);
  }

  process(jsonNode: JsonNode, context: ProcessingContext): WriteRequest[] {
    // Extract context mappings from the JSON
    const contextMappings = this.extractContextMappings(jsonNode);

    if (Object.keys(contextMappings).length === 0) {
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

  private hasDisplayContextSelection(jsonNode: JsonNode): boolean {
    return this.findDisplayContextSelector(jsonNode) !== null;
  }

  private findDisplayContextSelector(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) return null;

    // Type guard for object with string properties
    const record = obj as Record<string, unknown>;

    // Look for display context selection
    if (record.property === "minecraft:display_context" && record.cases) {
      return record;
    }

    // Recursively search
    for (const value of Object.values(record)) {
      const found = this.findDisplayContextSelector(value);
      if (found) return found;
    }

    return null;
  }

  private hasNestedComponentSelections(selector: unknown): boolean {
    if (typeof selector !== "object" || selector === null) return false;

    const record = selector as Record<string, unknown>;

    // Check if any case contains component-based selections
    if (!record.cases || !Array.isArray(record.cases)) return false;

    for (const caseItem of record.cases) {
      if (typeof caseItem !== "object" || caseItem === null) continue;

      const caseObj = caseItem as Record<string, unknown>;
      if (caseObj.model && typeof caseObj.model === "object") {
        // Check if the model contains component selections
        if (this.containsComponentSelection(caseObj.model)) {
          return true;
        }
      }
    }

    return false;
  }

  private containsComponentSelection(obj: unknown): boolean {
    if (typeof obj !== "object" || obj === null) return false;

    const record = obj as Record<string, unknown>;

    // Look for component-based selections
    if (record.component && typeof record.component === "string") return true;

    // Recursively search
    for (const value of Object.values(record)) {
      if (this.containsComponentSelection(value)) return true;
    }

    return false;
  }

  private extractContextMappings(jsonNode: JsonNode): {
    [context: string]: string;
  } {
    const mappings: { [context: string]: string } = {};
    const selector = this.findDisplayContextSelector(jsonNode);

    if (!selector) return mappings;

    // Check if this has nested component selections - if so, skip it
    if (this.hasNestedComponentSelections(selector)) {
      return mappings;
    }

    if (typeof selector !== "object" || selector === null) return mappings;

    const selectorRecord = selector as Record<string, unknown>;

    // Process cases
    if (selectorRecord.cases && Array.isArray(selectorRecord.cases)) {
      for (const caseItem of selectorRecord.cases) {
        if (typeof caseItem !== "object" || caseItem === null) continue;

        const caseObj = caseItem as Record<string, unknown>;
        if (caseObj.when && caseObj.model) {
          const contexts = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];
          const modelPath = this.extractModelPath(caseObj.model);

          for (const context of contexts) {
            if (typeof context === "string") {
              mappings[context] = modelPath;
            }
          }
        }
      }
    }

    // Process fallback
    if (
      selectorRecord.fallback &&
      typeof selectorRecord.fallback === "object" &&
      selectorRecord.fallback !== null
    ) {
      const fallback = selectorRecord.fallback as Record<string, unknown>;
      if (fallback.model) {
        const fallbackModel = this.extractModelPath(fallback.model);

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
    }

    return mappings;
  }

  private extractModelPath(model: unknown): string {
    if (typeof model === "string") {
      return model;
    }

    if (typeof model === "object" && model !== null) {
      const modelRecord = model as Record<string, unknown>;
      if (modelRecord.model && typeof modelRecord.model === "string") {
        return modelRecord.model;
      }
    }

    return "";
  }

  private extractTexture(
    contextMappings: { [context: string]: string },
    context: ProcessingContext
  ): string {
    // Try to read texture from GUI model first
    const guiModel = contextMappings.gui || contextMappings.fixed;

    if (guiModel) {
      try {
        const modelPath = `${guiModel.replace("minecraft:", "assets/minecraft/models/")}.json`;

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
            return modelContent.textures.layer0;
          }
        }
      } catch {
        // Silently continue to fallback texture
      }
    }

    // Fallback to default texture
    return `minecraft:item/${context.itemId}`;
  }

  private buildPommelModel(
    contextMappings: { [context: string]: string },
    texture: string
  ): Record<string, unknown> {
    const overrides: Array<{
      predicate: Record<string, number>;
      model: string;
    }> = [];

    // Map contexts to Pommel predicates
    const contextToPredicates: { [context: string]: Record<string, number> } = {
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
