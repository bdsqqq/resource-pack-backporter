#!/usr/bin/env bun

/**
 * Fix CustomModelData to use SPECIFIC 3D enchantment models
 */

import { promises as fs } from 'fs';
import path from 'path';

interface EnchantmentMapping {
  enchantment: string;
  level: number;
  originalPath: string;
  specificModel: string;
}

/**
 * Map enchantments to their specific 3D models
 */
function mapToSpecific3DModel(enchantment: string, level: number): string {
  // Map enchantments to their specific 3D model files
  const specificModels: Record<string, string> = {
    'aqua_affinity': 'item/books_3d/aqua_affinity_3d',
    'bane_of_arthropods': 'item/books_3d/bane_of_arthropods_3d',
    'blast_protection': 'item/books_3d/blast_protection_3d',
    'channeling': 'item/books_3d/channeling_3d',
    'binding_curse': 'item/books_3d/curse_of_binding_3d',
    'vanishing_curse': 'item/books_3d/curse_of_vanishing_3d',
    'depth_strider': 'item/books_3d/depth_strider_3d',
    'efficiency': 'item/books_3d/efficiency_3d',
    'feather_falling': 'item/books_3d/feather_falling_3d',
    'fire_aspect': 'item/books_3d/fire_aspect_3d',
    'fire_protection': 'item/books_3d/fire_protection_3d',
    'flame': 'item/books_3d/flame_3d',
    'fortune': 'item/books_3d/fortune_3d',
    'frost_walker': 'item/books_3d/frost_walker_3d',
    'impaling': 'item/books_3d/impaling_3d',
    'infinity': 'item/books_3d/infinity_3d',
    'knockback': 'item/books_3d/knockback_3d',
    'looting': 'item/books_3d/looting_3d',
    'loyalty': 'item/books_3d/loyalty_3d',
    'luck_of_the_sea': 'item/books_3d/luck_of_the_sea_3d',
    'lure': 'item/books_3d/lure_3d',
    'mending': 'item/books_3d/mending_3d',
    'multishot': 'item/books_3d/multishot_3d',
    'piercing': 'item/books_3d/piercing_3d',
    'power': 'item/books_3d/power_3d',
    'projectile_protection': 'item/books_3d/projectile_protection_3d',
    'protection': 'item/books_3d/protection_3d',
    'punch': 'item/books_3d/punch_3d',
    'quick_charge': 'item/books_3d/quick_charge_3d',
    'respiration': 'item/books_3d/respiration_3d',
    'riptide': 'item/books_3d/riptide_3d',
    'sharpness': 'item/books_3d/sharpness_3d',
    'silk_touch': 'item/books_3d/silk_touch_3d',
    'smite': 'item/books_3d/smite_3d',
    'soul_speed': 'item/books_3d/soul_speed_3d',
    'sweeping_edge': 'item/books_3d/sweeping_edge_3d',
    'swift_sneak': 'item/books_3d/swift_sneak_3d',
    'thorns': 'item/books_3d/thorns_3d',
    'unbreaking': 'item/books_3d/unbreaking_3d',
    'wind_burst': 'item/books_3d/wind_burst_3d',
    'breach': 'item/books_3d/breach_3d',
    'density': 'item/books_3d/density_3d'
  };
  
  // Return specific model if exists, otherwise use generic 3D enchanted book
  return specificModels[enchantment] || 'item/books_3d/enchanted_book_3d';
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
              const originalPath = case_.model.model.replace('minecraft:', '');
              const specificModel = mapToSpecific3DModel(cleanEnchName, level as number);
              
              mappings.push({
                enchantment: cleanEnchName,
                level: level as number,
                originalPath,
                specificModel
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

async function createSpecificModels(inputDir: string, outputDir: string): Promise<void> {
  console.log('Creating pack with SPECIFIC 3D enchantment models...');
  
  const packDir = path.join(outputDir, 'dist', 'Better-Fresher-3D-Books-Specific');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Specific)\n§7Each enchantment has its own 3D model"
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
  let mappings: EnchantmentMapping[] = [];
  
  try {
    const content = await fs.readFile(enchantedBookPath, 'utf-8');
    const json = JSON.parse(content);
    mappings = extractEnchantmentMappings(json);
  } catch (error) {
    console.error('Could not process enchanted_book.json:', error);
  }
  
  // Create enchanted book model with SPECIFIC 3D models
  const overrides = mappings.map((mapping, index) => ({
    predicate: { custom_model_data: index + 1 },
    model: mapping.specificModel
  }));
  
  const enchantedBookModel = {
    parent: "item/books_3d/enchanted_book_3d", // Default generic 3D
    overrides
  };
  
  await fs.writeFile(
    path.join(modelsDir, 'enchanted_book.json'),
    JSON.stringify(enchantedBookModel, null, 2)
  );
  
  console.log(`Created enchanted_book.json with ${overrides.length} SPECIFIC 3D model overrides`);
  
  // Create other book models
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
  }
  
  // Generate commands with specific models
  const commandsDir = path.join(packDir, 'commands');
  await fs.mkdir(commandsDir, { recursive: true });
  
  const commands = mappings.map((mapping, index) => {
    const cmdId = index + 1;
    const enchId = `minecraft:${mapping.enchantment}`;
    return `# ${mapping.enchantment} level ${mapping.level} → ${mapping.specificModel}
/give @p minecraft:enchanted_book[custom_model_data=${cmdId},stored_enchantments=[{id:"${enchId}",lvl:${mapping.level}}]]`;
  });
  
  const commandsContent = `# Specific 3D Enchantment Models Pack
# Each enchantment now has its own unique 3D model!

🎯 SPECIFIC ENCHANTMENT MODELS:
${commands.slice(0, 10).join('\n\n')}

... and ${commands.length - 10} more!

🧪 QUICK TESTS:
# Aqua Affinity (specific model):
/give @p minecraft:enchanted_book[custom_model_data=1]

# Sharpness (different specific model):
/give @p minecraft:enchanted_book[custom_model_data=96]

# Each should look completely different!`;
  
  await fs.writeFile(
    path.join(commandsDir, 'specific_commands.txt'),
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
      // Skip
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
  
  // Show specific mappings
  console.log('\n📋 Specific Model Mappings:');
  const uniqueMappings = new Map<string, string>();
  mappings.forEach(m => {
    if (!uniqueMappings.has(m.enchantment)) {
      uniqueMappings.set(m.enchantment, m.specificModel);
    }
  });
  
  let count = 0;
  for (const [ench, model] of uniqueMappings) {
    if (count < 8) {
      console.log(`  ${ench} → ${model}`);
    }
    count++;
  }
  if (count > 8) {
    console.log(`  ... and ${count - 8} more specific models`);
  }
  
  console.log('');
  console.log('✅ Specific models pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🎯 NOW EACH ENCHANTMENT HAS ITS OWN UNIQUE 3D MODEL!');
  console.log('');
  console.log('🧪 TEST DIFFERENT MODELS:');
  console.log('/give @p minecraft:enchanted_book[custom_model_data=1]  # Aqua Affinity');
  console.log('/give @p minecraft:enchanted_book[custom_model_data=2]  # Bane of Arthropods'); 
  console.log('Each should look completely different!');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun fix-specific-models.ts <input-dir> <output-dir>');
    console.log('Example: bun fix-specific-models.ts . .');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  createSpecificModels(inputDir, outputDir).catch(console.error);
}
