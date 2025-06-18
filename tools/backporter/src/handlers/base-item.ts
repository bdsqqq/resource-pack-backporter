import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";
import type { ItemHandler, JsonNode } from "@backporter/handlers";

export class BaseItemHandler implements ItemHandler {
  name = "base-item";

  canHandle(_jsonNode: JsonNode, _context: ProcessingContext): boolean {
    // This is a fallback handler - it always can handle any item
    // But it should run last (lowest priority)
    return true;
  }

  process(jsonNode: JsonNode, context: ProcessingContext): WriteRequest[] {
    // For base items, we just need to copy the vanilla model structure
    // and ensure textures are available
    const requests: WriteRequest[] = [];

    // Only generate vanilla model for items that don't have specialized handlers
    // Check if this item has complex component-based logic
    const hasComplexComponents = this.hasComplexComponents(jsonNode);

    if (!hasComplexComponents) {
      // Generate a basic vanilla model
      requests.push({
        type: "vanilla-model",
        path: `item/${context.itemId}.json`,
        content: this.buildBaseModel(context),
        merge: "replace",
        priority: 0, // Lowest priority - only used if no other handlers apply
      });
    }

    // Copy associated textures
    const textureRefs = this.findTextureReferences(context);
    for (const textureRef of textureRefs) {
      requests.push({
        type: "texture-copy",
        path: textureRef.path,
        content: {
          sourcePath: textureRef.sourcePath,
          itemId: textureRef.itemId,
        },
        merge: "replace",
        priority: 0,
      });
    }

    return requests;
  }

  private hasComplexComponents(jsonNode: JsonNode): boolean {
    // Check if this item has component-based selections or display contexts
    // that would be handled by specialized handlers
    return this.hasComponentSelection(jsonNode) || this.hasDisplayContextSelection(jsonNode);
  }

  private hasComponentSelection(obj: unknown): boolean {
    if (typeof obj !== "object" || obj === null) return false;

    const record = obj as Record<string, unknown>;

    // Look for component-based selections
    if (record.component && typeof record.component === "string") return true;

    // Recursively search
    for (const value of Object.values(record)) {
      if (this.hasComponentSelection(value)) return true;
    }

    return false;
  }

  private hasDisplayContextSelection(obj: unknown): boolean {
    if (typeof obj !== "object" || obj === null) return false;

    const record = obj as Record<string, unknown>;

    // Look for display context selections
    if (record.property === "minecraft:display_context") return true;

    // Recursively search
    for (const value of Object.values(record)) {
      if (this.hasDisplayContextSelection(value)) return true;
    }

    return false;
  }

  private buildBaseModel(context: ProcessingContext): Record<string, unknown> {
    // Create a basic generated item model
    return {
      parent: "minecraft:item/generated",
      textures: {
        layer0: `minecraft:item/${context.itemId}`,
      },
    };
  }

  private findTextureReferences(context: ProcessingContext): TextureReference[] {
    const textureRefs: TextureReference[] = [];

    // Look for textures related to this item
    const _itemTexturePath = `assets/minecraft/textures/item/${context.itemId}.png`;

    // Find matching texture files
    const matchingTextures = context.packStructure.textureFiles.filter((texturePath) => {
      const normalizedPath = texturePath.replace(/\\/g, "/");
      return (
        normalizedPath.endsWith(`item/${context.itemId}.png`) ||
        normalizedPath.includes(`${context.itemId}.png`)
      );
    });

    for (const texturePath of matchingTextures) {
      // Convert absolute path to relative path for output
      const relativePath = texturePath.replace(/.*assets\/minecraft\/textures\//, "");

      textureRefs.push({
        path: `textures/${relativePath}`,
        sourcePath: texturePath,
        itemId: context.itemId,
      });
    }

    return textureRefs;
  }
}

interface TextureReference {
  path: string;
  sourcePath: string;
  itemId: string;
}
