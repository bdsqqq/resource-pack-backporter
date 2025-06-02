#!/usr/bin/env bun

import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Core interfaces
interface DisplayContextMapping {
  itemId: string;
  enchantment?: string;
  level?: number;
  contexts: Record<string, string>; // displayContext -> modelPath
}

interface PredicateSystem {
  name: string;
  mapDisplayContext(context: string): { predicate: Record<string, number> } | null;
}

interface ItemVariant {
  itemId: string;
  variantId: string;
  textureRef: string;
  models: Record<string, string>; // predicateName -> modelPath
  enchantment?: string;
  level?: number;
}

// Predicate Systems
class PommelPredicateSystem implements PredicateSystem {
  name = 'pommel';
  
  mapDisplayContext(context: string) {
    const mapping = {
      'firstperson_righthand': { predicate: { "pommel:is_held": 1.0 } },
      'thirdperson_righthand': { predicate: { "pommel:is_held": 1.0 } },
      'firstperson_lefthand': { predicate: { "pommel:is_offhand": 1.0 } },
      'thirdperson_lefthand': { predicate: { "pommel:is_offhand": 1.0 } },
      'head': { predicate: { "pommel:is_offhand": 1.0 } },
      'ground': { predicate: { "pommel:is_ground": 1.0 } }
    };
    
    return mapping[context as keyof typeof mapping] || null;
  }
}

// Main extraction function
function extractDisplayContextMappings(componentJson: any, itemId: string): DisplayContextMapping[] {
  const mappings: Record<string, DisplayContextMapping> = {}; // key: enchantment:level
  
  // Look for display context selectors
  if (componentJson?.model?.type === "minecraft:select" && componentJson.model.property === "minecraft:display_context") {
    for (const displayCase of componentJson.model.cases || []) {
      const displayContexts = Array.isArray(displayCase.when) ? displayCase.when : [displayCase.when];
      
      // Look for component selectors within this display context
      if (displayCase.model?.type === "minecraft:select" && displayCase.model.component === "minecraft:stored_enchantments") {
        for (const enchantmentCase of displayCase.model.cases || []) {
          if (enchantmentCase.when && enchantmentCase.model?.model) {
            // Handle both single object and array of objects
            const whenItems = Array.isArray(enchantmentCase.when) ? enchantmentCase.when : [enchantmentCase.when];
            
            for (const whenItem of whenItems) {
              if (typeof whenItem === 'object') {
                for (const [enchantment, level] of Object.entries(whenItem)) {
                  if (typeof enchantment !== 'string' || !enchantment.includes(':')) continue;
                  if (typeof level !== 'number') continue;
                  
                  const key = `${enchantment}:${level}`;
                  
                  // Find or create mapping for this enchantment+level
                  if (!mappings[key]) {
                    mappings[key] = {
                      itemId,
                      enchantment,
                      level,
                      contexts: {}
                    };
                  }
                  
                  // Add all display contexts that use this model
                  for (const context of displayContexts) {
                    mappings[key].contexts[context] = enchantmentCase.model.model;
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  
  return Object.values(mappings);
}

// Convert display context mappings to item variants for a predicate system
function createItemVariants(mappings: DisplayContextMapping[], predicateSystem: PredicateSystem): ItemVariant[] {
  const variants: ItemVariant[] = [];
  
  for (const mapping of mappings) {
    if (!mapping.enchantment || mapping.level === undefined) continue;
    
    const enchantmentName = mapping.enchantment.replace('minecraft:', '');
    const variantId = `${enchantmentName}_${mapping.level}`;
    const textureModelName = getTextureModelName(enchantmentName, mapping.level);
    
    // Create predicate models from display contexts
    const predicateModels: Record<string, string> = {};
    
    for (const [context, modelPath] of Object.entries(mapping.contexts)) {
      const predicateMapping = predicateSystem.mapDisplayContext(context);
      if (predicateMapping) {
        const predicateKey = JSON.stringify(predicateMapping.predicate);
        predicateModels[predicateKey] = modelPath;
      }
    }
    
    // Only create variant if we have predicate models
    if (Object.keys(predicateModels).length > 0) {
      variants.push({
        itemId: mapping.itemId,
        variantId,
        textureRef: `minecraft:item/books/${textureModelName}`,
        models: predicateModels,
        enchantment: mapping.enchantment,
        level: mapping.level
      });
    }
  }
  
  return variants;
}

function getTextureModelName(enchantmentName: string, level: number): string {
  // Handle curse enchantments with different texture names
  if (enchantmentName === 'binding_curse') return 'curse_of_binding';
  if (enchantmentName === 'vanishing_curse') return 'curse_of_vanishing';
  
  // Special enchantments that don't have level suffixes in textures
  const noLevelSuffix = ['aqua_affinity', 'channeling', 'flame', 'infinity', 'mending', 'multishot', 'silk_touch'];
  if (noLevelSuffix.includes(enchantmentName)) {
    return enchantmentName;
  }
  
  // All other enchantments use level suffixes in texture names
  return `${enchantmentName}_${level}`;
}

async function generateCITFile(variant: ItemVariant, citDir: string): Promise<void> {
  const citContent = [
    'type=item',
    'items=enchanted_book',
    `model=assets/minecraft/models/item/books/${variant.variantId}`,
    `enchantmentIDs=${variant.enchantment}`,
    `enchantmentLevels=${variant.level}`
  ].join('\n');
  
  await writeFile(join(citDir, `${variant.variantId}.properties`), citContent);
}

async function generatePredicateModel(variant: ItemVariant, modelsDir: string): Promise<void> {
  const overrides = [];
  
  for (const [predicateKey, modelPath] of Object.entries(variant.models)) {
    const predicate = JSON.parse(predicateKey);
    overrides.push({
      predicate,
      model: modelPath
    });
  }
  
  const model = {
    parent: "minecraft:item/handheld",
    textures: {
      layer0: variant.textureRef
    },
    overrides
  };
  
  await writeFile(
    join(modelsDir, `${variant.variantId}.json`),
    JSON.stringify(model, null, 2)
  );
}

// Main backporter function
async function backportResourcePack(inputDir: string, outputDir: string, predicateSystemName = 'pommel') {
  console.log('🔄 Backporting resource pack from 1.21.4+ to 1.21.1...');
  
  // Create output directories
  const citDir = join(outputDir, 'assets/minecraft/optifine/cit');
  const pommelModelsDir = join(outputDir, 'assets/minecraft/models/item/books');
  await mkdir(citDir, { recursive: true });
  await mkdir(pommelModelsDir, { recursive: true });
  
  // Copy pack metadata
  for (const file of ['pack.mcmeta', 'pack.png']) {
    const srcPath = join(inputDir, file);
    const destPath = join(outputDir, file);
    if (existsSync(srcPath)) {
      await writeFile(destPath, await readFile(srcPath));
    }
  }
  
  // Copy all models and textures
  const assetPaths = ['assets/minecraft/models', 'assets/minecraft/textures'];
  for (const assetPath of assetPaths) {
    const srcPath = join(inputDir, assetPath);
    const destPath = join(outputDir, assetPath);
    if (existsSync(srcPath)) {
      await mkdir(destPath, { recursive: true });
      const { cp } = await import('fs/promises');
      await cp(srcPath, destPath, { recursive: true });
    }
  }
  
  // Copy textures to proper location for books
  const enchantedBooksTextureSrc = join(inputDir, 'assets/minecraft/textures/item/enchanted_books');
  const booksTextureDest = join(outputDir, 'assets/minecraft/textures/item/books');
  if (existsSync(enchantedBooksTextureSrc)) {
    await mkdir(booksTextureDest, { recursive: true });
    const { cp } = await import('fs/promises');
    await cp(enchantedBooksTextureSrc, booksTextureDest, { recursive: true });
  }
  
  // Fix model compatibility
  console.log('🔧 Fixing model compatibility for 1.21.1...');
  await fixModelCompatibility(outputDir);
  
  // Initialize predicate system
  const predicateSystems: Record<string, PredicateSystem> = {
    'pommel': new PommelPredicateSystem()
  };
  
  const predicateSystem = predicateSystems[predicateSystemName];
  if (!predicateSystem) {
    throw new Error(`Unknown predicate system: ${predicateSystemName}`);
  }
  
  console.log(`🎯 Using ${predicateSystem.name} predicate system`);
  
  // Process enchanted books
  const enchantedBookPath = join(inputDir, 'assets/minecraft/items/enchanted_book.json');
  if (existsSync(enchantedBookPath)) {
    console.log('📚 Processing enchanted books...');
    
    const enchantedBookJson = JSON.parse(await readFile(enchantedBookPath, 'utf-8'));
    const displayMappings = extractDisplayContextMappings(enchantedBookJson, 'enchanted_book');

    
    const variants = createItemVariants(displayMappings, predicateSystem);
    

    
    console.log(`📦 Found ${variants.length} enchantment variants`);
    
    for (const variant of variants) {
      await generateCITFile(variant, citDir);
      await generatePredicateModel(variant, pommelModelsDir);
    }
  }
  
  // TODO: Process regular books similarly
  // For now, handle them with simple hardcoded mappings
  const regularBooks = [
    { itemId: 'book', textureRef: 'minecraft:item/books/book' },
    { itemId: 'writable_book', textureRef: 'minecraft:item/books/writable_book' },
    { itemId: 'written_book', textureRef: 'minecraft:item/books/written_book' },
    { itemId: 'knowledge_book', textureRef: 'minecraft:item/books/knowledge_book' }
  ];
  
  for (const book of regularBooks) {
    const booksDir = join(inputDir, 'assets/minecraft/models/item/books_3d');
    if (existsSync(join(booksDir, `${book.itemId}_3d.json`))) {
      console.log(`📖 Processing ${book.itemId}...`);
      
      // Create simple CIT file
      const citContent = [
        'type=item',
        `items=${book.itemId}`,
        `model=assets/minecraft/models/item/books/${book.itemId}`
      ].join('\n');
      await writeFile(join(citDir, `${book.itemId}.properties`), citContent);
      
      // Create Pommel model with standard mappings
      const rightHandPredicate = predicateSystem.mapDisplayContext('firstperson_righthand');
      const leftHandPredicate = predicateSystem.mapDisplayContext('firstperson_lefthand');
      const groundPredicate = predicateSystem.mapDisplayContext('ground');
      
      const overrides = [];
      if (rightHandPredicate) {
        overrides.push({
          predicate: rightHandPredicate.predicate,
          model: `minecraft:item/books_3d/${book.itemId}_3d_open`
        });
      }
      if (leftHandPredicate) {
        overrides.push({
          predicate: leftHandPredicate.predicate,
          model: `minecraft:item/books_3d/${book.itemId}_3d`
        });
      }
      if (groundPredicate) {
        overrides.push({
          predicate: groundPredicate.predicate,
          model: `minecraft:item/books_3d/${book.itemId}_3d`
        });
      }
      
      const model = {
        parent: "minecraft:item/handheld",
        textures: {
          layer0: book.textureRef
        },
        overrides
      };
      
      await writeFile(
        join(pommelModelsDir, `${book.itemId}.json`),
        JSON.stringify(model, null, 2)
      );
    }
  }
  
  console.log(`✅ Resource pack backport complete!`);
  console.log(`📁 Output: ${outputDir}`);
}

async function fixModelCompatibility(outputDir: string) {
  const modelDirs = ['assets/minecraft/models/item'];
  
  for (const modelDir of modelDirs) {
    const fullPath = join(outputDir, modelDir);
    if (existsSync(fullPath)) {
      await fixModelsInDirectory(fullPath);
    }
  }
}

async function fixModelsInDirectory(modelsDir: string) {
  const subdirs = await readdir(modelsDir, { withFileTypes: true });
  
  for (const subdir of subdirs) {
    if (subdir.isDirectory()) {
      const subdirPath = join(modelsDir, subdir.name);
      const files = await readdir(subdirPath);
      const modelFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of modelFiles) {
        const filePath = join(subdirPath, file);
        await fixSingleModel(filePath);
      }
    }
  }
}

async function fixSingleModel(modelPath: string) {
  try {
    const content = await readFile(modelPath, 'utf-8');
    const model = JSON.parse(content);
    
    let hasChanges = false;
    
    // Remove problematic builtin/entity parent
    if (model.parent === 'builtin/entity') {
      delete model.parent;
      hasChanges = true;
    }
    
    // Fix zero-thickness elements
    if (model.elements) {
      for (const element of model.elements) {
        if (!element.from || !element.to) continue;
        
        for (let axis = 0; axis < 3; axis++) {
          if (element.from[axis] === element.to[axis]) {
            element.to[axis] = element.to[axis] + 0.01;
            hasChanges = true;
          }
        }
      }
    }
    
    if (hasChanges) {
      await writeFile(modelPath, JSON.stringify(model, null, '\t'));
    }
  } catch (error) {
    // Silently skip files that can't be processed
  }
}

// CLI usage
if (import.meta.main) {
  const [inputDir = '.', outputDir = 'dist/backported', predicateSystem = 'pommel'] = process.argv.slice(2);
  
  backportResourcePack(inputDir, outputDir, predicateSystem)
    .catch(error => {
      console.error('❌ Backport failed:', error.message);
      process.exit(1);
    });
}
