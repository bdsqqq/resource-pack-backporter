type: #type/principle
area: software-design
keywords: api-design, philosophy, complexity, defaults
status: #status/active
created: 2025-06-18
source: core-philosophy

---

**API Design Principles**

**Core Philosophy**

**Respect underlying systems** - Match existing APIs, conventions, and naming. Don't create abstractions that fight what you're building on top of.

**Hide complexity behind simplicity** - Complex implementation is fine if it creates a simple consumer experience. Make simple things simple, complex things possible.

**Structure teaches usage** - Use compound components and logical grouping so the API shape guides consumers toward correct patterns.

**Smart defaults, full control** - Provide sensible defaults that work without configuration, but preserve access to full underlying power.
