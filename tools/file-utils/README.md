# File Utils

filesystem utilities for minecraft resource pack processing with optimized traversal and filtering.

## features

- **asset walking**: efficiently traverse minecraft asset directories
- **model enumeration**: find and categorize model files
- **texture discovery**: locate texture files with proper path resolution
- **filtered traversal**: skip output directories and irrelevant files
- **cross-platform paths**: handle windows/unix path differences

## api

### `walkAssets(packDir: string): Promise<string[]>`

walks the entire assets directory structure, returning all asset files.

```typescript
import { walkAssets } from "@file-utils/index";

const assets = await walkAssets("./my-pack");
// returns: ["assets/minecraft/models/item/sword.json", ...]
```

### `walkModels(packDir: string): Promise<string[]>`

finds all model files (`.json` files in `models/` directories).

```typescript
import { walkModels } from "@file-utils/index";

const models = await walkModels("./my-pack");
// returns: ["assets/minecraft/models/item/sword.json", "assets/minecraft/models/block/stone.json", ...]
```

### `walkTextures(packDir: string): Promise<string[]>`

finds all texture files (`.png` files in `textures/` directories).

```typescript
import { walkTextures } from "@file-utils/index";

const textures = await walkTextures("./my-pack");
// returns: ["assets/minecraft/textures/item/sword.png", ...]
```

## filtering behavior

all walk functions automatically filter out:

- output directories (`dist/`, `build/`, `out/`)
- hidden files (`.git/`, `.DS_Store`, etc.)
- temporary files (`*.tmp`, `*.temp`)
- non-asset files outside `assets/` directories

## path handling

- normalizes path separators for cross-platform compatibility
- returns relative paths from pack root
- preserves minecraft asset path structure
- handles nested namespace directories

## performance

optimized for large resource packs:

- uses streaming directory traversal
- minimal memory footprint
- parallel processing where beneficial
- early termination for filtered paths

## usage patterns

### resource pack introspection

```typescript
import { walkAssets, walkModels, walkTextures } from "@file-utils/index";

async function analyzepack(packDir: string) {
  const [assets, models, textures] = await Promise.all([
    walkAssets(packDir),
    walkModels(packDir),
    walkTextures(packDir),
  ]);

  console.log(
    `found ${assets.length} assets, ${models.length} models, ${textures.length} textures`
  );
}
```

### validation preparation

```typescript
import { walkModels } from "@file-utils/index";

async function validateModels(packDir: string) {
  const models = await walkModels(packDir);

  for (const modelPath of models) {
    // validate each model file
    await validateModel(join(packDir, modelPath));
  }
}
```

### build pipeline integration

```typescript
import { walkAssets } from "@file-utils/index";

async function copyAssets(srcDir: string, destDir: string) {
  const assets = await walkAssets(srcDir);

  await Promise.all(
    assets.map((asset) => copyFile(join(srcDir, asset), join(destDir, asset)))
  );
}
```

## error handling

functions throw descriptive errors for:

- non-existent directories
- permission issues
- filesystem errors

wrap calls in try/catch for robust error handling:

```typescript
try {
  const models = await walkModels(packDir);
} catch (error) {
  console.error(`failed to walk models: ${error.message}`);
}
```
