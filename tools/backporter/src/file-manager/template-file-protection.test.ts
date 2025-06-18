import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ModelCompatibilityProcessor } from "@backporter/postprocessors/model-compatibility";

/**
 * Template File Protection Test Suite
 *
 * Critical regression prevention for the main hand invisibility bug.
 * Root cause: spurious "parent" field in template files breaks Pommel 3D rendering.
 *
 * Based on: notes/2025-06-05T13:45:12+0000--main-hand-invisibility-root-cause-found.md
 */
describe("Template File Protection", () => {
  let testDir: string;
  let processor: ModelCompatibilityProcessor;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "template-protection");
    await mkdir(testDir, { recursive: true });
    processor = new ModelCompatibilityProcessor();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Template File Detection", () => {
    it("should identify template files by path pattern", () => {
      const templatePaths = [
        "assets/minecraft/models/item/books_3d/template_book_open.json",
        "assets/minecraft/models/item/books_3d/template_book_closed.json",
        "models/item/books_3d/template_enchanted_book.json",
      ];

      const nonTemplatePaths = [
        "assets/minecraft/models/item/books_3d/channeling_3d_open.json",
        "assets/minecraft/models/item/enchanted_books/sharpness_1.json",
        "assets/minecraft/models/item/book.json",
      ];

      templatePaths.forEach((path) => {
        expect(path.includes("/books_3d/template_")).toBe(true);
      });

      nonTemplatePaths.forEach((path) => {
        expect(path.includes("/books_3d/template_")).toBe(false);
      });
    });
  });

  describe("Template File Processing Protection", () => {
    it("should never add parent field to template files", async () => {
      // Create template file with zero-thickness element (would trigger compatibility fix)
      const templateWithZeroThickness = {
        credit: "Bray + Cyberia were here",
        texture_size: [32, 32],
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 0], // Zero thickness on Z-axis
            faces: {
              north: { texture: "#layer0" },
              south: { texture: "#layer0" },
            },
          },
        ],
        display: {
          firstperson_righthand: {
            rotation: [0, -90, 25],
            translation: [1.13, 3.2, 1.13],
            scale: [0.68, 0.68, 0.68],
          },
        },
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_book_open.json"
      );
      await writeFile(templatePath, JSON.stringify(templateWithZeroThickness, null, 2));

      // Process the file (this would normally add parent field for non-templates)
      await processor.fixSingleModel(templatePath);

      // Critical test: Template must NOT have parent field after processing
      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      expect(processedTemplate.parent).toBeUndefined();
      expect(processedTemplate.credit).toBe("Bray + Cyberia were here");
      expect(processedTemplate.texture_size).toEqual([32, 32]);

      // Zero thickness should be fixed but no parent added
      expect(processedTemplate.elements[0].to[2]).toBeGreaterThan(0);
    });

    it("should remove existing parent field from template files", async () => {
      // Create template file that somehow got a parent field (the bug scenario)
      const corruptedTemplate = {
        credit: "Bray + Cyberia were here",
        parent: "minecraft:item/handheld", // This line caused the bug!
        texture_size: [32, 32],
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 2],
            faces: {
              north: { texture: "#layer0" },
            },
          },
        ],
        display: {
          firstperson_righthand: {},
        },
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_book_open.json"
      );
      await writeFile(templatePath, JSON.stringify(corruptedTemplate, null, 2));

      // Process the corrupted template
      await processor.fixSingleModel(templatePath);

      // Parent field should be removed
      const fixedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      expect(fixedTemplate.parent).toBeUndefined();
      expect(fixedTemplate.credit).toBe("Bray + Cyberia were here");
      expect(fixedTemplate.texture_size).toEqual([32, 32]);
    });

    it("should validate template file structure after processing", async () => {
      const validTemplate = {
        credit: "Template Credit",
        texture_size: [32, 32],
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 0], // Zero thickness - will be fixed
            faces: { north: { texture: "#layer0" } },
          },
        ],
        display: {
          firstperson_righthand: {
            rotation: [0, -90, 25],
          },
        },
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_book_closed.json"
      );
      await writeFile(templatePath, JSON.stringify(validTemplate, null, 2));

      await processor.fixSingleModel(templatePath);

      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      // All required fields should be present
      expect(processedTemplate.credit).toBeDefined();
      expect(processedTemplate.texture_size).toBeDefined();
      expect(processedTemplate.elements).toBeDefined();
      expect(processedTemplate.display).toBeDefined();

      // Parent field must not exist
      expect(processedTemplate.parent).toBeUndefined();

      // Structure should be valid
      expect(Array.isArray(processedTemplate.elements)).toBe(true);
      expect(typeof processedTemplate.display).toBe("object");
    });
  });

  describe("Non-Template File Processing", () => {
    it("should add parent field to non-template files when needed", async () => {
      // Create regular model file with builtin/entity parent (needs conversion)
      const regularModel = {
        parent: "builtin/entity",
        textures: {
          layer0: "minecraft:item/enchanted_books/sharpness_1",
        },
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 0], // Zero thickness
            faces: { north: { texture: "#layer0" } },
          },
        ],
      };

      const regularPath = join(testDir, "sharpness_3d_open.json");
      await writeFile(regularPath, JSON.stringify(regularModel, null, 2));

      await processor.fixSingleModel(regularPath);

      const processedModel = JSON.parse(await readFile(regularPath, "utf-8"));

      // Non-template should get parent field updated
      expect(processedModel.parent).toBe("minecraft:item/handheld");

      // Zero thickness should be fixed
      expect(processedModel.elements[0].to[2]).toBeGreaterThan(0);
    });

    it("should preserve existing valid parent in non-template files", async () => {
      const modelWithValidParent = {
        parent: "minecraft:item/generated",
        textures: {
          layer0: "minecraft:item/enchanted_books/channeling",
        },
        overrides: [],
      };

      const regularPath = join(testDir, "channeling_1.json");
      await writeFile(regularPath, JSON.stringify(modelWithValidParent, null, 2));

      await processor.fixSingleModel(regularPath);

      const processedModel = JSON.parse(await readFile(regularPath, "utf-8"));

      // Valid parent should be preserved
      expect(processedModel.parent).toBe("minecraft:item/generated");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should reject malformed template files and preserve them unchanged", async () => {
      const malformedTemplate = {
        // Missing required fields
        parent: "minecraft:item/handheld",
        elements: [],
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_malformed.json"
      );
      await writeFile(templatePath, JSON.stringify(malformedTemplate, null, 2));

      // Should not throw error but will reject the malformed template
      await expect(processor.fixSingleModel(templatePath)).resolves.toBeUndefined();

      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      // Malformed template should be preserved as-is (validation failed)
      expect(processedTemplate.parent).toBe("minecraft:item/handheld");
      expect(processedTemplate.elements).toEqual([]);
    });

    it("should reject template files with missing elements array", async () => {
      const templateNoElements = {
        credit: "Test Template",
        parent: "minecraft:item/handheld",
        texture_size: [32, 32],
        display: {},
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_no_elements.json"
      );
      await writeFile(templatePath, JSON.stringify(templateNoElements, null, 2));

      await processor.fixSingleModel(templatePath);

      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      // Template rejected due to missing elements - preserved as-is
      expect(processedTemplate.parent).toBe("minecraft:item/handheld");
      expect(processedTemplate.credit).toBe("Test Template");
    });

    it("should reject completely invalid template files", async () => {
      const emptyTemplate = {
        parent: "minecraft:item/handheld", // Only this field - missing all required fields
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_empty.json"
      );
      await writeFile(templatePath, JSON.stringify(emptyTemplate, null, 2));

      await processor.fixSingleModel(templatePath);

      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      // Invalid template should be preserved as-is (validation failed)
      expect(processedTemplate.parent).toBe("minecraft:item/handheld");
      expect(Object.keys(processedTemplate)).toEqual(["parent"]);
    });
  });

  describe("Integration with Compatibility Fixes", () => {
    it("should apply zero-thickness fixes to templates without adding parent", async () => {
      const templateWithMultipleIssues = {
        credit: "Test",
        texture_size: [32, 32],
        elements: [
          {
            from: [0, 0, 0],
            to: [16, 16, 0], // Zero thickness on Z
            faces: { north: { texture: "#layer0" } },
          },
          {
            from: [0, 0, 0],
            to: [0, 16, 16], // Zero thickness on X
            faces: { east: { texture: "#layer0" } },
          },
          {
            from: [0, 0, 0],
            to: [16, 0, 16], // Zero thickness on Y
            faces: { up: { texture: "#layer0" } },
          },
        ],
        display: {},
      };

      await mkdir(join(testDir, "assets", "minecraft", "models", "item", "books_3d"), {
        recursive: true,
      });
      const templatePath = join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_multi_issues.json"
      );
      await writeFile(templatePath, JSON.stringify(templateWithMultipleIssues, null, 2));

      await processor.fixSingleModel(templatePath);

      const processedTemplate = JSON.parse(await readFile(templatePath, "utf-8"));

      // All zero-thickness issues should be fixed
      expect(processedTemplate.elements[0].to[2]).toBeGreaterThan(0); // Z fixed
      expect(processedTemplate.elements[1].to[0]).toBeGreaterThan(0); // X fixed
      expect(processedTemplate.elements[2].to[1]).toBeGreaterThan(0); // Y fixed

      // But no parent field should be added
      expect(processedTemplate.parent).toBeUndefined();
    });
  });
});
