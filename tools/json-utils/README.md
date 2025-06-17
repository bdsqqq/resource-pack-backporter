# JSON Utils

json validation and parsing utilities for minecraft resource pack processing with robust error handling.

## features

- **syntax validation**: parse and validate json files with detailed error reporting
- **error context**: provide line/column information for syntax errors
- **safe parsing**: graceful handling of malformed json files
- **performance optimized**: fast parsing for large json files
- **type safety**: typescript-friendly json handling

## api

### `validateJson(filePath: string): Promise<ValidationResult>`

validates a json file and returns detailed results.

```typescript
import { validateJson } from "@json-utils/index";

const result = await validateJson("./pack.mcmeta");

if (result.valid) {
  console.log("json is valid:", result.data);
} else {
  console.error("json error:", result.error);
}
```

### `ValidationResult` interface

```typescript
interface ValidationResult {
  valid: boolean;
  data?: any; // parsed json data (if valid)
  error?: string; // error message (if invalid)
  line?: number; // error line number (if available)
  column?: number; // error column number (if available)
}
```

## usage patterns

### pack metadata validation

```typescript
import { validateJson } from "@json-utils/index";

async function validatePackMeta(packDir: string) {
  const result = await validateJson(join(packDir, "pack.mcmeta"));

  if (!result.valid) {
    throw new Error(`invalid pack.mcmeta: ${result.error}`);
  }

  const meta = result.data;
  if (!meta.pack?.pack_format) {
    throw new Error("missing pack_format in pack.mcmeta");
  }

  return meta;
}
```

### model file validation

```typescript
import { validateJson } from "@json-utils/index";
import { walkModels } from "@file-utils/index";

async function validateAllModels(packDir: string) {
  const models = await walkModels(packDir);
  const errors: string[] = [];

  for (const modelPath of models) {
    const result = await validateJson(join(packDir, modelPath));

    if (!result.valid) {
      errors.push(`${modelPath}: ${result.error}`);
    }
  }

  return errors;
}
```

### batch validation

```typescript
import { validateJson } from "@json-utils/index";

async function validateJsonFiles(files: string[]) {
  const results = await Promise.all(files.map((file) => validateJson(file)));

  const errors = results
    .map((result, i) => ({ file: files[i], result }))
    .filter(({ result }) => !result.valid)
    .map(({ file, result }) => `${file}: ${result.error}`);

  return errors;
}
```

## error handling

the validator provides detailed error information:

```typescript
const result = await validateJson("invalid.json");

if (!result.valid) {
  console.error(`json syntax error in invalid.json`);
  console.error(`error: ${result.error}`);

  if (result.line && result.column) {
    console.error(`location: line ${result.line}, column ${result.column}`);
  }
}
```

## performance

optimized for resource pack processing:

- streaming json parsing for large files
- minimal memory allocation
- fast validation without full parsing when possible
- efficient error reporting

## minecraft-specific considerations

while this is a general json utility, it's designed with minecraft resource pack requirements in mind:

- handles common minecraft json structures
- provides error messages suitable for pack developers
- optimized for typical resource pack file sizes

## error types

common json errors detected:

- syntax errors (missing commas, brackets, etc.)
- invalid unicode sequences
- truncated files
- empty files
- non-utf8 encoding issues

## integration

designed to integrate seamlessly with other tools:

```typescript
// use with linter
import { validateJson } from "@json-utils/index";
import { walkModels } from "@file-utils/index";

async function lintpack(packDir: string) {
  const models = await walkModels(packDir);

  for (const model of models) {
    const result = await validateJson(join(packDir, model));
    if (!result.valid) {
      console.error(`❌ ${model}: ${result.error}`);
    }
  }
}
```
