# Detailed Implementation Plan - Conditional Decomposition Compiler

## Executive Summary

**Core Insight**: We need a **Conditional Decomposition Compiler** that flattens nested conditionals into all possible paths, then compiles each path to multiple targets (CIT, Pommel, Assets) simultaneously.

**This replaces our current "strategy selection" approach with "systematic decomposition + multi-target compilation".**

## High-Level Architecture Overview

### Level 1: System Components
1. **Conditional Tree Parser** - Parse nested JSON into tree structure
2. **Path Flattener** - Flatten tree into all possible condition paths
3. **Multi-Target Compiler** - Compile each path to applicable targets
4. **Output Coordinator** - Merge and coordinate target outputs
5. **File Generator** - Generate final write requests

### Level 2: Processing Pipeline
```
Input JSON → Parse Tree → Flatten Paths → Compile Targets → Coordinate Outputs → Generate Files
```

### Level 3: Data Flow
```typescript
ItemDefinition 
  ↓ ConditionalTreeParser
ConditionalTree
  ↓ PathFlattener  
ConditionalPath[]
  ↓ MultiTargetCompiler
TargetCompilation[]
  ↓ OutputCoordinator
WriteRequest[]
  ↓ FileGenerator
Generated Files
```

## Detailed Implementation Plan

### Phase 1: Core Data Structures (2 hours)

#### ConditionalNode Types
```typescript
interface ConditionalNode {
  type: 'select' | 'condition' | 'model' | 'reference';
  [key: string]: any;
}

interface SelectNode extends ConditionalNode {
  type: 'select';
  property: string;
  cases: ConditionalCase[];
  fallback?: ConditionalNode;
}

interface ConditionNode extends ConditionalNode {
  type: 'condition';
  property: string;
  predicate: any;
  on_true: ConditionalNode;
  on_false: ConditionalNode;
}

interface ModelNode extends ConditionalNode {
  type: 'model';
  model: string;
}
```

#### ConditionalPath System
```typescript
class ConditionalPath {
  private conditions: Condition[] = [];
  private resultModel: string;
  private isFallback: boolean = false;
  
  addCondition(property: string, value: any, result?: boolean): ConditionalPath {
    const newPath = this.clone();
    newPath.conditions.push(new Condition(property, value, result));
    return newPath;
  }
  
  hasEnchantmentConditions(): boolean {
    return this.conditions.some(c => c.property === 'minecraft:stored_enchantments');
  }
  
  hasDisplayContextConditions(): boolean {
    return this.conditions.some(c => c.property === 'minecraft:display_context');
  }
  
  hasWritableBookContentConditions(): boolean {
    return this.conditions.some(c => c.property === 'minecraft:writable_book_content');
  }
  
  getEnchantmentConditions(): EnchantmentCondition[] {
    return this.conditions
      .filter(c => c.property === 'minecraft:stored_enchantments')
      .map(c => new EnchantmentCondition(c.value));
  }
  
  getDisplayContextConditions(): string[] {
    return this.conditions
      .filter(c => c.property === 'minecraft:display_context')
      .flatMap(c => Array.isArray(c.value) ? c.value : [c.value]);
  }
}
```

### Phase 2: Conditional Tree Parser (3 hours)

#### Parser Implementation
```typescript
class ConditionalTreeParser {
  parse(itemJson: any): ConditionalTree {
    if (!itemJson.model) {
      throw new Error('Item definition missing model field');
    }
    
    const rootNode = this.parseNode(itemJson.model);
    return new ConditionalTree(rootNode, itemJson);
  }
  
  private parseNode(nodeJson: any): ConditionalNode {
    const nodeType = nodeJson.type || 'model';
    
    switch (nodeType) {
      case 'minecraft:select':
        return this.parseSelectNode(nodeJson);
        
      case 'minecraft:condition':
        return this.parseConditionNode(nodeJson);
        
      case 'minecraft:model':
        return this.parseModelNode(nodeJson);
        
      case 'minecraft:reference':
        return this.parseReferenceNode(nodeJson);
        
      default:
        console.warn(`Unknown node type: ${nodeType}, treating as model`);
        return this.parseModelNode(nodeJson);
    }
  }
  
  private parseSelectNode(nodeJson: any): SelectNode {
    const cases: ConditionalCase[] = [];
    
    for (const caseJson of nodeJson.cases || []) {
      cases.push({
        when: caseJson.when,
        model: this.parseNode(caseJson.model)
      });
    }
    
    return {
      type: 'select',
      property: nodeJson.property,
      component: nodeJson.component, // For stored_enchantments
      cases: cases,
      fallback: nodeJson.fallback ? this.parseNode(nodeJson.fallback) : undefined
    };
  }
  
  private parseConditionNode(nodeJson: any): ConditionNode {
    return {
      type: 'condition',
      property: nodeJson.property,
      predicate: nodeJson.predicate || nodeJson.value,
      on_true: this.parseNode(nodeJson.on_true),
      on_false: this.parseNode(nodeJson.on_false)
    };
  }
  
  private parseModelNode(nodeJson: any): ModelNode {
    return {
      type: 'model',
      model: nodeJson.model || nodeJson // Handle both object and string forms
    };
  }
}
```

#### Tree Validation
```typescript
class ConditionalTreeValidator {
  validate(tree: ConditionalTree): ValidationResult {
    const issues: ValidationIssue[] = [];
    
    // Check for circular references
    const circularRefs = this.detectCircularReferences(tree.root);
    issues.push(...circularRefs);
    
    // Check for unreachable paths
    const unreachablePaths = this.detectUnreachablePaths(tree.root);
    issues.push(...unreachablePaths);
    
    // Check for missing model references
    const missingModels = this.detectMissingModelReferences(tree.root);
    issues.push(...missingModels);
    
    return new ValidationResult(issues);
  }
  
  private detectCircularReferences(node: ConditionalNode, visited = new Set<string>()): ValidationIssue[] {
    // Implementation for cycle detection
    // Similar to our previous cycle detection logic
  }
}
```

### Phase 3: Path Flattener (4 hours)

#### Core Flattening Logic
```typescript
class PathFlattener {
  flattenTree(tree: ConditionalTree): ConditionalPath[] {
    const paths: ConditionalPath[] = [];
    const rootPath = new ConditionalPath();
    
    this.flattenNode(tree.root, rootPath, paths);
    
    // Validate that we have reasonable number of paths
    if (paths.length > 10000) {
      console.warn(`Large number of paths generated: ${paths.length}. Consider optimization.`);
    }
    
    return paths;
  }
  
  private flattenNode(node: ConditionalNode, currentPath: ConditionalPath, results: ConditionalPath[]): void {
    switch (node.type) {
      case 'select':
        this.flattenSelectNode(node as SelectNode, currentPath, results);
        break;
        
      case 'condition':
        this.flattenConditionNode(node as ConditionNode, currentPath, results);
        break;
        
      case 'model':
        this.flattenModelNode(node as ModelNode, currentPath, results);
        break;
        
      case 'reference':
        this.flattenReferenceNode(node as ReferenceNode, currentPath, results);
        break;
    }
  }
  
  private flattenSelectNode(node: SelectNode, currentPath: ConditionalPath, results: ConditionalPath[]): void {
    // Handle each case
    for (const case of node.cases) {
      const newPath = currentPath.addCondition(node.property, case.when);
      
      // Special handling for component-based selections
      if (node.component) {
        const componentPath = newPath.addComponent(node.component);
        this.flattenNode(case.model, componentPath, results);
      } else {
        this.flattenNode(case.model, newPath, results);
      }
    }
    
    // Handle fallback
    if (node.fallback) {
      const fallbackPath = currentPath.addFallback(node.property);
      this.flattenNode(node.fallback, fallbackPath, results);
    }
  }
  
  private flattenConditionNode(node: ConditionNode, currentPath: ConditionalPath, results: ConditionalPath[]): void {
    // Handle true branch
    const truePath = currentPath.addCondition(node.property, node.predicate, true);
    this.flattenNode(node.on_true, truePath, results);
    
    // Handle false branch  
    const falsePath = currentPath.addCondition(node.property, node.predicate, false);
    this.flattenNode(node.on_false, falsePath, results);
  }
  
  private flattenModelNode(node: ModelNode, currentPath: ConditionalPath, results: ConditionalPath[]): void {
    // Terminal node - create final path
    const finalPath = currentPath.setResult(node.model);
    results.push(finalPath);
  }
}
```

#### Path Optimization
```typescript
class PathOptimizer {
  optimizePaths(paths: ConditionalPath[]): ConditionalPath[] {
    // Remove duplicate paths
    const deduplicated = this.removeDuplicates(paths);
    
    // Merge similar paths where possible
    const merged = this.mergeSimilarPaths(deduplicated);
    
    // Sort by specificity (most specific first)
    const sorted = this.sortBySpecificity(merged);
    
    return sorted;
  }
  
  private removeDuplicates(paths: ConditionalPath[]): ConditionalPath[] {
    const seen = new Set<string>();
    const unique: ConditionalPath[] = [];
    
    for (const path of paths) {
      const signature = path.getSignature();
      if (!seen.has(signature)) {
        seen.add(signature);
        unique.push(path);
      }
    }
    
    return unique;
  }
  
  private mergeSimilarPaths(paths: ConditionalPath[]): ConditionalPath[] {
    // Group paths with same result but different conditions
    const resultGroups = new Map<string, ConditionalPath[]>();
    
    for (const path of paths) {
      const result = path.getResult();
      if (!resultGroups.has(result)) {
        resultGroups.set(result, []);
      }
      resultGroups.get(result)!.push(path);
    }
    
    // For each group, see if we can merge conditions
    const merged: ConditionalPath[] = [];
    for (const [result, groupPaths] of resultGroups) {
      if (groupPaths.length === 1) {
        merged.push(groupPaths[0]);
      } else {
        // Try to merge paths with compatible conditions
        const mergedPath = this.attemptPathMerge(groupPaths);
        merged.push(...mergedPath);
      }
    }
    
    return merged;
  }
}
```

### Phase 4: Multi-Target Compiler (5 hours)

#### Target Determination
```typescript
class TargetAnalyzer {
  determineTargets(path: ConditionalPath): CompilationTarget[] {
    const targets: CompilationTarget[] = [];
    
    // CIT Target: If path has enchantment or custom data conditions
    if (this.needsCITTarget(path)) {
      targets.push(CompilationTarget.CIT);
    }
    
    // Pommel Target: If path has display context conditions
    if (this.needsPommelTarget(path)) {
      targets.push(CompilationTarget.POMMEL);
    }
    
    // Asset Target: Always needed for model/texture copying
    targets.push(CompilationTarget.ASSETS);
    
    return targets;
  }
  
  private needsCITTarget(path: ConditionalPath): boolean {
    return path.hasEnchantmentConditions() || 
           path.hasCustomDataConditions() ||
           path.hasNBTConditions();
  }
  
  private needsPommelTarget(path: ConditionalPath): boolean {
    return path.hasDisplayContextConditions() ||
           path.hasWritableBookContentConditions() ||
           path.requiresContextualModels();
  }
}
```

#### CIT Compiler
```typescript
class CITTargetCompiler {
  compile(path: ConditionalPath, context: CompilationContext): TargetCompilation {
    const writeRequests: WriteRequest[] = [];
    
    if (path.hasEnchantmentConditions()) {
      writeRequests.push(...this.compileEnchantmentConditions(path, context));
    }
    
    if (path.hasCustomDataConditions()) {
      writeRequests.push(...this.compileCustomDataConditions(path, context));
    }
    
    return new TargetCompilation(CompilationTarget.CIT, writeRequests);
  }
  
  private compileEnchantmentConditions(path: ConditionalPath, context: CompilationContext): WriteRequest[] {
    const requests: WriteRequest[] = [];
    const enchantments = path.getEnchantmentConditions();
    
    for (const enchantment of enchantments) {
      const citContent = this.generateCITProperties(enchantment, path, context);
      const filename = this.generateCITFilename(enchantment);
      
      requests.push({
        type: 'cit-properties',
        path: `cit/${filename}.properties`,
        content: citContent,
        merge: 'replace',
        priority: 1
      });
    }
    
    return requests;
  }
  
  private generateCITProperties(enchantment: EnchantmentCondition, path: ConditionalPath, context: CompilationContext): CITProperties {
    return {
      type: 'item',
      items: context.itemId,
      enchantmentIDs: enchantment.getId(),
      enchantmentLevels: enchantment.getLevel(),
      model: `assets/minecraft/models/${this.resolveModelPath(path, context)}`
    };
  }
  
  private generateCITFilename(enchantment: EnchantmentCondition): string {
    const baseName = enchantment.getId().replace('minecraft:', '');
    const level = enchantment.getLevel();
    return `${baseName}_${level}`;
  }
}
```

#### Pommel Compiler
```typescript
class PommelTargetCompiler {
  compile(path: ConditionalPath, context: CompilationContext): TargetCompilation {
    const writeRequests: WriteRequest[] = [];
    
    // Generate individual model for this path (if it has specific model)
    if (this.shouldGenerateIndividualModel(path)) {
      writeRequests.push(this.generateIndividualModel(path, context));
    }
    
    // Generate main item model overrides
    if (this.shouldGenerateMainModelOverrides(path)) {
      writeRequests.push(this.generateMainModelOverrides(path, context));
    }
    
    return new TargetCompilation(CompilationTarget.POMMEL, writeRequests);
  }
  
  private generateIndividualModel(path: ConditionalPath, context: CompilationContext): WriteRequest {
    const modelContent = {
      parent: this.determineParent(path, context),
      textures: this.generateTextures(path, context),
      overrides: this.generatePommelOverrides(path, context)
    };
    
    const modelPath = this.resolveIndividualModelPath(path, context);
    
    return {
      type: 'pommel-model',
      path: `item/${modelPath}.json`,
      content: modelContent,
      merge: 'merge-overrides',
      priority: 2
    };
  }
  
  private generatePommelOverrides(path: ConditionalPath, context: CompilationContext): PommelOverride[] {
    const overrides: PommelOverride[] = [];
    const displayContexts = path.getDisplayContextConditions();
    
    // Ground/GUI contexts
    if (this.includesGUIContexts(displayContexts)) {
      overrides.push({
        predicate: {"pommel:is_ground": 1},
        model: this.resolve2DModelReference(path, context)
      });
    }
    
    // Held contexts  
    if (this.includesHeldContexts(displayContexts)) {
      overrides.push({
        predicate: {"pommel:is_held": 1},
        model: this.resolve3DModelReference(path, context, 'open')
      });
    }
    
    // Offhand contexts
    if (this.includesOffhandContexts(displayContexts)) {
      overrides.push({
        predicate: {"pommel:is_offhand": 1},
        model: this.resolve3DModelReference(path, context, 'closed')
      });
    }
    
    return overrides;
  }
}
```

#### Asset Compiler
```typescript
class AssetTargetCompiler {
  compile(path: ConditionalPath, context: CompilationContext): TargetCompilation {
    const writeRequests: WriteRequest[] = [];
    
    // Ensure referenced models exist
    const modelRefs = this.extractModelReferences(path);
    for (const modelRef of modelRefs) {
      writeRequests.push(this.generateModelCopyRequest(modelRef, context));
    }
    
    // Ensure referenced textures exist
    const textureRefs = this.extractTextureReferences(path);
    for (const textureRef of textureRefs) {
      writeRequests.push(this.generateTextureCopyRequest(textureRef, context));
    }
    
    return new TargetCompilation(CompilationTarget.ASSETS, writeRequests);
  }
  
  private extractModelReferences(path: ConditionalPath): ModelReference[] {
    const references: ModelReference[] = [];
    
    // Main model reference
    const mainModel = path.getResult();
    references.push(new ModelReference(mainModel, 'main'));
    
    // 3D model references (inferred from path characteristics)
    if (path.hasDisplayContextConditions()) {
      const base3DModel = this.infer3DModelReference(path);
      references.push(new ModelReference(base3DModel, '3d_base'));
      references.push(new ModelReference(`${base3DModel}_open`, '3d_open'));
    }
    
    return references;
  }
}
```

### Phase 5: Output Coordination (3 hours)

#### Coordination Strategy
```typescript
class OutputCoordinator {
  coordinate(compilations: TargetCompilation[]): WriteRequest[] {
    // Group by target type
    const targetGroups = this.groupByTarget(compilations);
    
    const coordinated: WriteRequest[] = [];
    
    // Process each target group
    coordinated.push(...this.coordinateCITRequests(targetGroups.get(CompilationTarget.CIT) || []));
    coordinated.push(...this.coordinatePommelRequests(targetGroups.get(CompilationTarget.POMMEL) || []));
    coordinated.push(...this.coordinateAssetRequests(targetGroups.get(CompilationTarget.ASSETS) || []));
    
    return coordinated;
  }
  
  private coordinatePommelRequests(pommelCompilations: TargetCompilation[]): WriteRequest[] {
    // Group by file path to merge overrides
    const fileGroups = new Map<string, WriteRequest[]>();
    
    for (const compilation of pommelCompilations) {
      for (const request of compilation.writeRequests) {
        const path = request.path;
        if (!fileGroups.has(path)) {
          fileGroups.set(path, []);
        }
        fileGroups.get(path)!.push(request);
      }
    }
    
    // Merge requests for same file
    const merged: WriteRequest[] = [];
    for (const [path, requests] of fileGroups) {
      if (requests.length === 1) {
        merged.push(requests[0]);
      } else {
        merged.push(this.mergeOverrideRequests(path, requests));
      }
    }
    
    return merged;
  }
  
  private mergeOverrideRequests(path: string, requests: WriteRequest[]): WriteRequest {
    // Sort by priority
    const sortedRequests = requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    // Base on highest priority request
    const baseRequest = sortedRequests[0];
    const mergedContent = { ...baseRequest.content };
    
    // Merge overrides from all requests
    const allOverrides: PommelOverride[] = [];
    for (const request of sortedRequests) {
      if (request.content.overrides) {
        allOverrides.push(...request.content.overrides);
      }
    }
    
    // Remove duplicate overrides
    mergedContent.overrides = this.deduplicateOverrides(allOverrides);
    
    return {
      ...baseRequest,
      content: mergedContent
    };
  }
}
```

### Phase 6: Integration with Existing System (2 hours)

#### Replace Current Strategy System
```typescript
// Replace current handler system with conditional decomposition
class ConditionalDecompositionHandler implements ItemHandler {
  name = "conditional-decomposition";
  
  canHandle(jsonNode: any, context: ProcessingContext): boolean {
    // This handler handles ALL items with conditional structures
    return this.hasConditionalStructure(jsonNode);
  }
  
  process(jsonNode: any, context: ProcessingContext): WriteRequest[] {
    try {
      // 1. Parse conditional tree
      const tree = this.parser.parse(jsonNode);
      
      // 2. Validate tree
      const validation = this.validator.validate(tree);
      if (!validation.isValid()) {
        console.warn(`Validation issues for ${context.itemId}:`, validation.getIssues());
      }
      
      // 3. Flatten to paths
      const paths = this.flattener.flattenTree(tree);
      console.log(`🔍 Flattened ${context.itemId} into ${paths.length} conditional paths`);
      
      // 4. Compile to targets
      const compilations = this.compiler.compileToTargets(paths, context);
      
      // 5. Coordinate outputs
      const writeRequests = this.coordinator.coordinate(compilations);
      
      console.log(`📝 Generated ${writeRequests.length} write requests for ${context.itemId}`);
      return writeRequests;
      
    } catch (error) {
      console.error(`❌ Failed to process ${context.itemId}:`, error);
      // Fall back to simple processing
      return this.fallbackToSimpleProcessing(jsonNode, context);
    }
  }
  
  private hasConditionalStructure(jsonNode: any): boolean {
    // Check if the JSON contains conditional structures
    return this.findConditionalNodes(jsonNode).length > 0;
  }
}
```

## Implementation Timeline

### Week 1: Core Infrastructure
- **Days 1-2**: Data structures and interfaces
- **Days 3-4**: Conditional tree parser
- **Day 5**: Parser testing and validation

### Week 2: Path Processing  
- **Days 1-3**: Path flattener implementation
- **Days 4-5**: Path optimization and testing

### Week 3: Multi-Target Compilation
- **Days 1-2**: CIT compiler
- **Days 3-4**: Pommel compiler  
- **Day 5**: Asset compiler

### Week 4: Integration and Testing
- **Days 1-2**: Output coordination
- **Days 3-4**: Integration with existing system
- **Day 5**: End-to-end testing

## Success Metrics

1. **Correctness**: Generated outputs match reference pack exactly
2. **Performance**: Process Better Fresher 3D Books pack in <30 seconds
3. **Maintainability**: Clean separation of concerns, testable components
4. **Extensibility**: Easy to add new target types (new mod systems)

This plan provides systematic decomposition of complex conditionals while maintaining perfect 1:1 parity with source packs.
