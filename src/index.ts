#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ConditionalBackportCoordinator } from './conditional-compiler/backport-coordinator';

// CLI entry point
async function main() {
  const args = process?.argv || [];
  const allArgs = args.slice(2);
  
  // Parse flags
  const verbose = allArgs.includes('--verbose') || allArgs.includes('-v');
  const nonFlagArgs = allArgs.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  
  let [inputDir = ".", outputDir] = nonFlagArgs;
  
  // If no output directory specified, generate one from pack name
  if (!outputDir) {
    const packName = await generatePackOutputName(inputDir);
    outputDir = `dist/${packName}`;
  }

  console.log("🚀 Starting backport with conditional compiler architecture...");
  console.log(`📥 Input: ${inputDir}`);
  console.log(`📤 Output: ${outputDir}`);
  if (verbose) {
    console.log("🔍 Verbose logging enabled");
  }

  const coordinator = new ConditionalBackportCoordinator();
  try {
    await coordinator.backport(inputDir, outputDir, { verbose });
  } catch (error: any) {
    console.error("❌ Backport failed:", error.message);
    process?.exit?.(1);
  }
}

// =============================================
// Pack Name Helper
// =============================================

async function generatePackOutputName(inputDir: string): Promise<string> {
  try {
    const packMetaPath = join(inputDir, "pack.mcmeta");
    if (existsSync(packMetaPath)) {
      const packMetaContent = await readFile(packMetaPath, "utf-8");
      const packMeta = JSON.parse(packMetaContent);

      // Extract pack name from description or use a default
      let packName = packMeta.pack?.description || "unknown_pack";

      // Clean up Minecraft formatting codes and get the main title
      packName = packName
        .replace(/§[0-9a-fk-or]/gi, "") // Remove Minecraft color codes
        .split(/[!()]/)[0] // Take everything before ! or parentheses
        .split(/\s+by\s+/i)[0] // Remove "by Author" parts
        .trim()
        .substring(0, 30) // Limit length
        .replace(/\s+/g, "_") // Replace spaces with underscores
        .replace(/[^\w\-_.]/g, "") // Remove special chars
        .toLowerCase()
        .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

      if (!packName) packName = "unknown_pack";

      return `↺--${packName}`;
    }
  } catch (error) {
    console.warn("⚠️ Could not read pack.mcmeta, using default name");
  }

  return "↺--backported_pack";
}

// Export for testing
export { ConditionalBackportCoordinator };

// Run if this is the main module
if (typeof window === "undefined" && import.meta.main) {
  main();
}
