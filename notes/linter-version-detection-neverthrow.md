type: #type/insight
area: minecraft-resource-pack
keywords: linter, validation, version-detection, neverthrow, error-handling
status: #status/active
created: 2025-01-24
source: debugging-session

---

**Smart Defaults, Full Control - Respect Underlying Systems**

Critical lesson from 3-phase linter overhaul: **Respect Minecraft's version system** - pack targeting 1.21.5 but validating against 1.20.x vanilla assets caused massive false positives.

Key implementation patterns:
- **Respect underlying systems**: Use exact pack format version detection, match Minecraft's conventions
- **Smart defaults**: Autonomous asset generation, zero configuration required
- **Hide complexity**: neverthrow Result<T,E> pattern internally, simple validation API externally  
- **Structure teaches usage**: Structured logging/tracing guides proper debugging patterns
- **Full control**: Support for special references like `builtin/entity` when needed

The transformation: broken linter with false positives → robust validation framework with zero manual maintenance. Complex version detection and error handling hidden behind simple `validateResourcePack()` API.

**Actionable pattern**: Make the underlying system (Minecraft) your ally, not your enemy. Hide complex validation logic behind simple interfaces while preserving access to full power when needed.
