#!/usr/bin/env bun

/**
 * Fixes NBT syntax in CIT properties files
 */

import { promises as fs } from 'fs';
import path from 'path';

async function fixNBTSyntax(citDir: string): Promise<void> {
  console.log('Fixing NBT syntax in CIT properties files...');
  
  const files = await fs.readdir(citDir);
  const propertyFiles = files.filter(f => f.endsWith('.properties'));
  
  for (const file of propertyFiles) {
    const filePath = path.join(citDir, file);
    let content = await fs.readFile(filePath, 'utf-8');
    
    // Check if this file has NBT rules
    if (content.includes('nbt.StoredEnchantments')) {
      console.log(`Fixing ${file}...`);
      
      // Replace the problematic NBT syntax with simpler alternatives
      // Try different NBT syntax formats that CIT might accept better
      
      // Original: nbt.StoredEnchantments.0.id=minecraft:sharpness
      // Fixed: Use tag.StoredEnchantments.0.id or different syntax
      
      content = content.replace(
        /nbt\.StoredEnchantments\.0\.id=minecraft:([^\\n]+)/g,
        'nbt.StoredEnchantments[0].id=minecraft:$1'
      );
      
      content = content.replace(
        /nbt\.StoredEnchantments\.0\.lvl=(\d+)s/g,
        'nbt.StoredEnchantments[0].lvl=$1'
      );
      
      await fs.writeFile(filePath, content);
    }
  }
  
  console.log('NBT syntax fixed!');
}

async function createSimpleEnchantedBookTest(outputDir: string): Promise<void> {
  console.log('Creating simple enchanted book test...');
  
  const testDir = path.join(outputDir, 'simple-enchanted-test');
  const citDir = path.join(testDir, 'assets', 'minecraft', 'optifine', 'cit');
  await fs.mkdir(citDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "Simple Enchanted Book Test - Fixed NBT"
    }
  };
  
  await fs.writeFile(
    path.join(testDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Create a very simple test that doesn't use NBT at all first
  const simpleTest = `type=item
items=minecraft:enchanted_book
model=../../../models/item/books_3d/enchanted_book_3d.json
`;
  
  await fs.writeFile(
    path.join(citDir, 'all_enchanted_books.properties'),
    simpleTest
  );
  
  // Copy models and textures
  const modelsDir = path.join(testDir, 'assets', 'minecraft', 'models');
  const texturesDir = path.join(testDir, 'assets', 'minecraft', 'textures');
  
  // Copy directory function
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
      // Directory doesn't exist, skip silently
    }
  }
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'models'),
    modelsDir
  );
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'textures'),
    texturesDir
  );
  
  console.log(`Simple test created: ${testDir}`);
  console.log('This test makes ALL enchanted books use the 3D model (no NBT matching)');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'fix') {
    const citDir = args[1] || "/Users/bdsqqq/Library/Application Support/ModrinthApp/profiles/Fabulously Optimized (1)/resourcepacks/Better-Fresher-3D-Books-CIT/assets/minecraft/optifine/cit";
    fixNBTSyntax(citDir).catch(console.error);
  } else if (args[0] === 'simple') {
    createSimpleEnchantedBookTest('.').catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  bun fix-nbt-syntax.ts fix [cit-directory]  - Fix NBT syntax in existing files');
    console.log('  bun fix-nbt-syntax.ts simple               - Create simple test pack');
  }
}
