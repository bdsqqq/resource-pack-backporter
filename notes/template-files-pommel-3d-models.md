type: #type/insight
area: minecraft-resource-pack
keywords: template-files, pommel, 3d-models, parent-declarations
status: #status/active
created: 2025-06-05
source: main-hand-invisibility-debugging

---

**Template Files Must Not Have Spurious Parent Declarations**

Template files like `template_book_open.json` should be standalone 3D models without inheritance from `minecraft:item/handheld`. Adding extra parent declarations breaks Pommel's 3D model rendering chain for main hand context.

**Key Actions:**
1. Remove any `"parent": "minecraft:item/handheld"` lines from template files
2. Update post-processing logic to avoid adding spurious parents during zero-thickness repairs
3. Add validation to ensure template files match expected structure without inheritance conflicts
4. Use byte-for-byte comparison with working reference packs to catch simple issues before complex debugging

This single spurious line can make entire model chains invisible in main hand while working correctly in offhand/ground contexts.
