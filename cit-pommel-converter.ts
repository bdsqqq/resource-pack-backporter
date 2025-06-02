#!/usr/bin/env bun

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface EnchantmentMapping {
  enchantment: string;
  level?: number;
  model: string;
}

interface PommelModel {
  parent: string;
  textures: {
    layer0: string;
  };
  overrides: Array<{
    predicate: Record<string, number>;
    model: string;
  }>;
}

interface CITFile {
  type: string;
  items: string;
  model: string;
  enchantmentIDs: string;
  enchantmentLevels?: string;
}

function extractEnchantmentMappings(componentJson: any): EnchantmentMapping[] {
  const mappings: EnchantmentMapping[] = [];
  
  function traverse(node: any) {
    // Handle the new component-based structure
    if (node?.type === "minecraft:select" && node?.component === "minecraft:stored_enchantments") {
      for (const caseItem of node.cases || []) {
        if (caseItem.when && typeof caseItem.when === 'object') {
          // Extract enchantment and level from the when clause
          for (const [enchantment, level] of Object.entries(caseItem.when)) {
            // Skip invalid entries
            if (typeof enchantment !== 'string' || enchantment.startsWith('[object') || !enchantment.includes(':')) {
              continue;
            }
            if (typeof level !== 'number') {
              continue;
            }
            
            if (caseItem.model?.model) {
              mappings.push({
                enchantment,
                level: level,
                model: caseItem.model.model
              });
            }
          }
        }
      }
    }
    
    // Continue traversing nested structures
    if (node?.model) {
      traverse(node.model);
    }
    
    if (node?.cases) {
      for (const caseItem of node.cases) {
        if (caseItem.model) {
          traverse(caseItem.model);
        }
      }
    }
  }
  
  traverse(componentJson);
  return mappings;
}

function generateCITFile(mapping: EnchantmentMapping): string {
  const lines = [
    'type=item',
    'items=enchanted_book',
    `model=assets/minecraft/models/item/books/${getBookModelName(mapping)}`,
    `enchantmentIDs=${mapping.enchantment}`
  ];
  
  if (mapping.level !== undefined) {
    lines.push(`enchantmentLevels=${mapping.level}`);
  }
  
  return lines.join('\n');
}

function generatePommelModel(mapping: EnchantmentMapping): PommelModel {
  const bookModelName = getBookModelName(mapping);
  // Map from enchanted_books to books_3d and add _3d suffix
  let threeDModelName = mapping.model;
  if (threeDModelName.includes('enchanted_books/')) {
    const enchantmentPath = threeDModelName.replace('minecraft:item/enchanted_books/', '');
    threeDModelName = `minecraft:item/books_3d/${enchantmentPath}_3d`;
  }
  
  return {
    parent: "minecraft:item/handheld",
    textures: {
      layer0: `minecraft:item/enchanted_books/${bookModelName}`
    },
    overrides: [
      {
        predicate: { "pommel:is_held": 1.0 },
        model: threeDModelName
      },
      {
        predicate: { "pommel:is_ground": 1.0 },
        model: threeDModelName
      }
    ]
  };
}

function getBookModelName(mapping: EnchantmentMapping): string {
  const enchantmentName = mapping.enchantment.replace('minecraft:', '');
  const level = mapping.level;
  
  // Special cases for enchantments that don't have level suffixes in textures
  const noLevelSuffix = ['aqua_affinity', 'channeling', 'flame', 'infinity', 'mending', 'multishot', 'silk_touch'];
  const isNoLevelEnchantment = noLevelSuffix.includes(enchantmentName);
  
  // Handle curse enchantments with different texture names
  if (enchantmentName === 'binding_curse') {
    return 'curse_of_binding';
  }
  if (enchantmentName === 'vanishing_curse') {
    return 'curse_of_vanishing';
  }
  
  if (isNoLevelEnchantment || level === 1) {
    return enchantmentName;
  }
  
  return `${enchantmentName}_${level}`;
}

function getEnchantmentFileName(mapping: EnchantmentMapping): string {
  const enchantmentName = mapping.enchantment.replace('minecraft:', '');
  const level = mapping.level;
  return level ? `${enchantmentName}_${level}` : enchantmentName;
}

async function convertToCITPommel(inputDir: string, outputDir: string) {
  console.log('🔄 Converting to CIT + Pommel format...');
  
  // Read the original enchanted_book.json
  const enchantedBookPath = join(inputDir, 'assets/minecraft/items/enchanted_book.json');
  if (!existsSync(enchantedBookPath)) {
    throw new Error(`enchanted_book.json not found at ${enchantedBookPath}`);
  }
  
  const enchantedBookJson = JSON.parse(await readFile(enchantedBookPath, 'utf-8'));
  const mappings = extractEnchantmentMappings(enchantedBookJson);
  
  console.log(`📚 Found ${mappings.length} enchantment mappings`);
  
  // Create output directories
  const citDir = join(outputDir, 'assets/minecraft/optifine/cit');
  const pommelModelsDir = join(outputDir, 'assets/minecraft/models/item/books');
  const threeDModelsDir = join(outputDir, 'assets/minecraft/models/item/books_3d');
  
  await mkdir(citDir, { recursive: true });
  await mkdir(pommelModelsDir, { recursive: true });
  await mkdir(threeDModelsDir, { recursive: true });
  
  // Copy pack.mcmeta and pack.png
  for (const file of ['pack.mcmeta', 'pack.png']) {
    const srcPath = join(inputDir, file);
    const destPath = join(outputDir, file);
    if (existsSync(srcPath)) {
      await writeFile(destPath, await readFile(srcPath));
    }
  }
  
  // Copy all 3D models
  const originalModelsDir = join(inputDir, 'assets/minecraft/models/item/books_3d');
  if (existsSync(originalModelsDir)) {
    console.log('📁 Copying 3D models...');
    const { readdir } = await import('fs/promises');
    const modelFiles = await readdir(originalModelsDir);
    
    for (const file of modelFiles) {
      if (file.endsWith('.json')) {
        const srcPath = join(originalModelsDir, file);
        const destPath = join(threeDModelsDir, file);
        await writeFile(destPath, await readFile(srcPath));
      }
    }
  }
  
  // Generate CIT files and Pommel models
  console.log('🏗️ Generating CIT files and Pommel models...');
  
  for (const mapping of mappings) {
    const fileName = getEnchantmentFileName(mapping);
    
    // Generate CIT file
    const citContent = generateCITFile(mapping);
    const citFilePath = join(citDir, `${fileName}.properties`);
    await writeFile(citFilePath, citContent);
    
    // Generate Pommel model
    const pommelModel = generatePommelModel(mapping);
    const pommelModelPath = join(pommelModelsDir, `${getBookModelName(mapping)}.json`);
    await writeFile(pommelModelPath, JSON.stringify(pommelModel, null, 2));
  }
  
  // Copy texture files if they exist
  const texturesDir = join(inputDir, 'assets/minecraft/textures');
  if (existsSync(texturesDir)) {
    console.log('🎨 Copying textures...');
    const destTexturesDir = join(outputDir, 'assets/minecraft/textures');
    await mkdir(destTexturesDir, { recursive: true });
    
    // Copy recursively
    const { cp } = await import('fs/promises');
    await cp(texturesDir, destTexturesDir, { recursive: true });
  }
  
  console.log(`✅ CIT + Pommel conversion complete!`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`📋 Generated ${mappings.length} CIT files and ${mappings.length} Pommel models`);
  console.log(`\n🔧 To use this pack:`);
  console.log(`1. Install CIT Resewn mod`);
  console.log(`2. Install Pommel mod`);
  console.log(`3. Place this resource pack in your resourcepacks folder`);
  console.log(`4. Enchanted books will automatically show 3D models when held or on ground!`);
}

// CLI usage
if (import.meta.main) {
  const [inputDir = '.', outputDir = 'dist/cit-pommel'] = process.argv.slice(2);
  
  convertToCITPommel(inputDir, outputDir)
    .catch(error => {
      console.error('❌ Conversion failed:', error.message);
      process.exit(1);
    });
}

export { convertToCITPommel, extractEnchantmentMappings };
