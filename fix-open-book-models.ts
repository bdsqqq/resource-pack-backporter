#!/usr/bin/env bun

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  [key: string]: any;
}

interface BookModel {
  elements?: ModelElement[];
  [key: string]: any;
}

function fixZeroThicknessElements(model: BookModel): boolean {
  if (!model.elements) return false;
  
  let hasChanges = false;
  
  for (const element of model.elements) {
    if (!element.from || !element.to) continue;
    
    // Check each axis (X, Y, Z) for zero thickness
    for (let axis = 0; axis < 3; axis++) {
      if (element.from[axis] === element.to[axis]) {
        // Add minimal thickness (0.01) to the 'to' coordinate
        element.to[axis] += 0.01;
        hasChanges = true;
        console.log(`  Fixed zero-thickness on axis ${axis}: ${element.from[axis]} -> ${element.to[axis]}`);
      }
    }
  }
  
  return hasChanges;
}

async function fixOpenBookModels(inputDir: string, outputDir: string) {
  console.log('🔧 Fixing open book models for 1.21.1 compatibility...');
  
  const booksDir = join(inputDir, 'assets/minecraft/models/item/books_3d');
  const outputBooksDir = join(outputDir, 'assets/minecraft/models/item/books_3d');
  
  // First, copy all models
  console.log('📁 Copying all book models...');
  const { cp } = await import('fs/promises');
  await cp(booksDir, outputBooksDir, { recursive: true });
  
  // Then fix open models
  const files = await readdir(outputBooksDir);
  const openModelFiles = files.filter(file => file.includes('_open.json'));
  
  console.log(`🔍 Found ${openModelFiles.length} open book models to fix`);
  
  let totalFixed = 0;
  
  for (const file of openModelFiles) {
    const filePath = join(outputBooksDir, file);
    console.log(`\n📖 Processing ${file}...`);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const model: BookModel = JSON.parse(content);
      
      const hasChanges = fixZeroThicknessElements(model);
      
      if (hasChanges) {
        await writeFile(filePath, JSON.stringify(model, null, '\t'));
        console.log(`  ✅ Fixed ${file}`);
        totalFixed++;
      } else {
        console.log(`  ✓ ${file} already has proper thickness`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${file}:`, error);
    }
  }
  
  console.log(`\n🎉 Fixed ${totalFixed} open book models for 1.21.1 compatibility!`);
  console.log(`📁 Output: ${outputDir}`);
}

// CLI usage
if (import.meta.main) {
  const [inputDir = '.', outputDir = 'dist/fixed-open-books'] = process.argv.slice(2);
  
  fixOpenBookModels(inputDir, outputDir)
    .catch(error => {
      console.error('❌ Fix failed:', error.message);
      process.exit(1);
    });
}
