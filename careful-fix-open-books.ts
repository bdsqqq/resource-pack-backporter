#!/usr/bin/env bun

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

async function carefulFixSingleModel(modelPath: string) {
  console.log(`🔧 Carefully fixing ${modelPath}...`);
  
  const content = await readFile(modelPath, 'utf-8');
  const model = JSON.parse(content);
  
  if (!model.elements) {
    console.log('  No elements found');
    return false;
  }
  
  let hasChanges = false;
  let changesCount = 0;
  
  for (let i = 0; i < model.elements.length; i++) {
    const element = model.elements[i];
    if (!element.from || !element.to) continue;
    
    // Check each axis for exact zero thickness
    for (let axis = 0; axis < 3; axis++) {
      if (element.from[axis] === element.to[axis]) {
        const oldValue = element.to[axis];
        element.to[axis] = element.to[axis] + 0.01;
        console.log(`  Element ${i}: Fixed axis ${axis}: ${oldValue} -> ${element.to[axis]}`);
        hasChanges = true;
        changesCount++;
      }
    }
  }
  
  if (hasChanges) {
    // Write back with original formatting (2 spaces, not tabs)
    await writeFile(modelPath, JSON.stringify(model, null, 2));
    console.log(`  ✅ Applied ${changesCount} fixes`);
  } else {
    console.log('  ✓ No fixes needed');
  }
  
  return hasChanges;
}

// Test with just aqua_affinity first
if (import.meta.main) {
  const testPath = 'dist/complete-cit-pommel/assets/minecraft/models/item/books_3d/aqua_affinity_3d_open.json';
  
  carefulFixSingleModel(testPath)
    .then(fixed => {
      if (fixed) {
        console.log('✅ Test fix complete! Copy the pack and test in-game');
      } else {
        console.log('ℹ️ No changes needed');
      }
    })
    .catch(error => {
      console.error('❌ Fix failed:', error.message);
    });
}
