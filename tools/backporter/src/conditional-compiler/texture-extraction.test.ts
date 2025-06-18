import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResourcePackStructure } from "@backporter/file-manager";
import { createTestTracer } from "../test-utils";

// Mock a minimal version of the DisplayContextStrategy class for testing
class TestDisplayContextStrategy {
  name = "display_context";

  private determineTextureRef(
    itemId: string,
    packStructure: ResourcePackStructure,
    modelMappings: { [context: string]: string }
  ): string {
    const tracer = createTestTracer();
    const span = tracer.startSpan(`Determine texture ref for ${itemId}`);
    span.setAttributes({ itemId, modelMappings });

    try {
      // Extract texture from the GUI model specified in the pack
      const guiModel = modelMappings.gui || modelMappings.fixed;
      span.debug("Using GUI model", { guiModel });

      if (guiModel) {
        // Try to read the actual model file to get its texture
        const modelPath = guiModel.replace("minecraft:", "assets/minecraft/models/");
        const modelFile = `${modelPath}.json`;

        // Look for the model file in the pack structure with exact path matching
        // IMPORTANT: Only search in source files, never in output directories
        const found = packStructure.modelFiles.find((file) => {
          // Normalize paths and check for exact structural match
          const normalizedFile = file.replace(/\\/g, "/");
          const normalizedModelFile = modelFile.replace(/\\/g, "/");

          // Skip any files in output directories (dist/, build/, out/, etc.)
          if (
            normalizedFile.includes("/dist/") ||
            normalizedFile.includes("/build/") ||
            normalizedFile.includes("/out/") ||
            normalizedFile.startsWith("dist/") ||
            normalizedFile.startsWith("build/") ||
            normalizedFile.startsWith("out/")
          ) {
            return false;
          }

          // Check if the full path ends with the model file path AND has correct path separator before it
          const matches =
            normalizedFile.endsWith(normalizedModelFile) &&
            (normalizedFile === normalizedModelFile ||
              normalizedFile.endsWith(`/${normalizedModelFile}`));
          if (matches) {
            span.debug("Found model file match", {
              normalizedFile,
              normalizedModelFile,
            });
          }
          return matches;
        });

        if (found) {
          const fileSpan = span.startChild("Read model file");
          fileSpan.setAttributes({ filePath: found });

          try {
            // Read the model file synchronously to get texture
            const fs = require("node:fs");
            const modelContent = JSON.parse(fs.readFileSync(found, "utf-8"));
            fileSpan.debug("Model file content loaded", { modelContent });

            if (modelContent.textures?.layer0) {
              const texture = modelContent.textures.layer0;
              fileSpan.info("Extracted texture from model", { texture });
              fileSpan.end({ success: true, texture });
              span.end({ success: true, texture });
              return texture;
            }
            fileSpan.warn("No layer0 texture found in model file");
            fileSpan.end({ success: false, reason: "no_layer0_texture" });
          } catch (error) {
            fileSpan.error("Error reading model file", {
              error: (error as Error).message,
            });
            fileSpan.end({ success: false, error: (error as Error).message });
            // Fallback if model can't be read
          }
        }
      }

      // Fallback to looking for texture files
      const possibleDirs = Object.keys(packStructure.textureDirectories);
      for (const dir of possibleDirs) {
        const textures = packStructure.textureDirectories[dir];
        if (textures) {
          const found = textures.find((texture) => texture.endsWith(`${itemId}.png`));
          if (found) {
            const fallbackTexture = found
              .replace(/^.*assets\/minecraft\/textures\//, "minecraft:")
              .replace(/\.png$/, "");
            span.info("Using fallback texture from directory", {
              fallbackTexture,
              dir,
            });
            span.end({ success: true, texture: fallbackTexture });
            return fallbackTexture;
          }
        }
      }

      const defaultTexture = `minecraft:item/${itemId}`;
      span.info("Using default texture", { defaultTexture });
      span.end({ success: true, texture: defaultTexture });
      return defaultTexture;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      span.error("Failed to determine texture ref", {
        error: errorMessage,
        stack: errorStack,
      });
      span.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  // Expose the private method for testing
  public testDetermineTextureRef(
    itemId: string,
    packStructure: ResourcePackStructure,
    modelMappings: { [context: string]: string }
  ): string {
    return this.determineTextureRef(itemId, packStructure, modelMappings);
  }
}

describe("Texture Extraction", () => {
  let testDir: string;
  let strategy: TestDisplayContextStrategy;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "texture-extraction");
    strategy = new TestDisplayContextStrategy();

    // Create test directory structure
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });
    await mkdir(
      join(
        testDir,
        "dist",
        "previous-run",
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books"
      ),
      { recursive: true }
    );
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should extract correct texture from source file, not output directory", async () => {
    // Create source file with correct texture
    const sourceBookModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/book",
      },
    };
    await writeFile(
      join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(sourceBookModel, null, 2)
    );

    // Create contaminated output file (simulating previous run)
    const contaminatedBookModel = {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: "minecraft:item/enchanted_books/knowledge_book", // WRONG!
      },
      overrides: [
        {
          predicate: { "pommel:is_held": 1 },
          model: "minecraft:item/books_3d/book_3d_open",
        },
      ],
    };
    await writeFile(
      join(
        testDir,
        "dist",
        "previous-run",
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "book.json"
      ),
      JSON.stringify(contaminatedBookModel, null, 2)
    );

    // Create mock pack structure that includes both files
    const packStructure: ResourcePackStructure = {
      itemFiles: [],
      textureFiles: [],
      modelFiles: [
        join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
        join(
          testDir,
          "dist",
          "previous-run",
          "assets",
          "minecraft",
          "models",
          "item",
          "enchanted_books",
          "book.json"
        ),
      ],
      textureDirectories: {},
      modelDirectories: {},
    };

    const modelMappings = {
      gui: "minecraft:item/enchanted_books/book",
      fixed: "minecraft:item/enchanted_books/book",
      ground: "minecraft:item/enchanted_books/book",
    };

    const result = strategy.testDetermineTextureRef("book", packStructure, modelMappings);

    // Should extract from source file, not contaminated output file
    expect(result).toBe("minecraft:item/enchanted_books/book");
  });

  it("should handle knowledge_book separately without contamination", async () => {
    // Create source files for both book and knowledge_book
    const sourceBookModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/book",
      },
    };
    const sourceKnowledgeBookModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/knowledge_book",
      },
    };

    await writeFile(
      join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(sourceBookModel, null, 2)
    );
    await writeFile(
      join(
        testDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "knowledge_book.json"
      ),
      JSON.stringify(sourceKnowledgeBookModel, null, 2)
    );

    const packStructure: ResourcePackStructure = {
      itemFiles: [],
      textureFiles: [],
      modelFiles: [
        join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
        join(
          testDir,
          "assets",
          "minecraft",
          "models",
          "item",
          "enchanted_books",
          "knowledge_book.json"
        ),
      ],
      textureDirectories: {},
      modelDirectories: {},
    };

    // Test book extraction
    const bookMappings = {
      gui: "minecraft:item/enchanted_books/book",
    };
    const bookResult = strategy.testDetermineTextureRef("book", packStructure, bookMappings);
    expect(bookResult).toBe("minecraft:item/enchanted_books/book");

    // Test knowledge_book extraction
    const knowledgeBookMappings = {
      gui: "minecraft:item/enchanted_books/knowledge_book",
    };
    const knowledgeBookResult = strategy.testDetermineTextureRef(
      "knowledge_book",
      packStructure,
      knowledgeBookMappings
    );
    expect(knowledgeBookResult).toBe("minecraft:item/enchanted_books/knowledge_book");
  });

  it("should skip files in various output directory patterns", async () => {
    const sourceModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/enchanted_books/book",
      },
    };

    // Create source file
    await writeFile(
      join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(sourceModel, null, 2)
    );

    // Create contaminated files in various output patterns
    const contaminatedModel = {
      textures: {
        layer0: "minecraft:item/enchanted_books/WRONG",
      },
    };

    await mkdir(
      join(testDir, "build", "assets", "minecraft", "models", "item", "enchanted_books"),
      { recursive: true }
    );
    await mkdir(join(testDir, "out", "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });
    await mkdir(
      join(testDir, "nested", "dist", "assets", "minecraft", "models", "item", "enchanted_books"),
      { recursive: true }
    );

    await writeFile(
      join(
        testDir,
        "build",
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "book.json"
      ),
      JSON.stringify(contaminatedModel, null, 2)
    );
    await writeFile(
      join(testDir, "out", "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
      JSON.stringify(contaminatedModel, null, 2)
    );
    await writeFile(
      join(
        testDir,
        "nested",
        "dist",
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "book.json"
      ),
      JSON.stringify(contaminatedModel, null, 2)
    );

    const packStructure: ResourcePackStructure = {
      itemFiles: [],
      textureFiles: [],
      modelFiles: [
        join(testDir, "assets", "minecraft", "models", "item", "enchanted_books", "book.json"),
        join(
          testDir,
          "build",
          "assets",
          "minecraft",
          "models",
          "item",
          "enchanted_books",
          "book.json"
        ),
        join(
          testDir,
          "out",
          "assets",
          "minecraft",
          "models",
          "item",
          "enchanted_books",
          "book.json"
        ),
        join(
          testDir,
          "nested",
          "dist",
          "assets",
          "minecraft",
          "models",
          "item",
          "enchanted_books",
          "book.json"
        ),
      ],
      textureDirectories: {},
      modelDirectories: {},
    };

    const modelMappings = {
      gui: "minecraft:item/enchanted_books/book",
    };

    const result = strategy.testDetermineTextureRef("book", packStructure, modelMappings);

    // Should only find the source file, not any of the output files
    expect(result).toBe("minecraft:item/enchanted_books/book");
  });

  it("should fallback to texture directory search when model file not found", async () => {
    const packStructure: ResourcePackStructure = {
      itemFiles: [],
      textureFiles: [],
      modelFiles: [], // No model files
      textureDirectories: {
        item: ["assets/minecraft/textures/item/book.png"],
      },
      modelDirectories: {},
    };

    const modelMappings = {
      gui: "minecraft:item/enchanted_books/book",
    };

    const result = strategy.testDetermineTextureRef("book", packStructure, modelMappings);

    expect(result).toBe("minecraft:item/book");
  });

  it("should return fallback texture when nothing is found", async () => {
    const packStructure: ResourcePackStructure = {
      itemFiles: [],
      textureFiles: [],
      modelFiles: [],
      textureDirectories: {},
      modelDirectories: {},
    };

    const modelMappings = {
      gui: "minecraft:item/enchanted_books/book",
    };

    const result = strategy.testDetermineTextureRef("book", packStructure, modelMappings);

    expect(result).toBe("minecraft:item/book");
  });
});
