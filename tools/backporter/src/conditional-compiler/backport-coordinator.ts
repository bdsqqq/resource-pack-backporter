import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { BackportOptions } from "@backporter/coordination";
import type { Span, StructuredTracer } from "@logger/index";
import { BackportFileGenerator } from "./file-generator";
import { ConditionalPathExtractor } from "./path-extractor";
import { TargetSystemMapper } from "./target-mapper";

export class ConditionalBackportCoordinator {
  private pathExtractor: ConditionalPathExtractor;
  private targetMapper: TargetSystemMapper;
  private fileGenerator: BackportFileGenerator | null = null;
  private verbose = false;
  private tracer: StructuredTracer;

  constructor(tracer: StructuredTracer) {
    this.tracer = tracer;
    this.pathExtractor = new ConditionalPathExtractor();
    this.targetMapper = new TargetSystemMapper();
  }

  async backport(
    inputDir: string,
    outputDir: string,
    options: Partial<BackportOptions> = {}
  ): Promise<void> {
    const backportSpan = this.tracer.startSpan("Conditional Compiler Backport");
    backportSpan.setAttributes({
      inputDir,
      outputDir,
      clearOutput: options.clearOutput,
    });

    try {
      this.verbose = options.verbose || false;
      this.fileGenerator = new BackportFileGenerator(outputDir, inputDir, this.tracer);

      // Update target mapper with source directory
      this.targetMapper = new TargetSystemMapper(inputDir);

      // Clear output directory if requested
      if (options.clearOutput !== false) {
        const clearSpan = backportSpan.startChild("Clear Output Directory");
        if (existsSync(outputDir)) {
          const fs = require("node:fs");
          await fs.promises.rm(outputDir, { recursive: true, force: true });
          clearSpan.info("Directory cleared", { path: outputDir });
        } else {
          clearSpan.info("Directory does not exist, skipping clear");
        }
        clearSpan.end();
      }

      // Copy base assets first
      await this.copyBaseAssets(inputDir, outputDir, backportSpan);

      // Find and process item files
      const itemFiles = await this.findItemFiles(inputDir, backportSpan);

      const processingSpan = backportSpan.startChild("Item Processing");
      processingSpan.setAttributes({ itemCount: itemFiles.length });

      for (const itemFile of itemFiles) {
        await this.processItemFile(itemFile, inputDir, processingSpan);
      }

      processingSpan.end({ itemsProcessed: itemFiles.length });

      // Apply post-processing
      await this.applyPostProcessing(outputDir, backportSpan);

      backportSpan.end({ success: true, itemsProcessed: itemFiles.length });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      backportSpan.error("Backport failed", {
        error: errorMessage,
        stack: errorStack,
      });
      backportSpan.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private async findItemFiles(inputDir: string, parentSpan: Span): Promise<string[]> {
    const findSpan = parentSpan.startChild("Find Item Files");
    const itemsDir = join(inputDir, "assets", "minecraft", "items");
    const itemFiles: string[] = [];

    if (!existsSync(itemsDir)) {
      findSpan.warn("No items directory found in source pack", { itemsDir });
      findSpan.end({ itemsFound: 0 });
      return itemFiles;
    }

    const fs = require("node:fs");
    const files = await fs.promises.readdir(itemsDir);

    for (const file of files) {
      if (file.endsWith(".json")) {
        itemFiles.push(join(itemsDir, file));
      }
    }

    findSpan.info("Found item files", {
      count: itemFiles.length,
      files: itemFiles.map((f) => basename(f)).join(", "),
    });
    findSpan.end({ itemsFound: itemFiles.length });
    return itemFiles;
  }

  private async processItemFile(
    itemFilePath: string,
    _sourceDir: string,
    parentSpan: Span
  ): Promise<void> {
    const itemId = basename(itemFilePath, ".json");
    const itemSpan = parentSpan.startChild(`Process Item: ${itemId}`);
    itemSpan.setAttributes({ itemId, itemFilePath });

    try {
      // Read and parse the item JSON
      const itemJson = JSON.parse(await readFile(itemFilePath, "utf-8"));

      // Check if this item uses the new conditional selector format
      if (!this.hasConditionalSelectors(itemJson)) {
        itemSpan.info("Skipping - no conditional selectors");
        itemSpan.end({ skipped: true, reason: "no_conditional_selectors" });
        return;
      }

      // Extract all execution paths from the nested selectors
      const paths = this.pathExtractor.extractAllPaths(itemJson);
      itemSpan.info("Extracted execution paths", { pathCount: paths.length });

      if (this.verbose) {
        const samplePaths = paths.slice(0, 3).map((path) => ({
          contexts: path.conditions.displayContext.join("|"),
          enchantment: path.conditions.enchantment?.type || "none",
          target: path.targetModel,
        }));
        itemSpan.debug("Sample execution paths", {
          samplePaths: JSON.stringify(samplePaths),
          totalPaths: paths.length,
        });
      }

      // Map execution paths to target systems
      const targets = this.targetMapper.mapPathsToTargets(paths, itemId);
      itemSpan.info("Generated output targets", {
        targetCount: targets.length,
      });

      // Generate all output files
      await this.fileGenerator?.generateAllFiles(targets, itemSpan);

      itemSpan.end({
        success: true,
        pathsExtracted: paths.length,
        targetsGenerated: targets.length,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      itemSpan.error(`Failed to process ${itemId}`, {
        error: errorMessage,
        stack: errorStack,
      });
      itemSpan.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private hasConditionalSelectors(itemJson: unknown): boolean {
    if (typeof itemJson !== "object" || itemJson === null) return false;

    const json = itemJson as Record<string, unknown>;
    if (!json.model || typeof json.model !== "object" || json.model === null) return false;

    const model = json.model as Record<string, unknown>;
    // Check if the model uses the new selector format
    return model.type === "minecraft:select";
  }

  private async copyBaseAssets(
    inputDir: string,
    outputDir: string,
    parentSpan: Span
  ): Promise<void> {
    const copySpan = parentSpan.startChild("Copy Base Assets");
    copySpan.setAttributes({ inputDir, outputDir });

    try {
      // Ensure output directory exists
      await mkdir(outputDir, { recursive: true });
      copySpan.info("Created output directory", { outputDir });

      // Copy pack.mcmeta and other root-level files
      await this.copyPackFiles(inputDir, outputDir, copySpan);

      // Copy minecraft assets (models, textures, but not items - we'll regenerate those)
      await this.copyMinecraftAssets(inputDir, outputDir, copySpan);

      copySpan.end({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      copySpan.error("Failed to copy base assets", {
        error: errorMessage,
        stack: errorStack,
      });
      copySpan.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private async copyPackFiles(
    inputDir: string,
    outputDir: string,
    parentSpan: Span
  ): Promise<void> {
    const packSpan = parentSpan.startChild("Copy Pack Files");

    try {
      const entries = await readdir(inputDir);
      let copiedCount = 0;

      for (const entry of entries) {
        const fullPath = join(inputDir, entry);
        const stats = await stat(fullPath);

        // Only copy files (not directories) from the root level
        if (stats.isFile() && !entry.startsWith(".")) {
          const outputPath = join(outputDir, entry);
          const fileSpan = packSpan.startChild(`Copy File: ${entry}`);

          try {
            // Special handling for pack.mcmeta to update description
            if (entry === "pack.mcmeta") {
              await this.copyAndUpdatePackMcmeta(fullPath, outputPath);
              fileSpan.info("Updated pack.mcmeta with attribution");
            } else {
              await copyFile(fullPath, outputPath);
              fileSpan.info("Copied file");
            }

            copiedCount++;
            fileSpan.end({ success: true });
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            fileSpan.error("Failed to copy file", { error: errorMessage });
            fileSpan.end({ success: false, error: errorMessage });
          }
        }
      }

      packSpan.info("Pack files copied", { copiedCount });
      packSpan.end({ success: true, copiedCount });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      packSpan.error("Could not copy pack files", { error: errorMessage });
      packSpan.end({ success: false, error: errorMessage });
    }
  }

  private async copyAndUpdatePackMcmeta(inputPath: string, outputPath: string): Promise<void> {
    try {
      const content = await readFile(inputPath, "utf-8");
      const packData = JSON.parse(content);

      // Update the description to add the backported by credit
      if (packData.pack?.description) {
        const attribution = " ↺_backported_by_@bdsqqq";
        if (typeof packData.pack.description === "string") {
          if (!packData.pack.description.includes(attribution)) {
            packData.pack.description += attribution;
          }
        } else if (Array.isArray(packData.pack.description)) {
          // Handle text component format - check if attribution already exists
          const hasAttribution = packData.pack.description.some(
            (item: unknown) => typeof item === "string" && item.includes("↺_backported_by_@bdsqqq")
          );
          if (!hasAttribution) {
            packData.pack.description.push(attribution);
          }
        }
      }

      // Write the updated pack.mcmeta
      await writeFile(outputPath, JSON.stringify(packData, null, 2), "utf-8");
    } catch (error) {
      // If parsing fails, just copy the file as-is
      const span = this.tracer.startSpan("Copy pack.mcmeta fallback");
      span.warn("Could not update pack.mcmeta description, copying as-is", {
        error: (error as Error).message,
      });
      span.end({ success: true, fallback: true });
      await copyFile(inputPath, outputPath);
    }
  }

  private async copyMinecraftAssets(
    inputDir: string,
    outputDir: string,
    parentSpan: Span
  ): Promise<void> {
    const assetsDir = join(inputDir, "assets", "minecraft");
    if (!existsSync(assetsDir)) return;

    // Copy all directories except 'items' (we regenerate those)
    const fs = require("node:fs");
    const entries = await fs.promises.readdir(assetsDir, {
      withFileTypes: true,
    });

    let copiedFiles = 0;

    for (const entry of entries) {
      if (entry.name === "items") continue; // Skip items directory

      const sourcePath = join(assetsDir, entry.name);
      const destPath = join(outputDir, "assets", "minecraft", entry.name);

      if (entry.isDirectory()) {
        // Recursively copy directory
        copiedFiles += await this.copyDirectoryRecursive(sourcePath, destPath);
      } else {
        // Copy file
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(sourcePath, destPath);
        copiedFiles++;
      }
    }

    parentSpan.info("Copied base asset files", { copiedFiles });
  }

  private async copyDirectoryRecursive(sourceDir: string, destDir: string): Promise<number> {
    const fs = require("node:fs");
    let copiedFiles = 0;

    if (!existsSync(sourceDir)) return 0;

    await mkdir(destDir, { recursive: true });

    const entries = await fs.promises.readdir(sourceDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const destPath = join(destDir, entry.name);

      if (entry.isDirectory()) {
        copiedFiles += await this.copyDirectoryRecursive(sourcePath, destPath);
      } else {
        await copyFile(sourcePath, destPath);
        copiedFiles++;
      }
    }

    return copiedFiles;
  }

  private async applyPostProcessing(outputDir: string, parentSpan: Span): Promise<void> {
    const postSpan = parentSpan.startChild("Post-Processing");
    postSpan.setAttributes({ outputDir });

    try {
      // Apply model compatibility fixes
      const { ModelCompatibilityProcessor } = await import("../postprocessors/model-compatibility");
      const compatibilityProcessor = new ModelCompatibilityProcessor();
      await compatibilityProcessor.fixModelCompatibility(outputDir);

      postSpan.info("Model compatibility fixes applied");
      postSpan.end({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      postSpan.error("Post-processing failed", {
        error: errorMessage,
        stack: errorStack,
      });
      postSpan.end({ success: false, error: errorMessage });
    }
  }
}
