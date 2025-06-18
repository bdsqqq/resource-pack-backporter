type: #type/insight
area: minecraft-resource-pack
keywords: linter, validation, version-detection, neverthrow, error-handling
status: #status/active
created: 2025-01-24
source: debugging-session

---

Critical lesson from 3-phase linter overhaul: **Version precision is everything** - pack targeting 1.21.5 but validating against 1.20.x vanilla assets caused massive false positives. 

Key implementation insights:
- Use exact pack format version detection, not hardcoded versions
- Implement neverthrow Result<T,E> pattern instead of throwing exceptions for type-safe error handling
- Replace console outputs with structured logging/tracing for production systems
- Add support for special references like `builtin/entity` in validation logic
- Create autonomous asset generation vs manual maintenance

The transformation: broken linter with false positives → robust validation framework with zero manual maintenance. Type-safe error handling prevents entire classes of runtime failures while structured logging enables proper debugging.

Actionable pattern: Always validate against the exact target version, return Results instead of throwing, and instrument properly from the start.
