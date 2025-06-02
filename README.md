# Minecraft Resource Pack Backporter

Converts Minecraft 1.21.4+ resource packs to work in 1.21.1 using CIT + Pommel mod combination.

## What This Tool Does

Modern Minecraft versions (1.21.4+) use a component-based model selection system that allows resource packs to show different 3D book models based on enchantments and display contexts. However, this system doesn't exist in 1.21.1.

This tool backports these modern resource packs by:

1. **Converting component-based models** to CIT (Custom Item Textures) properties files
2. **Generating Pommel models** that handle hand-specific behavior
3. **Fixing model compatibility issues** for 1.21.1

## Features

- ✅ **Full enchantment support** - Automatically detects all 125+ enchantment combinations
- ✅ **Hand-specific behavior** - Open books in right hand, closed books in left hand  
- ✅ **All book types** - Supports regular books, enchanted books, written books, etc.
- ✅ **No invisibility issues** - Fixes problematic `builtin/entity` parents
- ✅ **2D inventory fallback** - Shows 2D sprites in inventory/GUI

## Requirements

- **Bun** runtime (for running the converter)
- **CIT Resewn** mod (for enchantment detection)
- **Pommel** mod (for hand-specific models)

### Important: Enhanced Pommel Required

For perfect feature parity, you need the latest Pommel build with enhanced predicates:

1. Clone: `https://github.com/TimmyChips/Pommel-Held-Item-Models`
2. Build: `./gradlew build`
3. Install the resulting JAR in your mods folder

This enables `pommel:is_offhand` predicate for exact left/right hand behavior.

## Usage

### Quick Start

1. Place your 1.21.4+ resource pack in this directory (replace the example files)
2. Run the converter:
   ```bash
   bun run convert
   ```
3. Fix open book models:
   ```bash
   bun run fix-open-books
   ```
4. Copy `dist/cit-pommel/` to your Minecraft resource packs folder

### Directory Structure

Your resource pack should have this structure:
```
assets/
├── minecraft/
│   ├── items/
│   │   └── enchanted_book.json     # Component-based model definitions
│   ├── models/
│   │   └── item/
│   │       └── books_3d/           # 3D book models
│   └── textures/
│       └── item/
│           └── enchanted_books/    # 2D book textures
pack.mcmeta
pack.png
```

### Output Structure

The converted pack will have:
```
dist/cit-pommel/
├── assets/minecraft/
│   ├── optifine/cit/              # CIT properties files
│   ├── models/item/
│   │   ├── books/                 # Pommel model files
│   │   └── books_3d/              # Fixed 3D models
│   └── textures/                  # Copied textures
pack.mcmeta
pack.png
```

## How It Works

### 1. Component Analysis
Extracts enchantment mappings from `enchanted_book.json` component selectors.

### 2. CIT Generation
Creates `.properties` files that detect enchanted books by their NBT data:
```properties
type=item
items=enchanted_book
model=assets/minecraft/models/item/books/sharpness_1
enchantmentIDs=minecraft:sharpness
enchantmentLevels=1
```

### 3. Pommel Models
Generates hand-aware models using predicates:
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

### 4. Model Fixes
Removes problematic `builtin/entity` parents and fixes zero-thickness elements that cause invisibility in 1.21.1.

## Troubleshooting

### Books are invisible when held
Run the fix script:
```bash
bun run fix-open-books
```

### Only closed books show in both hands
You need the enhanced Pommel build with `pommel:is_offhand` predicate support.

### Enchantments not detected
Ensure CIT Resewn mod is installed and NBT data is preserved in your world.

## Contributing

This tool was developed specifically for the "Better Fresher 3D Books" resource pack but should work with any 1.21.4+ resource pack that uses component-based model selection.

## License

Open source - feel free to adapt for your own resource pack backporting needs!
