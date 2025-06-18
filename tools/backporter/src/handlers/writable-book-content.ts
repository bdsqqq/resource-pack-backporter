import type { WriteRequest, ProcessingContext } from "@backporter/file-manager";
import type { ItemHandler } from "@backporter/handlers";

export class WritableBookContentHandler implements ItemHandler {
  name = "writable-book-content";

  canHandle(jsonNode: any, context: ProcessingContext): boolean {
    // Check if this item has writable_book_content component
    return this.hasWritableBookContent(jsonNode);
  }

  process(jsonNode: any, context: ProcessingContext): WriteRequest[] {
    // Extract context mappings from the JSON
    const contextMappings = this.extractContextMappings(jsonNode, context);

    if (Object.keys(contextMappings).length === 0) {
      return [];
    }

    // Extract texture from one of the models
    const texture = this.extractTexture(contextMappings, context);

    // Create a Pommel model with book-specific overrides
    const pommelModel = this.buildWritableBookPommelModel(
      contextMappings,
      texture
    );

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

  private hasWritableBookContent(jsonNode: any): boolean {
    return this.findWritableBookContentSelector(jsonNode) !== null;
  }

  private findWritableBookContentSelector(obj: any): any {
    if (typeof obj !== "object" || obj === null) return null;

    // Look for writable_book_content component
    if (
      obj.component === "minecraft:writable_book_content" ||
      obj.predicate === "minecraft:writable_book_content"
    ) {
      return obj;
    }

    // Recursively search
    for (const value of Object.values(obj)) {
      const found = this.findWritableBookContentSelector(value);
      if (found) return found;
    }

    return null;
  }

  private extractContextMappings(
    jsonNode: any,
    context: ProcessingContext
  ): { [context: string]: string } {
    const mappings: { [context: string]: string } = {};

    // Try to extract from display context analysis first
    // The writable book content component is typically nested within display context selection
    const displayContextSelector = this.findDisplayContextSelector(jsonNode);

    if (displayContextSelector) {
      // Process cases to find writable book content conditions
      if (
        displayContextSelector.cases &&
        Array.isArray(displayContextSelector.cases)
      ) {
        for (const caseObj of displayContextSelector.cases) {
          if (caseObj.when && caseObj.model) {
            const contexts = Array.isArray(caseObj.when)
              ? caseObj.when
              : [caseObj.when];

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
      if (displayContextSelector.fallback) {
        const fallbackModel = this.extractModelFromBookContent(
          displayContextSelector.fallback
        );
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

  private findDisplayContextSelector(obj: any): any {
    if (typeof obj !== "object" || obj === null) return null;

    if (obj.property === "minecraft:display_context" && obj.cases) {
      return obj;
    }

    for (const value of Object.values(obj)) {
      const found = this.findDisplayContextSelector(value);
      if (found) return found;
    }

    return null;
  }

  private extractModelFromBookContent(modelObj: any): string | null {
    if (typeof modelObj === "string") {
      return modelObj;
    }

    if (modelObj.type === "minecraft:model" && modelObj.model) {
      return modelObj.model;
    }

    // Handle condition logic for book content
    if (
      modelObj.type === "minecraft:condition" &&
      modelObj.predicate === "minecraft:writable_book_content"
    ) {
      // For conditions, we prefer the on_false model (closed book) as it's more common
      if (modelObj.on_false && modelObj.on_false.model) {
        return modelObj.on_false.model;
      }
      if (modelObj.on_true && modelObj.on_true.model) {
        return modelObj.on_true.model;
      }
    }

    // Recursively search for models
    if (typeof modelObj === "object") {
      for (const value of Object.values(modelObj)) {
        const found = this.extractModelFromBookContent(value);
        if (found) return found;
      }
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
        const modelPath =
          guiModel.replace("minecraft:", "assets/minecraft/models/") + ".json";

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
            console.log(
              `📚 Extracted book texture: ${modelContent.textures.layer0}`
            );
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

  private extractSimpleModelPath(modelPath: any): string {
    // If it's already a string, return as-is
    if (typeof modelPath === "string") {
      return modelPath;
    }

    // If it's a complex condition object, extract the preferred model
    if (
      typeof modelPath === "object" &&
      modelPath.type === "minecraft:condition"
    ) {
      // For writable book content, prefer the "closed book" state (on_false)
      if (
        modelPath.on_false?.type === "minecraft:model" &&
        modelPath.on_false.model
      ) {
        return modelPath.on_false.model;
      }
      // Fallback to on_true if needed
      if (
        modelPath.on_true?.type === "minecraft:model" &&
        modelPath.on_true.model
      ) {
        return modelPath.on_true.model;
      }
    }

    // If it's a direct model object
    if (
      typeof modelPath === "object" &&
      modelPath.type === "minecraft:model" &&
      modelPath.model
    ) {
      return modelPath.model;
    }

    // Fallback - return a default model path
    return "minecraft:item/books_3d/writable_book_3d_contents_open";
  }
}
