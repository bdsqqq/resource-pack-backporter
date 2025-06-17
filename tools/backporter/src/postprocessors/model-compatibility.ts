import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export class ModelCompatibilityProcessor {
  async fixModelCompatibility(outputDir: string): Promise<void> {
    console.log("🔧 Fixing model compatibility...");

    const modelsDir = join(outputDir, "assets/minecraft/models");
    if (!existsSync(modelsDir)) return;

    await this.fixModelsInDirectory(modelsDir);
  }

  private async fixModelsInDirectory(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.fixModelsInDirectory(fullPath);
      } else if (entry.name.endsWith(".json")) {
        await this.fixSingleModel(fullPath);
      }
    }
  }

  private async fixSingleModel(modelPath: string): Promise<void> {
    try {
      const content = await readFile(modelPath, "utf-8");
      const model = JSON.parse(content);
      let hasChanges = false;

      // CRITICAL: Do not modify template files - they must remain standalone
      const isTemplateFile = modelPath.includes('/books_3d/template_');
      
      if (!isTemplateFile) {
        // Remove problematic builtin/entity parent
        if (model.parent === "builtin/entity") {
          console.log(`🔧 Fixing builtin/entity parent in ${modelPath}`);
          model.parent = "minecraft:item/handheld";
          hasChanges = true;
        }
      } else {
        console.log(`🔒 Processing template file with special handling: ${modelPath}`);
        // For template files, REMOVE any parent field entirely
        if (model.parent) {
          console.log(`🔧 Removing parent field from template: ${model.parent} → (none)`);
          delete model.parent;
          hasChanges = true;
        }
        this.validateTemplateFile(model, modelPath);
      }

      // Fix zero-thickness elements
      if (model.elements) {
        for (const element of model.elements) {
          if (!element.from || !element.to) continue;

          for (let axis = 0; axis < 3; axis++) {
            if (element.from[axis] === element.to[axis]) {
              console.log(`🔧 Fixing zero-thickness element in ${modelPath} (axis ${axis})`);
              element.to[axis] = element.to[axis] + 0.01;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        await writeFile(modelPath, JSON.stringify(model, null, "\t"));
        console.log(`✓ Fixed model compatibility: ${modelPath}`);
      }
    } catch (error) {
      console.log(`⚠ Error processing model ${modelPath}: ${error.message}`);
      // Skip files that can't be processed
    }
  }

  private validateTemplateFile(model: any, modelPath: string): void {
    const errors: string[] = [];
    
    // Template files should NOT have parent field
    if (model.parent) {
      errors.push(`Template file should not have parent field, found: ${model.parent}`);
    }
    
    // Template files should have required structure
    if (!model.credit) {
      errors.push('Template file missing credit field');
    }
    
    if (!model.texture_size || !Array.isArray(model.texture_size)) {
      errors.push('Template file missing or invalid texture_size field');
    }
    
    if (!model.elements || !Array.isArray(model.elements)) {
      errors.push('Template file missing or invalid elements field');
    }
    
    if (!model.display || typeof model.display !== 'object') {
      errors.push('Template file missing or invalid display field');
    }
    
    if (errors.length > 0) {
      console.error(`✗ Template file validation failed: ${modelPath}`);
      errors.forEach(error => console.error(`   - ${error}`));
      throw new Error(`Template file validation failed: ${modelPath}`);
    } else {
      console.log(`✓ Template file validation passed: ${modelPath}`);
    }
  }
}
