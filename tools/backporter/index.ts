#!/usr/bin/env bun

import { basename } from "node:path";
import { ConditionalBackportCoordinator } from "@backporter/conditional-compiler/backport-coordinator";
import { createTracer } from "@logger/index";

// CLI entry point
export async function main() {
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

  // Initialize tracer
  const tracer = createTracer({
    serviceName: "resource-pack-backporter",
    axiomDataset: process.env.AXIOM_DATASET,
    axiomToken: process.env.AXIOM_TOKEN,
    enableConsole: true,
    enableAxiom: !!process.env.AXIOM_TOKEN,
  });

  const mainSpan = tracer.startSpan("Resource Pack Backport");
  mainSpan.setAttributes({
    inputDir,
    outputDir,
    verbose,
    args: allArgs,
  });

  try {
    const coordinator = new ConditionalBackportCoordinator(tracer);
    await coordinator.backport(inputDir, outputDir, { verbose });
    mainSpan.end({ success: true });
    await tracer.flush();
  } catch (error: any) {
    mainSpan.error("Backport failed", {
      error: error.message,
      stack: error.stack,
    });
    mainSpan.end({ success: false, error: error.message });
    await tracer.flush();
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
    console.warn("⚠ Could not parse folder name, using default name:", error);
  }

  return "↺--backported_pack";
}

// Export for testing
export { ConditionalBackportCoordinator };

// Run if this is the main module
if (import.meta.main) {
  main();
}
