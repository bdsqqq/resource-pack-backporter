#!/usr/bin/env bun

import { createTracer } from "@logger/index";

async function main() {
  // Initialize tracer with Axiom config (optional)
  const tracer = createTracer({
    serviceName: "resource-pack-tools",
    axiomDataset: process.env.AXIOM_DATASET,
    axiomToken: process.env.AXIOM_TOKEN,
    enableConsole: true,
    enableAxiom: !!process.env.AXIOM_TOKEN,
  });

  // Start main operation
  const mainSpan = tracer.startSpan("Resource Pack Processing");
  mainSpan.setAttributes({
    inputDir: "./test-pack",
    outputDir: "./output",
  });

  // Start child operations
  const analysisSpan = mainSpan.startChild("Pack Analysis");
  analysisSpan.info("Scanning pack directory", { fileCount: 42 });
  analysisSpan.info("Found item files", { count: 12 });
  analysisSpan.info("Found texture files", { count: 30 });
  analysisSpan.end({ filesScanned: 42 });

  // Another child operation
  const processingSpan = mainSpan.startChild("Item Processing");

  for (let i = 0; i < 3; i++) {
    const itemSpan = processingSpan.startChild(`Processing item_${i}`, {
      itemId: `item_${i}`,
    });

    // Simulate some work
    await new Promise((resolve) =>
      setTimeout(resolve, 100 + Math.random() * 200)
    );

    itemSpan.info("Generated model file", {
      outputPath: `models/item/item_${i}.json`,
    });
    itemSpan.info("Generated CIT properties", { citCount: 2 });

    if (i === 1) {
      itemSpan.warn("Missing texture reference", { texture: "custom_texture" });
    }

    itemSpan.end({ filesGenerated: 3 });
  }

  processingSpan.end({ itemsProcessed: 3 });

  // Post-processing
  const postProcessSpan = mainSpan.startChild("Post Processing");
  postProcessSpan.info("Applying compatibility fixes");
  postProcessSpan.info("Validating output structure");
  postProcessSpan.end({ fixesApplied: 5 });

  // End main operation
  mainSpan.end({
    totalFiles: 42,
    itemsProcessed: 3,
    success: true,
  });

  // Flush any pending Axiom data
  await tracer.flush();
}

if (import.meta.main) {
  main().catch(console.error);
}
