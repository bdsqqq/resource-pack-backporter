import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConditionalBackportCoordinator } from "@backporter/conditional-compiler/backport-coordinator";
import { createTestTracer } from "./test-utils";

/**
 * Critical Regression Test Suite
 *
 * This focused test suite prevents the most critical regressions that broke books functionality:
 * 1. Main hand invisibility (template file corruption)
 * 2. Pack description attribution
 * 3. Template file protection
 *
 * Based on actual bugs found and fixed in the timestamped notes.
 */
describe("Critical Books Regression Prevention", () => {
  let testDir: string;
  let inputDir: string;
  let outputDir: string;
  let coordinator: ConditionalBackportCoordinator;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "critical-regression");
    inputDir = join(testDir, "input");
    outputDir = join(testDir, "output");

    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    coordinator = new ConditionalBackportCoordinator(createTestTracer());
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  /**
   * CRITICAL: Main Hand Invisibility Prevention
   *
   * Root cause: spurious "parent": "minecraft:item/handheld" in template files
   * Reference: notes/2025-06-05T13:45:12+0000--main-hand-invisibility-root-cause-found.md
   */
  it("should never add parent field to template files", async () => {
    // Create template file that would trigger compatibility processing
    await mkdir(
      join(inputDir, "assets", "minecraft", "models", "item", "books_3d"),
      { recursive: true }
    );

    const templateWithZeroThickness = {
      credit: "Bray + Cyberia were here",
      texture_size: [32, 32],
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 0], // Zero thickness - triggers compatibility fix
          faces: {
            north: { texture: "#layer0" },
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

    await writeFile(
      join(
        inputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_book_open.json"
      ),
      JSON.stringify(templateWithZeroThickness, null, 2)
    );

    // Create minimal pack structure
    await createMinimalPack(inputDir);

    // Run backporter
    await coordinator.backport(inputDir, outputDir);

    // CRITICAL TEST: Template file must NOT have parent field
    const processedTemplate = JSON.parse(
      await readFile(
        join(
          outputDir,
          "assets",
          "minecraft",
          "models",
          "item",
          "books_3d",
          "template_book_open.json"
        ),
        "utf-8"
      )
    );

    expect(processedTemplate.parent).toBeUndefined();
    expect(processedTemplate.credit).toBe("Bray + Cyberia were here");
    expect(processedTemplate.texture_size).toEqual([32, 32]);

    // Zero thickness should be fixed but no parent added
    expect(processedTemplate.elements[0].to[2]).toBeGreaterThan(0);
  });

  /**
   * CRITICAL: Pack Description Attribution
   *
   * Ensures all backported packs are clearly marked with attribution
   */
  it("should add backported attribution to pack description", async () => {
    await createMinimalPack(inputDir);

    const packMeta = {
      pack: {
        pack_format: 55,
        description: "Original Test Pack",
      },
    };
    await writeFile(
      join(inputDir, "pack.mcmeta"),
      JSON.stringify(packMeta, null, 2)
    );

    await coordinator.backport(inputDir, outputDir);

    const outputPackMeta = JSON.parse(
      await readFile(join(outputDir, "pack.mcmeta"), "utf-8")
    );

    expect(outputPackMeta.pack.description).toBe(
      "Original Test Pack ↺_backported_by_@bdsqqq"
    );
  });

  /**
   * CRITICAL: Template File Structure Preservation
   *
   * Ensures template files maintain their critical structure after processing
   */
  it("should preserve template file structure with all required fields", async () => {
    await mkdir(
      join(inputDir, "assets", "minecraft", "models", "item", "books_3d"),
      { recursive: true }
    );

    const validTemplate = {
      credit: "Template Credit",
      texture_size: [32, 32],
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 2],
          faces: { north: { texture: "#layer0" } },
        },
      ],
      display: {
        firstperson_righthand: {
          rotation: [0, -90, 25],
        },
      },
    };

    await writeFile(
      join(
        inputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "books_3d",
        "template_book_closed.json"
      ),
      JSON.stringify(validTemplate, null, 2)
    );

    await createMinimalPack(inputDir);
    await coordinator.backport(inputDir, outputDir);

    const processedTemplate = JSON.parse(
      await readFile(
        join(
          outputDir,
          "assets",
          "minecraft",
          "models",
          "item",
          "books_3d",
          "template_book_closed.json"
        ),
        "utf-8"
      )
    );

    // All required fields should be present
    expect(processedTemplate.credit).toBeDefined();
    expect(processedTemplate.texture_size).toBeDefined();
    expect(processedTemplate.elements).toBeDefined();
    expect(processedTemplate.display).toBeDefined();

    // Parent field must not exist
    expect(processedTemplate.parent).toBeUndefined();
  });

  /**
   * INTEGRATION: Regular Books Pommel Generation
   *
   * Ensures regular books generate Pommel overrides correctly
   */
  it("should generate Pommel overrides for regular books", async () => {
    await createBookPack(inputDir);
    await coordinator.backport(inputDir, outputDir);

    const bookModel = JSON.parse(
      await readFile(
        join(outputDir, "assets", "minecraft", "models", "item", "book.json"),
        "utf-8"
      )
    );

    expect(bookModel.overrides).toBeDefined();
    expect(bookModel.overrides.length).toBeGreaterThan(0);

    // Should have Pommel predicates
    const predicates = bookModel.overrides.map((o: any) => o.predicate);
    const hasGroundPredicate = predicates.some(
      (p: any) => p && p["pommel:is_ground"] === 1
    );
    const hasHeldPredicate = predicates.some(
      (p: any) => p && p["pommel:is_held"] === 1
    );
    const hasOffhandPredicate = predicates.some(
      (p: any) => p && p["pommel:is_offhand"] === 1
    );

    expect(hasGroundPredicate).toBe(true);
    expect(hasHeldPredicate).toBe(true);
    expect(hasOffhandPredicate).toBe(true);
  });

  /**
   * INTEGRATION: Asset Preservation
   *
   * Ensures all important pack files are preserved during backporting
   */
  it("should preserve all root-level pack files", async () => {
    await createMinimalPack(inputDir);

    // Add various pack files
    await writeFile(join(inputDir, "pack.png"), "fake-image");
    await writeFile(join(inputDir, "credit.txt"), "Pack credits");
    await writeFile(join(inputDir, "README.md"), "Documentation");

    await coordinator.backport(inputDir, outputDir);

    // All files should be preserved
    const packMeta = await readFile(join(outputDir, "pack.mcmeta"), "utf-8");
    const packImage = await readFile(join(outputDir, "pack.png"), "utf-8");
    const credits = await readFile(join(outputDir, "credit.txt"), "utf-8");
    const readme = await readFile(join(outputDir, "README.md"), "utf-8");

    expect(packMeta).toContain("pack_format");
    expect(packImage).toBe("fake-image");
    expect(credits).toBe("Pack credits");
    expect(readme).toBe("Documentation");
  });

  // Helper functions
  async function createMinimalPack(inputDir: string) {
    const packMeta = {
      pack: {
        pack_format: 55,
        description: "Test Pack",
      },
    };
    await writeFile(
      join(inputDir, "pack.mcmeta"),
      JSON.stringify(packMeta, null, 2)
    );
  }

  async function createBookPack(inputDir: string) {
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(
      join(
        inputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books"
      ),
      { recursive: true }
    );

    await createMinimalPack(inputDir);

    // Create book item with multiple contexts (triggers Pommel generation)
    const bookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "head"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/book",
            },
          },
          {
            when: ["ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/book",
            },
          },
          {
            when: ["firstperson_righthand", "thirdperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/books_3d/book_3d_open",
            },
          },
          {
            when: ["firstperson_lefthand", "thirdperson_lefthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/books_3d/book_3d",
            },
          },
        ],
      },
    };

    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "book.json"),
      JSON.stringify(bookItem, null, 2)
    );

    // Create corresponding model
    const bookModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/book",
      },
    };

    await writeFile(
      join(
        inputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "book.json"
      ),
      JSON.stringify(bookModel, null, 2)
    );
  }
});
