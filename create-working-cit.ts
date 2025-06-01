#!/usr/bin/env bun

/**
 * Creates a working CIT pack that avoids NBT matching (not supported in 1.21+)
 */

import { promises as fs } from 'fs';
import path from 'path';

async function createWorkingCIT(outputDir: string): Promise<void> {
  console.log('Creating working CIT pack (no NBT, 1.21+ compatible)...');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Working');
  const citDir = path.join(packDir, 'assets', 'minecraft', 'optifine', 'cit');
  await fs.mkdir(citDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (CIT 1.21+ Compatible)\n§7All books use 3D models"
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
  
  // Create simple CIT rules that work in 1.21+
  const rules = [
    {
      name: 'book',
      item: 'minecraft:book',
      model: '../../../models/item/books_3d/book_3d.json',
      description: 'All books use 3D model'
    },
    {
      name: 'enchanted_book', 
      item: 'minecraft:enchanted_book',
      model: '../../../models/item/books_3d/enchanted_book_3d.json',
      description: 'All enchanted books use 3D model (cannot differentiate by enchantment in 1.21+)'
    },
    {
      name: 'written_book',
      item: 'minecraft:written_book', 
      model: '../../../models/item/books_3d/written_book_3d.json',
      description: 'All written books use 3D model'
    },
    {
      name: 'writable_book',
      item: 'minecraft:writable_book',
      model: '../../../models/item/books_3d/writable_book_3d.json', 
      description: 'All writable books use 3D model'
    },
    {
      name: 'knowledge_book',
      item: 'minecraft:knowledge_book',
      model: '../../../models/item/books_3d/knowledge_book_3d.json',
      description: 'All knowledge books use 3D model'
    }
  ];
  
  // Generate CIT properties files
  for (const rule of rules) {
    const properties = `# ${rule.description}
type=item
items=${rule.item}
model=${rule.model}
`;
    
    await fs.writeFile(
      path.join(citDir, `${rule.name}.properties`),
      properties
    );
    
    console.log(`Created ${rule.name}.properties`);
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
      console.log(`Could not copy ${src}: ${error}`);
    }
  }
  
  console.log('Copying models and textures...');
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'models'),
    path.join(packDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'textures'),
    path.join(packDir, 'assets', 'minecraft', 'textures')
  );
  
  console.log('');
  console.log('✅ Working CIT pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🔴 IMPORTANT LIMITATIONS:');
  console.log('• CIT Resewn does NOT support NBT matching in Minecraft 1.21+');
  console.log('• Cannot differentiate enchanted books by enchantment type');
  console.log('• All enchanted books will use the same 3D model');
  console.log('• Hand-based differentiation is unreliable');
  console.log('');
  console.log('✨ WHAT WORKS:');
  console.log('• All books become 3D models');
  console.log('• Different book types have different models');
  console.log('• Much more reliable than complex NBT rules');
  console.log('');
  console.log('🚀 TO USE:');
  console.log('1. Copy the pack to your resourcepacks folder');
  console.log('2. Enable in Minecraft');
  console.log('3. Enjoy 3D books!');
}

if (import.meta.main) {
  createWorkingCIT('.').catch(console.error);
}
