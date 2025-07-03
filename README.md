# pack-toolbox

minecraft resource pack dev tools. started as a backporter for "better fresher 3d books v1.1", now it's a whole thing.

## what it does

**backporter** - takes your shiny 1.21.4+ conditional models and makes them work on 1.21.1 via pommel predicates + cit properties. bc mojang moves fast but servers don't.

**linter** - validates your pack. checks json syntax, texture refs, model inheritance, the works. auto-generates vanilla assets so you don't have to think about it.

**utils** - file traversal, json validation, minecraft path resolution. the boring stuff that makes everything else work.

## quick start

```bash
pnpm install
pnpm backport ./my-pack ./my-pack-legacy  
pnpm lint ./my-pack
```

requires node 18+ and pnpm.

## how it works

the backporter does some pretty gnarly stuff under the hood:

1. **conditional compilation** - parses 1.21.4+ conditional selectors, maps them to pommel predicates
2. **display context mapping** - gui/ground/held/offhand contexts become pommel:is_ground, pommel:is_held, etc
3. **enchanted book handling** - generates individual cit properties for each enchantment level
4. **template protection** - never adds parent fields to template files (learned this the hard way)

the linter is more straightforward but does some clever things:

- detects pack_format, fetches vanilla assets from github for that exact version
- validates texture references against both custom and vanilla assets  
- checks model inheritance chains for circular deps
- warns about non-namespaced refs (bc that's usually a mistake)

## architecture

```
tools/
├── backporter/          # the main event
│   ├── conditional-compiler/    # 1.21.4+ → legacy magic
│   ├── coordination/           # orchestrates the whole process
│   ├── file-manager/           # i/o + template protection
│   ├── handlers/               # per-component processors
│   └── writers/                # output generation
├── linter/              # validation + auto-generation
├── file-utils/          # filesystem stuff
├── json-utils/          # json parsing w/ good errors
└── mc-paths/            # minecraft-specific path resolution
```

everything's typescript with path aliases (@backporter/*, @linter/*, etc). tests are colocated bc that's the only sane way to do it.

## performance

tested on large packs:
- backporter: ~100 items/sec
- linter: ~1000 files/sec  
- file walking: ~5000 files/sec

uses parallel processing where possible, streams large files, caches parsed data. should handle even the chonkiest packs.

## limitations

**backporter:**
- needs pommel mod on the client
- 3d models must exist already (doesn't generate geometry)
- some 1.21.4+ features might not have legacy equivalents

**linter:**
- validates structure/syntax, not content quality
- doesn't check cross-version compatibility
- limited to standard resource pack features

## testing

100 tests covering the critical paths. run with:

```bash
pnpm test                    # all tests
pnpm test:coverage          # with coverage
pnpm test tools/linter/     # specific tool
```

the test suite caught some tricky edge cases during development - template file corruption, path matching bugs, enchantment name mapping issues. afaict it's pretty solid now but minecraft modding has its quirks.

## api usage

```typescript
import { ConditionalBackportCoordinator } from "@backporter/index";
import { validateResourcePack } from "@linter/validator";

const coordinator = new ConditionalBackportCoordinator();
await coordinator.backport("./input", "./output");

const results = await validateResourcePack("./pack");
```

## contributing

1. new tools go in `tools/`
2. colocate tests with code
3. use path aliases, not relative imports
4. document everything

the codebase follows "moderate complexity over architecture" - it's complex enough to handle minecraft's weirdness but not so abstract you can't figure out what's happening.

## roadmap

maybe:
- asset optimizer (texture compression, model optimization)
- pack merger (safely combine multiple packs)
- version detector (analyze pack requirements)
- web interface (bc cli tools are intimidating)

but honestly the current feature set handles 90% of use cases. might be better to keep it focused.

## acknowledgments

- original "better fresher 3d books v1.1" pack
- pommel mod devs for making legacy compat possible
- minecraft modding community for reverse-engineering all this stuff