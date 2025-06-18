import { mkdir } from "node:fs/promises";
import type { ProcessingContext, WriteRequest } from "@backporter/file-manager";
import { FileManagerImpl } from "@backporter/file-manager";
import { getHandlers } from "@backporter/handlers";
import { ResourcePackIntrospector } from "@backporter/introspection";
import type { StructuredTracer } from "@logger/index";
import type { BackportOptions } from "./index";

export class BackportCoordinator {
  private introspector: ResourcePackIntrospector;
  private packStructure: any;
  private verbose = false;
  private tracer?: StructuredTracer;

  constructor(tracer?: StructuredTracer) {
    this.introspector = new ResourcePackIntrospector();
    this.tracer = tracer;
  }

  async backport(
    inputDir: string,
    outputDir: string,
    options: Partial<BackportOptions> = {}
  ): Promise<void> {
    const backportSpan = this.tracer?.startSpan("Coordination Backport");
    backportSpan?.setAttributes({
      inputDir,
      outputDir,
      clearOutput: options.clearOutput,
    });

    try {
      this.verbose = options.verbose || false;

      // Clear output directory if requested
      if (options.clearOutput !== false) {
        const clearSpan = backportSpan?.startChild("Clear Output Directory");
        const fs = require("node:fs");
        if (fs.existsSync(outputDir)) {
          await fs.promises.rm(outputDir, { recursive: true, force: true });
          clearSpan?.info("Directory cleared", { path: outputDir });
        } else {
          clearSpan?.info("Directory does not exist, skipping clear");
        }
        clearSpan?.end();
      }

      // Analyze pack structure
      const analyzeSpan = backportSpan?.startChild("Analyze Pack Structure");
      this.packStructure = await this.introspector.analyzeStructure(inputDir, this.verbose);

      analyzeSpan?.info("Pack structure analyzed", {
        itemFiles: this.packStructure.itemFiles.length,
        textureFiles: this.packStructure.textureFiles.length,
        modelFiles: this.packStructure.modelFiles.length,
      });
      analyzeSpan?.end();

      // Initialize file manager
      const fileManager = new FileManagerImpl(outputDir, this.tracer);

      // Copy base assets
      await this.copyBaseAssets(inputDir, outputDir, backportSpan);

      // Process each item file using the strategy pattern
      const processSpan = backportSpan?.startChild("Process Item Files");
      processSpan?.setAttributes({
        itemCount: this.packStructure.itemFiles.length,
      });

      for (const itemFile of this.packStructure.itemFiles) {
        await this.processItemFile(itemFile, this.packStructure, fileManager, processSpan);
      }

      processSpan?.end({ itemsProcessed: this.packStructure.itemFiles.length });

      // Write all accumulated requests
      const writeSpan = backportSpan?.startChild("Write Files");
      await fileManager.writeAll();
      writeSpan?.end();

      // Fix model compatibility issues
      const compatSpan = backportSpan?.startChild("Model Compatibility");
      const { ModelCompatibilityProcessor } = await import("../postprocessors/model-compatibility");
      const compatibilityProcessor = new ModelCompatibilityProcessor(this.tracer);
      await compatibilityProcessor.fixModelCompatibility(outputDir);
      compatSpan?.info("Compatibility fixes applied");
      compatSpan?.end();

      backportSpan?.end({
        success: true,
        itemsProcessed: this.packStructure.itemFiles.length,
      });
    } catch (error: any) {
      backportSpan?.error("Backport failed", {
        error: error.message,
        stack: error.stack,
      });
      backportSpan?.end({ success: false, error: error.message });
      throw error;
    }
  }

  private async processItemFile(
    itemFilePath: string,
    packStructure: any,
    fileManager: FileManagerImpl,
    parentSpan?: any
  ): Promise<void> {
    // Analyze the item file
    const analysis = await this.introspector.analyzeComponent(itemFilePath);
    const itemId = analysis.itemId;

    const itemSpan = parentSpan?.startChild(`Process ${itemId}`);
    itemSpan?.setAttributes({
      itemId,
      componentsUsed: analysis.componentsUsed,
      displayContexts: analysis.displayContexts,
    });

    if (this.verbose) {
      itemSpan?.debug("Item analysis details", {
        components: analysis.componentsUsed.join(", ") || "none",
        contexts: analysis.displayContexts.join(", ") || "none",
      });
    }

    // Create processing context
    const context: ProcessingContext = {
      itemId,
      itemPath: itemFilePath,
      packStructure,
      outputDir: fileManager.outputDir, // Access private field for now
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
        const handlerSpan = itemSpan?.startChild(`Apply ${handler.name} handler`);
        handlerSpan?.setAttributes({ handlerName: handler.name });

        try {
          const requests = handler.process(itemJson, context);
          allRequests.push(...requests);
          appliedHandlers.push(handler.name);

          handlerSpan?.info("Handler applied successfully", {
            requestsGenerated: requests.length,
          });
          handlerSpan?.end({ success: true, requestCount: requests.length });
        } catch (error: any) {
          handlerSpan?.error("Handler failed", {
            error: error.message,
            stack: error.stack,
          });
          handlerSpan?.end({ success: false, error: error.message });
          throw error;
        }
      }
    }

    if (appliedHandlers.length === 0) {
      itemSpan?.warn("No handler could process item");
    } else if (this.verbose) {
      itemSpan?.debug("Applied handlers", {
        handlers: appliedHandlers.join(", "),
      });
    }

    if (allRequests.length === 0) {
      itemSpan?.warn("No handlers generated requests");
      itemSpan?.end({ success: true, requestCount: 0 });
    } else {
      itemSpan?.info("Generated write requests", {
        requestCount: allRequests.length,
      });
      fileManager.addRequests(allRequests);
      itemSpan?.end({ success: true, requestCount: allRequests.length });
    }
  }

  private async copyBaseAssets(
    inputDir: string,
    outputDir: string,
    parentSpan?: any
  ): Promise<void> {
    const copySpan = parentSpan?.startChild("Copy Base Assets");
    copySpan?.setAttributes({ inputDir, outputDir });

    try {
      // Ensure output directory exists
      await mkdir(outputDir, { recursive: true });

      // Copy pack.mcmeta
      await this.copyPackMeta(inputDir, outputDir, copySpan);

      // Copy minecraft assets only (not mod-specific assets)
      await this.copyMinecraftAssets(inputDir, outputDir, copySpan);

      copySpan?.end({ success: true });
    } catch (error: any) {
      copySpan?.error("Failed to copy assets", {
        error: error.message,
        stack: error.stack,
      });
      copySpan?.end({ success: false, error: error.message });
      throw error;
    }
  }

  private async copyPackMeta(inputDir: string, outputDir: string, parentSpan?: any): Promise<void> {
    const fs = require("node:fs");
    const { copyFile } = require("node:fs/promises");
    const { join } = require("node:path");

    const packMetaPath = join(inputDir, "pack.mcmeta");
    if (fs.existsSync(packMetaPath)) {
      await copyFile(packMetaPath, join(outputDir, "pack.mcmeta"));
      parentSpan?.debug("Copied pack.mcmeta");
    }
  }

  private async copyMinecraftAssets(
    inputDir: string,
    outputDir: string,
    parentSpan?: any
  ): Promise<void> {
    const fs = require("node:fs");
    const { copyFile, mkdir } = require("node:fs/promises");
    const { join, dirname, relative } = require("node:path");

    // Copy all minecraft textures and models (including item models - they're needed as 3D assets)
    const assetsDir = join(inputDir, "assets", "minecraft");
    if (!fs.existsSync(assetsDir)) return;

    const filesToCopy = [
      ...(this.packStructure?.textureFiles?.filter((f: string) => !f.includes("/items/")) || []),
      ...(this.packStructure?.modelFiles || []), // Copy ALL model files including item models
    ];

    for (const sourceFile of filesToCopy) {
      try {
        const relativePath = relative(inputDir, sourceFile);
        const destFile = join(outputDir, relativePath);

        await mkdir(dirname(destFile), { recursive: true });
        await copyFile(sourceFile, destFile);
      } catch (error) {
        parentSpan?.warn("Failed to copy file", {
          sourceFile,
          error: (error as Error).message,
        });
      }
    }

    parentSpan?.info("Copied base asset files", {
      fileCount: filesToCopy.length,
    });
  }
}
