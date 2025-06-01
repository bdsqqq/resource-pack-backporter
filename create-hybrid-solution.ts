#!/usr/bin/env bun

/**
 * Creates the best practical solution:
 * - All books are 3D by default (works immediately)
 * - CustomModelData overrides for specific enchanted book models (optional)
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
    
    // Component-based enchantment selection
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
    
    // Recurse
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

async function createHybridSolution(inputDir: string, outputDir: string): Promise<void> {
  console.log('Creating hybrid 3D book solution...');
  console.log('📚 Generic 3D models by default + CustomModelData overrides');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Hybrid');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Hybrid)\n§7Default 3D + CustomModelData variants"
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
  
  // Create hybrid enchanted book model
  const overrides = enchantmentMappings.map((mapping, index) => ({
    predicate: { custom_model_data: index + 1 },
    model: mapping.modelPath
  }));
  
  const enchantedBookModel = {
    // Default to 3D generic model (works immediately)
    parent: "item/books_3d/enchanted_book_3d",
    // But provide overrides for specific enchantments via CustomModelData
    overrides
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'enchanted_book.json'),
    JSON.stringify(enchantedBookModel, null, 2)
  );
  
  console.log(`Created enchanted_book.json with default 3D + ${overrides.length} overrides`);
  
  // Create simple 3D models for other book types
  const bookModels = [
    { name: 'book', model: 'item/books_3d/book_3d' },
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
  
  // Generate commands file
  const commandsDir = path.join(packDir, 'commands');
  await fs.mkdir(commandsDir, { recursive: true });
  
  const commands = enchantmentMappings.map((mapping, index) => {
    const cmdId = index + 1;
    const enchId = `minecraft:${mapping.enchantment}`;
    return `# ${mapping.enchantment} level ${mapping.level}\n/give @p minecraft:enchanted_book{CustomModelData:${cmdId},StoredEnchantments:[{id:"${enchId}",lvl:${mapping.level}}]}`;
  });
  
  const commandsContent = `# Hybrid Book Pack Commands
# 
# 🎮 IMMEDIATE USE:
# All books from creative inventory are automatically 3D!
# 
# 🎯 SPECIFIC ENCHANTMENTS:
# Use these commands for specific enchanted book models:

${commands.join('\n\n')}`;
  
  await fs.writeFile(
    path.join(commandsDir, 'enchanted_book_commands.txt'),
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
  console.log('✅ Hybrid solution created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🎮 HOW IT WORKS:');
  console.log('• ALL books from creative are immediately 3D (generic models)');
  console.log('• Use commands for specific enchanted book models');
  console.log('• Best of both worlds!');
  console.log('');
  console.log('🧪 TESTING:');
  console.log('1. Enable pack → immediate 3D books');
  console.log('2. Try command: /give @p minecraft:enchanted_book{CustomModelData:1,StoredEnchantments:[{id:"minecraft:aqua_affinity",lvl:1}]}');
  console.log('3. Should show specific aqua affinity model!');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun create-hybrid-solution.ts <input-dir> <output-dir>');
    console.log('Example: bun create-hybrid-solution.ts . .');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  createHybridSolution(inputDir, outputDir).catch(console.error);
}
