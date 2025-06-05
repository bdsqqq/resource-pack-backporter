# Resource Pack Backporter - Architecture Specification

## Overview

This backporter converts Minecraft 1.21.4+ resource packs to work with 1.21.1 using CIT (OptiFine) and Pommel mods. The core challenge is transforming complex nested conditional structures (`minecraft:select` with `display_context` and `stored_enchantments`) into flattened target systems.

## Architecture Pattern: Conditional Compiler

The system uses a **Conditional Compiler** approach rather than a Strategy Pattern, consisting of three main components:

### Core Components

1. **ConditionalPathExtractor** (`src/conditional-compiler/path-extractor.ts`)
   - Parses nested `minecraft:select` and `minecraft:condition` nodes
   - Extracts all possible execution paths with their conditions
   - Handles display contexts, enchantments, and component conditions

2. **TargetSystemMapper** (`src/conditional-compiler/target-mapper.ts`)
   - Converts execution paths to output targets
   - Handles three target systems: Pommel model overrides, CIT properties, and base textures
   - Implements critical deduplication for proper Pommel functionality

3. **BackportFileGenerator** (`src/conditional-compiler/file-generator.ts`)
   - Creates final files with deduplication
   - Handles different file types: `.json` models, `.properties` files, texture copies

### Entry Point

**ConditionalBackportCoordinator** (`src/conditional-compiler/backport-coordinator.ts`) - orchestrates the entire process.

## Critical Design Principles

### 1. CIT vs Pommel Interaction

**Key Insight**: CIT properties without context restrictions apply to ALL display contexts, overriding Pommel 3D models.

**Correct Pattern**:
- CIT points to individual enchantment model files (e.g., `channeling_1.json`)
- These model files contain Pommel overrides for 3D contexts
- Regular books get Pommel overrides directly
- Enchanted books use base model with no overrides (CIT replaces entirely)

### 2. Pommel Predicate Patterns

**Critical Discovery**: When items are in offhand, BOTH `pommel:is_held` AND `pommel:is_offhand` return 1.0 simultaneously.

**Required Pattern**:
- 1x ground predicate: `pommel:is_ground`
- 2x held predicates: `pommel:is_held` 
- 3x offhand predicates: `pommel:is_offhand`

This ensures proper override precedence and functionality.

### 3. Context Grouping

- **GUI contexts**: `gui`, `fixed`, `head` - get 2D sprites via CIT
- **Ground context**: `ground` - gets own Pommel predicate 
- **3D contexts**: `firstperson_righthand`, `thirdperson_righthand`, `firstperson_lefthand`, `thirdperson_lefthand` - get Pommel 3D models

## Template File Architecture

### Critical Component: Template Files

Template files (e.g., `assets/minecraft/models/item/books_3d/template_book_open.json`) define the base 3D structure for all book models.

**CRITICAL REQUIREMENTS**:

1. **No Parent Field**: Template files must NOT inherit from `minecraft:item/handheld` or any other parent
2. **Standalone Structure**: Must contain complete 3D model definition
3. **Display Transformations**: Must include all required display contexts for proper rendering

### Template File Validation

The system validates template files to ensure:
- No spurious `parent` field (the root cause of main hand invisibility)
- Required fields: `credit`, `texture_size`, `elements`, `display`
- Proper structure for 3D model processing

### Post-Processing Protection

The `ModelCompatibilityProcessor` includes safeguards:
- **Template Protection**: Skips template files from compatibility fixes
- **Validation**: Ensures template files maintain expected structure
- **Prevention**: Stops spurious parent injection that breaks Pommel rendering

## File Generation Patterns

### Enchanted Books
```
enchanted_book.json (base model, no overrides) 
├── CIT Property → channeling_1.json
└── channeling_1.json (contains Pommel overrides for 3D contexts)
```

### Regular Books
```
writable_book.json (contains direct Pommel overrides)
```

### Texture Naming Conventions

- **Single-level enchantments**: `channeling.png`
- **Multi-level enchantments**: `bane_of_arthropods_1.png`, `bane_of_arthropods_2.png`
- **Curse mappings**: `binding_curse` → `curse_of_binding`

## Debugging Methodology

When facing rendering issues:

1. **Byte-for-byte comparison** against working reference pack
2. **Template file inspection** for spurious parent fields
3. **CIT property validation** for proper model targeting
4. **Pommel predicate verification** for correct override patterns

## Success Criteria

- ✅ **Main hand visibility**: Books show 3D open models when held
- ✅ **Offhand functionality**: Books show 3D closed models in offhand  
- ✅ **Ground display**: Books show 2D textures on ground
- ✅ **GUI sprites**: Enchanted books show correct 2D sprites in inventory
- ✅ **Animation preservation**: Dynamic effects (lightning, etc.) work in 3D models

## Lessons Learned

1. **Template files are critical** - small changes break entire model chains
2. **Byte-for-byte comparison is essential** for debugging complex issues
3. **Post-processing validation prevents regression** in template file structure
4. **Working reference packs are invaluable** for verification and debugging
