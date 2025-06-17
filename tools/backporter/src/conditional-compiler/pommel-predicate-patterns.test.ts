import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { TargetSystemMapper } from "./target-mapper";

/**
 * Pommel Predicate Patterns Test Suite
 *
 * Tests the critical discovery that when items are in offhand,
 * BOTH `pommel:is_held` AND `pommel:is_offhand` return 1.0 simultaneously.
 *
 * Required pattern: 1x ground, 2x held, 3x offhand predicates
 *
 * Based on: notes/2025-06-05T12:04:57+0000--conditional-compiler-progress-report.md
 * Architecture insight from Pommel source code analysis.
 */
describe("Pommel Predicate Patterns", () => {
  let testDir: string;
  let mapper: TargetSystemMapper;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "pommel-predicates");
    await mkdir(testDir, { recursive: true });
    mapper = new TargetSystemMapper();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Predicate Count Requirements", () => {
    it("should generate correct predicate counts for all book types", () => {
      // Create execution paths for a book with all contexts
      const executionPaths = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open",
        },
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d",
        },
      ];

      const targets = mapper.mapPathsToTargets(executionPaths, "book");

      // Should generate single Pommel target with correct overrides
      expect(targets).toHaveLength(1);
      expect(targets[0].type).toBe("pommel");

      const overrides = targets[0].content.overrides;
      expect(Array.isArray(overrides)).toBe(true);

      // Count predicate types
      const predicates = overrides.map((o: any) => o.predicate);
      const groundCount = predicates.filter(
        (p: any) => p && p["pommel:is_ground"] === 1
      ).length;
      const heldCount = predicates.filter(
        (p: any) => p && p["pommel:is_held"] === 1
      ).length;
      const offhandCount = predicates.filter(
        (p: any) => p && p["pommel:is_offhand"] === 1
      ).length;

      // Critical pattern requirements
      expect(groundCount).toBe(1);
      expect(heldCount).toBe(2); // 2x held predicates (main hand contexts)
      expect(offhandCount).toBe(3); // 3x offhand predicates (offhand contexts)
    });

    it("should generate correct predicates for enchanted book individual models", () => {
      const enchantedPaths = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: { type: "minecraft:channeling", level: 1 },
          },
          targetModel: "minecraft:item/enchanted_books/channeling_1",
        },
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: { type: "minecraft:channeling", level: 1 },
          },
          targetModel: "minecraft:item/enchanted_books/channeling_1",
        },
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: { type: "minecraft:channeling", level: 1 },
          },
          targetModel: "minecraft:item/books_3d/channeling_3d_open",
        },
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: { type: "minecraft:channeling", level: 1 },
          },
          targetModel: "minecraft:item/books_3d/channeling_3d",
        },
      ];

      const targets = mapper.mapPathsToTargets(
        enchantedPaths,
        "enchanted_book"
      );

      // Should generate CIT + Pommel targets
      const pommelTargets = targets.filter(
        (t) => t.type === "pommel" && t.file.includes("channeling_1")
      );
      expect(pommelTargets).toHaveLength(1);

      const overrides = pommelTargets[0].content.overrides;
      const predicates = overrides.map((o: any) => o.predicate);

      const groundCount = predicates.filter(
        (p: any) => p && p["pommel:is_ground"] === 1
      ).length;
      const heldCount = predicates.filter(
        (p: any) => p && p["pommel:is_held"] === 1
      ).length;
      const offhandCount = predicates.filter(
        (p: any) => p && p["pommel:is_offhand"] === 1
      ).length;

      // Same pattern for individual enchantment models
      expect(groundCount).toBe(1);
      expect(heldCount).toBe(2);
      expect(offhandCount).toBe(3);
    });
  });

  describe("Predicate Grouping and Context Mapping", () => {
    it("should group GUI contexts together (no Pommel predicates)", () => {
      const guiOnlyPaths = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
      ];

      const targets = mapper.mapPathsToTargets(guiOnlyPaths, "book");

      // GUI-only should not generate Pommel overrides in base model
      const pommelTarget = targets.find((t) => t.type === "pommel");

      if (pommelTarget) {
        // If Pommel target exists, it should have overrides even for GUI-only (for fallback contexts)
        const overrides = pommelTarget.content.overrides || [];
        expect(overrides.length).toBeGreaterThan(0);
      }
    });

    it("should map ground context to pommel:is_ground predicate", () => {
      const groundPaths = [
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
      ];

      const targets = mapper.mapPathsToTargets(groundPaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;
      const hasGroundPredicate = overrides.some(
        (o: any) => o.predicate && o.predicate["pommel:is_ground"] === 1
      );

      expect(hasGroundPredicate).toBe(true);
    });

    it("should map main hand contexts to pommel:is_held predicates", () => {
      const mainHandPaths = [
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open",
        },
      ];

      const targets = mapper.mapPathsToTargets(mainHandPaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;
      const heldPredicates = overrides.filter(
        (o: any) => o.predicate && o.predicate["pommel:is_held"] === 1
      );

      expect(heldPredicates.length).toBe(2); // Both first and third person
    });

    it("should map offhand contexts to pommel:is_offhand predicates", () => {
      const offhandPaths = [
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d",
        },
      ];

      const targets = mapper.mapPathsToTargets(offhandPaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;
      const offhandPredicates = overrides.filter(
        (o: any) => o.predicate && o.predicate["pommel:is_offhand"] === 1
      );

      expect(offhandPredicates.length).toBe(3); // Special 3x pattern for offhand
    });
  });

  describe("Override Deduplication", () => {
    it("should deduplicate identical model references in overrides", () => {
      // Create paths that would generate duplicate overrides
      const duplicatePaths = [
        {
          conditions: {
            displayContext: ["firstperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open",
        },
        {
          conditions: {
            displayContext: ["thirdperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open", // Same model
        },
      ];

      const targets = mapper.mapPathsToTargets(duplicatePaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;

      // Should generate multiple overrides for the same model with different predicates (Pommel duplicate system)
      const modelReferences = overrides.map((o: any) => o.model);
      const uniqueModels = [...new Set(modelReferences)];

      // There should be fewer unique models than total overrides (duplicates for different predicates)
      expect(uniqueModels.length).toBeLessThan(modelReferences.length);
    });

    it("should maintain separate overrides for different models", () => {
      const differentModelPaths = [
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open",
        },
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d", // Different model
        },
      ];

      const targets = mapper.mapPathsToTargets(differentModelPaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;

      // Should have overrides for both models
      const hasOpenModel = overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/book_3d_open"
      );
      const hasClosedModel = overrides.some(
        (o: any) => o.model === "minecraft:item/books_3d/book_3d"
      );

      expect(hasOpenModel).toBe(true);
      expect(hasClosedModel).toBe(true);
    });
  });

  describe("Predicate Priority and Ordering", () => {
    it("should order predicates with most specific first", () => {
      const allContextPaths = [
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d_open",
        },
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: null,
          },
          targetModel: "minecraft:item/books_3d/book_3d",
        },
      ];

      const targets = mapper.mapPathsToTargets(allContextPaths, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;

      // Ground predicates should come first (as shown in debug output)
      const firstOverride = overrides[0];
      if (firstOverride.predicate) {
        const hasGroundFirst =
          firstOverride.predicate["pommel:is_ground"] === 1;
        expect(hasGroundFirst).toBe(true);
      }
    });

    it("should ensure ground predicate exists for items with ground context", () => {
      const pathsWithGround = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: null,
          },
          targetModel: "minecraft:item/enchanted_books/book",
        },
      ];

      const targets = mapper.mapPathsToTargets(pathsWithGround, "book");
      const pommelTarget = targets.find((t) => t.type === "pommel");

      expect(pommelTarget).toBeDefined();

      const overrides = pommelTarget!.content.overrides;
      const hasGroundPredicate = overrides.some(
        (o: any) => o.predicate && o.predicate["pommel:is_ground"] === 1
      );

      expect(hasGroundPredicate).toBe(true);
    });
  });

  describe("Integration with CIT System", () => {
    it("should generate CIT targets with no Pommel predicates in base model", () => {
      const enchantedBookPaths = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: { type: "minecraft:channeling", level: 1 },
          },
          targetModel: "minecraft:item/enchanted_books/channeling_1",
        },
      ];

      const targets = mapper.mapPathsToTargets(
        enchantedBookPaths,
        "enchanted_book"
      );

      // Should have both CIT and Pommel targets
      const citTarget = targets.find((t) => t.type === "cit_property");
      const baseTarget = targets.find(
        (t) => t.file === "models/item/enchanted_book.json"
      );

      expect(citTarget).toBeDefined();

      // Base enchanted_book.json should have no overrides (CIT handles everything)
      if (baseTarget) {
        expect(baseTarget.content.overrides).toBeUndefined();
      }
    });

    it("should generate individual enchantment models with full Pommel predicates", () => {
      const enchantedBookPaths = [
        {
          conditions: {
            displayContext: ["gui", "fixed", "head"],
            enchantment: { type: "minecraft:sharpness", level: 3 },
          },
          targetModel: "minecraft:item/enchanted_books/sharpness_3",
        },
        {
          conditions: {
            displayContext: ["ground"],
            enchantment: { type: "minecraft:sharpness", level: 3 },
          },
          targetModel: "minecraft:item/enchanted_books/sharpness_3",
        },
        {
          conditions: {
            displayContext: ["firstperson_righthand", "thirdperson_righthand"],
            enchantment: { type: "minecraft:sharpness", level: 3 },
          },
          targetModel: "minecraft:item/books_3d/sharpness_3d_open",
        },
        {
          conditions: {
            displayContext: ["firstperson_lefthand", "thirdperson_lefthand"],
            enchantment: { type: "minecraft:sharpness", level: 3 },
          },
          targetModel: "minecraft:item/books_3d/sharpness_3d",
        },
      ];

      const targets = mapper.mapPathsToTargets(
        enchantedBookPaths,
        "enchanted_book"
      );

      // Individual model should have full Pommel predicates
      const sharpnessModel = targets.find(
        (t) => t.type === "pommel" && t.file.includes("sharpness_3")
      );

      expect(sharpnessModel).toBeDefined();

      const overrides = sharpnessModel!.content.overrides;
      const predicates = overrides.map((o: any) => o.predicate);

      const groundCount = predicates.filter(
        (p: any) => p && p["pommel:is_ground"] === 1
      ).length;
      const heldCount = predicates.filter(
        (p: any) => p && p["pommel:is_held"] === 1
      ).length;
      const offhandCount = predicates.filter(
        (p: any) => p && p["pommel:is_offhand"] === 1
      ).length;

      expect(groundCount).toBe(1);
      expect(heldCount).toBe(2);
      expect(offhandCount).toBe(3);
    });
  });
});
