type: #type/insight
area: minecraft-resource-pack
keywords: architecture, strategy-pattern, conditional-compiler
status: #status/active
created: 2025-06-18
source: debugging-session

---

**Hide Complexity Behind Simplicity - Don't Over-Architect**

When facing complex problems, resist creating new abstractions that fight existing systems. The resource pack backporter issue appeared to need a "Conditional Decomposition Compiler" with AST parsing, but the actual fix respected the existing architecture:

1. **One-line model copy fix** - Remove unnecessary filtering
2. **30-line handler enhancement** - Add missing Pommel model generation

The existing Strategy Pattern architecture was sound - it just needed better implementations, not new abstractions.

**Actionable principle**: Complex implementation is fine if it maintains a simple consumer experience. Before creating new architectural layers, verify if existing patterns can be enhanced to handle the complexity internally.

**Application**: When debugging shows missing functionality, extend existing systems rather than building parallel abstractions. Let the API structure guide consumers toward correct patterns while hiding implementation complexity.
