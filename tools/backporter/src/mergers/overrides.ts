import type { WriteRequest } from "@backporter/file-manager";
import type { RequestMerger } from "@backporter/mergers";
import type { StructuredTracer } from "@logger/index";

interface MinecraftOverride {
  readonly predicate: Record<string, unknown>;
  readonly model: string | Record<string, unknown>;
}

interface MinecraftItemModel {
  readonly parent?: string;
  readonly textures?: Record<string, unknown>;
  overrides?: MinecraftOverride[];
  readonly display?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export class OverridesMerger implements RequestMerger {
  name = "overrides-merger";
  private tracer?: StructuredTracer;

  constructor(tracer?: StructuredTracer) {
    this.tracer = tracer;
  }

  canMerge(requests: WriteRequest[]): boolean {
    // Can merge if all requests are pommel-model type with same path
    return (
      requests.length > 1 &&
      requests.every((r) => r.type === "pommel-model") &&
      new Set(requests.map((r) => r.path)).size === 1
    );
  }

  merge(requests: WriteRequest[]): WriteRequest {
    if (requests.length === 0) {
      throw new Error("Cannot merge empty request list");
    }

    const firstRequest = requests[0];
    if (requests.length === 1 && firstRequest) {
      return firstRequest;
    }

    // Use the highest priority request as base
    const sorted = requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const base = sorted[0];
    if (!base) {
      throw new Error("Base request is undefined after sorting");
    }

    const highestPriority = base.priority || 0;

    // Only merge overrides from requests with the same highest priority
    // This prevents low-priority raw conditionals from polluting high-priority simplified overrides
    const samePriorityRequests = sorted.filter((r) => (r.priority || 0) === highestPriority);

    const allOverrides: MinecraftOverride[] = [];

    for (const request of samePriorityRequests) {
      if (
        typeof request.content === "object" &&
        request.content !== null &&
        !Array.isArray(request.content)
      ) {
        const model = request.content as MinecraftItemModel;
        if (model.overrides && Array.isArray(model.overrides)) {
          for (const override of model.overrides) {
            if (this.isValidOverride(override)) {
              allOverrides.push(override as MinecraftOverride);
            }
          }
        }
      }
    }

    // Deduplicate overrides by predicate + model combination
    const uniqueOverrides = this.deduplicateOverrides(allOverrides);

    // Sort overrides to ensure correct Pommel predicate order
    const sortedOverrides = this.sortPommelPredicates(uniqueOverrides);

    const mergeSpan = this.tracer?.startSpan("Merge Pommel Overrides");
    mergeSpan?.setAttributes({
      requestCount: requests.length,
      overrideCount: uniqueOverrides.length,
      priority: highestPriority,
    });
    mergeSpan?.debug(
      `Merged ${requests.length} pommel-model requests into 1 (${uniqueOverrides.length} overrides, priority ${highestPriority})`
    );
    mergeSpan?.end({ success: true });

    // Update the base request with merged overrides
    const baseContent = base.content;
    if (typeof baseContent === "object" && baseContent !== null && !Array.isArray(baseContent)) {
      return {
        ...base,
        content: {
          ...baseContent,
          overrides: sortedOverrides,
        } as typeof baseContent,
      };
    }

    return base;
  }

  private isValidOverride(override: unknown): override is MinecraftOverride {
    return (
      typeof override === "object" &&
      override !== null &&
      "predicate" in override &&
      "model" in override &&
      typeof (override as Record<string, unknown>).predicate === "object" &&
      (typeof (override as Record<string, unknown>).model === "string" ||
        typeof (override as Record<string, unknown>).model === "object")
    );
  }

  private deduplicateOverrides(overrides: MinecraftOverride[]): MinecraftOverride[] {
    const seen = new Set<string>();
    const unique: MinecraftOverride[] = [];

    for (const override of overrides) {
      // Create a key from predicate + model for ALL overrides (including Pommel)
      const key = JSON.stringify({
        predicate: override.predicate,
        model: typeof override.model === "string" ? override.model : JSON.stringify(override.model),
      });

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(override);
      }
    }

    return unique;
  }

  private sortPommelPredicates(overrides: MinecraftOverride[]): MinecraftOverride[] {
    // Don't sort - preserve the original order from handlers
    // The reference pack that works has pommel:is_held before pommel:is_offhand
    return overrides;
  }

  private isPommelPredicate(predicate: Record<string, unknown>): boolean {
    if (!predicate || typeof predicate !== "object") return false;
    return Object.keys(predicate).some((key) => key.startsWith("pommel:"));
  }
}
