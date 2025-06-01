# Minecraft Resource Pack to CIT Converter

Converts modern Minecraft item model JSON files (1.21.4+) to CIT (Custom Item Textures) properties files compatible with CIT Resewn 1.21.1.

## What it does

This tool transforms complex, nested JSON predicates using modern Minecraft features like:
- `minecraft:select` nodes with display context switching
- `minecraft:component` enchantment detection  
- Nested conditional logic

Into flat CIT `.properties` files that work with CIT Resewn's NBT-based matching system.

## Features

- **Full enchantment support**: Converts `minecraft:stored_enchantments` component checks to `nbt.StoredEnchantments` matching
- **Display context mapping**: Maps display contexts to CIT hand constraints where possible
- **Level handling**: Creates individual rules for each enchantment level 
- **Type safety**: Full TypeScript implementation with proper type guards
- **Comprehensive logging**: Detailed output showing conversion progress and any limitations

## System Requirements

- [Bun](https://bun.sh/) runtime
- TypeScript support

## Installation

1. Clone or download this converter
2. Install dependencies:
   ```bash
   bun install
   ```

## Usage

```bash
bun run convert-to-cit.ts <input-pack-directory> <output-cit-directory>
```

### Example

```bash
# Convert the current resource pack to CIT format
bun run convert-to-cit.ts . ./cit-output

# Convert a specific pack
bun run convert-to-cit.ts ./my-resource-pack ./my-cit-pack
```

## Input Format

The converter expects a standard Minecraft resource pack structure:
```
resource-pack/
├── pack.mcmeta
├── pack.png
└── assets/
    └── minecraft/
        ├── items/           # JSON files to convert
        ├── models/          # Referenced model files
        └── textures/        # Texture files
```

## Output Format

Creates a complete CIT resource pack with this structure:
```
output-pack/
├── pack.mcmeta           # Updated pack metadata
├── pack.png             # Copied pack icon
└── assets/
    └── minecraft/
        ├── models/       # Copied model files
        ├── textures/     # Copied texture files
        └── optifine/
            └── cit/      # Generated CIT properties
                ├── {item}_{enchantment}_{level}.properties
                ├── {item}_{hand}.properties
                └── {item}.properties
```

CIT properties files use naming pattern:
- `{item}_{enchantment}_{level}.properties` - For enchanted items
- `{item}_{hand}.properties` - For hand-specific items  
- `{item}.properties` - For basic items

### Example Output

**Input JSON** (enchanted_book.json):
```json
{
  "model": {
    "type": "minecraft:select",
    "property": "minecraft:component", 
    "component": "minecraft:stored_enchantments",
    "cases": [
      {
        "when": { "minecraft:sharpness": 1 },
        "model": {
          "type": "minecraft:model",
          "model": "minecraft:item/enchanted_books/sharpness_1"
        }
      }
    ]
  }
}
```

**Generated CIT** (enchanted_book_sharpness_1.properties):
```properties
type=item
items=minecraft:enchanted_book
model=../../../models/item/enchanted_books/sharpness_1.json
nbt.StoredEnchantments.0.id=minecraft:sharpness
nbt.StoredEnchantments.0.lvl=1s
```

## Limitations & Conversions

### Supported Conversions
- ✅ Display contexts → Hand constraints (`hand=left|right`)
- ✅ Stored enchantments → NBT matching (`nbt.StoredEnchantments`)
- ✅ Basic model selection → Model path assignment
- ✅ Enchantment levels → Level matching (`lvl=1s|2s|3s`)

### CIT Limitations
- ❌ **No GUI vs Hand differentiation**: CIT cannot show different models in GUI vs in-hand
- ❌ **No conditional logic**: Complex `minecraft:condition` nodes are skipped
- ❌ **No model wildcards**: Each enchantment level needs its own rule
- ❌ **Single enchantment matching**: Only matches the first stored enchantment

### What Gets Lost
When converting from modern JSON to CIT:
1. **Context separation**: GUI-specific models are lost (CIT uses the same model everywhere)
2. **Complex conditions**: Multi-condition logic is simplified or skipped
3. **Fallback chains**: Complex fallback logic is flattened

## Technical Details

### Type System
- **MinecraftModel**: Base interface for all JSON nodes
- **SelectNode**: Handles `minecraft:select` with property switching
- **ComponentNode**: Specialized for `minecraft:component` enchantment detection
- **ModelNode**: Terminal nodes with actual model paths

### Processing Pipeline
1. **Parse**: Load and validate JSON structure
2. **Extract**: Recursively traverse nodes to find all (item, enchantment, level, context, model) combinations
3. **Collapse**: Group compatible predicates by matching criteria
4. **Generate**: Create CIT properties files with appropriate constraints

### Context Mapping
```typescript
// Display contexts → Hand constraints
leftContexts = ['firstperson_lefthand', 'thirdperson_lefthand', 'head']
rightContexts = ['firstperson_righthand', 'thirdperson_righthand'] 
guiContexts = ['gui', 'fixed', 'ground'] // No hand constraint
```

## Development

The converter is built with:
- **Bun**: Fast TypeScript runtime
- **Functional approach**: Uses `map`, `flatMap`, `filter` over mutations
- **Type guards**: Safe type checking (`isSelectNode`, `isModelNode`)
- **Modular design**: Separate functions for extraction, collapsing, generation

### Testing
```bash
# Run on the included test pack
bun run convert-to-cit.ts . ./Better-Fresher-3D-Books-CIT

# Check generated structure
ls ./Better-Fresher-3D-Books-CIT/
ls ./Better-Fresher-3D-Books-CIT/assets/minecraft/optifine/cit/

# Copy to Minecraft to test
cp -r ./Better-Fresher-3D-Books-CIT ~/.minecraft/resourcepacks/
```

## Troubleshooting

### Common Issues

**"Unsupported node type: minecraft:condition"**
- Modern conditional logic is too complex for CIT
- These nodes are skipped with a warning
- Manual conversion may be needed for critical conditions

**"No model found in [file]"**
- JSON file doesn't contain a model definition
- Check file structure and format

**Missing model files**
- Converter only generates properties, not model/texture files
- Ensure referenced models exist in the resource pack

### Debugging
The converter provides detailed logging:
- `Processing [file]...` - Shows current file
- `Extracted N predicates` - Shows extraction results  
- `Collapsed to N CIT rules` - Shows optimization results
- `Generated [file].properties` - Shows output files

## License

MIT License - Feel free to modify and distribute.

## Contributing

1. Fork the repository
2. Make changes with proper TypeScript types
3. Test with various resource packs
4. Submit pull requests with clear descriptions

## Related Projects

- [CIT Resewn](https://github.com/SHsuperCM/CITResewn) - The CIT implementation for Fabric
- [OptiFine CIT](https://github.com/sp614x/optifine/blob/master/OptiFineDoc/doc/cit.properties) - Original CIT specification
