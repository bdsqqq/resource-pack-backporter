import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ConditionalBackportCoordinator } from "@backporter/conditional-compiler/backport-coordinator";
import { createTestTracer } from "./test-utils";

describe("Integration Tests", () => {
  let testDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "integration");
    inputDir = join(testDir, "input");
    outputDir = join(testDir, "output");

    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should create a complete resource pack structure", async () => {
    // Create minimal input pack structure
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "textures", "item"), {
      recursive: true,
    });

    // Create pack.mcmeta
    const packMeta = {
      pack: {
        pack_format: 48,
        description: "Test Pack",
      },
    };
    await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify(packMeta, null, 2));

    // Create book item file
    const bookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "ground"],
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
        ],
      },
    };
    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "book.json"),
      JSON.stringify(bookItem, null, 2)
    );

    // Create book model file
    const bookModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/book",
      },
    };
    await writeFile(
      join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(bookModel, null, 2)
    );

    // Import and run the backporter
    const coordinator = new ConditionalBackportCoordinator(createTestTracer());
    await coordinator.backport(inputDir, outputDir);

    // Verify output structure
    expect(existsSync(join(outputDir, "pack.mcmeta"))).toBe(true);
    expect(existsSync(join(outputDir, "assets", "minecraft", "models", "item", "book.json"))).toBe(
      true
    );

    // Verify generated book.json has correct structure
    const generatedBook = JSON.parse(
      await readFile(join(outputDir, "assets", "minecraft", "models", "item", "book.json"), "utf-8")
    );

    // Pure Pommel strategy generates 3D models with original parent preserved
    expect(generatedBook.parent).toBeDefined(); // Should inherit from original or 3D template
    expect(generatedBook.overrides).toBeDefined();
    expect(generatedBook.overrides.length).toBeGreaterThan(0);

    // Should have Pommel predicates for ground context
    const hasGroundPredicate = generatedBook.overrides.some(
      (override: any) => override.predicate && override.predicate["pommel:is_ground"] === 1
    );

    expect(hasGroundPredicate).toBe(true);
  });

  it("should handle multiple book types correctly", async () => {
    // Setup input structure
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });

    // Create pack.mcmeta
    const packMeta = {
      pack: {
        pack_format: 48,
        description: "Multi-Book Test Pack",
      },
    };
    await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify(packMeta, null, 2));

    // Create book items
    const bookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/book",
            },
          },
        ],
      },
    };

    const knowledgeBookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/knowledge_book",
            },
          },
        ],
      },
    };

    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "book.json"),
      JSON.stringify(bookItem, null, 2)
    );
    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "knowledge_book.json"),
      JSON.stringify(knowledgeBookItem, null, 2)
    );

    // Create model files
    const bookModel = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/enchanted_books/book" },
    };
    const knowledgeBookModel = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/enchanted_books/knowledge_book" },
    };

    await writeFile(
      join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(bookModel, null, 2)
    );
    await writeFile(
      join(
        inputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "knowledge_book.json"
      ),
      JSON.stringify(knowledgeBookModel, null, 2)
    );

    // Run backporter
    const coordinator = new ConditionalBackportCoordinator(createTestTracer());

    await coordinator.backport(inputDir, outputDir);

    // Verify both books have correct textures
    const generatedBook = JSON.parse(
      await readFile(join(outputDir, "assets", "minecraft", "models", "item", "book.json"), "utf-8")
    );
    const generatedKnowledgeBook = JSON.parse(
      await readFile(
        join(outputDir, "assets", "minecraft", "models", "item", "knowledge_book.json"),
        "utf-8"
      )
    );

    // Both books should have overrides for Pommel context switching
    expect(generatedBook.overrides).toBeDefined();
    expect(generatedKnowledgeBook.overrides).toBeDefined();
  });

  it("should clear output directory to prevent contamination", async () => {
    // Setup input with multiple contexts to trigger Pommel generation
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });

    const packMeta = { pack: { pack_format: 48, description: "Test" } };
    await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify(packMeta, null, 2));

    const bookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "ground"],
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
        ],
      },
    };
    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "book.json"),
      JSON.stringify(bookItem, null, 2)
    );

    const bookModel = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/enchanted_books/book" },
    };
    await writeFile(
      join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(bookModel, null, 2)
    );

    // Create contaminated output from "previous run"
    await mkdir(join(outputDir, "assets", "minecraft", "models", "item"), {
      recursive: true,
    });
    const contaminatedFile = {
      parent: "minecraft:item/handheld",
      textures: { layer0: "minecraft:item/enchanted_books/WRONG_TEXTURE" },
      overrides: [],
    };
    await writeFile(
      join(outputDir, "assets", "minecraft", "models", "item", "book.json"),
      JSON.stringify(contaminatedFile, null, 2)
    );

    // Run backporter
    const coordinator = new ConditionalBackportCoordinator(createTestTracer());

    await coordinator.backport(inputDir, outputDir);

    // Verify output directory was cleared and regenerated correctly
    const generatedBook = JSON.parse(
      await readFile(join(outputDir, "assets", "minecraft", "models", "item", "book.json"), "utf-8")
    );

    // Should have Pommel overrides (indicating it was regenerated, not contaminated)
    expect(generatedBook.overrides).toBeDefined();
    expect(generatedBook.overrides.length).toBeGreaterThan(0);

    // Should have ground predicate (proving it's our generated file)
    const hasGroundPredicate = generatedBook.overrides.some(
      (override: any) => override.predicate && override.predicate["pommel:is_ground"] === 1
    );
    expect(hasGroundPredicate).toBe(true);
  });

  it("should preserve other pack assets", async () => {
    // Setup input with additional assets
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "textures", "item"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "sounds"), {
      recursive: true,
    });

    // Create pack files
    const packMeta = { pack: { pack_format: 48, description: "Test" } };
    await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify(packMeta, null, 2));
    await writeFile(join(inputDir, "pack.png"), "fake-png-data");

    // Create texture file (minecraft textures are copied)
    await writeFile(
      join(inputDir, "assets", "minecraft", "textures", "item", "custom_texture.png"),
      "fake-texture-data"
    );

    // Create minimal book item for processing (with multiple contexts to trigger Pommel)
    const bookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/book",
            },
          },
          {
            when: ["firstperson_righthand"],
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

    const bookModel = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/enchanted_books/book" },
    };
    await writeFile(
      join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(bookModel, null, 2)
    );

    // Run backporter
    const coordinator = new ConditionalBackportCoordinator(createTestTracer());

    await coordinator.backport(inputDir, outputDir);

    // Verify core pack files were preserved
    expect(existsSync(join(outputDir, "pack.mcmeta"))).toBe(true);
    expect(existsSync(join(outputDir, "pack.png"))).toBe(true);

    // Verify minecraft assets were preserved
    expect(
      existsSync(join(outputDir, "assets", "minecraft", "textures", "item", "custom_texture.png"))
    ).toBe(true);

    // Verify processed book exists and has Pommel overrides
    expect(existsSync(join(outputDir, "assets", "minecraft", "models", "item", "book.json"))).toBe(
      true
    );

    const generatedBook = JSON.parse(
      await readFile(join(outputDir, "assets", "minecraft", "models", "item", "book.json"), "utf-8")
    );
    expect(generatedBook.overrides).toBeDefined();
    expect(generatedBook.overrides.length).toBeGreaterThan(0);
  });
});
