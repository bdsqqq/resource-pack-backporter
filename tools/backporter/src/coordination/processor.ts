import { mkdir } from "node:fs/promises";
import { ResourcePackIntrospector } from "@backporter/introspection";
import { FileManagerImpl } from "@backporter/file-manager";
import { getHandlers } from "@backporter/handlers";
import { getWriters } from "@backporter/writers";
import type { ProcessingContext } from "@backporter/file-manager";
import type { WriteRequest } from "@backporter/file-manager";
import type { BackportOptions } from "./index";

export class BackportCoordinator {
  private introspector: ResourcePackIntrospector;
  private packStructure: any;
  private verbose: boolean = false;

  constructor() {
    this.introspector = new ResourcePackIntrospector();
  }

  async backport(
    inputDir: string,
    outputDir: string,
    options: Partial<BackportOptions> = {}
  ): Promise<void> {
    this.verbose = options.verbose || false;

    console.log("🔍 Analyzing resource pack structure...");

    // Clear output directory if requested
    if (options.clearOutput !== false) {
      console.log("🧹 Clearing output directory...");
      const fs = require("node:fs");
      if (fs.existsSync(outputDir)) {
        await fs.promises.rm(outputDir, { recursive: true, force: true });
      }
    }

    // Analyze pack structure
    this.packStructure = await this.introspector.analyzeStructure(
      inputDir,
      this.verbose
    );

    console.log(`📁 Found ${this.packStructure.itemFiles.length} item files`);
    console.log(
      `🎨 Found ${this.packStructure.textureFiles.length} texture files`
    );
    console.log(`📦 Found ${this.packStructure.modelFiles.length} model files`);

    // Initialize file manager
    const fileManager = new FileManagerImpl(outputDir);

    // Copy base assets
    await this.copyBaseAssets(inputDir, outputDir);

    // Process each item file using the strategy pattern
    for (const itemFile of this.packStructure.itemFiles) {
      await this.processItemFile(itemFile, this.packStructure, fileManager);
    }

    // Write all accumulated requests
    await fileManager.writeAll();

    // Fix model compatibility issues
    const { ModelCompatibilityProcessor } = await import(
      "../postprocessors/model-compatibility"
    );
    const compatibilityProcessor = new ModelCompatibilityProcessor();
    await compatibilityProcessor.fixModelCompatibility(outputDir);

    console.log("✅ Backport complete!");
  }

  private async processItemFile(
    itemFilePath: string,
    packStructure: any,
    fileManager: FileManagerImpl
  ): Promise<void> {
    // Analyze the item file
    const analysis = await this.introspector.analyzeComponent(itemFilePath);
    const itemId = analysis.itemId;

    console.log(`🔄 Processing ${itemId}...`);
    if (this.verbose) {
      console.log(
        `  Components: ${analysis.componentsUsed.join(", ") || "none"}`
      );
      console.log(
        `  Contexts: ${analysis.displayContexts.join(", ") || "none"}`
      );
    }

    // Create processing context
    const context: ProcessingContext = {
      itemId,
      itemPath: itemFilePath,
      packStructure,
      outputDir: fileManager["outputDir"], // Access private field for now
    };

    // Load the item JSON for processing
    const fs = require("node:fs");
    const itemJson = JSON.parse(fs.readFileSync(itemFilePath, "utf-8"));

    // Run ALL handlers that can process this item (accumulate all requests)
    const handlers = getHandlers();
    const allRequests: WriteRequest[] = [];

    const appliedHandlers: string[] = [];
    for (const handler of handlers) {
      if (handler.canHandle(itemJson, context)) {
        console.log(`🎯 Applying ${handler.name} handler`);
        const requests = handler.process(itemJson, context);
        allRequests.push(...requests);
        appliedHandlers.push(handler.name);
      }
    }

    if (appliedHandlers.length === 0) {
      console.log(`⚠️  No handler could process ${itemId}`);
    } else if (this.verbose) {
      console.log(`  Applied handlers: ${appliedHandlers.join(", ")}`);
    }

    if (allRequests.length === 0) {
      console.log(`⚠️  No handlers processed ${itemId}`);
    } else {
      console.log(`📝 Generated ${allRequests.length} write requests`);
      fileManager.addRequests(allRequests);
    }
  }

  private async copyBaseAssets(
    inputDir: string,
    outputDir: string
  ): Promise<void> {
    console.log("📋 Copying base assets...");

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Copy pack.mcmeta
    await this.copyPackMeta(inputDir, outputDir);

    // Copy minecraft assets only (not mod-specific assets)
    await this.copyMinecraftAssets(inputDir, outputDir);
  }

  private async copyPackMeta(
    inputDir: string,
    outputDir: string
  ): Promise<void> {
    const fs = require("node:fs");
    const { copyFile } = require("node:fs/promises");
    const { join } = require("node:path");

    const packMetaPath = join(inputDir, "pack.mcmeta");
    if (fs.existsSync(packMetaPath)) {
      await copyFile(packMetaPath, join(outputDir, "pack.mcmeta"));
      console.log("✅ Copied pack.mcmeta");
    }
  }

  private async copyMinecraftAssets(
    inputDir: string,
    outputDir: string
  ): Promise<void> {
    const fs = require("node:fs");
    const { copyFile, mkdir } = require("node:fs/promises");
    const { join, dirname, relative } = require("node:path");

    // Copy all minecraft textures and models (including item models - they're needed as 3D assets)
    const assetsDir = join(inputDir, "assets", "minecraft");
    if (!fs.existsSync(assetsDir)) return;

    const filesToCopy = [
      ...(this.packStructure?.textureFiles?.filter(
        (f) => !f.includes("/items/")
      ) || []),
      ...(this.packStructure?.modelFiles || []), // Copy ALL model files including item models
    ];

    for (const sourceFile of filesToCopy) {
      try {
        const relativePath = relative(inputDir, sourceFile);
        const destFile = join(outputDir, relativePath);

        await mkdir(dirname(destFile), { recursive: true });
        await copyFile(sourceFile, destFile);
      } catch (error) {
        console.log(`⚠️  Failed to copy ${sourceFile}: ${error.message}`);
      }
    }

    console.log(`✅ Copied ${filesToCopy.length} base asset files`);
  }
}
