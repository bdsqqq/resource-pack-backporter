import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";

interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}

export class PommelModelWriter implements FileWriter {
  name = "pommel-model";

  canWrite(request: WriteRequest): boolean {
    return request.type === "pommel-model";
  }

  async write(request: WriteRequest, outputDir: string): Promise<void> {
    const fullPath = join(outputDir, "assets/minecraft/models", request.path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Format the Pommel model
    const modelContent = this.formatPommelModel(request.content);

    // Write the file
    await writeFile(fullPath, JSON.stringify(modelContent, null, 2));

    console.log(`✅ Wrote Pommel model: ${request.path}`);
  }

  private formatPommelModel(content: any): any {
    // Ensure the model has the correct structure
    return {
      parent: content.parent || "minecraft:item/handheld",
      textures: content.textures || {},
      overrides: content.overrides || [],
    };
  }
}
