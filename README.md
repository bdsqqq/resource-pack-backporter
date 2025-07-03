# Resource Pack Tools

comprehensive toolbox for minecraft resource pack development, testing, and deployment. originally "Better Fresher 3D Books v1.1" backporter, now evolved into a full-featured resource pack development suite.

## tools overview

### ↻ [backporter](tools/backporter/)

transforms modern minecraft resource packs (1.21.4+) to work with older versions (1.21.1) by converting conditional item models to pommel predicates and cit properties.

### ◉ [linter](tools/linter/)

static validation tool with auto-generation and comprehensive test coverage that detects pack format, generates vanilla assets, validates json syntax, texture references, model inheritance chains, and pack structure. zero configuration required - perfect for build pipelines.

### ⚙ utility modules

- **[file-utils](tools/file-utils/)**: filesystem traversal and asset discovery
- **[json-utils](tools/json-utils/)**: json validation with detailed error reporting
- **[mc-paths](tools/mc-paths/)**: minecraft-specific path resolution with dynamically generated vanilla asset validation

## quick start

```bash
# install dependencies
pnpm install

# backport a resource pack
pnpm backport ./my-pack ./my-pack-backported

# lint a resource pack
pnpm lint ./my-pack

# run unified cli
pnpm tsx tools/index.ts --help
```

## installation

requires [Node.js](https://nodejs.org) 18+ and [pnpm](https://pnpm.io):

```bash
# clone repository
git clone <repository-url>
cd resource-pack-tools

# install dependencies
pnpm install

# verify installation
pnpm test
```

## usage patterns

### development workflow

```bash
# 1. create/modify your resource pack
# 2. validate with linter
pnpm lint ./my-pack

# 3. backport for compatibility
pnpm backport ./my-pack ./my-pack-v1.21.1

# 4. test the backported pack
pnpm lint ./my-pack-v1.21.1
```

### ci/cd integration

```bash
# validate pack in ci pipeline
pnpm lint ./pack || exit 1

# generate multiple versions
pnpm backport ./pack ./pack-v1.21.1
```

### api usage

```typescript
// programmatic usage
import { ConditionalBackportCoordinator } from "@backporter/index";
import { validateResourcePack } from "@linter/validator";

const coordinator = new ConditionalBackportCoordinator();
await coordinator.backport("./input", "./output");

const lintResults = await validateResourcePack("./pack");
```

## architecture

built with modular architecture and clean separation of concerns:

```
tools/
├── backporter/          # main backporting logic
│   ├── src/
│   │   ├── conditional-compiler/    # 1.21.4+ → legacy conversion
│   │   ├── coordination/           # process orchestration
│   │   ├── file-manager/           # i/o operations
│   │   ├── handlers/               # component processors
│   │   ├── writers/                # output generators
│   │   ├── mergers/                # conflict resolution
│   │   └── postprocessors/         # compatibility fixes
│   └── *.test.ts                   # colocated tests
├── linter/              # validation tools
│   └── src/
├── file-utils/          # filesystem utilities
│   └── src/
├── json-utils/          # json processing
│   └── src/
└── mc-paths/            # minecraft path resolution
    └── src/
```

## key features

### backporter capabilities

- **conditional compilation**: converts 1.21.4+ conditional selectors to legacy formats
- **display context mapping**: gui/ground/held/offhand → pommel predicates
- **enchanted book support**: individual cit properties for each enchantment
- **3d model preservation**: maintains custom model references
- **template protection**: prevents corruption of template files
- **model compatibility**: fixes common model issues automatically

### linter capabilities

- **automatic vanilla asset generation**: detects pack_format and generates validation for target minecraft version
- **json syntax validation**: comprehensive error reporting with line/column info
- **vanilla asset validation**: supports minecraft 1.13-1.21+ with auto-generation
- **texture reference checking**: validates all model → texture references, distinguishes custom vs vanilla
- **model inheritance validation**: checks parent model references and chains
- **missing file detection**: identifies broken asset links with context
- **namespace warnings**: alerts about non-namespaced references
- **pack structure validation**: ensures proper minecraft pack format
- **zero configuration**: works out of the box, perfect for ci/cd pipelines
- **comprehensive test coverage**: 17+ test cases covering all validation scenarios including auto-generation

### development experience

- **typescript throughout**: full type safety and intellisense
- **path aliases**: clean imports with `@backporter/*`, `@linter/*` etc.
- **colocated tests**: tests sit next to the code they validate
- **unified cli**: single entry point for all tools
- **comprehensive docs**: detailed readme for each module

## testing

comprehensive test coverage across all tools:

```bash
# run all tests
pnpm test

# run specific tool tests
pnpm test tools/backporter/src/
pnpm test:linter

# run with coverage
pnpm test:coverage

# run specific test files
pnpm test tools/backporter/src/integration.test.ts
pnpm test tools/linter/src/validator.test.ts
```

## contributing

1. **follow the architecture**: new tools go in `tools/`, utilities in dedicated modules
2. **colocate tests**: put `*.test.ts` files next to the code they test
3. **use path aliases**: import with `@toolname/*` instead of relative paths
4. **document thoroughly**: each module needs a comprehensive readme
5. **maintain backward compatibility**: existing cli interfaces should continue working

### adding new tools

```bash
# create new tool structure
mkdir -p tools/newtool/src
echo "# New Tool" > tools/newtool/README.md

# add to unified cli
# edit tools/index.ts to add new command

# add path alias
# edit tsconfig.json paths section
```

## performance

optimized for large resource packs:

- **parallel processing**: concurrent file operations where possible
- **streaming**: minimal memory usage for large files
- **caching**: efficient reuse of parsed data
- **early termination**: skip processing when possible

typical performance on modern hardware:

- backporter: ~100 items/second
- linter: ~1000 files/second
- file walking: ~5000 files/second

## limitations

### backporter

- requires pommel mod for predicate support
- 3d models must be pre-created
- some 1.21.4+ features may not have legacy equivalents

### linter

- validates syntax and references, not content quality
- doesn't check minecraft version compatibility
- limited to standard resource pack features

## roadmap

potential future enhancements:

- **asset optimizer**: compress textures, optimize models
- **pack merger**: combine multiple packs safely
- **version detector**: identify minecraft version requirements
- **template generator**: scaffold new resource packs
- **web interface**: browser-based pack tools

## license

[license information]

## acknowledgments

- original "Better Fresher 3D Books v1.1" pack
- minecraft modding community
- pommel mod developers
- optifine cit documentation
