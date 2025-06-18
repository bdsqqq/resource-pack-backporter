import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";
import type { FileWriter } from "@backporter/writers";

interface ModelOverride {
  predicate?: Record<string, unknown>;
  model?: string;
}

interface MinecraftModel {
  parent?: string;
  textures?: Record<string, string>;
  overrides?: ModelOverride[];
}

export class VanillaModelWriter implements FileWriter {
  name = "vanilla-model";

  canWrite(request: WriteRequest): boolean {
    return request.type === "vanilla-model";
  }

  async write(request: WriteRequest, outputDir: string): Promise<void> {
    const fullPath = join(outputDir, "assets/minecraft/models", request.path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Format the vanilla model
    const modelContent = this.formatVanillaModel(request.content);

    // Write the file
    await writeFile(fullPath, JSON.stringify(modelContent, null, 2));
  }

  private formatVanillaModel(content: unknown): MinecraftModel {
    if (!this.isMinecraftModelContent(content)) {
      return {
        parent: "minecraft:item/generated",
        textures: {},
      };
    }

    // Ensure the model has the correct structure for vanilla Minecraft
    const result: MinecraftModel = {
      parent: content.parent || "minecraft:item/generated",
      textures: this.extractTextures(content.textures),
    };

    const overrides = this.extractOverrides(content.overrides);
    if (overrides.length > 0) {
      result.overrides = overrides;
    }

    return result;
  }

  private isMinecraftModelContent(value: unknown): value is MinecraftModel {
    return typeof value === "object" && value !== null;
  }

  private extractTextures(textures: unknown): Record<string, string> {
    if (typeof textures === "object" && textures !== null) {
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(textures)) {
        if (typeof value === "string") {
          result[key] = value;
        }
      }
      return result;
    }
    return {};
  }

  private extractOverrides(overrides: unknown): ModelOverride[] {
    if (Array.isArray(overrides)) {
      return overrides
        .filter(
          (item): item is Record<string, unknown> => typeof item === "object" && item !== null
        )
        .map(
          (item): ModelOverride => ({
            predicate:
              typeof item.predicate === "object" && item.predicate !== null
                ? (item.predicate as Record<string, unknown>)
                : undefined,
            model: typeof item.model === "string" ? item.model : undefined,
          })
        );
    }
    return [];
  }
}
