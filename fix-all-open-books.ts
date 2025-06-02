#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function fixAllOpenBooks(booksDir: string) {
  console.log('🔧 Fixing all open book models...');
  
  const files = await readdir(booksDir);
  const openModelFiles = files.filter(file => file.includes('_open.json'));
  
  console.log(`📚 Found ${openModelFiles.length} open book models to fix`);
  
  let fixedCount = 0;
  
  for (const file of openModelFiles) {
    const filePath = join(booksDir, file);
    console.log(`🔧 Fixing ${file}...`);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const model = JSON.parse(content);
      
      let hasChanges = false;
      
      // Remove builtin/entity parent if it exists
      if (model.parent === 'builtin/entity') {
        delete model.parent;
        console.log(`  ✅ Removed builtin/entity parent from ${file}`);
        hasChanges = true;
      }
      
      // Also fix zero-thickness elements while we're at it
      if (model.elements) {
        for (let i = 0; i < model.elements.length; i++) {
          const element = model.elements[i];
          if (!element.from || !element.to) continue;
          
          for (let axis = 0; axis < 3; axis++) {
            if (element.from[axis] === element.to[axis]) {
              element.to[axis] = element.to[axis] + 0.01;
              hasChanges = true;
            }
          }
        }
      }
      
      if (hasChanges) {
        await writeFile(filePath, JSON.stringify(model, null, '\t'));
        console.log(`  ✅ Fixed ${file}`);
        fixedCount++;
      } else {
        console.log(`  ✓ ${file} already correct`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${file}:`, error);
    }
  }
  
  console.log(`\n🎉 Fixed ${fixedCount} open book models!`);
  console.log('✅ All open books should now work in 1.21.1 with Pommel!');
}

if (import.meta.main) {
  const booksDir = 'dist/complete-cit-pommel/assets/minecraft/models/item/books_3d';
  
  fixAllOpenBooks(booksDir)
    .catch(error => {
      console.error('❌ Fix failed:', error.message);
    });
}
