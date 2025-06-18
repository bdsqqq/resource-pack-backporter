# Resource Pack Linter

static validation tool for minecraft resource packs that catches common errors and missing references before deployment.

## features

- **json syntax validation**: ensures all json files are valid and parseable
- **texture reference checking**: validates that model files reference existing textures
- **missing file detection**: identifies broken references between models and textures
- **path validation**: checks for correct minecraft asset path structures
- **comprehensive reporting**: detailed error messages with file locations

## usage

```bash
# direct usage
bun run tools/linter/index.ts <pack-directory>

# via unified cli
bun run tools/index.ts lint <pack-directory>

# via package script
bun run lint <pack-directory>
```

## examples

```bash
# lint current directory
bun run lint .

# lint specific pack
bun run lint ./my-resource-pack

# lint with verbose output
bun run lint ./my-pack --verbose
```

## validation checks

### json syntax validation

- parses all `.json` files in the pack
- reports syntax errors with line/column information
- validates json structure integrity

### texture reference validation

- scans all model files for texture references
- checks if referenced textures exist in the pack
- validates texture path format (e.g., `minecraft:item/sword`)
- reports missing texture files

### pack structure validation

- ensures `pack.mcmeta` exists and is valid
- validates asset directory structure
- checks for common path issues

## output format

the linter provides clear, actionable feedback:

```
[INFO]: Starting resource pack validation
├─ Pack directory: ./my-pack
└─ Quick validation mode

[FAILED]: Resource pack validation failed
└─ Checked 45 files, found 3 issues

[ERROR]: Validation issues found
├─ Invalid JSON in assets/minecraft/models/item/sword.json: Unexpected token '}' at line 12
├─ Missing texture: minecraft:item/custom_sword (referenced in models/item/sword.json)
└─ Invalid pack.mcmeta: Missing required 'pack_format' field
```

## supported file types

- **models**: `.json` files in `assets/*/models/`
- **textures**: `.png` files in `assets/*/textures/`
- **pack metadata**: `pack.mcmeta`
- **other json**: any `.json` file in the pack

## integration

the linter is designed to integrate with ci/cd pipelines:

```bash
# exit code 0 = no issues found
# exit code 1 = validation errors found

# use in github actions
- name: Lint Resource Pack
  run: bun run lint ./pack
```

## configuration

currently no configuration files supported - the linter uses minecraft's standard conventions for validation rules.

## limitations

- only validates file existence and json syntax
- doesn't validate texture content or model geometry
- doesn't check for minecraft version compatibility
- doesn't validate custom resource pack features

## extending validation

the linter is built with a modular architecture that makes adding new validation rules straightforward. key components:

- **validators**: individual validation functions
- **file walkers**: utilities for traversing pack structure
- **path resolvers**: minecraft-specific path handling
- **reporters**: output formatting and error aggregation

## performance

the linter is optimized for speed:

- parallel file processing where possible
- minimal memory footprint
- fast json parsing
- efficient file system operations

typical performance on modern hardware:

- ~1000 files/second for json validation
- ~500 files/second for texture reference checking
