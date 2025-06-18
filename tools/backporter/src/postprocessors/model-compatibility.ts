import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StructuredTracer } from "@logger/index";

export class ModelCompatibilityProcessor {
  private tracer?: StructuredTracer;

  constructor(tracer?: StructuredTracer) {
    this.tracer = tracer;
  }

  async fixModelCompatibility(outputDir: string): Promise<void> {
    const span = this.tracer?.startSpan("Fix Model Compatibility");
    span?.setAttributes({ outputDir });

    try {
      const modelsDir = join(outputDir, "assets/minecraft/models");
      if (!existsSync(modelsDir)) {
        span?.info("No models directory found, skipping compatibility fixes");
        span?.end({ success: true, skipped: true });
        return;
      }

      await this.fixModelsInDirectory(modelsDir, span);
      span?.end({ success: true });
    } catch (error: any) {
      span?.error("Model compatibility processing failed", {
        error: error.message,
        stack: error.stack,
      });
      span?.end({ success: false, error: error.message });
      throw error;
    }
  }

  private async fixModelsInDirectory(dir: string, parentSpan?: any): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.fixModelsInDirectory(fullPath, parentSpan);
      } else if (entry.name.endsWith(".json")) {
        await this.fixSingleModel(fullPath, parentSpan);
      }
    }
  }

  private async fixSingleModel(modelPath: string, parentSpan?: any): Promise<void> {
    const modelSpan = parentSpan?.startChild(`Fix model: ${modelPath.split("/").pop()}`);
    modelSpan?.setAttributes({ modelPath });

    try {
      const content = await readFile(modelPath, "utf-8");
      const model = JSON.parse(content);
      let hasChanges = false;

      // CRITICAL: Do not modify template files - they must remain standalone
      const isTemplateFile = modelPath.includes("/books_3d/template_");

      if (!isTemplateFile) {
        // Remove problematic builtin/entity parent
        if (model.parent === "builtin/entity") {
          modelSpan?.info("Fixed builtin/entity parent", {
            oldParent: "builtin/entity",
            newParent: "minecraft:item/handheld",
          });
          model.parent = "minecraft:item/handheld";
          hasChanges = true;
        }
      } else {
        modelSpan?.info("Processing template file with special handling");
        // For template files, REMOVE any parent field entirely
        if (model.parent) {
          modelSpan?.info("Removed parent field from template", {
            removedParent: model.parent,
          });
          delete model.parent;
          hasChanges = true;
        }
        this.validateTemplateFile(model, modelPath, modelSpan);
      }

      // Fix zero-thickness elements
      if (model.elements) {
        for (const element of model.elements) {
          if (!element.from || !element.to) continue;

          for (let axis = 0; axis < 3; axis++) {
            if (element.from[axis] === element.to[axis]) {
              modelSpan?.info("Fixed zero-thickness element", { axis });
              element.to[axis] = element.to[axis] + 0.01;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        await writeFile(modelPath, JSON.stringify(model, null, "\t"));
        modelSpan?.info("Model compatibility fixes applied");
        modelSpan?.end({ success: true, hasChanges: true });
      } else {
        modelSpan?.end({ success: true, hasChanges: false });
      }
    } catch (error: any) {
      modelSpan?.error("Error processing model", {
        error: error.message,
        stack: error.stack,
      });
      modelSpan?.end({ success: false, error: error.message });
      // Skip files that can't be processed - don't rethrow
    }
  }

  private validateTemplateFile(model: any, modelPath: string, modelSpan?: any): void {
    const errors: string[] = [];

    // Template files should NOT have parent field
    if (model.parent) {
      errors.push(`Template file should not have parent field, found: ${model.parent}`);
    }

    // Template files should have required structure
    if (!model.credit) {
      errors.push("Template file missing credit field");
    }

    if (!model.texture_size || !Array.isArray(model.texture_size)) {
      errors.push("Template file missing or invalid texture_size field");
    }

    if (!model.elements || !Array.isArray(model.elements)) {
      errors.push("Template file missing or invalid elements field");
    }

    if (!model.display || typeof model.display !== "object") {
      errors.push("Template file missing or invalid display field");
    }

    if (errors.length > 0) {
      modelSpan?.error("Template file validation failed", {
        errors,
        validationErrors: errors.length,
      });
      throw new Error(`Template file validation failed: ${modelPath}`);
    }

    modelSpan?.info("Template file validation passed");
  }
}
