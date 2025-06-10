import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ConditionalBackportCoordinator } from "../src/conditional-compiler/backport-coordinator.js";

async function setupEnchantedTest() {
  const inputDir = "./input";
  const outputDir = "./output";
  
  // Setup pack.mcmeta
  await writeFile(join(inputDir, "pack.mcmeta"), JSON.stringify({
    pack: { pack_format: 51, description: "Test pack" }
  }, null, 2));
  
  // Create enchanted book item
  await mkdir(join(inputDir, "assets", "minecraft", "items"), { recursive: true });
  
  const enchantedBookItem = {
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
  
  await writeFile(
    join(inputDir, "assets", "minecraft", "items", "enchanted_book.json"),
    JSON.stringify(enchantedBookItem, null, 2)
  );
  
  // Run backport
  const coordinator = new ConditionalBackportCoordinator();
  await coordinator.backport(inputDir, outputDir);
  
  console.log("Generated files:");
  const { execSync } = await import("child_process");
  try {
    const result = execSync(`find ./output -name "*.json" | head -20`, { encoding: 'utf8' });
    console.log(result);
  } catch (e) {
    console.log("No files found or error:", e.message);
  }
}

setupEnchantedTest().catch(console.error);
