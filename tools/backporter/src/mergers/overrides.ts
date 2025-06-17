import type { WriteRequest } from "@backporter/file-manager";
import type { RequestMerger } from "@backporter/mergers";

export class OverridesMerger implements RequestMerger {
  name = "overrides-merger";

  canMerge(requests: WriteRequest[]): boolean {
    // Can merge if all requests are pommel-model type with same path
    return (
      requests.length > 1 &&
      requests.every((r) => r.type === "pommel-model") &&
      new Set(requests.map((r) => r.path)).size === 1
    );
  }

  merge(requests: WriteRequest[]): WriteRequest {
    if (requests.length === 1) return requests[0];

    // Use the highest priority request as base
    const sorted = requests.sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    );
    const base = { ...sorted[0] };
    const highestPriority = sorted[0].priority || 0;

    // Only merge overrides from requests with the same highest priority
    // This prevents low-priority raw conditionals from polluting high-priority simplified overrides
    const samePriorityRequests = sorted.filter(
      (r) => (r.priority || 0) === highestPriority
    );

    const allOverrides = [];

    for (const request of samePriorityRequests) {
      const model = request.content;
      if (model.overrides && Array.isArray(model.overrides)) {
        allOverrides.push(...model.overrides);
      }
    }

    // Deduplicate overrides by predicate + model combination
    const uniqueOverrides = this.deduplicateOverrides(allOverrides);

    // Sort overrides to ensure correct Pommel predicate order
    const sortedOverrides = this.sortPommelPredicates(uniqueOverrides);

    // Update the base request with merged overrides
    base.content = {
      ...base.content,
      overrides: sortedOverrides,
    };

    console.log(
      `↻ Merged ${requests.length} pommel-model requests into 1 (${uniqueOverrides.length} overrides, priority ${highestPriority})`
    );

    return base;
  }

  private deduplicateOverrides(overrides: any[]): any[] {
    const seen = new Set<string>();
    const unique = [];

    for (const override of overrides) {
      // Create a key from predicate + model for ALL overrides (including Pommel)
      const key = JSON.stringify({
        predicate: override.predicate,
        model:
          typeof override.model === "string"
            ? override.model
            : JSON.stringify(override.model),
      });

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(override);
      }
    }

    return unique;
  }

  private sortPommelPredicates(overrides: any[]): any[] {
    // Don't sort - preserve the original order from handlers
    // The reference pack that works has pommel:is_held before pommel:is_offhand
    return overrides;
  }

  private isPommelPredicate(predicate: any): boolean {
    if (!predicate || typeof predicate !== "object") return false;
    return Object.keys(predicate).some((key) => key.startsWith("pommel:"));
  }
}
