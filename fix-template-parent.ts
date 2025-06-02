#!/usr/bin/env bun

import { readFile, writeFile } from 'fs/promises';

async function fixTemplateParent() {
  console.log('🔧 Fixing template_book_open parent...');
  
  const templatePath = 'dist/complete-cit-pommel/assets/minecraft/models/item/books_3d/template_book_open.json';
  const content = await readFile(templatePath, 'utf-8');
  const model = JSON.parse(content);
  
  // Remove the problematic parent
  if (model.parent === 'builtin/entity') {
    delete model.parent;
    console.log('  ✅ Removed builtin/entity parent');
    
    await writeFile(templatePath, JSON.stringify(model, null, '\t'));
    console.log('  ✅ Updated template_book_open.json');
    return true;
  } else {
    console.log('  ℹ️ Parent was not builtin/entity');
    return false;
  }
}

if (import.meta.main) {
  fixTemplateParent()
    .then(fixed => {
      if (fixed) {
        console.log('✅ Template fix complete! Test again.');
      }
    })
    .catch(error => {
      console.error('❌ Fix failed:', error.message);
    });
}
