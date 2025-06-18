import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { WriteRequest } from "@backporter/file-manager";

interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}

interface CITPropertiesContent {
  type?: string;
  items?: string;
  model?: string;
  texture?: string;
  nbt?: Record<string, unknown>;
  enchantments?: string;
  enchantmentIDs?: string;
  enchantmentLevels?: string;
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
  }

  private formatCITProperties(content: unknown): string {
    const lines: string[] = [];

    if (!this.isCITPropertiesContent(content)) {
      return "\n";
    }

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

    return `${lines.join("\n")}\n`;
  }

  private isCITPropertiesContent(value: unknown): value is CITPropertiesContent {
    return typeof value === "object" && value !== null;
  }

  private formatNBTProperties(nbt: Record<string, unknown>, lines: string[], prefix = "nbt"): void {
    for (const [key, value] of Object.entries(nbt)) {
      const fullKey = `${prefix}.${key}`;

      if (Array.isArray(value)) {
        // Handle arrays like StoredEnchantments
        value.forEach((item: unknown, index: number) => {
          if (typeof item === "object" && item !== null) {
            this.formatNBTProperties(
              item as Record<string, unknown>,
              lines,
              `${fullKey}.[${index}]`
            );
          } else {
            lines.push(`${fullKey}.[${index}]=${String(item)}`);
          }
        });
      } else if (typeof value === "object" && value !== null) {
        // Handle nested objects
        this.formatNBTProperties(value as Record<string, unknown>, lines, fullKey);
      } else {
        // Handle primitive values
        lines.push(`${fullKey}=${String(value)}`);
      }
    }
  }
}
