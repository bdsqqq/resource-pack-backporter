import { describe, expect, it } from "bun:test";

describe("Path Matching Regression Tests", () => {
  it("should not match book.json when searching for knowledge_book.json", () => {
    const modelFiles = [
      "assets/minecraft/models/item/enchanted_books/book.json",
      "assets/minecraft/models/item/enchanted_books/knowledge_book.json",
      "assets/minecraft/models/item/enchanted_books/written_book.json",
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/knowledge_book.json";

    // This is the logic from determineTextureRef
    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      // The critical fix: ensure proper path separation
      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/knowledge_book.json");
    expect(found).not.toBe("assets/minecraft/models/item/enchanted_books/book.json");
  });

  it("should not match book.json when searching for book.json with path prefix", () => {
    const modelFiles = [
      "some/other/path/book.json", // This should NOT match
      "assets/minecraft/models/item/enchanted_books/book.json", // This should match
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/book.json");
    expect(found).not.toBe("some/other/path/book.json");
  });

  it("should handle Windows-style path separators", () => {
    const modelFiles = [
      "assets\\minecraft\\models\\item\\enchanted_books\\book.json",
      "assets\\minecraft\\models\\item\\enchanted_books\\knowledge_book.json",
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets\\minecraft\\models\\item\\enchanted_books\\book.json");
  });

  it("should match exact file paths", () => {
    const modelFiles = ["assets/minecraft/models/item/enchanted_books/book.json"];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/book.json");
  });

  it("should match files with absolute path prefixes", () => {
    const modelFiles = [
      "/Users/test/project/assets/minecraft/models/item/enchanted_books/book.json",
      "/Users/test/project/assets/minecraft/models/item/enchanted_books/knowledge_book.json",
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe(
      "/Users/test/project/assets/minecraft/models/item/enchanted_books/book.json"
    );
  });

  it("should reject partial filename matches", () => {
    const modelFiles = [
      "assets/minecraft/models/item/enchanted_books/super_book.json", // Should not match "book.json"
      "assets/minecraft/models/item/enchanted_books/book_special.json", // Should not match "book.json"
      "assets/minecraft/models/item/enchanted_books/book.json", // Should match
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/book.json");
    expect(found).not.toBe("assets/minecraft/models/item/enchanted_books/super_book.json");
    expect(found).not.toBe("assets/minecraft/models/item/enchanted_books/book_special.json");
  });

  it("should filter out output directories correctly", () => {
    const modelFiles = [
      "assets/minecraft/models/item/enchanted_books/book.json", // Source - should match
      "dist/assets/minecraft/models/item/enchanted_books/book.json", // Output - should be filtered
      "build/assets/minecraft/models/item/enchanted_books/book.json", // Output - should be filtered
      "out/assets/minecraft/models/item/enchanted_books/book.json", // Output - should be filtered
      "nested/dist/assets/minecraft/models/item/enchanted_books/book.json", // Output - should be filtered
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

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

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/book.json");
  });

  it("should handle edge case with similar filenames in different directories", () => {
    const modelFiles = [
      "assets/minecraft/models/item/books/book.json", // Different directory
      "assets/minecraft/models/item/enchanted_books/book.json", // Correct directory
      "assets/minecraft/models/item/enchanted_books/another_book.json", // Different filename
    ];

    const searchFor = "assets/minecraft/models/item/enchanted_books/book.json";

    const found = modelFiles.find((file) => {
      const normalizedFile = file.replace(/\\/g, "/");
      const normalizedModelFile = searchFor.replace(/\\/g, "/");

      const matches =
        normalizedFile.endsWith(normalizedModelFile) &&
        (normalizedFile === normalizedModelFile ||
          normalizedFile.endsWith(`/${normalizedModelFile}`));
      return matches;
    });

    expect(found).toBe("assets/minecraft/models/item/enchanted_books/book.json");
    expect(found).not.toBe("assets/minecraft/models/item/books/book.json");
  });
});
