# Critical Assumption Analysis - 20 Minute Deep Dive

## Questioning Our Core Assumptions

### 1. AST Parser Tree Assumption ❌

**Assumption**: JSON conditional structure is a clean tree that can be walked like an AST.

**Breaking Cases**:

```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:display_context", 
    "cases": [
      {
        "when": ["gui"],
        "model": {
          "type": "minecraft:model",
          "model": "some_pack:item/dynamic_model_${enchantment_id}_${level}"  // TEMPLATED REFERENCE
        }
      }
    ]
  }
}
```

**Problem**: Model references with variables/templates break static analysis. We can't know all possible models without runtime context.

```json
{
  "models": {
    "base_model": {
      "type": "minecraft:select",
      "reference": "models.conditional_model"  // CIRCULAR REFERENCE
    },
    "conditional_model": {
      "type": "minecraft:condition", 
      "fallback": {
        "reference": "models.base_model"  // BACK TO BASE
      }
    }
  }
}
```

**Problem**: Circular references create infinite recursion in tree walker.

### 2. Static Analysis Completeness Assumption ❌

**Assumption**: We can determine all conditional paths at build time.

**Breaking Cases**:

```json
{
  "model": {
    "type": "minecraft:condition",
    "property": "minecraft:custom_data",
    "predicate": {
      "function": "some_pack:runtime_calculation",  // RUNTIME COMPUTED
      "depends_on": ["player_stats", "world_state", "time_of_day"]
    }
  }
}
```

**Problem**: Conditions that depend on runtime game state can't be analyzed statically.

```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:component",
    "component": "minecraft:stored_enchantments",
    "dynamic_cases": {
      "source": "registry:minecraft/enchantment",  // DYNAMIC CASE GENERATION
      "template": {
        "when": {"${enchantment_id}": "${level}"},
        "model": "some_pack:item/books/${enchantment_id}_${level}"
      }
    }
  }
}
```

**Problem**: Cases generated from external registries can't be known at pack build time.

### 3. Known Backport Mechanism Assumption ❌

**Assumption**: All conditional paths map to known backport mechanisms (CIT, Pommel, etc.).

**Breaking Cases**:

```json
{
  "model": {
    "type": "future_mod:special_condition",  // UNKNOWN MOD SYSTEM
    "special_property": "future_mod:new_property_type",
    "cases": [
      {
        "when": {"future_condition": "unknown_value"},
        "model": "minecraft:item/some_model"
      }
    ]
  }
}
```

**Problem**: Future/unknown mod systems that don't map to CIT/Pommel/etc.

```json
{
  "model": {
    "type": "minecraft:multi_mod_condition",  // REQUIRES MULTIPLE MODS
    "requires": ["optifine", "pommel", "custom_mod"],
    "optifine_part": { /* CIT logic */ },
    "pommel_part": { /* Pommel logic */ },
    "custom_part": { /* Unknown logic */ }
  }
}
```

**Problem**: Conditions that require coordination between multiple mod systems.

### 4. Finite Model Space Assumption ❌

**Assumption**: There's a finite, knowable set of models to generate.

**Breaking Cases**:

```json
{
  "model": {
    "type": "minecraft:procedural",
    "generator": {
      "type": "combinatorial",
      "dimensions": [
        {"enchantments": "all_possible_enchantments"},  // 100+ enchantments
        {"levels": [1,2,3,4,5]},                       // 5 levels each  
        {"modifiers": "all_possible_modifiers"},        // 50+ modifiers
        {"rarities": ["common", "rare", "epic", "legendary"]}
      ]
    }
  }
}
```

**Problem**: Combinatorial explosion: 100 × 5 × 50 × 4 = 100,000 possible models. We can't generate all combinations.

### 5. Model Reference Stability Assumption ❌

**Assumption**: Model references are stable string literals.

**Breaking Cases**:

```json
{
  "model": {
    "type": "minecraft:computed_model",
    "base": "minecraft:item/enchanted_books/",
    "suffix_function": "hash(player_uuid + enchantment_data)",  // COMPUTED PATHS
    "fallback": "minecraft:item/enchanted_book"
  }
}
```

**Problem**: Model paths computed at runtime can't be predicted.

```json
{
  "model_registry": {
    "sharpness_models": ["sharpness_1", "sharpness_alt", "sharpness_special"],
    "model": {
      "type": "minecraft:registry_lookup",
      "registry": "model_registry.sharpness_models",
      "selector": "random_based_on_world_seed"  // INDIRECTION + RANDOMNESS
    }
  }
}
```

**Problem**: Indirection through registries with dynamic selection.

### 6. Independent Item Processing Assumption ❌

**Assumption**: Each item can be processed in isolation.

**Breaking Cases**:

```json
{
  "global_config": {
    "enchantment_style": "minimalist",  // GLOBAL SETTING
    "affects_all_items": true
  },
  "items": {
    "enchanted_book": {
      "model": {
        "type": "minecraft:conditional_on_global",
        "property": "global_config.enchantment_style",
        "cases": [
          {
            "when": "minimalist",
            "model": "minecraft:item/simple_book"
          },
          {
            "when": "detailed", 
            "model": {
              "type": "minecraft:select",
              /* complex enchantment logic */
            }
          }
        ]
      }
    }
  }
}
```

**Problem**: Items depend on global pack configuration, can't process independently.

```json
{
  "items": {
    "enchanted_book": {
      "model": {
        "type": "minecraft:depends_on_item",
        "reference_item": "written_book",  // CROSS-ITEM DEPENDENCY
        "inherit_properties": ["display_context", "custom_data"]
      }
    }
  }
}
```

**Problem**: Items have dependencies on other items' processing results.

### 7. JSON Structure Consistency Assumption ❌

**Assumption**: Conditional logic is always in the "model" field with consistent structure.

**Breaking Cases**:

```json
{
  "model": "minecraft:item/base_book",
  "conditional_textures": {  // CONDITIONALS IN TEXTURES
    "type": "minecraft:select",
    "property": "minecraft:stored_enchantments",
    "cases": [
      {
        "when": {"minecraft:fire_aspect": 1},
        "textures": {
          "layer0": "minecraft:item/fire_book",
          "overlay": "minecraft:item/fire_effect"
        }
      }
    ]
  },
  "conditional_sounds": {  // CONDITIONALS IN SOUNDS  
    "type": "minecraft:select",
    "property": "minecraft:display_context",
    "cases": [
      {
        "when": ["held"],
        "sounds": {
          "ambient": "minecraft:item.book.page_turn"
        }
      }
    ]
  }
}
```

**Problem**: Conditionals exist in multiple fields, not just models.

### 8. Minecraft Version Compatibility Assumption ❌

**Assumption**: All conditional types are version-stable.

**Breaking Cases**:

```json
{
  "format_version": "1.21.5",
  "model": {
    "type": "minecraft:new_conditional_type_added_in_1_21_5",  // VERSION-SPECIFIC
    "new_property": "minecraft:future_component",
    "cases": [
      {
        "when": {"new_syntax": "unknown_format"},
        "model": "minecraft:item/future_model"
      }
    ]
  }
}
```

**Problem**: New Minecraft versions add conditional types our parser doesn't know about.

### 9. Mod Ecosystem Stability Assumption ❌

**Assumption**: Target mods (CIT, Pommel) have stable APIs and capabilities.

**Breaking Cases**:

```json
{
  "model": {
    "type": "minecraft:requires_capability_check",
    "required_mods": [
      {"mod": "optifine", "min_version": "H1", "features": ["cit_extended"]},
      {"mod": "pommel", "min_version": "2.0", "features": ["complex_predicates"]},
      {"mod": "custom_mod", "version": "any", "features": ["unknown_feature"]}
    ],
    "fallback_chain": [
      "try_optifine_advanced",
      "try_pommel_basic", 
      "try_vanilla_overrides",
      "give_up"
    ]
  }
}
```

**Problem**: Pack requires specific mod versions/features that may not be available.

## Implications for Our Approach

### What This Means:

1. **AST Parser approach is insufficient** - We need error handling for cycles, unknown types, and dynamic references
2. **Static analysis has limits** - We need runtime/build-time hybrid approaches  
3. **Backport mechanisms are not universal** - We need graceful degradation and extensibility
4. **Model space can be infinite** - We need sampling/approximation strategies
5. **Items are not independent** - We need global context and dependency resolution
6. **JSON structure varies** - We need flexible parsing that handles conditionals anywhere

### Required Architectural Changes:

1. **Error-Resilient Tree Walker** with cycle detection and unknown type handling
2. **Hybrid Static/Dynamic Analysis** with runtime hooks and approximation
3. **Extensible Backport System** with plugin architecture for unknown mod systems
4. **Smart Model Space Management** with combinatorial explosion detection
5. **Global Context System** for cross-item dependencies and pack-level configuration
6. **Multi-Field Conditional Parser** that handles conditionals in any JSON field

The reality is much more complex than a simple AST parser can handle.
