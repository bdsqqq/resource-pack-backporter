#!/usr/bin/env bun

/**
 * Test which predicates actually work in 1.21.1
 * Create simple test cases to verify predicate support
 */

import { promises as fs } from 'fs';
import path from 'path';

async function createPredicateTests(outputDir: string): Promise<void> {
  console.log('Creating predicate test pack...');
  
  const packDir = path.join(outputDir, 'Predicate-Test-Pack');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "Predicate Test Pack - Testing what works in 1.21.1"
    }
  };
  
  await fs.writeFile(
    path.join(packDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Create test models directory
  const testModelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item', 'test');
  await fs.mkdir(testModelsDir, { recursive: true });
  
  // Create simple test models
  const redModel = {
    parent: "item/generated",
    textures: { layer0: "block/red_wool" }
  };
  
  const greenModel = {
    parent: "item/generated", 
    textures: { layer0: "block/green_wool" }
  };
  
  const blueModel = {
    parent: "item/generated",
    textures: { layer0: "block/blue_wool" }
  };
  
  await fs.writeFile(path.join(testModelsDir, 'red.json'), JSON.stringify(redModel, null, 2));
  await fs.writeFile(path.join(testModelsDir, 'green.json'), JSON.stringify(greenModel, null, 2));
  await fs.writeFile(path.join(testModelsDir, 'blue.json'), JSON.stringify(blueModel, null, 2));
  
  // Test different predicates on a book
  const testConfigs = [
    {
      name: 'book_test_lefthanded',
      predicates: [
        { predicate: { lefthanded: true }, model: "item/test/red", comment: "Left-handed players" },
        { predicate: { lefthanded: false }, model: "item/test/green", comment: "Right-handed players" }
      ]
    },
    {
      name: 'book_test_damaged',
      predicates: [
        { predicate: { damaged: true }, model: "item/test/red", comment: "Damaged items" },
        { predicate: { damaged: false }, model: "item/test/green", comment: "Undamaged items" }
      ]
    },
    {
      name: 'book_test_custom_model_data',
      predicates: [
        { predicate: { custom_model_data: 1 }, model: "item/test/red", comment: "CMD = 1" },
        { predicate: { custom_model_data: 2 }, model: "item/test/green", comment: "CMD = 2" },
        { predicate: { custom_model_data: 3 }, model: "item/test/blue", comment: "CMD = 3" }
      ]
    }
  ];
  
  for (const config of testConfigs) {
    const testModel = {
      parent: "item/generated",
      textures: { layer0: "item/book" },
      overrides: config.predicates.map(p => ({
        predicate: p.predicate,
        model: p.model
      }))
    };
    
    await fs.writeFile(
      path.join(modelsDir, `${config.name}.json`),
      JSON.stringify(testModel, null, 2)
    );
    
    console.log(`Created ${config.name}.json`);
    config.predicates.forEach(p => {
      console.log(`  ${JSON.stringify(p.predicate)} → ${p.model} (${p.comment})`);
    });
  }
  
  // Create a working fallback - just better default models
  const simpleBookModel = {
    parent: "item/books_3d/book_3d"
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'book.json'),
    JSON.stringify(simpleBookModel, null, 2)
  );
  
  // Copy some basic models for testing
  async function copyDirectory(src: string, dest: string): Promise<void> {
    try {
      await fs.access(src);
      await fs.mkdir(dest, { recursive: true });
      
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      // Skip missing directories
    }
  }
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'models'),
    path.join(packDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'textures'),
    path.join(packDir, 'assets', 'minecraft', 'textures')
  );
  
  // Create test instructions
  const instructions = `# Predicate Test Pack Instructions

## What to Test:

### 1. Test book_test_lefthanded.json
- Rename it to book.json temporarily
- Should show different colors based on left/right-handed setting
- Red = left-handed players, Green = right-handed players

### 2. Test book_test_custom_model_data.json  
- Rename it to book.json temporarily
- Use commands:
  /give @p minecraft:book{CustomModelData:1} (should be red)
  /give @p minecraft:book{CustomModelData:2} (should be green)
  /give @p minecraft:book{CustomModelData:3} (should be blue)

### 3. Test book_test_damaged.json
- Rename it to book.json temporarily  
- Get damaged vs undamaged books (books don't usually have durability though)

## Results:
- Note which predicates actually work
- CustomModelData should definitely work
- lefthanded and damaged are questionable

## Current Working Predicates in 1.21.1:
✅ custom_model_data
❓ lefthanded  
❓ damaged
❓ Others unknown
`;

  await fs.writeFile(path.join(packDir, 'TEST_INSTRUCTIONS.txt'), instructions);
  
  console.log('');
  console.log('✅ Predicate test pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🧪 TESTING APPROACH:');
  console.log('1. Copy different test files to book.json');
  console.log('2. See which predicates actually work');
  console.log('3. Build working solution based on results');
}

async function createSimpleWorking(outputDir: string): Promise<void> {
  console.log('\nCreating simple working solution...');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Simple');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Simple Working)\n§7All books are 3D, no fancy predicates"
    }
  };
  
  await fs.writeFile(
    path.join(packDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Copy pack.png
  try {
    await fs.copyFile(
      path.join(process.cwd(), 'pack.png'),
      path.join(packDir, 'pack.png')
    );
  } catch (error) {
    console.log('pack.png not found, skipping...');
  }
  
  // Create simple 3D models that just work
  const bookModels = [
    { name: 'book', model: 'item/books_3d/book_3d' },
    { name: 'enchanted_book', model: 'item/books_3d/enchanted_book_3d' },
    { name: 'written_book', model: 'item/books_3d/written_book_3d' },
    { name: 'writable_book', model: 'item/books_3d/writable_book_3d' },
    { name: 'knowledge_book', model: 'item/books_3d/knowledge_book_3d' }
  ];
  
  for (const book of bookModels) {
    const model = { parent: book.model };
    await fs.writeFile(
      path.join(modelsDir, `${book.name}.json`),
      JSON.stringify(model, null, 2)
    );
    console.log(`Created ${book.name}.json → ${book.model}`);
  }
  
  // Copy models and textures
  async function copyDirectory(src: string, dest: string): Promise<void> {
    try {
      await fs.access(src);
      await fs.mkdir(dest, { recursive: true });
      
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      // Skip missing directories
    }
  }
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'models'),
    path.join(packDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'textures'),
    path.join(packDir, 'assets', 'minecraft', 'textures')
  );
  
  console.log('✅ Simple working pack created!');
  console.log('This should definitely work - all books become 3D immediately');
}

if (import.meta.main) {
  const outputDir = '.';
  
  Promise.all([
    createPredicateTests(outputDir),
    createSimpleWorking(outputDir)
  ]).catch(console.error);
}
