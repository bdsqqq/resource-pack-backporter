# CIT Troubleshooting Guide

## Issues Found with the Generated Pack

### 1. **Conflicting Rules**
The converter created overlapping rules that conflict:
- `enchanted_book_sharpness_1.properties` (specific enchantment)
- `enchanted_book_left_128.properties` (generic hand-based rule)
- `enchanted_book_right_127.properties` (generic hand-based rule)

**Problem**: CIT processes rules in order, and generic rules might override specific ones.

### 2. **Hand Constraints May Not Work**
CIT Resewn support for `hand=left/right` is limited or non-functional in 1.21.1.

### 3. **Too Many Rules**
147 properties files might cause performance issues or rule conflicts.

## Testing Steps

### Step 1: Test Simple Debug Pack
1. Load the `debug-cit-test` pack I created
2. Check if basic books change to 3D models
3. If this works, CIT is functional

### Step 2: Test Individual Enchanted Books
Create a single test rule for one enchantment:

```properties
# test_sharpness.properties
type=item
items=minecraft:enchanted_book
model=../../../models/item/enchanted_books/sharpness_1.json
nbt.StoredEnchantments.0.id=minecraft:sharpness
nbt.StoredEnchantments.0.lvl=1s
```

### Step 3: Check CIT Logs
Look in Minecraft logs for CIT errors:
- `.minecraft/logs/latest.log`
- Search for "CIT" or "error"

## Quick Fixes to Try

### Fix 1: Remove Hand Constraints
Remove all `hand=left` and `hand=right` lines from properties files.

### Fix 2: Remove Generic Rules
Delete these conflicting files:
- `enchanted_book_126.properties`
- `enchanted_book_129.properties` 
- `enchanted_book_left_128.properties`
- `enchanted_book_right_127.properties`
- Similar generic rules for other books

### Fix 3: Test with Fewer Rules
Start with just 5-10 enchantment rules to test if the concept works.

## Command to Clean Up

```bash
# Remove generic hand-based rules
cd "/Users/bdsqqq/Library/Application Support/ModrinthApp/profiles/Fabulously Optimized (1)/resourcepacks/Better-Fresher-3D-Books-CIT/assets/minecraft/optifine/cit"

# Remove problematic generic rules
rm enchanted_book_126.properties
rm enchanted_book_129.properties 
rm enchanted_book_left_128.properties
rm enchanted_book_right_127.properties
rm book_*.properties
rm knowledge_book_*.properties
rm writable_book_*.properties
rm written_book_*.properties

# Keep only specific enchantment rules for testing
```

## Next Steps

1. Test the simple debug pack first
2. If that works, try the cleanup commands above
3. Check Minecraft logs for CIT errors
4. We'll create an improved converter that avoids these issues
