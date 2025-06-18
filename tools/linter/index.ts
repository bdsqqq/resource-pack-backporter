#!/usr/bin/env bun

import { validateResourcePack } from "@linter/validator";
import { createTracer } from "@logger/index";

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

  // Initialize tracer
  const tracer = createTracer({
    serviceName: "resource-pack-linter",
    axiomDataset: process.env.AXIOM_DATASET,
    axiomToken: process.env.AXIOM_TOKEN,
    enableConsole: true,
    enableAxiom: !!process.env.AXIOM_TOKEN,
  });

  const mainSpan = tracer.startSpan("Resource Pack Validation");
  mainSpan.setAttributes({
    packDir,
    verbose,
    fix,
    args: allArgs,
  });

  try {
    const result = await validateResourcePack(
      packDir,
      { verbose, fix },
      tracer
    );

    if (result.isValid) {
      mainSpan.info("Validation passed", {
        filesChecked: result.stats.filesChecked,
        issues: result.stats.issues,
      });
      mainSpan.end({ success: true, ...result.stats });
    } else {
      mainSpan.error("Validation failed", {
        filesChecked: result.stats.filesChecked,
        issues: result.stats.issues,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });

      // Log detailed issues
      if (result.errors.length > 0) {
        const errorSpan = mainSpan.startChild("Validation Errors");
        result.errors.forEach((error, i) => {
          errorSpan.error(`Error ${i + 1}`, { message: error });
        });
        errorSpan.end({ errorCount: result.errors.length });
      }

      if (result.warnings.length > 0) {
        const warningSpan = mainSpan.startChild("Validation Warnings");
        result.warnings.forEach((warning, i) => {
          warningSpan.warn(`Warning ${i + 1}`, { message: warning });
        });
        warningSpan.end({ warningCount: result.warnings.length });
      }

      mainSpan.end({ success: false, ...result.stats });
      await tracer.flush();
      process?.exit?.(1);
    }

    await tracer.flush();
  } catch (error: any) {
    mainSpan.error("Validation failed", {
      error: error.message,
      stack: error.stack,
    });
    mainSpan.end({ success: false, error: error.message });
    await tracer.flush();
    process?.exit?.(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}
