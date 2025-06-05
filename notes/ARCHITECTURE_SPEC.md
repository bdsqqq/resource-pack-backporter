# Resource Pack Backporter - Strategy Architecture Specification

## Overview

This specification defines a strategy pattern-based architecture for the resource pack backporter. The system is designed around composition of small, focused strategies that can be combined to handle any pack complexity without combinatorial explosion.

## Core Principles

1. **Pure Strategy Composition**: Each handler is a black box that examines JSON and decides what files to write
2. **No Combinatorial Strategies**: Handlers compose naturally - no "Pure" vs "Combined" strategies needed
3. **Safe File Operations**: Central file manager prevents conflicts and handles merging
4. **Testable in Isolation**: Each strategy can be developed and tested independently
5. **Extensible**: Adding new mod support requires only implementing interfaces

## Architecture Overview

```
Input Pack → Introspection → Handler Strategies → Write Requests → File Writers → Output Pack
```

### Processing Pipeline

1. **Introspection**: Analyze pack structure and item definitions
2. **Handler Strategy Execution**: Each handler examines item JSON and emits write requests
3. **Request Merging**: Merge conflicting requests using merger strategies
4. **File Writing**: Execute write requests using appropriate file writers

## Core Interfaces

### ItemHandler Strategy

```typescript
interface ItemHandler {
  name: string;
  canHandle(jsonNode: any, context: ProcessingContext): boolean;
  process(jsonNode: any, context: ProcessingContext): WriteRequest[];
}
```

**Contract:**
- `canHandle()`: Must be pure function, no side effects
- `process()`: Only called if `canHandle()` returns true
- Must return array of write requests (can be empty)
- Should not write files directly

### FileWriter Strategy

```typescript
interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}
```

**Contract:**
- `canWrite()`: Must be pure function based only on request type
- `write()`: Must handle file creation, directory creation, error handling
- Should be idempotent (safe to call multiple times)

### RequestMerger Strategy

```typescript
interface RequestMerger {
  name: string;
  canMerge(requests: WriteRequest[]): boolean;
  merge(requests: WriteRequest[]): WriteRequest;
}
```

**Contract:**
- `canMerge()`: Must check if all requests are same type and path
- `merge()`: Must produce single request that represents merged intent
- Must handle merge conflicts gracefully

## Data Types

### WriteRequest

```typescript
interface WriteRequest {
  type: 'pommel-model' | 'cit-properties' | 'vanilla-model' | 'texture-copy';
  path: string;          // Relative path within output pack
  content: any;          // Type-specific content
  merge?: MergeStrategy; // How to handle conflicts
  priority?: number;     // Higher priority wins conflicts (default: 0)
}

type MergeStrategy = 'replace' | 'merge-overrides' | 'merge-properties' | 'append';
```

### ProcessingContext

```typescript
interface ProcessingContext {
  itemId: string;
  itemPath: string;
  packStructure: ResourcePackStructure;
  outputDir: string;
}
```

## Handler Strategies

### DisplayContextHandler

**Responsibility**: Handle display context selection (GUI vs hand vs ground models)

**Triggers on**: 
- `property: "minecraft:display_context"` 
- Items with context-based model selection

**Emits**: 
- `pommel-model` requests with Pommel overrides for hand/ground contexts
- Base model with 2D texture for GUI contexts

### StoredEnchanmentsHandler

**Responsibility**: Handle NBT-based enchantment variations

**Triggers on**:
- `component: "minecraft:stored_enchantments"`
- Conditional models based on enchantment data

**Emits**:
- `cit-properties` requests for each enchantment variant
- `vanilla-model` requests for texture variants

### WritableBookContentHandler

**Responsibility**: Handle writable book content variations

**Triggers on**:
- `component: "minecraft:writable_book_content"`
- Book open/closed state variations

**Emits**:
- `pommel-model` requests with overrides for open/closed states

### BaseItemHandler

**Responsibility**: Fallback handler for vanilla item models

**Triggers on**: Always (lowest priority)

**Emits**:
- `vanilla-model` requests for basic item models
- `texture-copy` requests for associated textures

## File Writers

### PommelModelWriter

**Handles**: `pommel-model` requests

**Output Format**:
```json
{
  "parent": "minecraft:item/generated",
  "textures": { "layer0": "..." },
  "overrides": [
    { "predicate": { "pommel:is_held": 1.0 }, "model": "..." }
  ]
}
```

### CITPropertiesWriter

**Handles**: `cit-properties` requests

**Output Format**:
```properties
type=item
items=minecraft:enchanted_book
nbt.StoredEnchantments.[0].id=minecraft:sharpness
nbt.StoredEnchantments.[0].lvl=1
model=custom/enchantments/sharpness_1
```

### VanillaModelWriter

**Handles**: `vanilla-model` requests

**Output Format**: Standard Minecraft model JSON

### TextureCopyWriter

**Handles**: `texture-copy` requests

**Behavior**: Copies texture files from input to output pack

## Request Mergers

### OverridesMerger

**Handles**: Multiple `pommel-model` requests for same item

**Strategy**: Merge `overrides` arrays, preserve base model from highest priority

### PropertiesMerger

**Handles**: Multiple `cit-properties` requests for same path

**Strategy**: Merge property objects, highest priority wins conflicts

## File Structure

```
src/
├── introspection.ts                   # ResourcePackIntrospector
├── handlers/
│   ├── index.ts                       # ItemHandler interface + registry
│   ├── display-context.ts             # DisplayContextHandler
│   ├── stored-enchantments.ts         # StoredEnchanmentsHandler  
│   ├── writable-book-content.ts       # WritableBookContentHandler
│   └── base-item.ts                   # BaseItemHandler
├── writers/
│   ├── index.ts                       # FileWriter interface + registry
│   ├── pommel-model.ts                # PommelModelWriter
│   ├── cit-properties.ts              # CITPropertiesWriter
│   ├── vanilla-model.ts               # VanillaModelWriter
│   └── texture-copy.ts                # TextureCopyWriter
├── mergers/
│   ├── index.ts                       # RequestMerger interface + registry
│   ├── overrides.ts                   # OverridesMerger
│   └── properties.ts                  # PropertiesMerger
├── file-manager/
│   ├── index.ts                       # WriteRequest types + FileManager
│   └── manager.ts                     # Request collection, merging, writing
├── coordination/
│   ├── index.ts                       # BackportCoordinator
│   └── processor.ts                   # Main processing pipeline
└── index.ts                           # CLI entry point
```

## Migration Plan

### Phase 1: Core Infrastructure
1. Create strategy interfaces
2. Implement FileManager for write request handling
3. Create basic BackportCoordinator with strategy registry

### Phase 2: Handler Migration
1. Convert DisplayContextStrategy → DisplayContextHandler
2. Convert StoredEnchanmentsStrategy → StoredEnchanmentsHandler  
3. Convert WritableBookContentStrategy → WritableBookContentHandler
4. Add BaseItemHandler as fallback

### Phase 3: Writer Implementation
1. Implement PommelModelWriter (extract from current PurePommelGenerationStrategy)
2. Implement CITPropertiesWriter (extract from current CombinedGenerationStrategy)
3. Implement VanillaModelWriter and TextureCopyWriter

### Phase 4: Merger Implementation
1. Implement OverridesMerger for Pommel models
2. Implement PropertiesMerger for CIT properties
3. Add conflict resolution logic

### Phase 5: Testing & Validation
1. Unit test each strategy in isolation
2. Integration test with known-good packs
3. Performance testing and optimization

## Testing Strategy

### Unit Tests
```typescript
describe('DisplayContextHandler', () => {
  test('detects display context selection', () => {
    const handler = new DisplayContextHandler();
    const result = handler.canHandle(mockDisplayContextJson, mockContext);
    expect(result).toBe(true);
  });
  
  test('generates correct pommel overrides', () => {
    const handler = new DisplayContextHandler();
    const requests = handler.process(mockDisplayContextJson, mockContext);
    expect(requests).toHaveLength(1);
    expect(requests[0].type).toBe('pommel-model');
  });
});
```

### Integration Tests
```typescript
describe('Full Pipeline', () => {
  test('processes Better Fresher 3D Books correctly', async () => {
    const coordinator = new BackportCoordinator();
    await coordinator.backport('test-fixtures/better-fresher-3d-books', tempDir);
    
    // Verify expected output files exist
    expect(existsSync(join(tempDir, 'assets/minecraft/models/item/writable_book.json'))).toBe(true);
  });
});
```

## Error Handling

1. **Handler Errors**: Log warning, continue with other handlers
2. **Writer Errors**: Fail fast with detailed error message
3. **Merge Conflicts**: Use priority system, log conflicts
4. **File System Errors**: Fail fast with helpful context

## Performance Considerations

1. **Lazy Loading**: Only load handlers that can handle current item
2. **Request Batching**: Batch write requests by type for efficiency
3. **Texture Caching**: Cache texture resolution across items
4. **Incremental Processing**: Skip unchanged items in development mode

## Extension Points

### Adding New Mod Support
1. Implement `ItemHandler` for mod-specific JSON patterns
2. Implement `FileWriter` for mod-specific file format
3. Add merger if needed for conflict resolution
4. Register in coordinator

### Adding New Item Components
1. Add new handler that implements `ItemHandler`
2. Register in handler registry
3. No changes needed to existing code

This architecture ensures the system remains maintainable and extensible as new mods and item types are added.
