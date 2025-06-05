# Real-World Edge Cases with Concrete Solutions

## High-Level Strategy Framework

### Level 1: Case Categories
1. **Static Analysis Breakers** - Cases that break pure AST parsing
2. **Dynamic Reference Breakers** - Cases with runtime/computed references  
3. **Scale Breakers** - Cases with infinite/massive model spaces
4. **Dependency Breakers** - Cases with complex inter-dependencies
5. **Unknown System Breakers** - Cases with future/unknown mod systems

### Level 2: Solution Approaches
1. **Hybrid Analysis** - Combine static + dynamic + approximation
2. **Graceful Degradation** - Handle unknowns with best-effort fallbacks
3. **Pluggable Architecture** - Extensible system for new patterns
4. **Smart Sampling** - Handle infinite spaces with strategic sampling
5. **Dependency Resolution** - Handle cross-item and global dependencies

### Level 3: Implementation Strategies
For each case: Detect → Analyze → Transform → Generate → Validate

---

## Case 1: Templated Model References (Static Analysis Breaker)

### Real Example Input Pack

**File**: `assets/minecraft/items/enchanted_book.json`
```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:component",
    "component": "minecraft:stored_enchantments",
    "template_cases": {
      "source": "registry:minecraft/enchantment",
      "pattern": {
        "when": {"${enchantment_id}": "${level}"},
        "model": {
          "type": "minecraft:template",
          "pattern": "mystical_books:item/books/${enchantment_id}_level_${level}",
          "fallback": "mystical_books:item/books/generic_${enchantment_id}"
        }
      },
      "level_range": [1, 5]
    }
  }
}
```

**File**: `assets/mystical_books/models/item/books/template_definitions.json`
```json
{
  "template_registry": {
    "sharpness": {
      "levels": [1, 2, 3, 4, 5],
      "special_variants": ["cursed", "blessed"],
      "texture_pattern": "mystical_books:item/enchantments/sharpness_${level}${variant}"
    },
    "fire_aspect": {
      "levels": [1, 2],
      "special_variants": ["infernal"],
      "texture_pattern": "mystical_books:item/enchantments/fire_${level}_${variant}"
    }
  }
}
```

### Problem Analysis
- **Template resolution**: Can't statically know all `${enchantment_id}` and `${level}` combinations
- **External registry dependency**: Needs to resolve `registry:minecraft/enchantment`
- **Dynamic pattern expansion**: One template generates dozens of models

### Solution Strategy

#### Level 1: Detection & Analysis
```typescript
class TemplatedReferenceHandler {
  canHandle(json: any): boolean {
    return this.hasTemplatedReferences(json) || this.hasTemplateRegistry(json);
  }
  
  private hasTemplatedReferences(obj: any): boolean {
    return JSON.stringify(obj).includes('${') && JSON.stringify(obj).includes('}');
  }
}
```

#### Level 2: Template Resolution System
```typescript
class TemplateResolver {
  resolveTemplates(json: any, context: PackContext): ResolvedTemplate[] {
    // 1. Extract template patterns
    const templates = this.extractTemplatePatterns(json);
    
    // 2. Resolve variables from registries/context
    const variables = this.resolveVariables(templates, context);
    
    // 3. Generate all valid combinations
    const combinations = this.generateCombinations(variables);
    
    // 4. Expand templates for each combination
    return combinations.map(combo => this.expandTemplate(templates, combo));
  }
  
  private resolveVariables(templates: Template[], context: PackContext): VariableSet {
    const variables = new VariableSet();
    
    for (const template of templates) {
      for (const variable of template.variables) {
        switch (variable.source) {
          case 'registry:minecraft/enchantment':
            variables.add(variable.name, this.getMinecraftEnchantments());
            break;
          case 'pack_data':
            variables.add(variable.name, context.getPackData(variable.path));
            break;
          case 'level_range':
            variables.add(variable.name, this.generateRange(variable.min, variable.max));
            break;
        }
      }
    }
    
    return variables;
  }
}
```

#### Level 3: Generated Output Structure

**Generated Files** (125+ models):
```
dist/
├── assets/minecraft/models/item/
│   ├── enchanted_books/
│   │   ├── sharpness_1.json         # From template expansion
│   │   ├── sharpness_2.json
│   │   ├── fire_aspect_1.json
│   │   └── ... (125+ files)
│   └── books_3d/
│       ├── sharpness_3d.json        # 3D models for Pommel
│       ├── sharpness_3d_open.json
│       └── ... (250+ files)
└── assets/minecraft/optifine/cit/
    ├── sharpness_1.properties       # CIT properties
    ├── sharpness_2.properties
    └── ... (125+ files)
```

**Example Generated Model**: `assets/minecraft/models/item/enchanted_books/sharpness_1.json`
```json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "mystical_books:item/enchantments/sharpness_1"
  },
  "overrides": [
    {
      "predicate": {"pommel:is_ground": 1},
      "model": "minecraft:item/enchanted_books/sharpness_1"
    },
    {
      "predicate": {"pommel:is_held": 1},
      "model": "minecraft:item/books_3d/sharpness_3d_open"
    },
    {
      "predicate": {"pommel:is_offhand": 1},
      "model": "minecraft:item/books_3d/sharpness_3d"
    }
  ]
}
```

---

## Case 2: Circular References (Tree Walker Breaker)

### Real Example Input Pack

**File**: `assets/minecraft/items/knowledge_book.json`
```json
{
  "model": {
    "type": "minecraft:reference",
    "path": "models.conditional_system.base_knowledge_model"
  },
  "models": {
    "conditional_system": {
      "base_knowledge_model": {
        "type": "minecraft:select",
        "property": "minecraft:custom_data",
        "cases": [
          {
            "when": {"has_content": true},
            "model": {
              "type": "minecraft:reference",
              "path": "models.conditional_system.content_dependent_model"
            }
          }
        ],
        "fallback": {
          "type": "minecraft:reference", 
          "path": "models.conditional_system.empty_knowledge_model"
        }
      },
      "content_dependent_model": {
        "type": "minecraft:condition",
        "property": "minecraft:custom_data",
        "predicate": {"content_type": "spell"},
        "on_true": {
          "type": "minecraft:reference",
          "path": "models.conditional_system.spell_book_model"
        },
        "on_false": {
          "type": "minecraft:reference",
          "path": "models.conditional_system.base_knowledge_model"  // CIRCULAR!
        }
      },
      "spell_book_model": {
        "type": "minecraft:model",
        "model": "minecraft:item/books_3d/spell_book_3d"
      },
      "empty_knowledge_model": {
        "type": "minecraft:condition",
        "property": "minecraft:display_context",
        "predicate": ["held"],
        "on_true": {
          "type": "minecraft:reference",
          "path": "models.conditional_system.base_knowledge_model"  // ANOTHER CYCLE!
        },
        "on_false": {
          "type": "minecraft:model",
          "model": "minecraft:item/books_3d/empty_knowledge_book"
        }
      }
    }
  }
}
```

### Problem Analysis
- **Reference cycles**: `base_knowledge_model` → `content_dependent_model` → `base_knowledge_model`
- **Multiple cycle paths**: Different conditions can create different cycles
- **Infinite recursion**: Naive tree walker will loop forever

### Solution Strategy

#### Level 1: Cycle Detection System
```typescript
class CycleDetectingWalker {
  private visitedNodes = new Set<string>();
  private currentPath = new Stack<string>();
  private resolvedReferences = new Map<string, ConditionalNode>();
  
  walkConditionalTree(node: ConditionalNode, context: WalkContext): ConditionMapping[] {
    // Detect if this is a reference
    if (node.type === 'minecraft:reference') {
      return this.handleReference(node, context);
    }
    
    // Normal tree walking for non-references
    return this.walkNormalNode(node, context);
  }
  
  private handleReference(node: ReferenceNode, context: WalkContext): ConditionMapping[] {
    const refPath = node.path;
    
    // Check for immediate cycle
    if (this.currentPath.contains(refPath)) {
      console.warn(`Cycle detected: ${this.currentPath.toString()} -> ${refPath}`);
      return this.handleCycle(refPath, context);
    }
    
    // Check if we've already resolved this reference
    if (this.resolvedReferences.has(refPath)) {
      return this.resolvedReferences.get(refPath);
    }
    
    // Resolve reference
    this.currentPath.push(refPath);
    const resolvedNode = this.resolveReference(refPath, context);
    const result = this.walkConditionalTree(resolvedNode, context);
    this.currentPath.pop();
    
    // Cache result for future use
    this.resolvedReferences.set(refPath, result);
    
    return result;
  }
}
```

#### Level 2: Cycle Resolution Strategies
```typescript
class CycleResolutionStrategy {
  handleCycle(cyclePath: string, context: WalkContext): ConditionMapping[] {
    // Strategy 1: Unroll cycle with depth limit
    const unrolledMappings = this.unrollCycleWithLimit(cyclePath, context, 3);
    
    // Strategy 2: Find cycle-breaking conditions
    const breakingConditions = this.findCycleBreakingConditions(cyclePath, context);
    
    // Strategy 3: Fallback to default behavior
    const fallbackMappings = this.generateFallbackMappings(cyclePath, context);
    
    return [...unrolledMappings, ...breakingConditions, ...fallbackMappings];
  }
  
  private unrollCycleWithLimit(cyclePath: string, context: WalkContext, maxDepth: number): ConditionMapping[] {
    const mappings = [];
    
    for (let depth = 1; depth <= maxDepth; depth++) {
      const unrolledContext = context.addCycleDepth(cyclePath, depth);
      
      // Create mapping that represents this depth level
      mappings.push(new ConditionMapping(
        unrolledContext.path,
        `minecraft:item/books_3d/knowledge_book_depth_${depth}`
      ));
    }
    
    return mappings;
  }
}
```

#### Level 3: Generated Output Structure

**Generated Files**:
```
dist/
├── assets/minecraft/models/item/
│   ├── knowledge_book.json          # Main model with cycle-resolved overrides
│   ├── books_3d/
│   │   ├── knowledge_book_depth_1.json    # Cycle unroll depth 1
│   │   ├── knowledge_book_depth_2.json    # Cycle unroll depth 2
│   │   ├── knowledge_book_depth_3.json    # Cycle unroll depth 3
│   │   ├── spell_book_3d.json             # Non-cycle model
│   │   └── empty_knowledge_book.json      # Fallback model
└── assets/minecraft/optifine/cit/
    ├── knowledge_book_spell.properties     # CIT for spell content
    └── knowledge_book_empty.properties     # CIT for empty content
```

**Example Generated Model**: `assets/minecraft/models/item/knowledge_book.json`
```json
{
  "parent": "minecraft:item/handheld", 
  "textures": {
    "layer0": "minecraft:item/knowledge_book"
  },
  "overrides": [
    {
      "predicate": {"pommel:is_held": 1},
      "model": "minecraft:item/books_3d/knowledge_book_depth_1"
    },
    {
      "predicate": {"pommel:is_ground": 1},
      "model": "minecraft:item/books_3d/empty_knowledge_book"
    }
  ]
}
```

---

## Case 3: Combinatorial Explosion (Scale Breaker)

### Real Example Input Pack

**File**: `assets/minecraft/items/custom_tool.json`
```json
{
  "model": {
    "type": "minecraft:combinatorial",
    "dimensions": [
      {
        "name": "enchantments",
        "source": "registry:minecraft/enchantment",
        "max_combinations": 3,
        "weight_by_rarity": true
      },
      {
        "name": "durability",
        "values": ["new", "worn", "damaged", "broken"],
        "affects_texture": true
      },
      {
        "name": "material",
        "values": ["wood", "stone", "iron", "gold", "diamond", "netherite"],
        "affects_model": true
      },
      {
        "name": "rarity",
        "values": ["common", "uncommon", "rare", "epic", "legendary"],
        "affects_effects": true
      }
    ],
    "total_combinations": "auto_calculate",  // 100 × 4 × 6 × 5 = 12,000 combinations!
    "generation_strategy": {
      "type": "smart_sampling",
      "max_generated": 500,
      "priority_combinations": [
        {"material": "diamond", "rarity": "legendary"},
        {"enchantments": ["sharpness", "fire_aspect"], "material": "netherite"}
      ]
    }
  }
}
```

### Problem Analysis
- **Massive combination space**: 12,000+ possible combinations
- **Resource constraints**: Can't generate 12,000 model files
- **Priority requirements**: Some combinations are more important than others

### Solution Strategy

#### Level 1: Combinatorial Analysis System
```typescript
class CombinatorialAnalyzer {
  analyzeCombinatorics(json: any): CombinatorialAnalysis {
    const dimensions = json.dimensions || [];
    const totalCombinations = this.calculateTotalCombinations(dimensions);
    
    return {
      dimensions,
      totalCombinations,
      isManageable: totalCombinations <= 1000,
      recommendedStrategy: this.getRecommendedStrategy(totalCombinations),
      estimatedGenerationTime: this.estimateGenerationTime(totalCombinations)
    };
  }
  
  private calculateTotalCombinations(dimensions: Dimension[]): number {
    return dimensions.reduce((total, dim) => {
      if (dim.source === 'registry:minecraft/enchantment') {
        // Estimate enchantment combinations
        const enchantmentCount = 100; // Known enchantment count
        const maxCombos = dim.max_combinations || 3;
        return total * this.calculateCombinations(enchantmentCount, maxCombos);
      }
      return total * (dim.values?.length || 1);
    }, 1);
  }
}
```

#### Level 2: Smart Sampling Strategy
```typescript
class SmartSamplingStrategy {
  generateSampledCombinations(analysis: CombinatorialAnalysis): SampledCombination[] {
    const maxGenerated = analysis.generation_strategy?.max_generated || 500;
    
    // 1. Always include priority combinations
    const priorityCombos = this.generatePriorityCombinations(analysis);
    
    // 2. Sample from high-impact combinations
    const highImpactCombos = this.sampleHighImpactCombinations(analysis, maxGenerated - priorityCombos.length);
    
    // 3. Fill remaining with diverse sampling
    const diverseCombos = this.generateDiverseSample(analysis, maxGenerated - priorityCombos.length - highImpactCombos.length);
    
    return [...priorityCombos, ...highImpactCombos, ...diverseCombos];
  }
  
  private sampleHighImpactCombinations(analysis: CombinatorialAnalysis, count: number): SampledCombination[] {
    // High-impact: rare materials + legendary rarity + popular enchantments
    const highImpactRules = [
      {materials: ["diamond", "netherite"], weight: 3},
      {rarities: ["epic", "legendary"], weight: 2},
      {enchantments: ["sharpness", "fire_aspect", "mending"], weight: 2}
    ];
    
    return this.weightedSample(analysis.dimensions, highImpactRules, count);
  }
}
```

#### Level 3: Generated Output Structure (Sampled)

**Generated Files** (500 models instead of 12,000):
```
dist/
├── assets/minecraft/models/item/
│   ├── custom_tools/
│   │   ├── diamond_legendary_sharpness_new.json      # Priority combo
│   │   ├── netherite_epic_fire_aspect_worn.json     # High-impact combo
│   │   ├── iron_common_efficiency_damaged.json      # Diverse sample
│   │   └── ... (497 more strategically selected)
│   └── custom_tool.json                             # Main dispatcher model
└── assets/minecraft/optifine/cit/
    ├── tools_diamond_legendary.properties           # High-level CIT matching
    ├── tools_netherite_epic.properties
    └── ... (50 strategic CIT properties)
```

**Example Main Dispatcher**: `assets/minecraft/models/item/custom_tool.json`
```json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "minecraft:item/custom_tool"
  },
  "overrides": [
    {
      "predicate": {"pommel:is_held": 1},
      "model": {
        "type": "minecraft:conditional_dispatcher",
        "fallback_model": "minecraft:item/custom_tools/iron_common_efficiency_new",
        "high_priority_mappings": [
          {
            "conditions": {"material": "diamond", "rarity": "legendary"},
            "model": "minecraft:item/custom_tools/diamond_legendary_sharpness_new"
          }
        ]
      }
    }
  ]
}
```

---

## Case 4: Cross-Item Dependencies (Dependency Breaker)

### Real Example Input Pack

**File**: `pack_config.json`
```json
{
  "pack_info": {
    "id": "unified_magic_system",
    "version": "2.1.0"
  },
  "global_settings": {
    "magic_system_enabled": true,
    "complexity_level": "advanced",
    "visual_style": "detailed"
  },
  "item_relationships": {
    "spell_books": {
      "base_item": "knowledge_book",
      "depends_on": ["written_book", "enchanted_book"],
      "inheritance_rules": {
        "from_written_book": ["display_context", "content_detection"],
        "from_enchanted_book": ["enchantment_visuals", "rarity_effects"]
      }
    }
  }
}
```

**File**: `assets/minecraft/items/spell_book.json`
```json
{
  "model": {
    "type": "minecraft:depends_on_item",
    "base_item_reference": "written_book",
    "inherit_properties": ["display_context", "writable_book_content"],
    "override_properties": {
      "component": "minecraft:stored_enchantments",
      "visual_enhancements": {
        "type": "minecraft:reference_other_item",
        "item": "enchanted_book",
        "merge_strategy": "combine_enchantment_effects"
      }
    },
    "global_config_dependency": {
      "property": "global_settings.visual_style",
      "affects": "texture_detail_level"
    }
  }
}
```

**File**: `assets/minecraft/items/written_book.json`
```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:display_context",
    "cases": [
      {
        "when": ["firstperson_righthand"],
        "model": {
          "type": "minecraft:condition",
          "property": "minecraft:writable_book_content",
          "predicate": {"pages": {"size": {"min": 1}}},
          "on_true": {
            "type": "minecraft:model",
            "model": "minecraft:item/books_3d/written_book_3d_open"
          }
        }
      }
    ]
  },
  "provides_to_dependents": {
    "display_context_logic": "full_conditional_tree",
    "content_detection_logic": "writable_book_content_conditions"
  }
}
```

### Problem Analysis
- **Processing order dependency**: `spell_book` depends on `written_book` being processed first
- **Global configuration dependency**: Items depend on pack-level settings
- **Cross-item logic inheritance**: Complex conditional logic needs to be shared/merged

### Solution Strategy

#### Level 1: Dependency Graph Resolution
```typescript
class DependencyResolver {
  buildDependencyGraph(packStructure: PackStructure): DependencyGraph {
    const graph = new DependencyGraph();
    
    // 1. Scan all items for dependencies
    for (const itemFile of packStructure.itemFiles) {
      const dependencies = this.extractDependencies(itemFile);
      graph.addNode(itemFile.itemId, dependencies);
    }
    
    // 2. Add global config dependencies
    const globalDeps = this.extractGlobalDependencies(packStructure.globalConfig);
    graph.addGlobalDependencies(globalDeps);
    
    // 3. Detect cycles and resolve them
    const cycles = graph.detectCycles();
    if (cycles.length > 0) {
      this.resolveDependencyCycles(cycles, graph);
    }
    
    return graph;
  }
  
  getProcessingOrder(graph: DependencyGraph): ProcessingPlan {
    // Topological sort with global config first
    const sortedItems = graph.topologicalSort();
    
    return new ProcessingPlan([
      { phase: 'global_config', items: ['pack_config'] },
      { phase: 'independent_items', items: sortedItems.filter(item => !item.hasDependencies()) },
      { phase: 'dependent_items', items: sortedItems.filter(item => item.hasDependencies()) }
    ]);
  }
}
```

#### Level 2: Cross-Item Logic Inheritance
```typescript
class LogicInheritanceProcessor {
  processWithInheritance(item: ItemDefinition, processedItems: Map<string, ProcessedItem>): ProcessedItem {
    // 1. Resolve base item logic
    const baseItemLogic = this.resolveBaseItemLogic(item, processedItems);
    
    // 2. Apply inheritance rules
    const inheritedLogic = this.applyInheritanceRules(item, baseItemLogic, processedItems);
    
    // 3. Merge with item-specific overrides
    const finalLogic = this.mergeWithOverrides(inheritedLogic, item.override_properties);
    
    return new ProcessedItem(item.id, finalLogic);
  }
  
  private applyInheritanceRules(item: ItemDefinition, baseLogic: ConditionalLogic, processedItems: Map<string, ProcessedItem>): ConditionalLogic {
    const inheritanceRules = item.inheritance_rules || {};
    
    for (const [sourceItem, properties] of Object.entries(inheritanceRules)) {
      const sourceLogic = processedItems.get(sourceItem)?.logic;
      if (!sourceLogic) {
        throw new Error(`Dependency not satisfied: ${item.id} depends on ${sourceItem}`);
      }
      
      // Inherit specific properties
      for (const property of properties) {
        baseLogic.inheritProperty(property, sourceLogic.getProperty(property));
      }
    }
    
    return baseLogic;
  }
}
```

#### Level 3: Generated Output Structure (with Dependencies)

**Processing Order**:
1. `pack_config.json` → Global settings
2. `written_book.json` → Base dependency
3. `enchanted_book.json` → Base dependency  
4. `spell_book.json` → Depends on previous items

**Generated Files**:
```
dist/
├── pack_config_resolved.json            # Resolved global settings
├── assets/minecraft/models/item/
│   ├── written_book.json                # Base item (processed first)
│   ├── enchanted_book.json              # Base item (processed first)
│   ├── spell_book.json                  # Dependent item (inherits logic)
│   └── books_3d/
│       ├── spell_book_3d_detailed.json  # Uses global "detailed" setting
│       ├── spell_book_3d_simple.json    # Alternative for "simple" setting
│       └── spell_book_3d_open.json      # Inherits open state from written_book
└── assets/minecraft/optifine/cit/
    ├── spell_book_fire.properties       # Inherits enchantment logic
    └── spell_book_content.properties    # Inherits content detection logic
```

**Example Generated Spell Book**: `assets/minecraft/models/item/spell_book.json`
```json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "minecraft:item/spell_book_detailed"
  },
  "overrides": [
    {
      "comment": "Inherited from written_book display_context logic",
      "predicate": {"pommel:is_held": 1},
      "model": "minecraft:item/books_3d/spell_book_3d_open"
    },
    {
      "comment": "Inherited from enchanted_book enchantment effects",
      "predicate": {"pommel:is_ground": 1},
      "model": "minecraft:item/books_3d/spell_book_3d_detailed"
    },
    {
      "comment": "Item-specific override",
      "predicate": {"pommel:is_offhand": 1},
      "model": "minecraft:item/books_3d/spell_book_3d_closed"
    }
  ]
}
```

---

## Implementation Framework Summary

### High-Level Processing Pipeline
1. **Dependency Analysis** → Build processing order
2. **Template Resolution** → Expand dynamic references  
3. **Cycle Detection** → Handle circular references
4. **Combinatorial Analysis** → Smart sampling for large spaces
5. **Logic Inheritance** → Merge cross-item dependencies
6. **Backport Generation** → Generate CIT/Pommel/Vanilla outputs
7. **Validation** → Verify output correctness

### Error Handling Strategy
- **Graceful degradation** for unknown types
- **Best-effort approximation** for impossible cases  
- **Clear error reporting** for user actionable issues
- **Fallback mechanisms** for each failure mode

This framework can handle the real-world complexity that simple AST parsing cannot.
