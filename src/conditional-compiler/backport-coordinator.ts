import { readFile, writeFile, mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { ConditionalPathExtractor } from './path-extractor';
import { TargetSystemMapper } from './target-mapper';
import { BackportFileGenerator } from './file-generator';
import type { BackportOptions } from '../coordination';

export class ConditionalBackportCoordinator {
  private pathExtractor: ConditionalPathExtractor;
  private targetMapper: TargetSystemMapper;
  private fileGenerator: BackportFileGenerator | null = null;
  private verbose: boolean = false;

  constructor() {
    this.pathExtractor = new ConditionalPathExtractor();
    this.targetMapper = new TargetSystemMapper();
  }

  async backport(inputDir: string, outputDir: string, options: Partial<BackportOptions> = {}): Promise<void> {
    this.verbose = options.verbose || false;
    this.fileGenerator = new BackportFileGenerator(outputDir, inputDir);

    console.log("🚀 Starting conditional compiler backport...");

    // Clear output directory if requested
    if (options.clearOutput !== false) {
      console.log("🧹 Clearing output directory...");
      if (existsSync(outputDir)) {
        const fs = require("node:fs");
        await fs.promises.rm(outputDir, { recursive: true, force: true });
      }
    }

    // Copy base assets first
    await this.copyBaseAssets(inputDir, outputDir);

    // Find and process item files
    const itemFiles = await this.findItemFiles(inputDir);
    console.log(`📁 Found ${itemFiles.length} item files to process`);

    for (const itemFile of itemFiles) {
      await this.processItemFile(itemFile, inputDir);
    }

    // Apply post-processing
    await this.applyPostProcessing(outputDir);

    console.log("✅ Conditional compiler backport complete!");
  }

  private async findItemFiles(inputDir: string): Promise<string[]> {
    const itemsDir = join(inputDir, 'assets', 'minecraft', 'items');
    const itemFiles: string[] = [];

    if (!existsSync(itemsDir)) {
      console.warn("⚠️  No items directory found in source pack");
      return itemFiles;
    }

    const fs = require("node:fs");
    const files = await fs.promises.readdir(itemsDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        itemFiles.push(join(itemsDir, file));
      }
    }

    return itemFiles;
  }

  private async processItemFile(itemFilePath: string, sourceDir: string): Promise<void> {
    const itemId = basename(itemFilePath, '.json');
    console.log(`🔄 Processing ${itemId}...`);

    try {
      // Read and parse the item JSON
      const itemJson = JSON.parse(await readFile(itemFilePath, 'utf-8'));

      // Check if this item uses the new conditional selector format
      if (!this.hasConditionalSelectors(itemJson)) {
        console.log(`⏭️  Skipping ${itemId} - no conditional selectors`);
        return;
      }

      // Extract all execution paths from the nested selectors
      const paths = this.pathExtractor.extractAllPaths(itemJson);
      
      if (this.verbose) {
        console.log(`  Extracted ${paths.length} execution paths`);
        for (const path of paths.slice(0, 3)) { // Show first 3 for brevity
          console.log(`    ${path.conditions.displayContext.join('|')} + ${path.conditions.enchantment?.type || 'none'} → ${path.targetModel}`);
        }
        if (paths.length > 3) {
          console.log(`    ... and ${paths.length - 3} more`);
        }
      }

      // Map execution paths to target systems
      const targets = this.targetMapper.mapPathsToTargets(paths, itemId);
      
      console.log(`📝 Generated ${targets.length} output targets`);

      // Generate all output files
      await this.fileGenerator!.generateAllFiles(targets);

    } catch (error: any) {
      console.error(`❌ Failed to process ${itemId}:`, error.message);
      if (this.verbose) {
        console.error(error.stack);
      }
    }
  }

  private hasConditionalSelectors(itemJson: any): boolean {
    if (!itemJson?.model) return false;
    
    // Check if the model uses the new selector format
    return itemJson.model.type === 'minecraft:select';
  }

  private async copyBaseAssets(inputDir: string, outputDir: string): Promise<void> {
    console.log("📋 Copying base assets...");
    
    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Copy pack.mcmeta and other root-level files
    await this.copyPackFiles(inputDir, outputDir);
    
    // Copy minecraft assets (models, textures, but not items - we'll regenerate those)
    await this.copyMinecraftAssets(inputDir, outputDir);
  }

  private async copyPackFiles(inputDir: string, outputDir: string): Promise<void> {
    
    try {
      const entries = await readdir(inputDir);
      
      for (const entry of entries) {
        const fullPath = join(inputDir, entry);
        const stats = await stat(fullPath);
        
        // Only copy files (not directories) from the root level
        if (stats.isFile() && !entry.startsWith('.')) {
          const outputPath = join(outputDir, entry);
          
          // Special handling for pack.mcmeta to update description
          if (entry === 'pack.mcmeta') {
            await this.copyAndUpdatePackMcmeta(fullPath, outputPath);
          } else {
            await copyFile(fullPath, outputPath);
          }
          
          console.log(`✅ Copied ${entry}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not copy pack files: ${error.message}`);
    }
  }

  private async copyAndUpdatePackMcmeta(inputPath: string, outputPath: string): Promise<void> {
    try {
      const content = await readFile(inputPath, 'utf-8');
      const packData = JSON.parse(content);
      
      // Update the description to add the backported by credit
      if (packData.pack && packData.pack.description) {
        if (typeof packData.pack.description === 'string') {
          packData.pack.description += " ↺_backported_by_@bdsqqq";
        } else if (Array.isArray(packData.pack.description)) {
          // Handle text component format
          packData.pack.description.push(" ↺_backported_by_@bdsqqq");
        }
      }
      
      // Write the updated pack.mcmeta
      await writeFile(outputPath, JSON.stringify(packData, null, 2), 'utf-8');
    } catch (error) {
      // If parsing fails, just copy the file as-is
      console.warn(`⚠️  Could not update pack.mcmeta description, copying as-is: ${error.message}`);
      await copyFile(inputPath, outputPath);
    }
  }

  private async copyMinecraftAssets(inputDir: string, outputDir: string): Promise<void> {
    const assetsDir = join(inputDir, "assets", "minecraft");
    if (!existsSync(assetsDir)) return;

    // Copy all directories except 'items' (we regenerate those)
    const fs = require("node:fs");
    const entries = await fs.promises.readdir(assetsDir, { withFileTypes: true });
    
    let copiedFiles = 0;
    
    for (const entry of entries) {
      if (entry.name === 'items') continue; // Skip items directory
      
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
    
    console.log(`✅ Copied ${copiedFiles} base asset files`);
  }

  private async copyDirectoryRecursive(sourceDir: string, destDir: string): Promise<number> {
    const fs = require("node:fs");
    let copiedFiles = 0;
    
    if (!existsSync(sourceDir)) return 0;
    
    await mkdir(destDir, { recursive: true });
    
    const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true });
    
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

  private async applyPostProcessing(outputDir: string): Promise<void> {
    console.log("🔧 Applying post-processing...");
    
    try {
      // Apply model compatibility fixes
      const { ModelCompatibilityProcessor } = await import('../postprocessors/model-compatibility');
      const compatibilityProcessor = new ModelCompatibilityProcessor();
      await compatibilityProcessor.fixModelCompatibility(outputDir);
      
      console.log("✅ Post-processing complete");
    } catch (error: any) {
      console.warn("⚠️  Post-processing failed:", error.message);
    }
  }
}
