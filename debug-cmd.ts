#!/usr/bin/env bun

/**
 * Debug CustomModelData issues and create a simple working test
 */

import { promises as fs } from 'fs';
import path from 'path';

async function createCMDDebug(outputDir: string): Promise<void> {
  console.log('Creating CustomModelData debug pack...');
  
  const packDir = path.join(outputDir, 'CMD-Debug-Pack');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "CMD Debug Pack - Testing CustomModelData"
    }
  };
  
  await fs.writeFile(
    path.join(packDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Create a simple test model that should definitely work
  const testModel = {
    parent: "item/generated",
    textures: {
      layer0: "block/red_wool"  // Use a texture we know exists
    }
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'test_red.json'),
    JSON.stringify(testModel, null, 2)
  );
  
  // Create enchanted book with VERY simple overrides
  const enchantedBookModel = {
    parent: "item/generated",
    textures: {
      layer0: "item/enchanted_book"
    },
    overrides: [
      {
        predicate: { custom_model_data: 1 },
        model: "item/test_red"  // Simple test model
      },
      {
        predicate: { custom_model_data: 2 },
        model: "item/books_3d/enchanted_book_3d"  // Try 3D model
      },
      {
        predicate: { custom_model_data: 3 },
        model: "item/books_3d/aqua_affinity"  // Try specific enchantment model
      }
    ]
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'enchanted_book.json'),
    JSON.stringify(enchantedBookModel, null, 2)
  );
  
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
      console.log(`Could not copy ${src}`);
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
  
  // Create test commands
  const testCommands = `# CustomModelData Debug Tests

## Test 1: Red Wool Texture (should definitely work)
/give @p minecraft:enchanted_book[minecraft:custom_model_data=1]

## Test 2: 3D Enchanted Book Model  
/give @p minecraft:enchanted_book[minecraft:custom_model_data=2]

## Test 3: Specific Aqua Affinity Model
/give @p minecraft:enchanted_book[minecraft:custom_model_data=3]

## What to expect:
- CMD 1: Red block texture (proves CustomModelData works)
- CMD 2: 3D enchanted book model
- CMD 3: Specific aqua affinity model

## If CMD 1 doesn't work:
- CustomModelData system is broken
- Check resource pack is enabled and reloaded

## If CMD 1 works but 2/3 don't:
- Model paths are wrong
- 3D models have issues
`;
  
  await fs.writeFile(path.join(packDir, 'TEST_COMMANDS.txt'), testCommands);
  
  console.log('✅ Debug pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🧪 TEST STEPS:');
  console.log('1. Enable this pack');
  console.log('2. Try: /give @p minecraft:enchanted_book[minecraft:custom_model_data=1]');
  console.log('3. Should show RED TEXTURE (proves CustomModelData works)');
  console.log('4. If red works, try CMD 2 and 3 for 3D models');
}

async function checkExistingModels(): Promise<void> {
  console.log('\n🔍 Checking existing model files...');
  
  const modelsToCheck = [
    'assets/minecraft/models/item/books_3d/enchanted_book_3d.json',
    'assets/minecraft/models/item/books_3d/aqua_affinity.json',
    'assets/minecraft/models/item/enchanted_books/aqua_affinity.json'
  ];
  
  for (const modelPath of modelsToCheck) {
    try {
      await fs.access(modelPath);
      console.log(`✅ Found: ${modelPath}`);
      
      // Read and check the model
      const content = await fs.readFile(modelPath, 'utf-8');
      const model = JSON.parse(content);
      console.log(`   Parent: ${model.parent || 'none'}`);
      
      if (model.textures) {
        console.log(`   Textures: ${Object.keys(model.textures).join(', ')}`);
      }
    } catch (error) {
      console.log(`❌ Missing: ${modelPath}`);
    }
  }
}

if (import.meta.main) {
  Promise.all([
    createCMDDebug('.'),
    checkExistingModels()
  ]).catch(console.error);
}
