#!/usr/bin/env bun

/**
 * Creates hand-aware 3D books:
 * - Right hand: Open book models
 * - Left hand/inventory: Closed book models
 * - CustomModelData overrides for specific enchantments
 */

import { promises as fs } from 'fs';
import path from 'path';

interface EnchantmentMapping {
  enchantment: string;
  level: number;
  modelPath: string;
}

function extractEnchantmentMappings(json: any): EnchantmentMapping[] {
  const mappings: EnchantmentMapping[] = [];
  
  function traverse(node: any): void {
    if (!node || typeof node !== 'object') return;
    
    if (node.type === 'minecraft:select' && node.component === 'minecraft:stored_enchantments') {
      for (const case_ of node.cases || []) {
        if (typeof case_.when === 'object' && !Array.isArray(case_.when)) {
          for (const [enchName, level] of Object.entries(case_.when)) {
            const cleanEnchName = enchName.replace('minecraft:', '');
            if (case_.model?.type === 'minecraft:model' && case_.model.model) {
              mappings.push({
                enchantment: cleanEnchName,
                level: level as number,
                modelPath: case_.model.model.replace('minecraft:', '')
              });
            }
          }
        }
      }
    }
    
    if (node.cases) {
      for (const case_ of node.cases) {
        traverse(case_.model);
      }
    }
    if (node.fallback) {
      traverse(node.fallback);
    }
  }
  
  if (json.model) {
    traverse(json.model);
  }
  
  return mappings;
}

async function createHandAware(inputDir: string, outputDir: string): Promise<void> {
  console.log('Creating hand-aware 3D books...');
  console.log('📖 Right hand = Open books, Left hand/inventory = Closed books');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-HandAware');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Hand-Aware)\n§7Open in right hand, closed elsewhere"
    }
  };
  
  await fs.writeFile(
    path.join(packDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Copy pack.png
  try {
    await fs.copyFile(
      path.join(inputDir, 'pack.png'),
      path.join(packDir, 'pack.png')
    );
  } catch (error) {
    console.log('pack.png not found, skipping...');
  }
  
  // Create hand-aware book models
  const bookConfigs = [
    {
      name: 'book',
      closedModel: 'item/books_3d/book_3d',
      openModel: 'item/books_3d/book_3d_open'
    },
    {
      name: 'written_book', 
      closedModel: 'item/books_3d/written_book_3d',
      openModel: 'item/books_3d/written_book_3d_open'
    },
    {
      name: 'writable_book',
      closedModel: 'item/books_3d/writable_book_3d', 
      openModel: 'item/books_3d/writable_book_3d_open'
    },
    {
      name: 'knowledge_book',
      closedModel: 'item/books_3d/knowledge_book_3d',
      openModel: 'item/books_3d/knowledge_book_3d_open'
    }
  ];
  
  // Create hand-aware models for regular books
  for (const config of bookConfigs) {
    const model = {
      parent: config.closedModel, // Default to closed model
      overrides: [
        {
          predicate: { lefthanded: false }, // Right hand
          model: config.openModel
        }
      ]
    };
    
    await fs.writeFile(
      path.join(modelsDir, `${config.name}.json`),
      JSON.stringify(model, null, 2)
    );
    
    console.log(`Created ${config.name}.json: closed by default, open in right hand`);
  }
  
  // Process enchanted books
  const enchantedBookPath = path.join(inputDir, 'assets', 'minecraft', 'items', 'enchanted_book.json');
  let enchantmentMappings: EnchantmentMapping[] = [];
  
  try {
    const content = await fs.readFile(enchantedBookPath, 'utf-8');
    const json = JSON.parse(content);
    enchantmentMappings = extractEnchantmentMappings(json);
  } catch (error) {
    console.error('Could not process enchanted_book.json:', error);
  }
  
  // Create hand-aware enchanted book model
  const enchantedOverrides = [
    // Right hand = open generic enchanted book
    {
      predicate: { lefthanded: false },
      model: "item/books_3d/enchanted_book_3d_open"
    },
    // CustomModelData overrides for specific enchantments
    ...enchantmentMappings.map((mapping, index) => ({
      predicate: { custom_model_data: index + 1 },
      model: mapping.modelPath
    }))
  ];
  
  const enchantedBookModel = {
    parent: "item/books_3d/enchanted_book_3d", // Default: closed generic
    overrides: enchantedOverrides
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'enchanted_book.json'),
    JSON.stringify(enchantedBookModel, null, 2)
  );
  
  console.log(`Created enchanted_book.json: closed by default, open in right hand, ${enchantmentMappings.length} CustomModelData overrides`);
  
  // Generate commands file
  const commandsDir = path.join(packDir, 'commands');
  await fs.mkdir(commandsDir, { recursive: true });
  
  const commands = enchantmentMappings.map((mapping, index) => {
    const cmdId = index + 1;
    const enchId = `minecraft:${mapping.enchantment}`;
    return `# ${mapping.enchantment} level ${mapping.level}\n/give @p minecraft:enchanted_book{CustomModelData:${cmdId},StoredEnchantments:[{id:"${enchId}",lvl:${mapping.level}}]}`;
  });
  
  const commandsContent = `# Hand-Aware Book Pack Commands
# 
# 🎮 AUTOMATIC BEHAVIOR:
# • Books in inventory/left hand: Closed 3D models
# • Books in right hand: Open 3D models  
# • All enchanted books: Generic 3D models (open in right hand)
# 
# 🎯 SPECIFIC ENCHANTMENTS:
# Use these commands for specific enchanted book models:

${commands.join('\n\n')}

# 🧪 TEST COMMANDS:
# Basic books (will be open in right hand, closed elsewhere):
/give @p minecraft:book
/give @p minecraft:written_book
/give @p minecraft:writable_book

# Enchanted books (generic, but open in right hand):
/give @p minecraft:enchanted_book{StoredEnchantments:[{id:"minecraft:sharpness",lvl:1}]}`;
  
  await fs.writeFile(
    path.join(commandsDir, 'all_commands.txt'),
    commandsContent
  );
  
  // Copy models and textures
  console.log('Copying models and textures...');
  
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
    path.join(inputDir, 'assets', 'minecraft', 'models'),
    path.join(packDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'textures'),
    path.join(packDir, 'assets', 'minecraft', 'textures')
  );
  
  console.log('');
  console.log('✅ Hand-aware pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🎮 HOW IT WORKS:');
  console.log('• Books in inventory/left hand: Closed 3D models');
  console.log('• Books in RIGHT HAND: Open 3D models! 📖');
  console.log('• CustomModelData still available for specific enchantments');
  console.log('');
  console.log('🧪 TESTING:');
  console.log('1. Get any book from creative');
  console.log('2. Hold in RIGHT HAND → should be open!');
  console.log('3. Put in inventory → should be closed!');
  console.log('4. Hold in LEFT HAND → should be closed!');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun create-hand-aware.ts <input-dir> <output-dir>');
    console.log('Example: bun create-hand-aware.ts . .');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  createHandAware(inputDir, outputDir).catch(console.error);
}
