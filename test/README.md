# Test Suite Documentation

This test suite ensures the resource pack backporter maintains correctness and prevents regressions in critical functionality.

## Test Structure

### 1. Texture Extraction Tests (`texture-extraction.test.ts`)
Tests the core texture resolution logic that was the source of the major bug fix.

**Critical Regression Tests:**
- ✅ Extracts correct texture from source files, not contaminated output directories
- ✅ Handles knowledge_book vs book separation without cross-contamination  
- ✅ Filters out dist/, build/, out/ directories correctly
- ✅ Fallback mechanisms work properly

### 2. Strategy Selection Tests (`strategy-selection.test.ts`)
Tests the logic that determines which generation strategy to use for each item type.

**Key Test Cases:**
- ✅ Pure Pommel for context-only items (book, writable_book)
- ✅ Combined CIT + Pommel for items with significant components (enchanted_book)
- ✅ Pure CIT for NBT-only items
- ✅ Simple copy for items with no variation
- ✅ Internal component handling (writable_book_content)

### 3. Component Analysis Tests (`component-analysis.test.ts`)
Tests the parsing of 1.21.4+ item component structures.

**Critical Parsing Tests:**
- ✅ Display context selection parsing
- ✅ Conditional model structures (writable_book)
- ✅ Component-based selection (enchanted_book)
- ✅ Nested model structures
- ✅ Fallback handling

### 4. Path Matching Regression Tests (`path-matching.test.ts`)
Tests the exact path matching logic that caused texture contamination.

**Regression Prevention:**
- ✅ book.json vs knowledge_book.json disambiguation
- ✅ Proper path separator handling
- ✅ Output directory filtering
- ✅ Partial filename rejection
- ✅ Windows/Unix path compatibility

### 5. Integration Tests (`integration.test.ts`)
End-to-end tests that verify the complete backport process.

**Full Workflow Tests:**
- ✅ Complete resource pack generation
- ✅ Multiple book types handling
- ✅ Output directory clearing
- ✅ Asset preservation
- ✅ File structure integrity

## Running Tests

```bash
# Run all tests
bun test

# Run with watch mode for development
bun test --watch

# Run with coverage
bun test --coverage

# Run specific test file
bun test texture-extraction.test.ts

# Run tests matching pattern
bun test --grep "texture"
```

## Critical Test Cases

### The Book Texture Bug (FIXED)
The most critical test ensures we never regress on the texture extraction contamination:

```typescript
it("should extract correct texture from source file, not output directory")
```

This test creates both source and contaminated output files, then verifies the texture extraction logic only reads from source files.

### Path Matching Edge Cases
These tests prevent the book.json/knowledge_book.json confusion:

```typescript
it("should not match book.json when searching for knowledge_book.json")
it("should filter out output directories correctly")
```

### Strategy Selection Accuracy
Ensures items get the right processing strategy:

```typescript
it("should select pure Pommel strategy for regular book (context-only)")
it("should select combined CIT + Pommel strategy for enchanted_book")
```

## Test Philosophy

1. **Regression Prevention**: Every major bug fix gets a corresponding test
2. **Edge Case Coverage**: Test boundary conditions and error cases
3. **Integration Validation**: Verify end-to-end workflows work correctly
4. **Performance Awareness**: Tests should run quickly to encourage frequent execution
5. **Clear Failure Messages**: When tests fail, it should be obvious what broke

## Adding New Tests

When adding new functionality:

1. Add unit tests for the core logic
2. Add integration tests for user-facing features
3. Add regression tests if fixing bugs
4. Update this README with any new critical test cases

## Test Data Management

Test fixtures are created/destroyed automatically in each test. The `test-fixtures/` directory is ignored by git and should not contain permanent data.

## Debugging Failed Tests

1. Run individual test files to isolate issues
2. Use `console.log` for debugging (tests capture output)
3. Check test fixtures are being created correctly
4. Verify file paths use correct separators for your OS
