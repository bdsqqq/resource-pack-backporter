# Structured CLI Tracer

A distributed tracing system for CLI applications that provides beautiful hierarchical console output and optional Axiom integration for observability.

## Features

- **Beautiful Console Output**: Box-drawing characters create clear hierarchical traces
- **OpenTelemetry-inspired API**: Familiar span-based tracing model
- **Axiom Integration**: Ship traces directly to Axiom for analysis and monitoring
- **Timing Data**: Automatic duration tracking for all operations
- **Structured Attributes**: Rich context data attached to spans and events
- **TypeScript Native**: Full type safety and excellent DX

## Installation

```bash
# The logger is part of the tools monorepo
import { createTracer } from '@logger/index';
```

## Quick Start

```typescript
import { createTracer } from "@logger/index";

// Initialize tracer
const tracer = createTracer({
  serviceName: "my-cli-tool",
  enableConsole: true,
  enableAxiom: false, // Set to true with token/dataset for Axiom
});

// Create spans
const mainSpan = tracer.startSpan("Main Operation");
const childSpan = mainSpan.startChild("Sub Operation");

// Log events
childSpan.info("Processing file", { filename: "test.json" });
childSpan.warn("Missing optional field", { field: "description" });

// End spans (automatically calculates duration)
childSpan.end({ filesProcessed: 1 });
mainSpan.end({ success: true });
```

## Console Output

The tracer produces beautiful hierarchical output:

```
[START]: Main Operation
├─ Sub Operation
│  ✓ Processing file
│  ⚠ Missing optional field
└─ Sub Operation completed (45ms)
[END]: Main Operation completed (46ms)
```

## Axiom Integration

To ship traces to Axiom for analysis:

```typescript
const tracer = createTracer({
  serviceName: "resource-pack-tools",
  axiomDataset: "cli-traces",
  axiomToken: process.env.AXIOM_TOKEN,
  enableConsole: true,
  enableAxiom: true,
});

// All spans and events will be automatically shipped to Axiom
const span = tracer.startSpan("File Processing");
span.info("Started processing", { inputFile: "pack.mcmeta" });
span.end({ success: true });

// Ensure all data is flushed
await tracer.flush();
```

## API Reference

### TracerConfig

```typescript
interface TracerConfig {
  serviceName: string; // Service identifier for traces
  axiomDataset?: string; // Axiom dataset name
  axiomToken?: string; // Axiom API token
  enableConsole?: boolean; // Enable console output (default: true)
  enableAxiom?: boolean; // Enable Axiom shipping (default: false)
}
```

### Span Methods

```typescript
// Create child spans
const child = span.startChild("Operation Name", { key: "value" });

// Log events at different levels
span.info("Information message", { context: "data" });
span.warn("Warning message", { issue: "details" });
span.error("Error message", { error: "description" });
span.debug("Debug message", { debug: "info" });

// Set attributes
span.setAttributes({ userId: "123", feature: "enabled" });

// End span with final attributes
span.end({ itemsProcessed: 42, success: true });
```

## Migration Guide

### Before (console.log)

```typescript
console.log("[INFO]: Starting backport");
console.log("├─ Input: ./input");
console.log("├─ Output: ./output");

console.log("├─ Processing items");
for (const item of items) {
  console.log(`│  ✓ Processed ${item.name}`);
}
console.log("└─ Processing complete");
```

### After (Structured Tracer)

```typescript
const tracer = createTracer({ serviceName: "backporter" });
const mainSpan = tracer.startSpan("Backport Operation");
mainSpan.setAttributes({ input: "./input", output: "./output" });

const processingSpan = mainSpan.startChild("Item Processing");
for (const item of items) {
  const itemSpan = processingSpan.startChild(`Process ${item.name}`);
  itemSpan.info("Processing complete", { itemType: item.type });
  itemSpan.end({ success: true });
}
processingSpan.end({ itemsProcessed: items.length });
mainSpan.end({ success: true });
```

## Axiom Schema

When shipping to Axiom, traces follow this schema:

```json
{
  "_time": "2024-01-15T10:30:00.000Z",
  "service": "resource-pack-tools",
  "trace_id": "abc123def456",
  "span_id": "span789",
  "parent_span_id": "parent456",
  "operation": "File Processing",
  "duration_ms": 150,
  "level": 1,
  "attributes": {
    "inputFile": "pack.mcmeta",
    "outputDir": "./dist"
  },
  "events": [
    {
      "timestamp": "2024-01-15T10:30:00.100Z",
      "level": "info",
      "message": "Started processing",
      "attributes": { "fileSize": 1024 }
    }
  ]
}
```

## Environment Variables

```bash
# For Axiom integration
export AXIOM_TOKEN="your-axiom-token"
export AXIOM_DATASET="cli-traces"

# Run your CLI tool
pnpm my-tool.ts
```

## Best Practices

1. **Start spans early**: Create spans at the beginning of operations
2. **Use meaningful names**: Operation names should be descriptive
3. **Add rich attributes**: Include relevant context data
4. **End spans properly**: Always call `.end()` to capture timing
5. **Structure hierarchically**: Use child spans to show relationships
6. **Log important events**: Use `.info()`, `.warn()`, `.error()` for key moments
7. **Flush on exit**: Call `tracer.flush()` before process exit

## Integration with Existing Tools

The tracer is designed to replace console.log statements throughout the codebase while providing much richer observability. It maintains the same beautiful console output while adding structured data collection for analysis in Axiom.

Perfect for CLI tools, build systems, and any process that needs clear progress indication and detailed observability.
