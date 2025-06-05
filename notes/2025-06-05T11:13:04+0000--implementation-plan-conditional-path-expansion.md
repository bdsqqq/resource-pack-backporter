# Implementation Plan: Conditional Path Expansion Architecture

**Date:** 2025-06-05T11:13:04+0000  
**Context:** Resource Pack Backporter Rewrite  
**Previous Analysis:** `2025-06-05T11:01:55+0000--resource-pack-backporter-architectural-analysis.md`

## Conceptual Model: Compiler, Not Strategy Pattern

**Core Insight:** This is a **data transformation compiler problem**, not an object-oriented design problem.

The 1.21.4+ nested selector structure needs to be:
1. **Parsed** into execution paths
2. **Expanded** into all possible conditions  
3. **Grouped** by target system (CIT vs Pommel vs base)
4. **Generated** into multiple output files

## Before/After Data Structure Analysis

### BEFORE: 1.21.4+ Nested Selectors
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
              "when": { "minecraft:channeling": 1 },
              "model": { "type": "minecraft:model", "model": "minecraft:item/enchanted_books/channeling" }
            },
            {
              "when": { "minecraft:efficiency": 2 },
              "model": { "type": "minecraft:model", "model": "minecraft:item/enchanted_books/efficiency_2" }
            }
          ],
          "fallback": { "model": "minecraft:item/enchanted_books/enchanted_book" }
        }
      },
      {
        "when": ["firstperson_righthand", "thirdperson_righthand"],
        "model": {
          "type": "minecraft:select",
          "property": "minecraft:component", 
          "component": "minecraft:stored_enchantments",
          "cases": [
            {
              "when": { "minecraft:channeling": 1 },
              "model": { "model": "minecraft:item/books_3d/channeling_3d_open" }
            }
          ],
          "fallback": { "model": "minecraft:item/books_3d/book_3d_open" }
        }
      },
      {
        "when": ["firstperson_lefthand", "thirdperson_lefthand"],
        "model": { "model": "minecraft:item/books_3d/book_3d" }
      }
    ]
  }
}
```

### AFTER: Multiple Target Files

**1. Base Model (`models/item/enchanted_book.json`)**
```json
{
  "parent": "minecraft:item/handheld",
  "textures": { "layer0": "minecraft:item/enchanted_books/enchanted_book" },
  "overrides": [
    { "predicate": { "pommel:is_ground": 1 }, "model": "minecraft:item/enchanted_books/enchanted_book" },
    { "predicate": { "pommel:is_held": 1 }, "model": "minecraft:item/books_3d/book_3d_open" },
    { "predicate": { "pommel:is_offhand": 1 }, "model": "minecraft:item/books_3d/book_3d" }
  ]
}
```

**2. CIT Properties (`optifine/cit/channeling_1.properties`)**
```
items=enchanted_book
enchantmentIDs=channeling
enchantmentLevels=1
model=minecraft:item/enchanted_books/channeling
```

**3. Enhanced 3D Model (`models/item/books_3d/channeling_3d_open.json`)**
```json
{
  "parent": "minecraft:item/books_3d/template_book_open",
  "textures": {
    "0": "item/books_3d/channeling_3d",
    "1": "item/books_3d/channeling_effect_3d"
  }
}
```

## Execution Path Analysis

From the nested structure, we can extract these paths:

1. `display_context=gui + enchantment=channeling:1` → **CIT override** to channeling sprite
2. `display_context=gui + enchantment=efficiency:2` → **CIT override** to efficiency_2 sprite  
3. `display_context=gui + enchantment=ANY_OTHER` → **Base texture** fallback
4. `display_context=firstperson_righthand + enchantment=channeling:1` → **Pommel override** to channeling_3d_open
5. `display_context=firstperson_righthand + enchantment=ANY_OTHER` → **Pommel override** to book_3d_open
6. `display_context=firstperson_lefthand + enchantment=ANY` → **Pommel override** to book_3d

## Implementation Architecture

### Phase 1: Recursive Path Extractor

```typescript
interface ExecutionPath {
  conditions: {
    displayContext: string[];
    enchantment?: { type: string, level: number };
    component?: string;
  };
  targetModel: string;
  priority: number;
  isFallback: boolean;
}

class ConditionalPathExtractor {
  extractAllPaths(sourceModel: any): ExecutionPath[] {
    return this.traverseSelector(sourceModel.model, []);
  }

  private traverseSelector(node: any, currentConditions: any[]): ExecutionPath[] {
    if (node.type === 'minecraft:model') {
      // Leaf node - create execution path
      return [{
        conditions: this.mergeConditions(currentConditions),
        targetModel: node.model,
        priority: this.calculatePriority(currentConditions),
        isFallback: false
      }];
    }

    if (node.type === 'minecraft:select') {
      const paths: ExecutionPath[] = [];
      
      // Process each case
      for (const case of node.cases) {
        const newConditions = [...currentConditions, {
          property: node.property,
          component: node.component,
          when: case.when
        }];
        paths.push(...this.traverseSelector(case.model, newConditions));
      }

      // Process fallback
      if (node.fallback) {
        const fallbackConditions = [...currentConditions, {
          property: node.property,
          component: node.component,
          when: 'FALLBACK'
        }];
        const fallbackPaths = this.traverseSelector(node.fallback, fallbackConditions);
        fallbackPaths.forEach(path => path.isFallback = true);
        paths.push(...fallbackPaths);
      }

      return paths;
    }

    throw new Error(`Unknown node type: ${node.type}`);
  }
}
```

### Phase 2: Target System Mapper

```typescript
interface OutputTarget {
  type: 'pommel_model' | 'cit_property' | 'base_texture' | 'enhanced_model';
  file: string;
  content: any;
  priority: number;
}

class TargetSystemMapper {
  mapPathsToTargets(paths: ExecutionPath[]): OutputTarget[] {
    const targets: OutputTarget[] = [];

    // Group paths by target requirements
    const groupedPaths = this.groupPathsByTarget(paths);

    // Generate base model with Pommel overrides
    targets.push(this.generatePommelModel(groupedPaths.pommel));

    // Generate CIT properties for enchantment-specific GUI display
    targets.push(...this.generateCITProperties(groupedPaths.enchantmentSpecific));

    // Generate enhanced 3D models with animation data preserved
    targets.push(...this.generateEnhanced3DModels(groupedPaths.animated));

    return targets;
  }

  private generatePommelModel(paths: ExecutionPath[]): OutputTarget {
    const overrides = [];

    // Convert display contexts to Pommel predicates
    const contextMapping = {
      'gui': null, // Base texture, no override needed
      'fixed': null,
      'ground': { predicate: { 'pommel:is_ground': 1 }, model: 'fallback_model' },
      'firstperson_righthand': { predicate: { 'pommel:is_held': 1 }, model: null },
      'thirdperson_righthand': { predicate: { 'pommel:is_held': 1 }, model: null },
      'firstperson_lefthand': { predicate: { 'pommel:is_offhand': 1 }, model: null },
      'thirdperson_lefthand': { predicate: { 'pommel:is_offhand': 1 }, model: null }
    };

    // Deduplicate and merge overrides
    const deduplicatedOverrides = this.deduplicateOverrides(overrides);

    return {
      type: 'pommel_model',
      file: 'models/item/enchanted_book.json',
      content: {
        parent: 'minecraft:item/handheld',
        textures: { layer0: 'minecraft:item/enchanted_books/enchanted_book' },
        overrides: deduplicatedOverrides
      },
      priority: 1
    };
  }

  private generateCITProperties(paths: ExecutionPath[]): OutputTarget[] {
    return paths
      .filter(path => path.conditions.enchantment)
      .map(path => ({
        type: 'cit_property',
        file: `optifine/cit/${path.conditions.enchantment.type}_${path.conditions.enchantment.level}.properties`,
        content: {
          items: 'enchanted_book',
          enchantmentIDs: path.conditions.enchantment.type,
          enchantmentLevels: path.conditions.enchantment.level,
          model: path.targetModel
        },
        priority: 2
      }));
  }
}
```

### Phase 3: Multi-File Generator

```typescript
class BackportFileGenerator {
  generateAllFiles(targets: OutputTarget[]): void {
    // Sort by priority to ensure correct generation order
    const sortedTargets = targets.sort((a, b) => a.priority - b.priority);

    for (const target of sortedTargets) {
      switch (target.type) {
        case 'pommel_model':
          this.writePommelModel(target);
          break;
        case 'cit_property':
          this.writeCITProperty(target);
          break;
        case 'enhanced_model':
          this.writeEnhancedModel(target);
          break;
        case 'base_texture':
          this.copyTexture(target);
          break;
      }
    }
  }

  private deduplicateOverrides(overrides: any[]): any[] {
    const seen = new Set();
    return overrides.filter(override => {
      const key = JSON.stringify({
        predicate: override.predicate,
        model: override.model
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
```

## Critical Implementation Details

### 1. **Condition Merging Logic**
```typescript
private mergeConditions(conditionChain: any[]): any {
  const merged = {
    displayContext: [],
    enchantment: null,
    component: null
  };

  for (const condition of conditionChain) {
    if (condition.property === 'minecraft:display_context') {
      merged.displayContext.push(...condition.when);
    }
    if (condition.property === 'minecraft:component') {
      merged.component = condition.component;
      if (condition.when !== 'FALLBACK') {
        merged.enchantment = this.parseEnchantment(condition.when);
      }
    }
  }

  return merged;
}
```

### 2. **Animation Data Preservation**
```typescript
private preserveAnimationData(sourceModel: any, targetModel: any): any {
  // Copy animation-related properties
  if (sourceModel.textures) {
    targetModel.textures = { ...sourceModel.textures, ...targetModel.textures };
  }
  if (sourceModel.elements) {
    targetModel.elements = sourceModel.elements.map(element => ({
      ...element,
      light_emission: element.light_emission // Preserve lighting effects
    }));
  }
  return targetModel;
}
```

### 3. **Duplicate Prevention**
```typescript
private deduplicateOverrides(overrides: any[]): any[] {
  const uniqueOverrides = new Map();
  
  for (const override of overrides) {
    const key = JSON.stringify(override.predicate);
    if (!uniqueOverrides.has(key)) {
      uniqueOverrides.set(key, override);
    } else {
      // Log conflict for debugging
      console.warn(`Duplicate predicate detected: ${key}`);
    }
  }
  
  return Array.from(uniqueOverrides.values());
}
```

## Testing Strategy

### 1. **Unit Tests for Path Extraction**
```typescript
describe('ConditionalPathExtractor', () => {
  it('should extract all execution paths from nested selectors', () => {
    const input = complexNestedSelector;
    const paths = extractor.extractAllPaths(input);
    expect(paths).toHaveLength(6);
    expect(paths[0].conditions.displayContext).toContain('gui');
    expect(paths[0].conditions.enchantment.type).toBe('channeling');
  });
});
```

### 2. **Integration Tests for Full Transformation**
```typescript
describe('Full Backport Process', () => {
  it('should generate working pack matching reference', () => {
    const sourceFiles = loadSourcePack();
    const generatedPack = processBackport(sourceFiles);
    const referencePack = loadReferencePack();
    
    expect(generatedPack).toMatchStructure(referencePack);
  });
});
```

## Success Criteria

1. **✅ Main hand visibility:** Books show 3D models in main hand
2. **✅ Animation preservation:** Channeling shows moving lightning effects  
3. **✅ No duplicate predicates:** Each Pommel predicate appears exactly once
4. **✅ CIT functionality:** Enchanted books show correct sprites in GUI
5. **✅ Reference pack match:** Generated output matches working reference exactly

## Implementation Order

1. **Phase 1:** Build and test path extractor with simple cases
2. **Phase 2:** Implement target mapping with Pommel predicate generation
3. **Phase 3:** Add CIT property generation  
4. **Phase 4:** Implement animation data preservation
5. **Phase 5:** Add comprehensive deduplication logic
6. **Phase 6:** Integration testing against reference pack
