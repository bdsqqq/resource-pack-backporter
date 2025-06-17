import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";

interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}

export class CITPropertiesWriter implements FileWriter {
  name = "cit-properties";

  canWrite(request: WriteRequest): boolean {
    return request.type === "cit-properties";
  }

  async write(request: WriteRequest, outputDir: string): Promise<void> {
    const fullPath = join(outputDir, "assets/minecraft/optifine", request.path);

    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });

    // Format the CIT properties
    const propertiesContent = this.formatCITProperties(request.content);

    // Write the file
    await writeFile(fullPath, propertiesContent);

    console.log(`✅ Wrote CIT properties: ${request.path}`);
  }

  private formatCITProperties(content: any): string {
    const lines: string[] = [];

    // Basic properties
    if (content.type) lines.push(`type=${content.type}`);
    if (content.items) lines.push(`items=${content.items}`);
    if (content.model) lines.push(`model=${content.model}`);
    if (content.texture) lines.push(`texture=${content.texture}`);

    // NBT properties
    if (content.nbt) {
      this.formatNBTProperties(content.nbt, lines);
    }

    // Enchantment-specific properties
    if (content.enchantments) {
      lines.push(`enchantments=${content.enchantments}`);
    }
    if (content.enchantmentIDs) {
      lines.push(`enchantmentIDs=${content.enchantmentIDs}`);
    }
    if (content.enchantmentLevels) {
      lines.push(`enchantmentLevels=${content.enchantmentLevels}`);
    }

    return lines.join("\n") + "\n";
  }

  private formatNBTProperties(nbt: any, lines: string[], prefix = "nbt"): void {
    for (const [key, value] of Object.entries(nbt)) {
      const fullKey = `${prefix}.${key}`;

      if (Array.isArray(value)) {
        // Handle arrays like StoredEnchantments
        value.forEach((item, index) => {
          if (typeof item === "object") {
            this.formatNBTProperties(item, lines, `${fullKey}.[${index}]`);
          } else {
            lines.push(`${fullKey}.[${index}]=${item}`);
          }
        });
      } else if (typeof value === "object" && value !== null) {
        // Handle nested objects
        this.formatNBTProperties(value, lines, fullKey);
      } else {
        // Handle primitive values
        lines.push(`${fullKey}=${value}`);
      }
    }
  }
}
