#!/usr/bin/env bun

import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface BookItemConfig {
  itemType: string;
  citFileName: string;
  pommelModelName: string;
  textureRef: string;
  threeDModel: string;
  enchantmentData?: {
    enchantmentIDs: string;
    enchantmentLevels?: string;
  };
}

async function createCompleteBooksPack(inputDir: string, outputDir: string) {
  console.log('🔄 Creating complete CIT + Pommel books pack...');
  
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
  
  // Copy all 3D models and textures, then fix open book models for 1.21.1
  const copyPaths = [
    { src: 'assets/minecraft/models/item/books_3d', dest: 'assets/minecraft/models/item/books_3d' },
    { src: 'assets/minecraft/textures', dest: 'assets/minecraft/textures' }
  ];
  
  for (const { src, dest } of copyPaths) {
    const srcPath = join(inputDir, src);
    const destPath = join(outputDir, dest);
    if (existsSync(srcPath)) {
      await mkdir(destPath, { recursive: true });
      const { cp } = await import('fs/promises');
      await cp(srcPath, destPath, { recursive: true });
    }
  }
  
  // Skip fixing open book models for now - caused invisibility
  // console.log('🔧 Fixing open book models for 1.21.1...');
  // await fixOpenBookModels(join(outputDir, 'assets/minecraft/models/item/books_3d'));
  
  // Also copy enchanted book textures to books/ directory for Pommel models
  const enchantedBooksTextureSrc = join(inputDir, 'assets/minecraft/textures/item/enchanted_books');
  const booksTextureDest = join(outputDir, 'assets/minecraft/textures/item/books');
  if (existsSync(enchantedBooksTextureSrc)) {
    await mkdir(booksTextureDest, { recursive: true });
    const { cp } = await import('fs/promises');
    await cp(enchantedBooksTextureSrc, booksTextureDest, { recursive: true });
  }
  
  // Regular books (non-enchanted)
  const regularBooks: BookItemConfig[] = [
    {
      itemType: 'book',
      citFileName: 'book',
      pommelModelName: 'book',
      textureRef: 'minecraft:item/books/book',
      threeDModel: 'minecraft:item/books_3d/book_3d'
    },
    {
      itemType: 'writable_book', 
      citFileName: 'writable_book',
      pommelModelName: 'writable_book',
      textureRef: 'minecraft:item/books/writable_book',
      threeDModel: 'minecraft:item/books_3d/writable_book_3d'
    },
    {
      itemType: 'written_book',
      citFileName: 'written_book', 
      pommelModelName: 'written_book',
      textureRef: 'minecraft:item/books/written_book',
      threeDModel: 'minecraft:item/books_3d/written_book_3d'
    },
    {
      itemType: 'knowledge_book',
      citFileName: 'knowledge_book',
      pommelModelName: 'knowledge_book', 
      textureRef: 'minecraft:item/books/knowledge_book',
      threeDModel: 'minecraft:item/books_3d/knowledge_book_3d'
    }
  ];
  
  // Create regular book CIT + Pommel files
  for (const book of regularBooks) {
    // Create CIT file
    const citContent = [
      'type=item',
      `items=${book.itemType}`,
      `model=assets/minecraft/models/item/books/${book.pommelModelName}`
    ].join('\n');
    
    await writeFile(join(citDir, `${book.citFileName}.properties`), citContent);
    
    // Create Pommel model - use open version when held (simulates right hand behavior)
    const threeDModelOpen = book.threeDModel.replace(/_3d$/, '_3d_open');
    
    const pommelModel = {
      parent: "minecraft:item/handheld",
      textures: {
        layer0: book.textureRef
      },
      overrides: [
        // Try enhanced predicates for exact original behavior
        {
          predicate: { "pommel:is_held": 1.0 },
          model: threeDModelOpen      // Right hand: Open book (reading)
        },
        {
          predicate: { "pommel:is_offhand": 1.0 },
          model: book.threeDModel     // Left hand: Closed book
        }
      ]
    };
    
    await writeFile(
      join(pommelModelsDir, `${book.pommelModelName}.json`), 
      JSON.stringify(pommelModel, null, 2)
    );
  }
  
  // Now handle enchanted books using the existing converter logic
  const enchantedBookPath = join(inputDir, 'assets/minecraft/items/enchanted_book.json');
  if (existsSync(enchantedBookPath)) {
    const enchantedBookJson = JSON.parse(await readFile(enchantedBookPath, 'utf-8'));
    const mappings = extractEnchantmentMappings(enchantedBookJson);
    
    console.log(`📚 Found ${mappings.length} enchantment mappings`);
    
    for (const mapping of mappings) {
      const fileName = getEnchantmentFileName(mapping);
      const bookModelName = getBookModelName(mapping);
      
      // Generate CIT file
      const citContent = [
        'type=item',
        'items=enchanted_book',
        `model=assets/minecraft/models/item/books/${bookModelName}`,
        `enchantmentIDs=${mapping.enchantment}`,
        ...(mapping.level !== undefined ? [`enchantmentLevels=${mapping.level}`] : [])
      ].join('\n');
      
      await writeFile(join(citDir, `${fileName}.properties`), citContent);
      
      // Generate Pommel model - map to base enchantment 3D model (no level suffix)
      let threeDModelName = mapping.model;
      let threeDModelNameOpen = mapping.model;
      
      if (threeDModelName.includes('enchanted_books/')) {
        const enchantmentPath = threeDModelName.replace('minecraft:item/enchanted_books/', '');
        // Remove level suffix from enchantment name for 3D model reference
        const baseEnchantmentName = enchantmentPath.replace(/_\d+$/, '');
        threeDModelName = `minecraft:item/books_3d/${baseEnchantmentName}_3d`;
        threeDModelNameOpen = `minecraft:item/books_3d/${baseEnchantmentName}_3d_open`;
      }
      
      const pommelModel = {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: `minecraft:item/books/${bookModelName}`
        },
        overrides: [
          // Try enhanced predicates for exact original behavior
          {
            predicate: { "pommel:is_held": 1.0 },
            model: threeDModelNameOpen  // Right hand: Open book (reading)
          },
          {
            predicate: { "pommel:is_offhand": 1.0 },
            model: threeDModelName      // Left hand: Closed book
          }
        ]
      };
      
      await writeFile(
        join(pommelModelsDir, `${bookModelName}.json`), 
        JSON.stringify(pommelModel, null, 2)
      );
    }
  }
  
  console.log(`✅ Complete books CIT + Pommel conversion complete!`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`🔧 Includes regular books AND enchanted books with full feature parity`);
}

// Helper functions from the original converter
function extractEnchantmentMappings(componentJson: any): any[] {
  const mappings: any[] = [];
  
  function traverse(node: any) {
    if (node?.type === "minecraft:select" && node?.component === "minecraft:stored_enchantments") {
      for (const caseItem of node.cases || []) {
        if (caseItem.when && typeof caseItem.when === 'object') {
          for (const [enchantment, level] of Object.entries(caseItem.when)) {
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

function getBookModelName(mapping: any): string {
  const enchantmentName = mapping.enchantment.replace('minecraft:', '');
  const level = mapping.level;
  
  // Handle curse enchantments with different texture names
  if (enchantmentName === 'binding_curse') {
    return 'curse_of_binding';
  }
  if (enchantmentName === 'vanishing_curse') {
    return 'curse_of_vanishing';
  }
  
  // Special enchantments that truly don't have level suffixes in textures
  const noLevelSuffix = ['aqua_affinity', 'channeling', 'flame', 'infinity', 'mending', 'multishot', 'silk_touch'];
  if (noLevelSuffix.includes(enchantmentName)) {
    return enchantmentName;
  }
  
  // All other enchantments always use level suffixes in texture names
  return `${enchantmentName}_${level}`;
}

function getEnchantmentFileName(mapping: any): string {
  const enchantmentName = mapping.enchantment.replace('minecraft:', '');
  const level = mapping.level;
  return level ? `${enchantmentName}_${level}` : enchantmentName;
}

// Model fixing functions
interface ModelElement {
  from: [number, number, number];
  to: [number, number, number];
  [key: string]: any;
}

interface BookModel {
  elements?: ModelElement[];
  [key: string]: any;
}

function fixZeroThicknessElements(model: BookModel): boolean {
  if (!model.elements) return false;
  
  let hasChanges = false;
  
  for (const element of model.elements) {
    if (!element.from || !element.to) continue;
    
    // Check each axis (X, Y, Z) for zero thickness
    for (let axis = 0; axis < 3; axis++) {
      if (element.from[axis] === element.to[axis]) {
        // Add minimal thickness (0.01) to the 'to' coordinate
        element.to[axis] += 0.01;
        hasChanges = true;
      }
    }
  }
  
  return hasChanges;
}

async function fixOpenBookModels(booksDir: string) {
  const files = await readdir(booksDir);
  const openModelFiles = files.filter(file => file.includes('_open.json'));
  
  for (const file of openModelFiles) {
    const filePath = join(booksDir, file);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const model: BookModel = JSON.parse(content);
      
      const hasChanges = fixZeroThicknessElements(model);
      
      if (hasChanges) {
        await writeFile(filePath, JSON.stringify(model, null, '\t'));
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
}

// CLI usage
if (import.meta.main) {
  const [inputDir = '.', outputDir = 'dist/complete-cit-pommel'] = process.argv.slice(2);
  
  createCompleteBooksPack(inputDir, outputDir)
    .catch(error => {
      console.error('❌ Conversion failed:', error.message);
      process.exit(1);
    });
}
