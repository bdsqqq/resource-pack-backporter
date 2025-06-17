#!/usr/bin/env bun

import { validateResourcePack } from "@linter/validator";

// CLI entry point
export async function main() {
  const args = process?.argv || [];
  const allArgs = args.slice(2);

  // Parse flags
  const verbose = allArgs.includes("--verbose") || allArgs.includes("-v");
  const fix = allArgs.includes("--fix");
  const nonFlagArgs = allArgs.filter(
    (arg) => !arg.startsWith("--") && !arg.startsWith("-")
  );

  const [packDir = "."] = nonFlagArgs;

  console.log("🔍 Starting resource pack validation...");
  console.log(`📁 Pack directory: ${packDir}`);
  if (verbose) {
    console.log("🔍 Verbose logging enabled");
  }
  if (fix) {
    console.log("🔧 Fix mode enabled");
  }

  try {
    const result = await validateResourcePack(packDir, { verbose, fix });

    if (result.isValid) {
      console.log("✅ Resource pack validation passed!");
      console.log(
        `📊 Checked ${result.stats.filesChecked} files, found ${result.stats.issues} issues`
      );
    } else {
      console.error("❌ Resource pack validation failed!");
      console.error(
        `📊 Checked ${result.stats.filesChecked} files, found ${result.stats.issues} issues`
      );

      if (result.errors.length > 0) {
        console.error("\n🚨 Errors:");
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
      }

      if (result.warnings.length > 0) {
        console.warn("\n⚠️  Warnings:");
        for (const warning of result.warnings) {
          console.warn(`  - ${warning}`);
        }
      }

      process?.exit?.(1);
    }
  } catch (error: any) {
    console.error("❌ Validation failed:", error.message);
    process?.exit?.(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}
