#!/usr/bin/env bun

// Main CLI dispatcher for minecraft resource pack tools

async function main() {
  const args = process?.argv || [];
  const [, , command, ...restArgs] = args;

  if (!command) {
    printHelp();
    process?.exit?.(1);
  }

  switch (command) {
    case "backport": {
      const { main: backportMain } = await import("./backporter/index");
      // Override argv to make it look like backporter was called directly
      process.argv = ["bun", "backporter", ...restArgs];
      await backportMain();
      break;
    }

    case "lint": {
      const { main: lintMain } = await import("./linter/index");
      // Override argv to make it look like linter was called directly
      process.argv = ["bun", "linter", ...restArgs];
      await lintMain();
      break;
    }

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default: {
      const { createTracer } = await import("@logger/index");
      const tracer = createTracer({
        serviceName: "tools-dispatcher",
        enableConsole: true,
      });
      const errorSpan = tracer.startSpan("Unknown Command Error");
      errorSpan.error(`Unknown command: ${command}`, { command });
      errorSpan.end({ success: false });
      printHelp();
      process?.exit?.(1);
      break;
    }
  }
}

function printHelp() {
  // Simple help output - no need for instrumentation here
  console.log(`
⚙  Minecraft Resource Pack Tools

Usage: bun run tools/index.ts <command> [options]

Commands:
  backport    Backport resource packs from 1.21.4+ to 1.21.1 using CIT + Pommel
  lint        Validate resource pack structure and references

Options:
  --help, -h  Show this help message
  --verbose   Enable verbose logging

Examples:
  bun run tools/index.ts backport ./my-pack ./output
  bun run tools/index.ts lint ./my-pack --verbose
  bun run tools/index.ts help

Or use the direct commands:
  bun run backport
  bun run lint
`);
}

// Run if this is the main module
if (import.meta.main) {
  main().catch(async (error) => {
    const { createTracer } = await import("@logger/index");
    const tracer = createTracer({
      serviceName: "tools-main",
      enableConsole: true,
    });
    const errorSpan = tracer.startSpan("Tool Execution Error");
    errorSpan.error("Tool failed", {
      error: error.message,
      stack: error.stack,
    });
    errorSpan.end({ success: false });
    process?.exit?.(1);
  });
}
