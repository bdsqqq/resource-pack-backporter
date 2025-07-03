# Resource Pack Linter

static validation tool for minecraft resource packs that catches common errors and missing references before deployment.

## features

- **automatic vanilla asset generation**: detects pack_format from pack.mcmeta and auto-generates vanilla asset validation for the target minecraft version
- **json syntax validation**: ensures all json files are valid and parseable with detailed error reporting
- **texture reference checking**: validates model files reference existing textures or valid vanilla assets
- **vanilla asset validation**: dynamically generated validation against official minecraft assets (1.13-1.21+)
- **model parent validation**: checks model inheritance chains for broken references
- **missing file detection**: identifies broken references between models and textures
- **path validation**: checks for correct minecraft asset path structures
- **namespace warnings**: alerts about non-namespaced references that fall back to vanilla
- **chainable with other tools**: seamlessly runs as part of build pipelines without manual setup
- **comprehensive reporting**: detailed error messages with file locations and context
- **structured logging**: optional tracer integration for debugging and analytics

## usage

```bash
# direct usage
pnpm tsx tools/linter/index.ts <pack-directory>
pnpm tsx tools/index.ts lint <pack-directory>
pnpm lint <pack-directory>

# run linter tests
pnpm test:linter
```

## examples

```bash
# lint current directory
pnpm lint .

# lint specific pack
pnpm lint ./my-resource-pack

# lint with verbose output (shows vanilla texture references)
pnpm lint ./my-pack --verbose
```

## validation checks

### json syntax validation

- parses all `.json` files in the pack
- reports syntax errors with line/column information
- validates json structure integrity
- handles both pack.mcmeta and model files

### texture reference validation

- scans all model files for texture references
- checks if referenced textures exist in the pack
- validates vanilla minecraft texture references against generated asset registry
- distinguishes between missing custom textures (error) and valid vanilla references (silent)
- supports both namespaced (`minecraft:item/book`) and legacy (`item/book`) formats
- warns about non-namespaced references that fallback to vanilla

### model validation

- validates model parent references
- checks for broken inheritance chains
- validates vanilla model references against official minecraft assets
- ensures model json structure is valid

### pack structure validation

- ensures `pack.mcmeta` exists and is valid
- validates asset directory structure
- checks for common path issues
- validates pack format compatibility

## vanilla asset validation

the linter automatically generates vanilla asset registries based on your pack's target version:

- **pack format detection**: reads pack.mcmeta to determine target minecraft version
- **automatic generation**: generates assets for 1.13-1.21+ based on pack_format
- **texture registry**: ~600+ official minecraft textures (blocks, items, entities)
- **model registry**: ~500+ official minecraft models
- **zero configuration**: works out of the box without manual setup
- **chainable**: perfect for build pipelines and ci/cd workflows

this means:

- ✅ `minecraft:item/book` → valid vanilla texture, no error
- ❌ `minecraft:item/fake_texture` → invalid vanilla reference, error reported
- ⚠️ `item/book` → valid but non-namespaced, warning issued

## output format

the linter provides clear, actionable feedback with structured logging:

```
[INFO]: Starting resource pack validation
├─ Pack directory: ./my-pack
└─ Found 15 model files

[FAILED]: Resource pack validation failed
└─ Checked 16 files, found 3 issues

[ERROR]: Validation issues found
├─ Invalid JSON in assets/minecraft/models/item/sword.json: Unexpected token '}' at line 12
├─ Missing texture: custom:item/my_sword (referenced in models/item/sword.json)
└─ Invalid vanilla texture reference: minecraft:item/nonexistent_gem does not exist in Minecraft
```

## testing

comprehensive test suite with 17+ test cases covering:

```bash
# run linter tests specifically
pnpm test:linter

# or run all tests
pnpm test
```

**test coverage includes:**

- automatic vanilla asset generation
- empty pack validation
- missing/invalid pack.mcmeta handling
- valid/invalid vanilla texture references
- custom texture existence checking
- model parent reference validation
- non-namespaced texture warnings
- json syntax error detection
- multi-texture model validation
- different pack format handling
- verbose mode functionality
- tracer integration
- statistics accuracy

## supported file types

- **models**: `.json` files in `assets/*/models/`
- **textures**: `.png` files in `assets/*/textures/`
- **pack metadata**: `pack.mcmeta`
- **any json**: syntax validation for all `.json` files in pack

## integration

designed for ci/cd pipelines with clear exit codes:

```bash
# exit code 0 = no issues found
# exit code 1 = validation errors found

# github actions example
- name: Lint Resource Pack
  run: pnpm lint ./pack

# with verbose logging
- name: Lint with Details
  run: pnpm lint ./pack --verbose
```

## programmatic usage

```typescript
import { validateResourcePack } from "@linter/validator";
import { createTracer } from "@logger/index";

const tracer = createTracer({ serviceName: "my-app" });
const result = await validateResourcePack("./pack", { verbose: true }, tracer);

if (result.isOk()) {
  const validation = result.value;
  console.log(`Checked ${validation.stats.filesChecked} files`);
  console.log(`Found ${validation.errors.length} errors`);
  console.log(`Found ${validation.warnings.length} warnings`);
}
```

## configuration

currently no configuration files supported - the linter uses minecraft's standard conventions and dynamically generated vanilla asset registries for validation rules.

## architecture

built with modular, testable components:

- **validator.ts**: main validation orchestration
- **@mc-paths**: minecraft-specific path resolution and vanilla asset checking
- **@json-utils**: json parsing with detailed error reporting
- **@file-utils**: efficient filesystem traversal
- **@logger**: structured logging and tracing
- **neverthrow**: type-safe error handling throughout

## performance

optimized for speed with comprehensive validation:

- parallel file processing where possible
- minimal memory footprint
- fast json parsing with detailed error context
- efficient vanilla asset lookups via generated sets
- early termination on critical errors

typical performance on modern hardware:

- ~1000 files/second for json validation
- ~500 files/second for texture reference checking
- ~200 files/second for full validation with vanilla asset checking

## limitations

- only validates file existence, json syntax, and reference integrity
- doesn't validate texture content, dimensions, or format
- doesn't validate model geometry or minecraft model limits
- doesn't check for minecraft version compatibility beyond asset references
- doesn't validate custom resource pack features (shaders, cit beyond basics)

## extending validation

the linter's modular architecture makes adding new validation rules straightforward:

```typescript
// add new validation in validator.ts
const customValidation = await validateCustomFeature(modelFile);
if (customValidation.isErr()) {
  errors.push(customValidation.error);
}
```

key extension points:

- **validation rules**: add new checks in `validateResourcePack`
- **path resolvers**: extend `@mc-paths` for new asset types
- **file walkers**: add new traversal patterns in `@file-utils`
- **error reporting**: extend structured logging in validation spans
