#!/usr/bin/env bun

import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface ComponentMapping {
  itemId: string;
  component: string;
  conditions: Record<string, any>;
  model: string;
}

interface ItemProcessor {
  name: string;
  canProcess(itemId: string, modelsDir: string, itemsDir: string): Promise<boolean>;
  process(inputDir: string, outputDir: string, citDir: string, predicateSystem: PredicateSystem): Promise<void>;
}

interface PredicateSystem {
  name: string;
  generateOverrides(item: ItemVariant): PredicateOverride[];
}

interface ItemVariant {
  itemId: string;
  variantId: string;
  textureRef: string;
  baseModel: string;
  openModel?: string;
  component?: string;
  conditions?: Record<string, any>;
}

interface PredicateOverride {
  predicate: Record<string, number>;
  model: string;
}

// Predicate Systems
class PommelPredicateSystem implements PredicateSystem {
  name = 'pommel';
  
  generateOverrides(item: ItemVariant): PredicateOverride[] {
    const overrides: PredicateOverride[] = [];
    
    // Right hand: open variant if available, otherwise base
    overrides.push({
      predicate: { "pommel:is_held": 1.0 },
      model: item.openModel || item.baseModel
    });
    
    // Left hand: always base/closed variant
    overrides.push({
      predicate: { "pommel:is_offhand": 1.0 },
      model: item.baseModel
    });
    
    return overrides;
  }
}

// Item Processors
class EnchantedBookProcessor implements ItemProcessor {
  name = 'enchanted_book';
  
  async canProcess(itemId: string, modelsDir: string, itemsDir: string): Promise<boolean> {
    return itemId === 'enchanted_book' && existsSync(join(itemsDir, 'enchanted_book.json'));
  }
  
  async process(inputDir: string, outputDir: string, citDir: string, predicateSystem: PredicateSystem): Promise<void> {
    console.log('📚 Processing enchanted books...');
    
    // Copy textures to proper location
    const enchantedBooksTextureSrc = join(inputDir, 'assets/minecraft/textures/item/enchanted_books');
    const booksTextureDest = join(outputDir, 'assets/minecraft/textures/item/books');
    if (existsSync(enchantedBooksTextureSrc)) {
      await mkdir(booksTextureDest, { recursive: true });
      const { cp } = await import('fs/promises');
      await cp(enchantedBooksTextureSrc, booksTextureDest, { recursive: true });
    }
    
    // Extract mappings from component file
    const enchantedBookPath = join(inputDir, 'assets/minecraft/items/enchanted_book.json');
    const enchantedBookJson = JSON.parse(await readFile(enchantedBookPath, 'utf-8'));
    const mappings = this.extractEnchantmentMappings(enchantedBookJson);
    
    console.log(`📦 Found ${mappings.length} enchantment variants`);
    
    // Create Pommel model directory
    const pommelModelsDir = join(outputDir, 'assets/minecraft/models/item/books');
    await mkdir(pommelModelsDir, { recursive: true });
    
    for (const mapping of mappings) {
      const variant = this.createItemVariant(mapping);
      
      // Generate CIT file
      await this.generateCITFile(variant, citDir);
      
      // Generate predicate model file
      await this.generatePredicateModel(variant, pommelModelsDir, predicateSystem);
    }
  }
  
  private extractEnchantmentMappings(componentJson: any): ComponentMapping[] {
    const mappings: ComponentMapping[] = [];
    
    function traverse(node: any) {
      if (node?.type === "minecraft:select" && node?.component === "minecraft:stored_enchantments") {
        for (const caseItem of node.cases || []) {
          if (caseItem.when && typeof caseItem.when === 'object') {
            for (const [enchantment, level] of Object.entries(caseItem.when)) {
              if (typeof enchantment !== 'string' || !enchantment.includes(':')) continue;
              if (typeof level !== 'number') continue;
              
              if (caseItem.model?.model) {
                mappings.push({
                  itemId: 'enchanted_book',
                  component: 'minecraft:stored_enchantments',
                  conditions: { [enchantment]: level },
                  model: caseItem.model.model
                });
              }
            }
          }
        }
      }
      
      if (node?.model) traverse(node.model);
      if (node?.cases) {
        for (const caseItem of node.cases) {
          if (caseItem.model) traverse(caseItem.model);
        }
      }
    }
    
    traverse(componentJson);
    return mappings;
  }
  
  private createItemVariant(mapping: ComponentMapping): ItemVariant {
    const enchantment = Object.keys(mapping.conditions)[0];
    const level = mapping.conditions[enchantment];
    
    const fileName = this.getEnchantmentFileName(enchantment, level);
    const textureModelName = this.getTextureModelName(enchantment, level);
    const baseEnchantmentName = this.getBaseEnchantmentName(enchantment);
    
    return {
      itemId: 'enchanted_book',
      variantId: fileName,
      textureRef: `minecraft:item/books/${textureModelName}`,
      baseModel: `minecraft:item/books_3d/${baseEnchantmentName}_3d`,
      openModel: `minecraft:item/books_3d/${baseEnchantmentName}_3d_open`,
      component: 'minecraft:stored_enchantments',
      conditions: { [enchantment]: level }
    };
  }
  
  private getEnchantmentFileName(enchantment: string, level: number): string {
    const enchantmentName = enchantment.replace('minecraft:', '');
    return `${enchantmentName}_${level}`;
  }
  
  private getTextureModelName(enchantment: string, level: number): string {
    const enchantmentName = enchantment.replace('minecraft:', '');
    
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
  
  private getBaseEnchantmentName(enchantment: string): string {
    const enchantmentName = enchantment.replace('minecraft:', '');
    
    // Handle curse enchantments
    if (enchantmentName === 'binding_curse') return 'curse_of_binding';
    if (enchantmentName === 'vanishing_curse') return 'curse_of_vanishing';
    
    return enchantmentName;
  }
  
  private async generateCITFile(variant: ItemVariant, citDir: string): Promise<void> {
    const enchantment = Object.keys(variant.conditions!)[0];
    const level = variant.conditions![enchantment];
    
    const citContent = [
      'type=item',
      'items=enchanted_book',
      `model=assets/minecraft/models/item/books/${variant.variantId}`,
      `enchantmentIDs=${enchantment}`,
      `enchantmentLevels=${level}`
    ].join('\n');
    
    await writeFile(join(citDir, `${variant.variantId}.properties`), citContent);
  }
  
  private async generatePredicateModel(variant: ItemVariant, modelsDir: string, predicateSystem: PredicateSystem): Promise<void> {
    const overrides = predicateSystem.generateOverrides(variant);
    
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
}

class RegularBookProcessor implements ItemProcessor {
  name = 'regular_books';
  
  private bookConfigs = [
    { itemId: 'book', textureRef: 'minecraft:item/books/book' },
    { itemId: 'writable_book', textureRef: 'minecraft:item/books/writable_book' },
    { itemId: 'written_book', textureRef: 'minecraft:item/books/written_book' },
    { itemId: 'knowledge_book', textureRef: 'minecraft:item/books/knowledge_book' }
  ];
  
  async canProcess(itemId: string, modelsDir: string, itemsDir: string): Promise<boolean> {
    if (!this.bookConfigs.some(config => config.itemId === itemId)) return false;
    
    // Check if 3D models exist
    const booksDir = join(modelsDir, 'books_3d');
    if (!existsSync(booksDir)) return false;
    
    const files = await readdir(booksDir);
    return files.includes(`${itemId}_3d.json`);
  }
  
  async process(inputDir: string, outputDir: string, citDir: string, predicateSystem: PredicateSystem): Promise<void> {
    // Create Pommel model directory
    const pommelModelsDir = join(outputDir, 'assets/minecraft/models/item/books');
    await mkdir(pommelModelsDir, { recursive: true });
    
    for (const config of this.bookConfigs) {
      if (await this.canProcess(config.itemId, join(inputDir, 'assets/minecraft/models/item'), '')) {
        console.log(`📖 Processing ${config.itemId}...`);
        
        const variant: ItemVariant = {
          itemId: config.itemId,
          variantId: config.itemId,
          textureRef: config.textureRef,
          baseModel: `minecraft:item/books_3d/${config.itemId}_3d`,
          openModel: `minecraft:item/books_3d/${config.itemId}_3d_open`
        };
        
        // Generate CIT file
        await this.generateCITFile(variant, citDir);
        
        // Generate predicate model file
        await this.generatePredicateModel(variant, pommelModelsDir, predicateSystem);
      }
    }
  }
  
  private async generateCITFile(variant: ItemVariant, citDir: string): Promise<void> {
    const citContent = [
      'type=item',
      `items=${variant.itemId}`,
      `model=assets/minecraft/models/item/books/${variant.variantId}`
    ].join('\n');
    
    await writeFile(join(citDir, `${variant.variantId}.properties`), citContent);
  }
  
  private async generatePredicateModel(variant: ItemVariant, modelsDir: string, predicateSystem: PredicateSystem): Promise<void> {
    const overrides = predicateSystem.generateOverrides(variant);
    
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
}

// Main backporter function
async function backportResourcePack(inputDir: string, outputDir: string, predicateSystemName = 'pommel') {
  console.log('🔄 Backporting resource pack from 1.21.4+ to 1.21.1...');
  
  // Create output directories
  const citDir = join(outputDir, 'assets/minecraft/optifine/cit');
  await mkdir(citDir, { recursive: true });
  
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
  
  // Initialize processors
  const processors: ItemProcessor[] = [
    new EnchantedBookProcessor(),
    new RegularBookProcessor()
  ];
  
  // Process items
  const modelsDir = join(inputDir, 'assets/minecraft/models/item');
  const itemsDir = join(inputDir, 'assets/minecraft/items');
  
  let totalProcessed = 0;
  
  for (const processor of processors) {
    let processed = false;
    
    if (processor.name === 'enchanted_book') {
      if (await processor.canProcess('enchanted_book', modelsDir, itemsDir)) {
        await processor.process(inputDir, outputDir, citDir, predicateSystem);
        processed = true;
        totalProcessed++;
      }
    } else {
      // For other processors, check each book type
      const bookTypes = ['book', 'writable_book', 'written_book', 'knowledge_book'];
      for (const bookType of bookTypes) {
        if (await processor.canProcess(bookType, modelsDir, itemsDir)) {
          if (!processed) {
            await processor.process(inputDir, outputDir, citDir, predicateSystem);
            processed = true;
          }
        }
      }
      if (processed) totalProcessed++;
    }
  }
  
  console.log(`✅ Resource pack backport complete!`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`🎯 Processed ${totalProcessed} item type(s) with ${predicateSystem.name} predicates`);
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
