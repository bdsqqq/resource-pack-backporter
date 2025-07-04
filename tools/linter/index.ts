#!/usr/bin/env tsx

import { validateResourcePack } from "@linter/validator";
import { createTracer } from "@logger/index";

// CLI entry point
export async function main() {
  const args = process?.argv || [];
  const allArgs = args.slice(2);

  // Parse flags
  const verbose = allArgs.includes("--verbose") || allArgs.includes("-v");
  const fix = allArgs.includes("--fix");
  const nonFlagArgs = allArgs.filter((arg) => !arg.startsWith("--") && !arg.startsWith("-"));

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
    args: allArgs.join(" "),
  });

  const validationResult = await validateResourcePack(packDir, { verbose, fix }, tracer);

  if (validationResult.isErr()) {
    mainSpan.error("Validation failed with error", {
      error: validationResult.error,
    });
    mainSpan.end({ success: false, error: validationResult.error });
    await tracer.flush();
    process?.exit?.(1);
    return;
  }

  const result = validationResult.value;

  if (result.isValid) {
    mainSpan.info("Validation passed", {
      filesChecked: result.stats.filesChecked,
      issues: result.stats.issues,
    });

    // Show clear success status
    const statusSpan = mainSpan.startChild("Validation Status");
    statusSpan.info("No validation issues found");
    statusSpan.end({ errorCount: 0, warningCount: 0 });

    mainSpan.end({ success: true, ...result.stats });
  } else {
    // Check if we have actual errors or just warnings
    const hasErrors = result.errors.length > 0;

    if (hasErrors) {
      mainSpan.error("Validation failed", {
        filesChecked: result.stats.filesChecked,
        issues: result.stats.issues,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });
    } else {
      mainSpan.warn("Validation completed with warnings", {
        filesChecked: result.stats.filesChecked,
        issues: result.stats.issues,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });
    }

    // Log detailed issues
    if (result.errors.length > 0) {
      const errorSpan = mainSpan.startChild("Validation Errors");
      result.errors.forEach((error, i) => {
        errorSpan.error(error, { errorIndex: i + 1 });
      });
      errorSpan.end({ errorCount: result.errors.length });
    } else if (result.warnings.length === 0 && verbose) {
      // Only show "no errors" message in verbose mode when there are also no warnings
      const errorSpan = mainSpan.startChild("Validation Status");
      errorSpan.info("No validation errors found");
      errorSpan.end({ errorCount: 0 });
    }

    if (result.warnings.length > 0) {
      const warningSpan = mainSpan.startChild("Validation Warnings");
      result.warnings.forEach((warning, i) => {
        warningSpan.warn(warning, { warningIndex: i + 1 });
      });
      warningSpan.end({ warningCount: result.warnings.length });
    }

    mainSpan.end({
      success: !hasErrors, // success if no errors, even with warnings
      ...result.stats,
    });

    await tracer.flush();

    // Only exit with error code if there are actual errors, not just warnings
    if (hasErrors) {
      process?.exit?.(1);
    }
  }
}

// Run if this is the main module
if (import.meta.main) {
  main().catch((error) => {
    // Create emergency tracer for unhandled errors
    const emergencyTracer = createTracer({
      serviceName: "resource-pack-linter-emergency",
      enableConsole: true,
      enableAxiom: false,
    });
    const errorSpan = emergencyTracer.startSpan("Unhandled Error");
    errorSpan.error("Unhandled error in linter", {
      error: error.message,
      stack: error.stack,
    });
    errorSpan.end({ success: false });
    emergencyTracer.flush().finally(() => process?.exit?.(1));
  });
}
