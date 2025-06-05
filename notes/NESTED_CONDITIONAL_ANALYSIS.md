# Arbitrary Nested Conditional Analysis

## Questioning the Strategy Cooperation Assumption

### The Real Problem: Arbitrary Depth & Complexity

My previous analysis assumed predictable 2-3 level nesting, but Minecraft's conditional system supports arbitrary complexity:

```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:display_context",
    "cases": [
      {
        "when": ["gui"],
        "model": {
          "type": "minecraft:select",
          "property": "minecraft:component",
          "component": "minecraft:stored_enchantments", 
          "cases": [
            {
              "when": {"minecraft:sharpness": 1},
              "model": {
                "type": "minecraft:condition",                    // LEVEL 3
                "property": "minecraft:custom_data",
                "predicate": "some_condition",
                "on_true": {
                  "type": "minecraft:select",                     // LEVEL 4
                  "property": "minecraft:another_component",
                  "cases": [
                    {
                      "when": "some_value",
                      "model": {
                        "type": "minecraft:condition",            // LEVEL 5
                        "property": "minecraft:yet_another_thing",
                        // potentially infinite nesting...
                      }
                    }
                  ],
                  "fallback": {
                    "type": "minecraft:select",                   // COMPLEX FALLBACK
                    "property": "minecraft:different_context",
                    "cases": [...] // more complex nesting in fallback
                  }
                }
              }
            }
          ],
          "fallback": {
            "type": "minecraft:condition",                        // NESTED FALLBACK
            "property": "minecraft:custom_model_data",
            "predicate": {"range": [1, 100]},
            "on_true": {
              "type": "minecraft:select",                         // FALLBACK HAS NESTING
              // more complex logic...
            }
          }
        }
      }
    ]
  }
}
```

## Problem Cases Strategy Cooperation Can't Handle

### 1. Arbitrary Depth
- 5+ levels of nesting
- Unknown conditional types
- New conditional patterns we haven't seen

### 2. Complex Fallbacks
- Fallbacks with their own nested conditionals
- Multiple fallback levels
- Fallbacks that reference different mod systems

### 3. Interleaved Concerns
- Display context nested inside component logic
- Component logic nested inside custom data
- Mixed mod system requirements in same path

### 4. Unknown Conditional Types
```json
{
  "type": "minecraft:custom_condition_type_we_havent_seen",
  "property": "minecraft:unknown_property",
  "complex_predicate": {
    // completely unknown structure
  }
}
```

## Systematic Solution: Conditional Tree Walker

### Approach: Recursive AST Processing

Instead of strategy cooperation, we need a **systematic tree walker** that can handle ANY nested conditional structure:

```typescript
interface ConditionalNode {
  type: string;
  property?: string;
  cases?: ConditionalCase[];
  fallback?: ConditionalNode;
  model?: string;
  // other conditional-specific fields
}

interface ConditionalCase {
  when: any;
  model: ConditionalNode;
}

class ConditionalTreeWalker {
  // Recursively walk the entire conditional tree
  walkConditionalTree(node: ConditionalNode, path: ConditionalPath): ConditionMapping[] {
    const mappings: ConditionMapping[] = [];
    
    switch (node.type) {
      case 'minecraft:select':
        // Handle select logic, recurse into cases
        for (const case of node.cases || []) {
          const newPath = path.addCondition(node.property, case.when);
          mappings.push(...this.walkConditionalTree(case.model, newPath));
        }
        
        // Handle fallback (which might also be complex!)
        if (node.fallback) {
          const fallbackPath = path.addFallback(node.property);
          mappings.push(...this.walkConditionalTree(node.fallback, fallbackPath));
        }
        break;
        
      case 'minecraft:condition':
        // Handle condition logic, recurse into on_true/on_false
        const truePath = path.addCondition(node.property, node.predicate, true);
        const falsePath = path.addCondition(node.property, node.predicate, false);
        
        mappings.push(...this.walkConditionalTree(node.on_true, truePath));
        mappings.push(...this.walkConditionalTree(node.on_false, falsePath));
        break;
        
      case 'minecraft:model':
        // Leaf node - create mapping
        mappings.push(new ConditionMapping(path, node.model));
        break;
        
      default:
        // Unknown type - try to handle gracefully or warn
        console.warn(`Unknown conditional type: ${node.type}`);
        break;
    }
    
    return mappings;
  }
}
```

### Path Tracking System

```typescript
class ConditionalPath {
  private conditions: Condition[] = [];
  
  addCondition(property: string, value: any, result?: boolean): ConditionalPath {
    const newPath = this.clone();
    newPath.conditions.push(new Condition(property, value, result));
    return newPath;
  }
  
  addFallback(property: string): ConditionalPath {
    const newPath = this.clone();
    newPath.conditions.push(new FallbackCondition(property));
    return newPath;
  }
  
  // Convert to appropriate backport mechanism
  toBackportMechanism(): BackportMechanism {
    // Analyze the path to determine what backport mechanism is needed
    if (this.hasStoredEnchantments()) return new CITBackport(this);
    if (this.hasDisplayContext()) return new PommelBackport(this);
    if (this.hasCustomData()) return new CustomModelDataBackport(this);
    // etc.
  }
}
```

### Backport Mechanism Mapping

```typescript
abstract class BackportMechanism {
  abstract generateWriteRequests(path: ConditionalPath, model: string): WriteRequest[];
}

class CITBackport extends BackportMechanism {
  generateWriteRequests(path: ConditionalPath, model: string): WriteRequest[] {
    // Generate CIT properties based on the conditional path
    const conditions = path.getStoredEnchantmentConditions();
    return [
      {
        type: 'cit-properties',
        path: `cit/${this.generateCITFileName(conditions)}.properties`,
        content: this.generateCITContent(conditions, model)
      }
    ];
  }
}

class PommelBackport extends BackportMechanism {
  generateWriteRequests(path: ConditionalPath, model: string): WriteRequest[] {
    // Generate Pommel overrides based on display context conditions
    const contextConditions = path.getDisplayContextConditions();
    return [
      {
        type: 'pommel-model',
        path: `item/${this.getBaseItem(path)}.json`,
        content: this.generatePommelOverrides(contextConditions, model),
        merge: 'merge-overrides'
      }
    ];
  }
}
```

## New Implementation Strategy

### Phase 1: Conditional Tree Parser
1. Build recursive parser for ANY conditional structure
2. Create path tracking system
3. Generate complete condition→model mappings

### Phase 2: Backport Mechanism Factory
1. Analyze conditional paths to determine required backport mechanisms
2. Generate appropriate write requests for each mechanism
3. Handle complex cases with multiple mechanisms

### Phase 3: Graceful Unknown Handling
1. Log unknown conditional types
2. Provide fallback behavior for unrecognized patterns
3. Allow manual overrides for complex cases

## Testing Strategy for Arbitrary Complexity

### Create Test Cases:
1. **5+ Level Nesting**: Test deep conditional trees
2. **Complex Fallbacks**: Fallbacks with their own nesting
3. **Mixed Concerns**: Display context + components + custom data
4. **Unknown Types**: Graceful handling of unrecognized conditionals

This approach ensures we can handle ANY conditional complexity, not just the patterns we've seen so far.
