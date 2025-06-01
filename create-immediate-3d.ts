#!/usr/bin/env bun

/**
 * Creates a resource pack where ALL books are 3D by default (no CustomModelData needed)
 */

import { promises as fs } from 'fs';
import path from 'path';

async function createImmediate3D(outputDir: string): Promise<void> {
  console.log('Creating immediate 3D book pack (no commands needed)...');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Immediate');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Immediate 3D)\n§7All books are 3D by default"
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
  
  // Create simple item models that directly use 3D models
  const itemModels = [
    {
      name: 'book',
      model: 'item/books_3d/book_3d',
      description: 'Regular books → 3D'
    },
    {
      name: 'enchanted_book', 
      model: 'item/books_3d/enchanted_book_3d',
      description: 'Enchanted books → 3D (generic model since we cannot detect enchantments)'
    },
    {
      name: 'written_book',
      model: 'item/books_3d/written_book_3d',
      description: 'Written books → 3D'
    },
    {
      name: 'writable_book',
      model: 'item/books_3d/writable_book_3d',
      description: 'Writable books → 3D'
    },
    {
      name: 'knowledge_book',
      model: 'item/books_3d/knowledge_book_3d',
      description: 'Knowledge books → 3D'
    }
  ];
  
  // Generate simple item models
  for (const item of itemModels) {
    const itemModel = {
      parent: item.model
    };
    
    await fs.writeFile(
      path.join(modelsDir, `${item.name}.json`),
      JSON.stringify(itemModel, null, 2)
    );
    
    console.log(`Created ${item.name}.json → ${item.model}`);
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
      // Directory doesn't exist, skip
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
  console.log('✅ Immediate 3D pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🎮 TESTING:');
  console.log('1. Enable this pack in Minecraft');
  console.log('2. Get any book from creative inventory');
  console.log('3. Should immediately show as 3D model!');
  console.log('');
  console.log('⚠️  LIMITATION:');
  console.log('• All enchanted books use same generic 3D model');
  console.log('• Cannot differentiate by enchantment without CustomModelData');
  console.log('• But you should see 3D models immediately!');
}

if (import.meta.main) {
  createImmediate3D('.').catch(console.error);
}
