#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ConditionalBackportCoordinator } from "@backporter/conditional-compiler/backport-coordinator";

// CLI entry point
async function main() {
  const args = process?.argv || [];
  const allArgs = args.slice(2);

  // Parse flags
  const verbose = allArgs.includes("--verbose") || allArgs.includes("-v");
  const nonFlagArgs = allArgs.filter(
    (arg) => !arg.startsWith("--") && !arg.startsWith("-")
  );

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
    // Use the input folder name instead of pack description
    let packName = basename(inputDir);

    // Clean up the folder name
    packName = packName
      .replace(/§[0-9a-fk-or]/gi, "") // Remove Minecraft color codes
      .trim()
      .substring(0, 50) // Allow longer names since folder names are more meaningful
      .replace(/\s+/g, "_") // Replace spaces with underscores
      .replace(/[^\w\-_.]/g, "") // Remove special chars except useful ones
      .toLowerCase()
      .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

    if (!packName) packName = "unknown_pack";

    return `↺--${packName}`;
  } catch (error) {
    console.warn("⚠️ Could not parse folder name, using default name");
  }

  return "↺--backported_pack";
}

// Export for testing
export { ConditionalBackportCoordinator };

// Run if this is the main module
if (typeof window === "undefined" && import.meta.main) {
  main();
}
