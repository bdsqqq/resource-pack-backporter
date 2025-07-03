import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTracer } from "@logger/index";
import { validateResourcePack } from "./validator";

// test fixture setup/teardown
const TEST_PACK_DIR = "test-fixtures/linter-test-pack";

function createTestPack() {
  if (existsSync(TEST_PACK_DIR)) {
    rmSync(TEST_PACK_DIR, { recursive: true });
  }

  mkdirSync(TEST_PACK_DIR, { recursive: true });
  mkdirSync(join(TEST_PACK_DIR, "assets", "minecraft", "models", "item"), {
    recursive: true,
  });
  mkdirSync(join(TEST_PACK_DIR, "assets", "minecraft", "textures", "item"), {
    recursive: true,
  });
  mkdirSync(join(TEST_PACK_DIR, "assets", "custom", "models", "item"), {
    recursive: true,
  });
  mkdirSync(join(TEST_PACK_DIR, "assets", "custom", "textures", "item"), {
    recursive: true,
  });

  // create valid pack.mcmeta
  writeFileSync(
    join(TEST_PACK_DIR, "pack.mcmeta"),
    JSON.stringify(
      {
        pack: {
          pack_format: 15,
          description: "test pack for linter validation",
        },
      },
      null,
      2
    )
  );
}

function cleanupTestPack() {
  if (existsSync(TEST_PACK_DIR)) {
    rmSync(TEST_PACK_DIR, { recursive: true });
  }
}

describe("validateResourcePack", () => {
  beforeEach(() => {
    createTestPack();
  });

  afterEach(() => {
    cleanupTestPack();
  });

  test("should validate empty pack successfully", async () => {
    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.errors).toHaveLength(0);
      expect(result.value.stats.filesChecked).toBe(1); // just pack.mcmeta
    }
  });

  test("should fail when pack.mcmeta is missing", async () => {
    rmSync(join(TEST_PACK_DIR, "pack.mcmeta"));

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(result.value.errors.some((e) => e.includes("pack.mcmeta error:"))).toBe(true);
    }
  });

  test("should fail when pack.mcmeta has invalid json", async () => {
    writeFileSync(join(TEST_PACK_DIR, "pack.mcmeta"), "{ invalid json }");

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(result.value.errors.some((e) => e.includes("Invalid pack.mcmeta"))).toBe(true);
    }
  });

  test("should validate model with valid vanilla texture reference", async () => {
    const validModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/book",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(validModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.errors).toHaveLength(0);
    }
  });

  test("should fail with invalid vanilla texture reference", async () => {
    const invalidModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/nonexistent_texture",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(invalidModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(
        result.value.errors.some((e) =>
          e.includes("Invalid vanilla texture reference: minecraft:item/nonexistent_texture")
        )
      ).toBe(true);
    }
  });

  test("should validate custom texture when file exists", async () => {
    const customModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "custom:item/my_texture",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(customModel, null, 2)
    );

    // create the custom texture file
    writeFileSync(
      join(TEST_PACK_DIR, "assets", "custom", "textures", "item", "my_texture.png"),
      "dummy png content"
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.errors).toHaveLength(0);
    }
  });

  test("should fail when custom texture file is missing", async () => {
    const customModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "custom:item/missing_texture",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(customModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(
        result.value.errors.some((e) => e.includes("Missing texture: custom:item/missing_texture"))
      ).toBe(true);
    }
  });

  test("should warn about non-namespaced texture references", async () => {
    const nonNamespacedModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "item/book", // missing namespace
      },
    };

    // Create the texture file so the namespace warning can trigger
    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "textures", "item", "book.png"),
      "fake texture"
    );

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(nonNamespacedModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true); // warnings don't make pack invalid
      expect(
        result.value.warnings.some((w) =>
          w.includes("isn't namespaced, it will fallback to vanilla minecraft:item/book")
        )
      ).toBe(true);
    }
  });

  test("should fail when model has invalid json", async () => {
    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "broken.json"),
      "{ invalid json structure"
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(
        result.value.errors.some((e) => e.includes("Invalid JSON in") && e.includes("broken.json"))
      ).toBe(true);
    }
  });

  test("should validate model parent references", async () => {
    const modelWithParent = {
      parent: "minecraft:item/nonexistent_parent",
      textures: {
        layer0: "minecraft:item/book",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(modelWithParent, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(
        result.value.errors.some((e) =>
          e.includes("Invalid vanilla model reference: minecraft:item/nonexistent_parent")
        )
      ).toBe(true);
    }
  });

  test("should handle multiple texture references in single model", async () => {
    const multiTextureModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/book",
        layer1: "custom:item/overlay", // missing
        layer2: "minecraft:item/paper",
        layer3: "minecraft:item/fake_texture", // invalid vanilla
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "multi.json"),
      JSON.stringify(multiTextureModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      expect(result.value.errors).toHaveLength(2);
      expect(
        result.value.errors.some((e) => e.includes("Missing texture: custom:item/overlay"))
      ).toBe(true);
      expect(
        result.value.errors.some((e) =>
          e.includes("Invalid vanilla texture reference: minecraft:item/fake_texture")
        )
      ).toBe(true);
    }
  });

  test("should work with structured tracer", async () => {
    const tracer = createTracer({
      serviceName: "linter-test",
      enableConsole: false,
      enableAxiom: false,
    });

    const result = await validateResourcePack(TEST_PACK_DIR, {}, tracer);

    expect(result.isOk()).toBe(true);
    await tracer.flush();
  });

  test("should provide verbose output when requested", async () => {
    // create a valid model to trigger verbose logging
    const validModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/book",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(validModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR, { verbose: true });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.stats.filesChecked).toBeGreaterThan(1);
    }
  });

  test("should count files and stats correctly", async () => {
    // create multiple models
    const model1 = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/book" },
    };
    const model2 = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/paper" },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "model1.json"),
      JSON.stringify(model1, null, 2)
    );
    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "model2.json"),
      JSON.stringify(model2, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.stats.filesChecked).toBe(3); // pack.mcmeta + 2 models
      expect(result.value.stats.issues).toBe(0);
    }
  });

  test("should handle missing pack.mcmeta gracefully", async () => {
    // remove pack.mcmeta to test the error case
    rmSync(join(TEST_PACK_DIR, "pack.mcmeta"));

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(false);
      // in this case we expect a regular pack.mcmeta error since assets already exist
      expect(result.value.errors.some((e) => e.includes("pack.mcmeta error:"))).toBe(true);
    }
  });

  test("should handle different pack formats gracefully", async () => {
    // test with a 1.21.4 pack format
    writeFileSync(
      join(TEST_PACK_DIR, "pack.mcmeta"),
      JSON.stringify(
        {
          pack: {
            pack_format: 46, // 1.21.4
            description: "test pack for 1.21.4",
          },
        },
        null,
        2
      )
    );

    const validModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/book",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(validModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.errors).toHaveLength(0);
    }
  });

  test("should auto-generate vanilla assets when they don't exist", async () => {
    // first remove the generated assets to force generation
    const vanillaAssetsPath = join(
      process.cwd(),
      "tools",
      "mc-paths",
      "src",
      "vanilla-assets.generated.ts"
    );
    if (existsSync(vanillaAssetsPath)) {
      rmSync(vanillaAssetsPath);
    }

    // ensure pack.mcmeta is valid for generation
    writeFileSync(
      join(TEST_PACK_DIR, "pack.mcmeta"),
      JSON.stringify(
        {
          pack: {
            pack_format: 34, // 1.21
            description: "test pack for asset generation",
          },
        },
        null,
        2
      )
    );

    const validModel = {
      parent: "minecraft:item/generated",
      textures: {
        layer0: "minecraft:item/book",
      },
    };

    writeFileSync(
      join(TEST_PACK_DIR, "assets", "minecraft", "models", "item", "test.json"),
      JSON.stringify(validModel, null, 2)
    );

    const result = await validateResourcePack(TEST_PACK_DIR);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isValid).toBe(true);
      expect(result.value.errors).toHaveLength(0);
      // verify the assets file was created
      expect(existsSync(vanillaAssetsPath)).toBe(true);
    }
  });
});
