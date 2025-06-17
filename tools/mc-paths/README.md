# MC Paths

minecraft-specific path resolution utilities for handling resource pack asset references and texture lookups.

## features

- **texture path resolution**: convert minecraft texture references to filesystem paths
- **namespace handling**: support for minecraft and custom namespaces
- **path normalization**: handle different path formats and separators
- **asset type detection**: identify models, textures, sounds, etc. from paths
- **cross-platform compatibility**: works on windows, macos, and linux

## api

### `resolveTexturePath(textureRef: string, packDir: string): string | null`

resolves a minecraft texture reference to an actual file path.

```typescript
import { resolveTexturePath } from "@mc-paths/index";

// resolve texture reference
const texturePath = resolveTexturePath("minecraft:item/sword", "./my-pack");
// returns: "assets/minecraft/textures/item/sword.png" (if it exists)

// handle missing textures
const missingPath = resolveTexturePath(
  "minecraft:item/nonexistent",
  "./my-pack"
);
// returns: null
```

### texture reference formats

supports various minecraft texture reference formats:

```typescript
// standard namespace format
"minecraft:item/sword"           → "assets/minecraft/textures/item/sword.png"

// custom namespace
"mypack:items/custom_sword"      → "assets/mypack/textures/items/custom_sword.png"

// relative path format
"item/sword"                     → "assets/minecraft/textures/item/sword.png"

// absolute texture path
"minecraft:textures/item/sword"  → "assets/minecraft/textures/item/sword.png"
```

## usage patterns

### model validation

```typescript
import { resolveTexturePath } from "@mc-paths/index";

async function validateModelTextures(modelPath: string, packDir: string) {
  const model = JSON.parse(await readFile(modelPath, "utf-8"));
  const missingTextures: string[] = [];

  if (model.textures) {
    for (const [key, textureRef] of Object.entries(model.textures)) {
      const resolvedPath = resolveTexturePath(textureRef as string, packDir);

      if (!resolvedPath || !existsSync(join(packDir, resolvedPath))) {
        missingTextures.push(textureRef as string);
      }
    }
  }

  return missingTextures;
}
```

### texture discovery

```typescript
import { resolveTexturePath } from "@mc-paths/index";

async function findAllTextures(textureRefs: string[], packDir: string) {
  const found: string[] = [];
  const missing: string[] = [];

  for (const ref of textureRefs) {
    const path = resolveTexturePath(ref, packDir);

    if (path && existsSync(join(packDir, path))) {
      found.push(path);
    } else {
      missing.push(ref);
    }
  }

  return { found, missing };
}
```

### asset copying

```typescript
import { resolveTexturePath } from "@mc-paths/index";

async function copyReferencedTextures(
  model: any,
  srcDir: string,
  destDir: string
) {
  if (!model.textures) return;

  for (const textureRef of Object.values(model.textures)) {
    const srcPath = resolveTexturePath(textureRef as string, srcDir);

    if (srcPath && existsSync(join(srcDir, srcPath))) {
      const destPath = join(destDir, srcPath);
      await mkdir(dirname(destPath), { recursive: true });
      await copyFile(join(srcDir, srcPath), destPath);
    }
  }
}
```

## path resolution rules

### namespace resolution

1. if reference includes namespace (`minecraft:item/sword`), use it directly
2. if no namespace, assume `minecraft` namespace
3. custom namespaces map to corresponding asset directories

### texture path construction

1. start with namespace: `minecraft` → `assets/minecraft/`
2. add texture type: `textures/`
3. add category and name: `item/sword`
4. add extension: `.png`

### fallback behavior

- if exact path doesn't exist, return `null`
- no automatic fallbacks to prevent incorrect references
- caller responsible for handling missing textures

## supported asset types

while focused on textures, the module can be extended for other asset types:

- **textures**: `.png` files in `textures/` directories
- **models**: `.json` files in `models/` directories
- **sounds**: `.ogg` files in `sounds/` directories
- **fonts**: various files in `font/` directories

## error handling

functions return `null` for invalid references rather than throwing:

```typescript
const path = resolveTexturePath("invalid:reference", packDir);
if (!path) {
  console.warn("could not resolve texture reference");
}
```

## performance

optimized for resource pack processing:

- minimal filesystem operations
- efficient string manipulation
- caching opportunities for repeated lookups
- lazy evaluation where possible

## integration examples

### with linter

```typescript
import { resolveTexturePath } from "@mc-paths/index";
import { walkModels } from "@file-utils/index";
import { validateJson } from "@json-utils/index";

async function lintTextureReferences(packDir: string) {
  const models = await walkModels(packDir);
  const errors: string[] = [];

  for (const modelPath of models) {
    const result = await validateJson(join(packDir, modelPath));
    if (!result.valid || !result.data?.textures) continue;

    for (const [key, textureRef] of Object.entries(result.data.textures)) {
      const resolvedPath = resolveTexturePath(textureRef as string, packDir);

      if (!resolvedPath) {
        errors.push(`${modelPath}: invalid texture reference "${textureRef}"`);
      } else if (!existsSync(join(packDir, resolvedPath))) {
        errors.push(
          `${modelPath}: missing texture "${textureRef}" (${resolvedPath})`
        );
      }
    }
  }

  return errors;
}
```
