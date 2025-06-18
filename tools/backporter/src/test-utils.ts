import { createTracer, type StructuredTracer } from "@logger/index";

export function createTestTracer(): StructuredTracer {
  return createTracer({
    serviceName: "test-backporter",
    enableConsole: false,
    enableAxiom: false,
  });
}
