import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";
import type { FileWriter } from "@backporter/writers";

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

    console.log(`✓ Wrote vanilla model: ${request.path}`);
  }

  private formatVanillaModel(content: any): any {
    // Ensure the model has the correct structure for vanilla Minecraft
    return {
      parent: content.parent || "minecraft:item/generated",
      textures: content.textures || {},
      ...(content.overrides && { overrides: content.overrides }),
    };
  }
}
