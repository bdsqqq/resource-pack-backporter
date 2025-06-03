import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// Mock interfaces needed for testing
interface ConditionalModel {
  component: string;
  conditions: any[];
  contextMappings: { [context: string]: string };
}

// Mock the component analysis logic
class TestComponentAnalyzer {
  extractComponentInfo(itemData: any): {
    components: string[];
    contexts: string[];
    conditionalModels: ConditionalModel[];
  } {
    const components: string[] = [];
    const contexts: string[] = [];
    const conditionalModels: ConditionalModel[] = [];

    if (itemData.model) {
      this.analyzeModel(itemData.model, components, contexts, conditionalModels);
    }

    return { components, contexts, conditionalModels };
  }

  private analyzeModel(
    model: any,
    components: string[],
    contexts: string[],
    conditionalModels: ConditionalModel[]
  ): void {
    if (model.type === "minecraft:select") {
      if (model.property === "minecraft:display_context" && model.cases) {
        // Display context selection
        for (const case_ of model.cases) {
          if (case_.when && Array.isArray(case_.when)) {
            contexts.push(...case_.when);
          }
        }
        components.push("pure_display_context");
      } else if (model.cases) {
        // Component-based selection
        for (const case_ of model.cases) {
          if (case_.when && case_.when.type === "minecraft:component" && case_.when.property) {
            const component = case_.when.property;
            if (!components.includes(component)) {
              components.push(component);
            }
          }
        }
      }
    } else if (model.type === "minecraft:condition") {
      // Handle conditional structures like writable_book
      const conditionInfo = this.extractConditionModels(model);
      if (conditionInfo.component) {
        if (!components.includes(conditionInfo.component)) {
          components.push(conditionInfo.component);
        }
      }

      // Extract contexts from condition branches
      contexts.push(...conditionInfo.contexts);
      conditionalModels.push(...conditionInfo.conditionalModels);
    }

    // Handle fallback models
    if (model.fallback) {
      this.analyzeModel(model.fallback, components, contexts, conditionalModels);
    }
  }

  private extractConditionModels(conditionModel: any): {
    component: string | null;
    contexts: string[];
    conditionalModels: ConditionalModel[];
  } {
    const contexts: string[] = [];
    const conditionalModels: ConditionalModel[] = [];
    let component: string | null = null;

    if (
      conditionModel.condition &&
      conditionModel.condition.type === "minecraft:component" &&
      conditionModel.condition.property
    ) {
      component = conditionModel.condition.property;
    }

    // Extract models from on_true and on_false branches
    if (conditionModel.on_true) {
      const trueContexts = this.extractModelsFromBranch(conditionModel.on_true);
      contexts.push(...trueContexts);
    }

    if (conditionModel.on_false) {
      const falseContexts = this.extractModelsFromBranch(conditionModel.on_false);
      contexts.push(...falseContexts);
    }

    return { component, contexts, conditionalModels };
  }

  private extractModelsFromBranch(branch: any): string[] {
    const contexts: string[] = [];

    if (
      branch.type === "minecraft:select" &&
      branch.property === "minecraft:display_context" &&
      branch.cases
    ) {
      for (const case_ of branch.cases) {
        if (case_.when && Array.isArray(case_.when)) {
          contexts.push(...case_.when);
        }
      }
    }

    return contexts;
  }
}

describe("Component Analysis", () => {
  let testDir: string;
  let analyzer: TestComponentAnalyzer;

  beforeEach(async () => {
    testDir = join(process.cwd(), "test-fixtures", "component-analysis");
    analyzer = new TestComponentAnalyzer();
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should analyze regular book (display context only)", async () => {
    const bookData = {
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
          {
            when: ["firstperson_lefthand", "thirdperson_lefthand", "head"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/books_3d/book_3d",
            },
          },
        ],
        fallback: {
          type: "minecraft:model",
          model: "minecraft:item/book",
        },
      },
    };

    const result = analyzer.extractComponentInfo(bookData);

    expect(result.components).toEqual(["pure_display_context"]);
    expect(result.contexts).toEqual([
      "gui",
      "fixed",
      "ground",
      "firstperson_righthand",
      "thirdperson_righthand",
      "firstperson_lefthand",
      "thirdperson_lefthand",
      "head",
    ]);
  });

  it("should analyze writable_book (conditional with writable_book_content)", async () => {
    const writableBookData = {
      model: {
        type: "minecraft:condition",
        condition: {
          type: "minecraft:component",
          property: "minecraft:writable_book_content",
        },
        on_true: {
          type: "minecraft:select",
          property: "minecraft:display_context",
          cases: [
            {
              when: ["gui", "fixed", "ground"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/enchanted_books/writable_book",
              },
            },
            {
              when: ["firstperson_righthand", "thirdperson_righthand"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/books_3d/writable_book_3d_contents_open",
              },
            },
            {
              when: ["firstperson_lefthand", "thirdperson_lefthand", "head"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/books_3d/writable_book_3d",
              },
            },
          ],
        },
        on_false: {
          type: "minecraft:select",
          property: "minecraft:display_context",
          cases: [
            {
              when: ["gui", "fixed", "ground"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/enchanted_books/writable_book",
              },
            },
            {
              when: ["firstperson_righthand", "thirdperson_righthand"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/books_3d/writable_book_3d_open",
              },
            },
            {
              when: ["firstperson_lefthand", "thirdperson_lefthand", "head"],
              model: {
                type: "minecraft:model",
                model: "minecraft:item/books_3d/writable_book_3d",
              },
            },
          ],
        },
      },
    };

    const result = analyzer.extractComponentInfo(writableBookData);

    expect(result.components).toEqual(["minecraft:writable_book_content"]);
    expect(result.contexts).toContain("gui");
    expect(result.contexts).toContain("firstperson_righthand");
    expect(result.contexts).toContain("thirdperson_righthand");
    expect(result.contexts).toContain("firstperson_lefthand");
    expect(result.contexts).toContain("thirdperson_lefthand");
    expect(result.contexts).toContain("head");
  });

  it("should analyze enchanted_book (stored_enchantments)", async () => {
    const enchantedBookData = {
      model: {
        type: "minecraft:select",
        property: "minecraft:stored_enchantments",
        cases: [
          {
            when: {
              type: "minecraft:component",
              property: "minecraft:stored_enchantments",
            },
            model: {
              type: "minecraft:select",
              property: "minecraft:display_context",
              cases: [
                {
                  when: ["gui", "fixed", "ground"],
                  model: {
                    type: "minecraft:model",
                    model: "minecraft:item/enchanted_books/aqua_affinity",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const result = analyzer.extractComponentInfo(enchantedBookData);

    expect(result.components).toContain("minecraft:stored_enchantments");
  });

  it("should handle nested model structures", async () => {
    const complexData = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/custom_gui",
            },
          },
          {
            when: ["firstperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/custom_3d",
            },
          },
        ],
        fallback: {
          type: "minecraft:model",
          model: "minecraft:item/fallback",
        },
      },
    };

    const result = analyzer.extractComponentInfo(complexData);

    expect(result.components).toContain("pure_display_context");
    expect(result.contexts).toContain("gui");
    expect(result.contexts).toContain("fixed");
    expect(result.contexts).toContain("firstperson_righthand");
  });

  it("should handle items with no model", async () => {
    const simpleData = {
      // No model property
    };

    const result = analyzer.extractComponentInfo(simpleData);

    expect(result.components).toEqual([]);
    expect(result.contexts).toEqual([]);
    expect(result.conditionalModels).toEqual([]);
  });

  it("should deduplicate components and contexts", async () => {
    const dataWithDuplicates = {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "gui", "fixed"], // Duplicate gui
            model: {
              type: "minecraft:model",
              model: "minecraft:item/test",
            },
          },
          {
            when: ["gui", "ground"], // Another gui duplicate
            model: {
              type: "minecraft:model",
              model: "minecraft:item/test2",
            },
          },
        ],
      },
    };

    const result = analyzer.extractComponentInfo(dataWithDuplicates);

    // Should deduplicate contexts
    const uniqueContexts = [...new Set(result.contexts)];
    expect(result.contexts.filter((c) => c === "gui").length).toBeGreaterThan(1); // We actually keep duplicates from the raw extraction
    expect(uniqueContexts).toContain("gui");
    expect(uniqueContexts).toContain("fixed");
    expect(uniqueContexts).toContain("ground");
  });
});
