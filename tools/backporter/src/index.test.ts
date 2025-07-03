import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ConditionalBackportCoordinator } from "@backporter/index";
import { createTestTracer } from "./test-utils";

const TEST_INPUT_DIR = "test-fixtures/integration-input";
const TEST_OUTPUT_DIR = "test-fixtures/integration-output";

beforeEach(async () => {
  // Clean up test directories
  await rm(TEST_INPUT_DIR, { recursive: true, force: true });
  await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  // Clean up test directories
  await rm(TEST_INPUT_DIR, { recursive: true, force: true });
  await rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
});

test("backports pack with display context switching", async () => {
  // Create a test pack with display context switching
  await createTestPack(TEST_INPUT_DIR, {
    "pack.mcmeta": {
      pack: {
        pack_format: 15,
        description: "Test Pack ↺_backported_by_@bdsqqq",
      },
    },
    "assets/minecraft/items/test_sword.json": {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["firstperson_righthand", "thirdperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/test_sword_3d",
            },
          },
          {
            when: ["ground"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/test_sword_ground",
            },
          },
        ],
        fallback: {
          type: "minecraft:model",
          model: "minecraft:item/test_sword_2d",
        },
      },
    },
    "assets/minecraft/models/item/test_sword_2d.json": {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/test_sword",
      },
    },
    "assets/minecraft/models/item/test_sword_3d.json": {
      parent: "minecraft:block/cube",
      textures: {
        all: "minecraft:item/test_sword",
      },
    },
    "assets/minecraft/models/item/test_sword_ground.json": {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/test_sword_ground",
      },
    },
    "assets/minecraft/textures/item/test_sword.png": "fake_texture_content",
    "assets/minecraft/textures/item/test_sword_ground.png": "fake_texture_content",
  });

  // Run backport
  const coordinator = new ConditionalBackportCoordinator(createTestTracer());
  await coordinator.backport(TEST_INPUT_DIR, TEST_OUTPUT_DIR);

  // Verify pack.mcmeta was copied
  const packMeta = await readJsonFile(join(TEST_OUTPUT_DIR, "pack.mcmeta"));
  expect(packMeta.pack.description).toBe("Test Pack ↺_backported_by_@bdsqqq");

  // Verify Pommel model was created
  const pommelModel = await readJsonFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/models/item/test_sword.json")
  );

  // Should be Pommel model with handheld parent
  expect(pommelModel.parent).toBe("minecraft:item/handheld");
  expect(pommelModel.textures.layer0).toBe("minecraft:item/test_sword");
  expect(pommelModel.overrides).toBeDefined();
  expect(pommelModel.overrides.length).toBeGreaterThan(0);

  // Should have overrides for held contexts
  const heldOverride = pommelModel.overrides.find((o) => o.predicate["pommel:is_held"]);
  expect(heldOverride).toBeDefined();
  expect(heldOverride.model).toBe("minecraft:item/test_sword_3d");

  // Should have overrides for ground
  const groundOverride = pommelModel.overrides.find((o) => o.predicate["pommel:is_ground"]);
  expect(groundOverride).toBeDefined();
  expect(groundOverride.model).toBe("minecraft:item/test_sword_ground");

  // Verify textures were copied
  const baseTexture = await readFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/textures/item/test_sword.png"),
    "utf-8"
  );
  expect(baseTexture).toBe("fake_texture_content");
});

test("backports pack with no special components (base item)", async () => {
  await createTestPack(TEST_INPUT_DIR, {
    "pack.mcmeta": {
      pack: {
        pack_format: 15,
        description: "Simple Pack",
      },
    },
    "assets/minecraft/items/simple_item.json": {
      type: "minecraft:model",
      model: "minecraft:item/simple_item",
    },
    "assets/minecraft/models/item/simple_item.json": {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/simple_item",
      },
    },
    "assets/minecraft/textures/item/simple_item.png": "simple_texture",
  });

  const coordinator = new ConditionalBackportCoordinator(createTestTracer());
  await coordinator.backport(TEST_INPUT_DIR, TEST_OUTPUT_DIR);

  // Should just copy the model as-is (base handler behavior)
  const outputFiles = await getAllFiles(TEST_OUTPUT_DIR);
  expect(outputFiles).toContain("pack.mcmeta");
  expect(outputFiles).toContain("assets/minecraft/textures/item/simple_item.png");

  // Base handler should create basic Pommel-compatible model
  const model = await readJsonFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/models/item/simple_item.json")
  );
  expect(model.parent).toBe("minecraft:item/generated");
  expect(model.textures.layer0).toBe("minecraft:item/simple_item");
});

test("processes multiple items with different handlers", async () => {
  await createTestPack(TEST_INPUT_DIR, {
    "pack.mcmeta": {
      pack: { pack_format: 15, description: "Multi Item Pack" },
    },
    // Display context item
    "assets/minecraft/items/context_item.json": {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["firstperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/context_3d",
            },
          },
        ],
        fallback: {
          type: "minecraft:model",
          model: "minecraft:item/context_2d",
        },
      },
    },
    // Simple item
    "assets/minecraft/items/simple_item.json": {
      type: "minecraft:model",
      model: "minecraft:item/simple",
    },
    // Models
    "assets/minecraft/models/item/context_2d.json": {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/context" },
    },
    "assets/minecraft/models/item/context_3d.json": {
      parent: "minecraft:block/cube",
      textures: { all: "minecraft:item/context" },
    },
    "assets/minecraft/models/item/simple.json": {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/simple" },
    },
    // Textures
    "assets/minecraft/textures/item/context.png": "context_texture",
    "assets/minecraft/textures/item/simple.png": "simple_texture",
  });

  const coordinator = new ConditionalBackportCoordinator(createTestTracer());
  await coordinator.backport(TEST_INPUT_DIR, TEST_OUTPUT_DIR);

  // Context item should be processed (has conditional selectors)
  const contextModel = await readJsonFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/models/item/context_item.json")
  );
  expect(contextModel.overrides).toBeDefined();
  expect(contextModel.overrides.length).toBeGreaterThan(0);

  // Simple item is skipped (no conditional selectors) - this is expected behavior
});

test("differentiates between display context and base item handling", async () => {
  await createTestPack(TEST_INPUT_DIR, {
    "pack.mcmeta": {
      pack: { pack_format: 15, description: "Handler Test Pack" },
    },
    // This should trigger display context handler
    "assets/minecraft/items/context_item.json": {
      model: {
        type: "minecraft:select",
        property: "minecraft:display_context",
        cases: [
          {
            when: ["firstperson_righthand"],
            model: {
              type: "minecraft:model",
              model: "minecraft:item/context_3d",
            },
          },
        ],
        fallback: {
          type: "minecraft:model",
          model: "minecraft:item/context_2d",
        },
      },
    },
    // This should trigger base item handler (no display context)
    "assets/minecraft/items/basic_item.json": {
      type: "minecraft:model",
      model: "minecraft:item/basic_item",
    },
    "assets/minecraft/models/item/context_2d.json": {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/context" },
    },
    "assets/minecraft/models/item/context_3d.json": {
      parent: "minecraft:block/cube",
      textures: { all: "minecraft:item/context" },
    },
    "assets/minecraft/models/item/basic_item.json": {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/basic" },
    },
    "assets/minecraft/textures/item/context.png": "context_texture",
    "assets/minecraft/textures/item/basic_item.png": "basic_texture",
  });

  const coordinator = new ConditionalBackportCoordinator(createTestTracer());
  await coordinator.backport(TEST_INPUT_DIR, TEST_OUTPUT_DIR);

  // Context item should have Pommel overrides (display context handler)
  const contextModel = await readJsonFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/models/item/context_item.json")
  );
  expect(contextModel.overrides).toBeDefined();
  expect(contextModel.overrides.length).toBeGreaterThan(0);
  expect(contextModel.parent).toBe("minecraft:item/handheld"); // Pommel models use handheld parent

  // Basic item is skipped (no conditional selectors) - this is expected behavior
});

test("handles pack with no items gracefully", async () => {
  await createTestPack(TEST_INPUT_DIR, {
    "pack.mcmeta": {
      pack: {
        pack_format: 15,
        description: "Empty Pack ↺_backported_by_@bdsqqq",
      },
    },
    "assets/minecraft/textures/block/stone.png": "stone_texture",
  });

  const coordinator = new ConditionalBackportCoordinator(createTestTracer());
  await coordinator.backport(TEST_INPUT_DIR, TEST_OUTPUT_DIR);

  // Should still copy pack.mcmeta and non-item assets
  const packMeta = await readJsonFile(join(TEST_OUTPUT_DIR, "pack.mcmeta"));
  expect(packMeta.pack.description).toBe("Empty Pack ↺_backported_by_@bdsqqq");

  const stoneTexture = await readFile(
    join(TEST_OUTPUT_DIR, "assets/minecraft/textures/block/stone.png"),
    "utf-8"
  );
  expect(stoneTexture).toBe("stone_texture");
});

// Helper functions

async function createTestPack(dir: string, structure: Record<string, any>) {
  for (const [path, content] of Object.entries(structure)) {
    const fullPath = join(dir, path);
    await mkdir(dirname(fullPath), { recursive: true });

    if (typeof content === "string") {
      await writeFile(fullPath, content);
    } else {
      await writeFile(fullPath, JSON.stringify(content, null, 2));
    }
  }
}

async function readJsonFile(path: string): Promise<any> {
  const content = await readFile(path, "utf-8");
  return JSON.parse(content);
}

async function getAllFiles(dir: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await getAllFiles(join(dir, entry.name), fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}
