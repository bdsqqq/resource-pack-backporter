import { beforeEach, describe, expect, it } from "vitest";

// Mock the interfaces and types we need
interface ComponentAnalysis {
  itemId: string;
  filePath: string;
  componentsUsed: string[];
  displayContexts: string[];
  conditionalModels: ConditionalModel[];
}

interface ConditionalModel {
  component: string;
  conditions: any[];
  contextMappings: { [context: string]: string };
}

interface ItemVariant {
  itemId: string;
  variantId: string;
  textureRef: string;
  modelMappings: { [context: string]: string };
  metadata: Record<string, any>;
}

interface FileGenerationStrategy {
  name: string;
}

// Mock the strategy selection logic from BackportCoordinator
class TestBackportCoordinator {
  private selectGenerationStrategy(
    analysis: ComponentAnalysis,
    _variants: ItemVariant[]
  ): FileGenerationStrategy {
    // Apply core principle: Use minimal strategy selection based on pack introspection

    // Components that are just for internal 3D model selection should be treated as context-only
    const internalComponents = ["minecraft:writable_book_content"];
    const hasSignificantComponents =
      analysis.componentsUsed.length > 0 &&
      !analysis.componentsUsed.every(
        (c) => c === "pure_display_context" || internalComponents.includes(c)
      );
    const hasContextSwitching = analysis.displayContexts.length > 1;

    if (hasSignificantComponents && hasContextSwitching) {
      // Both NBT/component-based AND context-based variation -> Combined CIT + Pommel
      return { name: "combined_cit_pommel" };
    }
    if (hasSignificantComponents) {
      // Only NBT/component-based variation -> Pure CIT
      return { name: "pure_cit" };
    }
    if (hasContextSwitching) {
      // Only context-based variation -> Pure Pommel
      return { name: "pure_pommel" };
    }
    // No variation needed -> Simple copy
    return { name: "simple_copy" };
  }

  // Expose for testing
  public testSelectGenerationStrategy(
    analysis: ComponentAnalysis,
    variants: ItemVariant[]
  ): FileGenerationStrategy {
    return this.selectGenerationStrategy(analysis, variants);
  }
}

describe("Strategy Selection", () => {
  let coordinator: TestBackportCoordinator;

  beforeEach(() => {
    coordinator = new TestBackportCoordinator();
  });

  it("should select pure Pommel strategy for regular book (context-only)", () => {
    const analysis: ComponentAnalysis = {
      itemId: "book",
      filePath: "assets/minecraft/items/book.json",
      componentsUsed: [],
      displayContexts: [
        "gui",
        "fixed",
        "ground",
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("pure_pommel");
  });

  it("should select pure Pommel strategy for writable_book (internal component)", () => {
    const analysis: ComponentAnalysis = {
      itemId: "writable_book",
      filePath: "assets/minecraft/items/writable_book.json",
      componentsUsed: ["minecraft:writable_book_content"],
      displayContexts: [
        "gui",
        "fixed",
        "ground",
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("pure_pommel");
  });

  it("should select combined CIT + Pommel strategy for enchanted_book", () => {
    const analysis: ComponentAnalysis = {
      itemId: "enchanted_book",
      filePath: "assets/minecraft/items/enchanted_book.json",
      componentsUsed: ["minecraft:stored_enchantments"],
      displayContexts: [
        "gui",
        "fixed",
        "ground",
        "firstperson_righthand",
        "thirdperson_righthand",
        "firstperson_lefthand",
        "thirdperson_lefthand",
        "head",
      ],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("combined_cit_pommel");
  });

  it("should select pure CIT strategy for NBT-only items", () => {
    const analysis: ComponentAnalysis = {
      itemId: "custom_item",
      filePath: "assets/minecraft/items/custom_item.json",
      componentsUsed: ["minecraft:custom_data"],
      displayContexts: ["gui"], // Only one context
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("pure_cit");
  });

  it("should select simple copy for items with no variation", () => {
    const analysis: ComponentAnalysis = {
      itemId: "simple_item",
      filePath: "assets/minecraft/items/simple_item.json",
      componentsUsed: [],
      displayContexts: ["gui"], // Only one context
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("simple_copy");
  });

  it("should handle pure_display_context component correctly", () => {
    const analysis: ComponentAnalysis = {
      itemId: "context_item",
      filePath: "assets/minecraft/items/context_item.json",
      componentsUsed: ["pure_display_context"],
      displayContexts: ["gui", "fixed", "ground", "firstperson_righthand"],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    // pure_display_context should be treated as context-only, not significant component
    expect(strategy.name).toBe("pure_pommel");
  });

  it("should select combined strategy for items with both significant components and contexts", () => {
    const analysis: ComponentAnalysis = {
      itemId: "complex_item",
      filePath: "assets/minecraft/items/complex_item.json",
      componentsUsed: ["minecraft:stored_enchantments", "minecraft:custom_data"],
      displayContexts: ["gui", "fixed", "ground", "firstperson_righthand", "thirdperson_righthand"],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    expect(strategy.name).toBe("combined_cit_pommel");
  });

  it("should handle mixed internal and significant components", () => {
    const analysis: ComponentAnalysis = {
      itemId: "mixed_item",
      filePath: "assets/minecraft/items/mixed_item.json",
      componentsUsed: ["minecraft:writable_book_content", "minecraft:stored_enchantments"], // One internal, one significant
      displayContexts: ["gui", "fixed", "ground", "firstperson_righthand"],
      conditionalModels: [],
    };

    const variants: ItemVariant[] = [];

    const strategy = coordinator.testSelectGenerationStrategy(analysis, variants);

    // Should still be combined because stored_enchantments is significant
    expect(strategy.name).toBe("combined_cit_pommel");
  });
});
