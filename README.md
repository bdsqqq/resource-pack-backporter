# Minecraft Resource Pack Backporter

Automatically backports Minecraft 1.21.4+ resource packs to work in 1.21.1 using CIT + Pommel mod combination.

## What This Tool Does

Modern Minecraft versions (1.21.4+) introduced a component-based model selection system that allows resource packs to show different item models based on NBT data, enchantments, and display contexts. This system doesn't exist in 1.21.1.

This tool automatically detects and converts these modern component-based resource packs by:

1. **Scanning for component-based items** - Automatically finds items using 1.21.4+ features
2. **Converting to CIT properties** - Generates Custom Item Textures files for NBT detection
3. **Creating Pommel models** - Handles context-specific behavior (hand position, ground, etc.)
4. **Fixing compatibility issues** - Resolves model problems for 1.21.1

## Features

- ✅ **Universal compatibility** - Works with any resource pack using component-based models
- ✅ **Automatic detection** - No manual configuration required
- ✅ **Full component support** - Handles enchantments, custom data, and other NBT components
- ✅ **Context-aware models** - Different models for different hands and display contexts
- ✅ **Model fixing** - Automatically resolves 1.21.1 compatibility issues
- ✅ **One-shot conversion** - Single command does everything

## Requirements

- **Bun** runtime (for running the converter)
- **CIT Resewn** mod (for NBT-based item detection)
- **Pommel** mod (for context-specific models)

### Enhanced Pommel (Recommended)

For perfect feature parity, use the latest Pommel build with enhanced predicates:

1. Clone: `https://github.com/TimmyChips/Pommel-Held-Item-Models`
2. Build: `./gradlew build`
3. Install the resulting JAR in your mods folder

This enables advanced predicates like `pommel:is_offhand` for precise context behavior.

## Usage

### Quick Start

1. Place your 1.21.4+ resource pack in this directory
2. Run the backporter:
   ```bash
   bun run backport
   ```
3. Copy `dist/backported/` to your Minecraft resource packs folder

### Input Structure

Your resource pack should have this structure:
```
assets/
├── minecraft/
│   ├── items/
│   │   ├── enchanted_book.json     # Component-based definitions
│   │   ├── custom_item.json        # Any item with components
│   │   └── ...
│   ├── models/
│   │   └── item/
│   │       ├── item_models_3d/     # 3D model variants
│   │       └── ...
│   └── textures/
│       └── item/
│           ├── item_textures/      # 2D texture variants
│           └── ...
pack.mcmeta
pack.png
```

### Output Structure

The backported pack will have:
```
dist/backported/
├── assets/minecraft/
│   ├── optifine/cit/              # Generated CIT properties
│   ├── models/item/
│   │   ├── pommel/                # Generated Pommel models
│   │   └── ...                    # Fixed original models
│   └── textures/                  # Copied textures
pack.mcmeta
pack.png
```

## How It Works

### 1. Component Detection
Scans `assets/minecraft/items/` for files using component-based model selection:
```json
{
  "type": "minecraft:select",
  "component": "minecraft:stored_enchantments",
  "cases": [
    {
      "when": { "minecraft:sharpness": 1 },
      "model": { "model": "minecraft:item/books/sharpness_1" }
    }
  ]
}
```

### 2. CIT Generation
Creates properties files for NBT-based detection:
```properties
type=item
items=enchanted_book
model=assets/minecraft/models/item/pommel/sharpness_1
enchantmentIDs=minecraft:sharpness
enchantmentLevels=1
```

### 3. Pommel Models
Generates context-aware models:
```json
{
  "parent": "minecraft:item/handheld",
  "textures": { "layer0": "minecraft:item/books/sharpness_1" },
  "overrides": [
    {
      "predicate": { "pommel:is_held": 1.0 },
      "model": "minecraft:item/books_3d/sharpness_3d_open"
    },
    {
      "predicate": { "pommel:is_offhand": 1.0 },
      "model": "minecraft:item/books_3d/sharpness_3d"
    }
  ]
}
```

### 4. Model Compatibility
Automatically fixes common 1.21.1 issues:
- Removes problematic `builtin/entity` parents
- Fixes zero-thickness elements that cause invisibility
- Preserves all other model properties

## Supported Components

- ✅ **minecraft:stored_enchantments** - Enchanted items
- ⚠️ **Other components** - Basic support with NBT fallback

Additional components can be added by extending the `generateCITFile` function.

## Troubleshooting

### No items detected
Ensure your resource pack has component-based items in `assets/minecraft/items/`.

### Models not showing correctly
Make sure both CIT Resewn and Pommel mods are installed and enabled.

### Hand behavior not working
Use the enhanced Pommel build with `pommel:is_offhand` predicate support.

### Custom components not working
The tool currently has full support for enchantments. Other components use NBT fallback which may need manual refinement.

## Contributing

This tool is designed to work with any 1.21.4+ resource pack. If you encounter issues with specific component types, please contribute improvements to the component detection logic.

## License

Open source - adapt and improve for the community!
