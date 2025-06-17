import { ConditionalPathExtractor } from "../src/conditional-compiler/path-extractor.js";
import { TargetSystemMapper } from "../src/conditional-compiler/target-mapper.js";

const testItem = {
  model: {
    type: "minecraft:select",
    property: "minecraft:stored_enchantments",
    cases: [{
      when: { "minecraft:channeling": 1 },
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["gui", "fixed", "head"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/channeling_1"
            }
          },
          {
            when: ["ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/enchanted_books/channeling_1"
            }
          },
          {
            when: ["firstperson_righthand", "thirdperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/books_3d/channeling_3d_open"
            }
          },
          {
            when: ["firstperson_lefthand", "thirdperson_lefthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/books_3d/channeling_3d"
            }
          }
        ]
      }
    }]
  }
};

console.log("Testing enchanted book target generation...");

const extractor = new ConditionalPathExtractor();
const paths = extractor.extractAllPaths(testItem);

console.log("Extracted paths:", paths.length);
paths.forEach((path, i) => {
  console.log(`Path ${i}:`, {
    conditions: path.conditions,
    targetModel: path.targetModel,
    priority: path.priority,
    isFallback: path.isFallback
  });
});

const mapper = new TargetSystemMapper("./input", "./output");
const targets = mapper.mapPathsToTargets(paths, "enchanted_book");

console.log("\nGenerated targets:", targets.length);
targets.forEach((target, i) => {
  console.log(`Target ${i}:`, {
    type: target.type,
    file: target.file,
    priority: target.priority,
    hasOverrides: !!target.content?.overrides,
    overrideCount: target.content?.overrides?.length || 0
  });
});
