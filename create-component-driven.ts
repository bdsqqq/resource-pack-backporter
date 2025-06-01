#!/usr/bin/env bun

/**
 * Creates resource pack using stored enchantment component predicates
 * This should allow different models based on actual stored enchantments!
 */

import { promises as fs } from 'fs';
import path from 'path';

interface EnchantmentOverride {
  predicate: {
    [key: string]: any;
  };
  model: string;
}

interface EnchantmentMapping {
  enchantment: string;
  level?: number;
  modelPath: string;
}

/**
 * Extract enchantment mappings from the original JSON
 */
function extractEnchantmentMappings(json: any): EnchantmentMapping[] {
  const mappings: EnchantmentMapping[] = [];
  
  function traverse(node: any): void {
    if (!node || typeof node !== 'object') return;
    
    // Terminal model node
    if (node.type === 'minecraft:model' && node.model) {
      return; // We need context to know which enchantment this is for
    }
    
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
    
    // Recurse into other node types
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
 * Create overrides using stored enchantment predicates
 */
function createEnchantmentOverrides(mappings: EnchantmentMapping[]): EnchantmentOverride[] {
  const overrides: EnchantmentOverride[] = [];
  
  for (const mapping of mappings) {
    // Try different predicate formats for stored enchantments
    const predicateVariants = [
      // Format 1: Direct enchantment check
      {
        [`minecraft:${mapping.enchantment}`]: mapping.level || 1
      },
      // Format 2: Stored enchantments array check
      {
        stored_enchantments: {
          [`minecraft:${mapping.enchantment}`]: mapping.level || 1
        }
      },
      // Format 3: Component-style check
      {
        components: {
          'minecraft:stored_enchantments': {
            [`minecraft:${mapping.enchantment}`]: mapping.level || 1
          }
        }
      }
    ];
    
    // Try the most likely format first
    const predicate = {
      stored_enchantments: {
        [`minecraft:${mapping.enchantment}`]: mapping.level || 1
      }
    };
    
    overrides.push({
      predicate,
      model: mapping.modelPath
    });
  }
  
  return overrides;
}

/**
 * Create enhanced enchanted book model
 */
function createEnhancedEnchantedBookModel(mappings: EnchantmentMapping[]) {
  const overrides = createEnchantmentOverrides(mappings);
  
  return {
    parent: "item/generated",
    textures: {
      layer0: "item/enchanted_book"
    },
    overrides
  };
}

/**
 * Main function
 */
async function createComponentDriven(inputDir: string, outputDir: string): Promise<void> {
  console.log('Creating component-driven 3D book pack...');
  console.log('Using stored enchantment predicates for model selection');
  
  const packDir = path.join(outputDir, 'Better-Fresher-3D-Books-Components');
  const modelsDir = path.join(packDir, 'assets', 'minecraft', 'models', 'item');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Create pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "§b§lMagic books are magic! (Component-driven)\n§7Different models per enchantment"
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
  
  // Process enchanted_book.json
  const enchantedBookPath = path.join(inputDir, 'assets', 'minecraft', 'items', 'enchanted_book.json');
  
  try {
    const content = await fs.readFile(enchantedBookPath, 'utf-8');
    const json = JSON.parse(content);
    
    const mappings = extractEnchantmentMappings(json);
    console.log(`Extracted ${mappings.length} enchantment mappings`);
    
    if (mappings.length > 0) {
      const enhancedModel = createEnhancedEnchantedBookModel(mappings);
      
      await fs.writeFile(
        path.join(modelsDir, 'enchanted_book.json'),
        JSON.stringify(enhancedModel, null, 2)
      );
      
      console.log('Created enhanced enchanted_book.json with stored enchantment predicates');
      
      // Log some examples
      console.log('\nExample predicates generated:');
      for (let i = 0; i < Math.min(3, mappings.length); i++) {
        const mapping = mappings[i];
        console.log(`  ${mapping.enchantment} ${mapping.level} → ${mapping.modelPath}`);
      }
    }
  } catch (error) {
    console.error('Error processing enchanted_book.json:', error);
  }
  
  // Create simple models for other book types (as fallback)
  const simpleModels = [
    { name: 'book', model: 'item/books_3d/book_3d' },
    { name: 'written_book', model: 'item/books_3d/written_book_3d' },
    { name: 'writable_book', model: 'item/books_3d/writable_book_3d' },
    { name: 'knowledge_book', model: 'item/books_3d/knowledge_book_3d' }
  ];
  
  for (const item of simpleModels) {
    const itemModel = { parent: item.model };
    await fs.writeFile(
      path.join(modelsDir, `${item.name}.json`),
      JSON.stringify(itemModel, null, 2)
    );
    console.log(`Created ${item.name}.json → ${item.model}`);
  }
  
  // Copy models and textures
  console.log('\nCopying models and textures...');
  
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
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'models'),
    path.join(packDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'textures'),
    path.join(packDir, 'assets', 'minecraft', 'textures')
  );
  
  console.log('');
  console.log('✅ Component-driven pack created!');
  console.log(`📁 Location: ${packDir}`);
  console.log('');
  console.log('🧪 EXPERIMENTAL:');
  console.log('• Uses stored enchantment predicates in overrides');
  console.log('• Should show different models per enchantment type');
  console.log('• May need predicate format adjustments for 1.21.1');
  console.log('');
  console.log('🎮 TESTING:');
  console.log('1. Enable this pack in Minecraft');
  console.log('2. Get enchanted books from creative or /enchant');
  console.log('3. Different enchantments should show different 3D models!');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun create-component-driven.ts <input-dir> <output-dir>');
    console.log('Example: bun create-component-driven.ts . .');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  createComponentDriven(inputDir, outputDir).catch(console.error);
}

export { createComponentDriven, extractEnchantmentMappings };
