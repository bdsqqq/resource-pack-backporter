# Hour-Long Conceptual Model Analysis

## Questioning the Premise: "Combine Strategies Correctly"

### Initial Premise Analysis

**User's Premise**: "We need to not choose a single strategy, but combine them correctly to handle the required cases."

**Questioning the Premise**:
- Is it actually about "combining strategies"?
- Or is it about something fundamentally different?
- What does "combine correctly" actually mean in practice?

### Deeper Analysis: What We Actually Have

#### Real Input Structure (enchanted_book.json):
```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:display_context",
    "cases": [
      {
        "when": ["gui", "fixed", "ground"],
        "model": {
          "type": "minecraft:select", 
          "property": "minecraft:component",
          "component": "minecraft:stored_enchantments",
          "cases": [
            {
              "when": {"minecraft:sharpness": 1},
              "model": {
                "type": "minecraft:model",
                "model": "minecraft:item/enchanted_books/sharpness_1"
              }
            },
            {
              "when": {"minecraft:fire_aspect": 2},
              "model": {
                "type": "minecraft:model", 
                "model": "minecraft:item/enchanted_books/fire_aspect_2"
              }
            }
          ],
          "fallback": {
            "type": "minecraft:model",
            "model": "minecraft:item/books_3d/enchanted_book_3d"
          }
        }
      },
      {
        "when": ["firstperson_righthand", "thirdperson_righthand"],
        "model": {
          "type": "minecraft:model",
          "model": "minecraft:item/books_3d/enchanted_book_3d_open"
        }
      }
    ],
    "fallback": {
      "type": "minecraft:model",
      "model": "minecraft:item/enchanted_book"
    }
  }
}
```

#### Required Output (Multiple Files):

**1. CIT Properties** (OptiFine target):
```properties
# File: cit/sharpness_1.properties
type=item
items=enchanted_book
enchantmentIDs=minecraft:sharpness
enchantmentLevels=1
model=assets/minecraft/models/item/enchanted_books/sharpness_1

# File: cit/fire_aspect_2.properties  
type=item
items=enchanted_book
enchantmentIDs=minecraft:fire_aspect
enchantmentLevels=2
model=assets/minecraft/models/item/enchanted_books/fire_aspect_2
```

**2. Individual Pommel Models** (Pommel target):
```json
// File: models/item/enchanted_books/sharpness_1.json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "minecraft:item/enchanted_books/sharpness_1"
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

// File: models/item/enchanted_books/fire_aspect_2.json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "minecraft:item/enchanted_books/fire_aspect_2"
  },
  "overrides": [
    {
      "predicate": {"pommel:is_ground": 1},
      "model": "minecraft:item/enchanted_books/fire_aspect_2"
    },
    {
      "predicate": {"pommel:is_held": 1},
      "model": "minecraft:item/books_3d/fire_aspect_3d_open"
    },
    {
      "predicate": {"pommel:is_offhand": 1},
      "model": "minecraft:item/books_3d/fire_aspect_3d"
    }
  ]
}
```

**3. Main Item Model** (Pommel coordination):
```json
// File: models/item/enchanted_book.json
{
  "parent": "minecraft:item/handheld",
  "textures": {
    "layer0": "minecraft:item/enchanted_book"
  },
  "overrides": [
    {
      "predicate": {"pommel:is_held": 1},
      "model": "minecraft:item/books_3d/enchanted_book_3d_open"
    },
    {
      "predicate": {"pommel:is_offhand": 1},
      "model": "minecraft:item/books_3d/enchanted_book_3d"
    }
  ]
}
```

### First Conceptual Model: Multi-Target Compilation

**Insight**: This isn't about "combining strategies" - it's about **MULTI-TARGET COMPILATION**.

One input generates multiple outputs for different mod systems:
- **CIT Target**: Enchantment detection logic
- **Pommel Target**: Display context logic  
- **Asset Target**: 3D model and texture copying

**Questioning This Model**: 
- Is this just renaming "strategy combination"?
- Or is there a fundamental difference in approach?
- What does this change about our implementation?

### Second Conceptual Model: Concern Separation Compiler

**Deeper Insight**: It's actually a **CONCERN SEPARATION** problem.

The nested conditional structure contains MULTIPLE CONCERNS:
1. **Enchantment Logic** (for CIT detection)
2. **Display Context Logic** (for Pommel overrides)
3. **Asset References** (for model/texture copying)
4. **Fallback Logic** (for graceful degradation)

Each concern needs to be:
1. **EXTRACTED** from the nested structure
2. **COMPILED** to appropriate target format
3. **LINKED** to work together in final output

**Questioning This Model**:
- Is this actually different from our current strategy approach?
- Does this solve the "multiple handlers on same item" problem?
- How does this handle complex interactions between concerns?

### Third Conceptual Model: Dependency Graph Compiler

**Even Deeper Insight**: The concerns have **DEPENDENCIES** between them.

```
Enchantment Detection (CIT) 
    ↓ depends on
Display Context Logic (Pommel)
    ↓ depends on  
Asset References (3D Models)
    ↓ depends on
Base Item Structure
```

This is actually a **DEPENDENCY GRAPH COMPILATION** problem:
1. **PARSE** nested conditionals into dependency graph
2. **RESOLVE** dependencies in correct order
3. **COMPILE** each node to appropriate target
4. **LINK** outputs to ensure coordination

**Questioning This Model**:
- Are there actually dependencies, or just coordination needs?
- Does dependency order matter for our use case?
- Is this over-engineering the problem?

## Final Conceptual Model: Conditional Decomposition Compiler

### Core Realization

After multiple rounds of questioning, the real insight is:

**It's a CONDITIONAL DECOMPOSITION problem where each "path" through the conditional tree needs to be compiled to multiple targets simultaneously.**

### The Real Process

#### Step 1: Conditional Tree Flattening
```typescript
// Input: Nested conditional structure
{
  display_context: ["gui"] AND stored_enchantments: {sharpness: 1} 
    → model: "enchanted_books/sharpness_1"
  
  display_context: ["firstperson_righthand"] 
    → model: "books_3d/enchanted_book_3d_open"
    
  fallback 
    → model: "enchanted_book"
}

// Flattened: All possible condition paths
[
  {
    conditions: [
      {type: "display_context", values: ["gui", "fixed", "ground"]},
      {type: "stored_enchantments", value: {sharpness: 1}}
    ],
    result: "minecraft:item/enchanted_books/sharpness_1"
  },
  {
    conditions: [
      {type: "display_context", values: ["firstperson_righthand", "thirdperson_righthand"]}
    ],
    result: "minecraft:item/books_3d/enchanted_book_3d_open"
  },
  {
    conditions: [],
    result: "minecraft:item/enchanted_book",
    is_fallback: true
  }
]
```

#### Step 2: Multi-Target Compilation
```typescript
// For each flattened path, compile to ALL applicable targets

Path 1: [display_context: gui] + [stored_enchantments: sharpness:1] → sharpness_1
  ↓
  CIT Target: Generate cit/sharpness_1.properties (enchantment detection)
  ↓  
  Pommel Target: Generate models/item/enchanted_books/sharpness_1.json (display handling)
  ↓
  Asset Target: Ensure books_3d/sharpness_3d.json exists (3D model reference)

Path 2: [display_context: firstperson_righthand] → enchanted_book_3d_open
  ↓
  Pommel Target: Add override to models/item/enchanted_book.json
  ↓
  Asset Target: Ensure books_3d/enchanted_book_3d_open.json exists
```

#### Step 3: Output Coordination
```typescript
// Ensure all generated outputs work together
- CIT properties reference models that Pommel generates
- Pommel overrides reference 3D models that exist
- Main item model coordinates with individual enchantment models
- Fallback behavior preserved across all targets
```

## Detailed Implementation Plan

### High-Level Architecture

```typescript
class ConditionalDecompositionCompiler {
  // 1. Parse nested conditionals into flattened paths
  flattenConditionalTree(itemJson: any): ConditionalPath[]
  
  // 2. Compile each path to all applicable targets  
  compileToTargets(paths: ConditionalPath[]): CompilationResult[]
  
  // 3. Coordinate outputs across targets
  coordinateOutputs(results: CompilationResult[]): WriteRequest[]
}
```

### Level 1: Conditional Tree Flattening

```typescript
class ConditionalTreeFlattener {
  flattenTree(node: ConditionalNode, currentPath: ConditionSet = new ConditionSet()): ConditionalPath[] {
    const paths: ConditionalPath[] = [];
    
    switch (node.type) {
      case 'minecraft:select':
        // For each case, add condition and recurse
        for (const case of node.cases) {
          const newPath = currentPath.clone().addCondition(
            node.property, 
            case.when
          );
          paths.push(...this.flattenTree(case.model, newPath));
        }
        
        // Handle fallback
        if (node.fallback) {
          const fallbackPath = currentPath.clone().markAsFallback(node.property);
          paths.push(...this.flattenTree(node.fallback, fallbackPath));
        }
        break;
        
      case 'minecraft:condition':
        // Handle both true and false branches
        const truePath = currentPath.clone().addCondition(node.property, node.predicate, true);
        const falsePath = currentPath.clone().addCondition(node.property, node.predicate, false);
        
        paths.push(...this.flattenTree(node.on_true, truePath));
        paths.push(...this.flattenTree(node.on_false, falsePath));
        break;
        
      case 'minecraft:model':
        // Leaf node - create final path
        paths.push(new ConditionalPath(currentPath, node.model));
        break;
    }
    
    return paths;
  }
}
```

### Level 2: Multi-Target Compilation

```typescript
class MultiTargetCompiler {
  compilePathsToTargets(paths: ConditionalPath[], context: ItemContext): TargetCompilation[] {
    const compilations: TargetCompilation[] = [];
    
    for (const path of paths) {
      // Determine which targets this path affects
      const applicableTargets = this.determineApplicableTargets(path);
      
      for (const target of applicableTargets) {
        const compilation = this.compilePathToTarget(path, target, context);
        compilations.push(compilation);
      }
    }
    
    return compilations;
  }
  
  private determineApplicableTargets(path: ConditionalPath): CompilationTarget[] {
    const targets: CompilationTarget[] = [];
    
    // If path has enchantment conditions → CIT target
    if (path.hasEnchantmentConditions()) {
      targets.push(CompilationTarget.CIT);
    }
    
    // If path has display context conditions → Pommel target
    if (path.hasDisplayContextConditions()) {
      targets.push(CompilationTarget.POMMEL);
    }
    
    // Always include asset target for model/texture references
    targets.push(CompilationTarget.ASSETS);
    
    return targets;
  }
  
  private compilePathToTarget(path: ConditionalPath, target: CompilationTarget, context: ItemContext): TargetCompilation {
    switch (target) {
      case CompilationTarget.CIT:
        return this.compileToCIT(path, context);
        
      case CompilationTarget.POMMEL:
        return this.compileToPommel(path, context);
        
      case CompilationTarget.ASSETS:
        return this.compileToAssets(path, context);
        
      default:
        throw new Error(`Unknown compilation target: ${target}`);
    }
  }
}
```

### Level 3: Target-Specific Compilation

```typescript
class CITCompiler {
  compile(path: ConditionalPath, context: ItemContext): WriteRequest[] {
    const requests: WriteRequest[] = [];
    
    // Extract enchantment conditions
    const enchantmentConditions = path.getEnchantmentConditions();
    
    for (const enchantment of enchantmentConditions) {
      const citContent = {
        type: 'item',
        items: context.itemId,
        enchantmentIDs: enchantment.id,
        enchantmentLevels: enchantment.level,
        model: `assets/minecraft/models/${path.getModelReference()}`
      };
      
      requests.push({
        type: 'cit-properties',
        path: `cit/${enchantment.id}_${enchantment.level}.properties`,
        content: citContent
      });
    }
    
    return requests;
  }
}

class PommelCompiler {
  compile(path: ConditionalPath, context: ItemContext): WriteRequest[] {
    const requests: WriteRequest[] = [];
    
    // Generate individual model for this path
    const modelContent = {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: this.extractTextureReference(path)
      },
      overrides: this.generatePommelOverrides(path, context)
    };
    
    requests.push({
      type: 'pommel-model',
      path: `item/${this.getModelPath(path, context)}.json`,
      content: modelContent,
      merge: 'merge-overrides'
    });
    
    return requests;
  }
  
  private generatePommelOverrides(path: ConditionalPath, context: ItemContext): PommelOverride[] {
    const overrides: PommelOverride[] = [];
    
    // Extract display context conditions
    const displayContexts = path.getDisplayContextConditions();
    
    for (const context of displayContexts) {
      if (context.includes('firstperson') || context.includes('thirdperson')) {
        overrides.push({
          predicate: {"pommel:is_held": 1},
          model: this.get3DModelReference(path, 'open')
        });
      }
      
      if (context.includes('gui') || context.includes('ground')) {
        overrides.push({
          predicate: {"pommel:is_ground": 1},
          model: path.getModelReference()
        });
      }
    }
    
    return overrides;
  }
}
```

### Level 4: Output Coordination

```typescript
class OutputCoordinator {
  coordinateTargetOutputs(compilations: TargetCompilation[]): WriteRequest[] {
    // Group by target type
    const citRequests = compilations.filter(c => c.target === CompilationTarget.CIT);
    const pommelRequests = compilations.filter(c => c.target === CompilationTarget.POMMEL);
    const assetRequests = compilations.filter(c => c.target === CompilationTarget.ASSETS);
    
    const coordinated: WriteRequest[] = [];
    
    // Process CIT requests (no coordination needed - independent)
    coordinated.push(...citRequests.flatMap(c => c.writeRequests));
    
    // Process Asset requests (no coordination needed - copying)
    coordinated.push(...assetRequests.flatMap(c => c.writeRequests));
    
    // Process Pommel requests (needs coordination for overrides merging)
    const coordinatedPommel = this.coordinatePommelRequests(pommelRequests);
    coordinated.push(...coordinatedPommel);
    
    return coordinated;
  }
  
  private coordinatePommelRequests(pommelCompilations: TargetCompilation[]): WriteRequest[] {
    // Group by model path to merge overrides
    const modelGroups = new Map<string, WriteRequest[]>();
    
    for (const compilation of pommelCompilations) {
      for (const request of compilation.writeRequests) {
        if (request.type === 'pommel-model') {
          if (!modelGroups.has(request.path)) {
            modelGroups.set(request.path, []);
          }
          modelGroups.get(request.path)!.push(request);
        }
      }
    }
    
    // Merge requests for same model path
    const mergedRequests: WriteRequest[] = [];
    for (const [path, requests] of modelGroups) {
      if (requests.length === 1) {
        mergedRequests.push(requests[0]);
      } else {
        mergedRequests.push(this.mergeOverrideRequests(requests));
      }
    }
    
    return mergedRequests;
  }
}
```

## Final Answer: Conditional Decomposition Compiler

**The conceptual model is a CONDITIONAL DECOMPOSITION COMPILER that:**

1. **Flattens** nested conditionals into all possible paths
2. **Identifies** which targets (CIT, Pommel, Assets) each path affects  
3. **Compiles** each path to all applicable targets
4. **Coordinates** outputs to ensure they work together

**This is NOT "strategy combination" - it's SYSTEMATIC DECOMPOSITION of complex conditionals into target-specific outputs with coordination.**
