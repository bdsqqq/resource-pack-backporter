import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";
import type { ItemHandler, JsonNode } from "@backporter/handlers";

export class WritableBookContentHandler implements ItemHandler {
  name = "writable-book-content";

  canHandle(jsonNode: JsonNode, _context: ProcessingContext): boolean {
    // Check if this item has writable_book_content component
    return this.hasWritableBookContent(jsonNode);
  }

  process(jsonNode: JsonNode, context: ProcessingContext): WriteRequest[] {
    // Extract context mappings from the JSON
    const contextMappings = this.extractContextMappings(jsonNode, context);

    if (Object.keys(contextMappings).length === 0) {
      return [];
    }

    // Extract texture from one of the models
    const texture = this.extractTexture(contextMappings, context);

    // Create a Pommel model with book-specific overrides
    const pommelModel = this.buildWritableBookPommelModel(contextMappings, texture);

    return [
      {
        type: "pommel-model",
        path: `item/${context.itemId}.json`,
        content: pommelModel,
        merge: "merge-overrides",
        priority: 2, // Higher priority than basic display context
      },
    ];
  }

  private hasWritableBookContent(jsonNode: JsonNode): boolean {
    return this.findWritableBookContentSelector(jsonNode) !== null;
  }

  private findWritableBookContentSelector(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) return null;

    // Type guard for object with string properties
    const record = obj as Record<string, unknown>;

    // Look for writable_book_content component
    if (
      record.component === "minecraft:writable_book_content" ||
      record.predicate === "minecraft:writable_book_content"
    ) {
      return record;
    }

    // Recursively search
    for (const value of Object.values(record)) {
      const found = this.findWritableBookContentSelector(value);
      if (found) return found;
    }

    return null;
  }

  private extractContextMappings(
    jsonNode: JsonNode,
    _context: ProcessingContext
  ): { [context: string]: string } {
    const mappings: { [context: string]: string } = {};

    // Try to extract from display context analysis first
    // The writable book content component is typically nested within display context selection
    const displayContextSelector = this.findDisplayContextSelector(jsonNode);

    if (displayContextSelector && typeof displayContextSelector === "object") {
      const selector = displayContextSelector as Record<string, unknown>;
      // Process cases to find writable book content conditions
      if (selector.cases && Array.isArray(selector.cases)) {
        for (const caseItem of selector.cases) {
          const caseObj = caseItem as Record<string, unknown>;
          if (caseObj.when && caseObj.model) {
            const contexts = Array.isArray(caseObj.when) ? caseObj.when : [caseObj.when];

            // Check if this case has writable book content logic
            const modelPath = this.extractModelFromBookContent(caseObj.model);
            if (modelPath) {
              for (const context of contexts) {
                if (typeof context === "string") {
                  mappings[context] = modelPath;
                }
              }
            }
          }
        }
      }

      // Handle fallback
      if (selector.fallback) {
        const fallbackModel = this.extractModelFromBookContent(selector.fallback);
        if (fallbackModel) {
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
    }

    // If no mappings found, use defaults for writable book
    if (Object.keys(mappings).length === 0) {
      const guiModel = "minecraft:item/enchanted_books/writable_book";
      const rightHandModel = "minecraft:item/books_3d/writable_book_3d_open";
      const leftHandModel = "minecraft:item/books_3d/writable_book_3d";

      mappings.gui = guiModel;
      mappings.fixed = guiModel;
      mappings.ground = guiModel;
      mappings.firstperson_righthand = rightHandModel;
      mappings.thirdperson_righthand = rightHandModel;
      mappings.firstperson_lefthand = leftHandModel;
      mappings.thirdperson_lefthand = leftHandModel;
      mappings.head = leftHandModel;
    }

    return mappings;
  }

  private findDisplayContextSelector(obj: unknown): unknown {
    if (typeof obj !== "object" || obj === null) return null;

    const record = obj as Record<string, unknown>;

    if (record.property === "minecraft:display_context" && record.cases) {
      return record;
    }

    for (const value of Object.values(record)) {
      const found = this.findDisplayContextSelector(value);
      if (found) return found;
    }

    return null;
  }

  private extractModelFromBookContent(modelObj: unknown): string | null {
    if (typeof modelObj === "string") {
      return modelObj;
    }

    if (typeof modelObj !== "object" || modelObj === null) {
      return null;
    }

    const record = modelObj as Record<string, unknown>;

    if (record.type === "minecraft:model" && record.model) {
      return record.model as string;
    }

    // Handle condition logic for book content
    if (
      record.type === "minecraft:condition" &&
      record.predicate === "minecraft:writable_book_content"
    ) {
      // For conditions, we prefer the on_false model (closed book) as it's more common
      const onFalse = record.on_false as Record<string, unknown> | undefined;
      if (onFalse?.model) {
        return onFalse.model as string;
      }
      const onTrue = record.on_true as Record<string, unknown> | undefined;
      if (onTrue?.model) {
        return onTrue.model as string;
      }
    }

    // Recursively search for models
    for (const value of Object.values(record)) {
      const found = this.extractModelFromBookContent(value);
      if (found) return found;
    }

    return null;
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

        const found = context.packStructure.modelFiles.find((file) => {
          const normalizedFile = file.replace(/\\/g, "/");
          const normalizedModelPath = modelPath.replace(/\\/g, "/");

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
            // Debug texture extraction - could add span here if needed
            return modelContent.textures.layer0;
          }
        }
      } catch {
        // Silently continue to fallback texture
      }
    }

    // Fallback to default writable book texture
    return `minecraft:item/${context.itemId}`;
  }

  private buildWritableBookPommelModel(
    contextMappings: { [context: string]: string },
    texture: string
  ): Record<string, unknown> {
    const overrides: Array<{ predicate: Record<string, number>; model: string }> = [];

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
        // Convert any complex model to simple string reference
        const simpleModel = this.extractSimpleModelPath(modelPath);
        overrides.push({
          predicate,
          model: simpleModel,
        });
      }
    }

    return {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: texture,
      },
      overrides,
    };
  }

  private extractSimpleModelPath(modelPath: unknown): string {
    // If it's already a string, return as-is
    if (typeof modelPath === "string") {
      return modelPath;
    }

    if (typeof modelPath !== "object" || modelPath === null) {
      return "minecraft:item/books_3d/writable_book_3d_contents_open";
    }

    const record = modelPath as Record<string, unknown>;

    // If it's a complex condition object, extract the preferred model
    if (record.type === "minecraft:condition") {
      // For writable book content, prefer the "closed book" state (on_false)
      const onFalse = record.on_false as Record<string, unknown> | undefined;
      if (onFalse?.type === "minecraft:model" && onFalse.model) {
        return onFalse.model as string;
      }
      // Fallback to on_true if needed
      const onTrue = record.on_true as Record<string, unknown> | undefined;
      if (onTrue?.type === "minecraft:model" && onTrue.model) {
        return onTrue.model as string;
      }
    }

    // If it's a direct model object
    if (record.type === "minecraft:model" && record.model) {
      return record.model as string;
    }

    // Fallback - return a default model path
    return "minecraft:item/books_3d/writable_book_3d_contents_open";
  }
}
