import { copyFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";
import type { FileWriter } from "@backporter/writers";

export class TextureCopyWriter implements FileWriter {
  name = "texture-copy";

  canWrite(request: WriteRequest): boolean {
    return request.type === "texture-copy";
  }

  async write(request: WriteRequest, outputDir: string): Promise<void> {
    const fullPath = join(outputDir, "assets/minecraft", request.path);
    const sourceContent = request.content;

    if (!sourceContent.sourcePath) {
      throw new Error(
        `No source path provided for texture copy: ${request.path}`
      );
    }

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Copy the texture file
    await copyFile(sourceContent.sourcePath, fullPath);
  }
}
