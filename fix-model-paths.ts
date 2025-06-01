#!/usr/bin/env bun

/**
 * Fix the CustomModelData converter to use correct 3D model paths
 */

import { promises as fs } from 'fs';
import path from 'path';

interface EnchantmentMapping {
  enchantment: string;
  level: number;
  originalPath: string;
  correctedPath: string;
}

function extractAndCorrectMappings(json: any): EnchantmentMapping[] {
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
              const originalPath = case_.model.model.replace('minecraft:', '');
              
              // Map to correct 3D model paths
              const correctedPath = mapTo3DModel(cleanEnchName, level as number);
              
              mappings.push({
                enchantment: cleanEnchName,
                level: level as number,
                originalPath,
                correctedPath
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

/**
 * Map enchantments to their correct 3D model paths
 */
function mapTo3DModel(enchantment: string, level: number): string {
  // Check if we have a specific 3D model for this enchantment
  const specificModels: Record<string, string> = {
    // Single-level enchantments (no level in filename)
    'aqua_affinity': 'item/books_3d/enchanted_book_3d',
    'channeling': 'item/books_3d/enchanted_book_3d',
    'binding_curse': 'item/books_3d/enchanted_book_3d',
    'vanishing_curse': 'item/books_3d/enchanted_book_3d',
    'flame': 'item/books_3d/enchanted_book_3d',
    'infinity': 'item/books_3d/enchanted_book_3d',
    'mending': 'item/books_3d/enchanted_book_3d',
    'multishot': 'item/books_3d/enchanted_book_3d',
    'silk_touch': 'item/books_3d/enchanted_book_3d',
    
    // Multi-level enchantments - use generic for now
    'sharpness': 'item/books_3d/enchanted_book_3d',
    'protection': 'item/books_3d/enchanted_book_3d',
    'efficiency': 'item/books_3d/enchanted_book_3d',
    'unbreaking': 'item/books_3d/enchanted_book_3d',
    'power': 'item/books_3d/enchanted_book_3d',
    'bane_of_arthropods': 'item/books_3d/enchanted_book_3d',
    // Add more as needed
  };
  
  // Return specific model if exists, otherwise use generic 3D enchanted book
  return specificModels[enchantment] || 'item/books_3d/enchanted_book_3d';
}

/**
 * Create corrected CustomModelData pack
 */
async function createCorrectedCMD(inputDir: string, outputDir: string): Promise<void> {
  console.log('Creating corrected CustomModelData pack...');
  console.log('Using proper 3D model paths');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Fixed');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Fixed)\n§7Corrected 3D model paths"
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
  
  // Process enchanted books with corrected paths
  const enchantedBookPath = path.join(inputDir, 'assets', 'minecraft', 'items', 'enchanted_book.json');
  let mappings: EnchantmentMapping[] = [];
  
  try {
    const content = await fs.readFile(enchantedBookPath, 'utf-8');
    const json = JSON.parse(content);
    mappings = extractAndCorrectMappings(json);
  } catch (error) {
    console.error('Could not process enchanted_book.json:', error);
  }
  
  // Create enchanted book model with corrected 3D paths
  const overrides = mappings.map((mapping, index) => ({
    predicate: { custom_model_data: index + 1 },
    model: mapping.correctedPath
  }));
  
  const enchantedBookModel = {
    parent: "item/books_3d/enchanted_book_3d", // Default to 3D model
    overrides
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'enchanted_book.json'),
    JSON.stringify(enchantedBookModel, null, 2)
  );
  
  console.log(`Created enchanted_book.json with ${overrides.length} corrected 3D overrides`);
  
  // Create other book models (simple 3D)
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
  
  // Generate corrected commands
  const commandsDir = path.join(packDir, 'commands');
  await fs.mkdir(commandsDir, { recursive: true });
  
  const commands = mappings.map((mapping, index) => {
    const cmdId = index + 1;
    const enchId = `minecraft:${mapping.enchantment}`;
    return `# ${mapping.enchantment} level ${mapping.level} → ${mapping.correctedPath}
/give @p minecraft:enchanted_book[minecraft:custom_model_data=${cmdId},minecraft:stored_enchantments=[{id:"${enchId}",lvl:${mapping.level}}]]`;
  });
  
  const commandsContent = `# Fixed 3D Books Pack Commands
# All commands now point to proper 3D models!

# 🎮 AUTOMATIC 3D:
# All books from creative are 3D by default

# 🎯 SPECIFIC ENCHANTMENTS (all 3D):
${commands.join('\n\n')}

# 🧪 QUICK TESTS:
# Generic 3D enchanted book:
/give @p minecraft:enchanted_book

# Specific 3D enchanted book:
/give @p minecraft:enchanted_book[minecraft:custom_model_data=1,minecraft:stored_enchantments=[{id:"minecraft:aqua_affinity",lvl:1}]]`;
  
  await fs.writeFile(
    path.join(commandsDir, 'corrected_commands.txt'),
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
  
  // Show mapping summary
  console.log('\n📋 Path Corrections Applied:');
  const uniqueCorrections = new Map<string, string>();
  mappings.forEach(m => {
    if (!uniqueCorrections.has(m.enchantment)) {
      uniqueCorrections.set(m.enchantment, m.correctedPath);
    }
  });
  
  let count = 0;
  for (const [ench, path] of uniqueCorrections) {
    if (count < 5) { // Show first 5
      console.log(`  ${ench} → ${path}`);
    }
    count++;
  }
  if (count > 5) {
    console.log(`  ... and ${count - 5} more`);
  }
  
  console.log('');
  console.log('✅ Fixed pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🎮 NOW ALL MODELS SHOULD BE 3D!');
  console.log('');
  console.log('🧪 TEST:');
  console.log('/give @p minecraft:enchanted_book[minecraft:custom_model_data=1]');
  console.log('Should show 3D enchanted book model!');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun fix-model-paths.ts <input-dir> <output-dir>');
    console.log('Example: bun fix-model-paths.ts . .');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  createCorrectedCMD(inputDir, outputDir).catch(console.error);
}
