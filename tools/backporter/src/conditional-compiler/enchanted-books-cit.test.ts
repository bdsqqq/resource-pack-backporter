import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestTracer } from "../test-utils";
import { ConditionalBackportCoordinator } from "./backport-coordinator";

/**
 * Enchanted Books CIT Generation Test Suite
 *
 * Tests the specific CIT (Connected Item Textures) generation functionality
 * for enchanted books that was fixed to match the working reference pack.
 */
describe("Enchanted Books CIT Generation", () => {
  let testDir: string;
  let inputDir: string;
  let outputDir: string;
  let coordinator: ConditionalBackportCoordinator;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "enchanted-books-cit");
    inputDir = join(testDir, "input");
    outputDir = join(testDir, "output");

    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    coordinator = new ConditionalBackportCoordinator(createTestTracer());
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("CIT Properties Generation", () => {
    it("should generate correct CIT properties for single-level enchantments", async () => {
      await setupEnchantedBookPack(inputDir, "channeling", 1);
      await coordinator.backport(inputDir, outputDir);

      const citPath = join(
        outputDir,
        "assets",
        "minecraft",
        "optifine",
        "cit",
        "channeling_1.properties"
      );
      expect(existsSync(citPath)).toBe(true);

      const citContent = await readFile(citPath, "utf-8");

      // Must match reference pack format exactly
      expect(citContent).toContain("type=item");
      expect(citContent).toContain("items=enchanted_book");
      expect(citContent).toContain(
        "model=assets/minecraft/models/item/enchanted_books/channeling_1"
      );
      expect(citContent).toContain("enchantmentIDs=minecraft:channeling");
      expect(citContent).toContain("enchantmentLevels=1");
    });

    it("should generate correct CIT properties for multi-level enchantments", async () => {
      await setupEnchantedBookPack(inputDir, "sharpness", 3);
      await coordinator.backport(inputDir, outputDir);

      // Test multiple levels
      for (let level = 1; level <= 3; level++) {
        const citPath = join(
          outputDir,
          "assets",
          "minecraft",
          "optifine",
          "cit",
          `sharpness_${level}.properties`
        );
        expect(existsSync(citPath)).toBe(true);

        const citContent = await readFile(citPath, "utf-8");

        expect(citContent).toContain("type=item");
        expect(citContent).toContain("items=enchanted_book");
        expect(citContent).toContain(
          `model=assets/minecraft/models/item/enchanted_books/sharpness_${level}`
        );
        expect(citContent).toContain("enchantmentIDs=minecraft:sharpness");
        expect(citContent).toContain(`enchantmentLevels=${level}`);
      }
    });

    it("should generate correct CIT properties for curse enchantments", async () => {
      await setupEnchantedBookPack(inputDir, "binding_curse", 1);
      await coordinator.backport(inputDir, outputDir);

      const citPath = join(
        outputDir,
        "assets",
        "minecraft",
        "optifine",
        "cit",
        "binding_curse_1.properties"
      );
      expect(existsSync(citPath)).toBe(true);

      const citContent = await readFile(citPath, "utf-8");

      // CIT should use original enchantment ID, not the mapped texture name
      expect(citContent).toContain("type=item");
      expect(citContent).toContain("items=enchanted_book");
      expect(citContent).toContain(
        "model=assets/minecraft/models/item/enchanted_books/binding_curse_1"
      );
      expect(citContent).toContain("enchantmentIDs=minecraft:binding_curse");
      expect(citContent).toContain("enchantmentLevels=1");
    });
  });

  describe("Enchantment Model Generation", () => {
    it("should generate correct model structure for single-level enchantments", async () => {
      await setupEnchantedBookPack(inputDir, "channeling", 1);
      await coordinator.backport(inputDir, outputDir);

      const modelPath = join(
        outputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "channeling_1.json"
      );
      expect(existsSync(modelPath)).toBe(true);

      const model = JSON.parse(await readFile(modelPath, "utf-8"));

      // Should match reference pack structure
      expect(model.parent).toBe("minecraft:item/handheld");
      expect(model.textures.layer0).toBe("minecraft:item/enchanted_books/channeling"); // No level suffix for single-level
      expect(model.overrides).toBeDefined();
      expect(model.overrides.length).toBeGreaterThan(0);

      // Should have Pommel predicates
      const predicates = model.overrides.map((o: any) => Object.keys(o.predicate)[0]);
      expect(predicates).toContain("pommel:is_ground");
      expect(predicates).toContain("pommel:is_held");
      expect(predicates).toContain("pommel:is_offhand");

      // Should reference correct 3D models
      const hasHeldReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/channeling_3d_open"
      );
      const hasOffhandReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/channeling_3d"
      );

      expect(hasHeldReference).toBe(true);
      expect(hasOffhandReference).toBe(true);
    });

    it("should generate correct model structure for multi-level enchantments", async () => {
      await setupEnchantedBookPack(inputDir, "sharpness", 3);
      await coordinator.backport(inputDir, outputDir);

      const modelPath = join(
        outputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "sharpness_2.json"
      );
      expect(existsSync(modelPath)).toBe(true);

      const model = JSON.parse(await readFile(modelPath, "utf-8"));

      expect(model.parent).toBe("minecraft:item/handheld");
      expect(model.textures.layer0).toBe("minecraft:item/enchanted_books/sharpness_2"); // With level suffix

      // Should reference 3D models without level suffix in the path
      const hasHeldReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/sharpness_3d_open"
      );
      const hasOffhandReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/sharpness_3d"
      );

      expect(hasHeldReference).toBe(true);
      expect(hasOffhandReference).toBe(true);
    });

    it("should handle curse enchantment texture name mapping", async () => {
      await setupEnchantedBookPack(inputDir, "binding_curse", 1);
      await coordinator.backport(inputDir, outputDir);

      const modelPath = join(
        outputDir,
        "assets",
        "minecraft",
        "models",
        "item",
        "enchanted_books",
        "binding_curse_1.json"
      );
      expect(existsSync(modelPath)).toBe(true);

      const model = JSON.parse(await readFile(modelPath, "utf-8"));

      // Should use mapped texture name: binding_curse → curse_of_binding
      expect(model.textures.layer0).toBe("minecraft:item/enchanted_books/curse_of_binding");

      // But 3D models should use the enchantment name
      const hasHeldReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/binding_curse_3d_open"
      );
      const hasOffhandReference = model.overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/binding_curse_3d"
      );

      expect(hasHeldReference).toBe(true);
      expect(hasOffhandReference).toBe(true);
    });
  });

  // Helper function to create enchanted book test packs
  async function setupEnchantedBookPack(inputDir: string, enchantment: string, maxLevel: number) {
    // Create basic pack structure
    await mkdir(join(inputDir, "assets", "minecraft", "items"), {
      recursive: true,
    });
    await mkdir(join(inputDir, "assets", "minecraft", "models", "item", "enchanted_books"), {
      recursive: true,
    });

    const packMeta = {
      pack: {
        pack_format: 55,
        description: "Test Enchanted Book Pack",
      },
    };
    await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify(packMeta, null, 2));

    // Create enchanted book item with conditional structure
    const enchantedBookItem = {
      model: {
        type: "minecraft:select",
        property: "minecraft:stored_enchantments",
        cases: Array.from({ length: maxLevel }, (_, i) => ({
          when: {
            [`minecraft:${enchantment}`]: i + 1,
          },
          model: {
            type: "minecraft:select",
            property: "minecraft:display_context",
            cases: [
              {
                when: ["gui", "fixed", "head"],
                model: {
                  type: "minecraft:model",
                  model: `minecraft:item/enchanted_books/${enchantment}_${i + 1}`,
                },
              },
              {
                when: ["ground"],
                model: {
                  type: "minecraft:model",
                  model: `minecraft:item/enchanted_books/${enchantment}_${i + 1}`,
                },
              },
              {
                when: ["firstperson_righthand", "thirdperson_righthand"],
                model: {
                  type: "minecraft:model",
                  model: `minecraft:item/books_3d/${enchantment}_3d_open`,
                },
              },
              {
                when: ["firstperson_lefthand", "thirdperson_lefthand"],
                model: {
                  type: "minecraft:model",
                  model: `minecraft:item/books_3d/${enchantment}_3d`,
                },
              },
            ],
          },
        })),
      },
    };

    await writeFile(
      join(inputDir, "assets", "minecraft", "items", "enchanted_book.json"),
      JSON.stringify(enchantedBookItem, null, 2)
    );

    // Create corresponding model files for each level
    for (let i = 1; i <= maxLevel; i++) {
      const modelData = {
        parent: "minecraft:item/generated",
        textures: {
          layer0: `minecraft:item/enchanted_books/${enchantment}_${i}`,
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
          `${enchantment}_${i}.json`
        ),
        JSON.stringify(modelData, null, 2)
      );
    }
  }
});
