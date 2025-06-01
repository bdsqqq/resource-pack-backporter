#!/usr/bin/env bun

/**
 * Converts modern Minecraft item models (1.21.4+) to CustomModelData overrides (1.21.1 compatible)
 * This is the CORRECT approach - no mods needed!
 */

import { promises as fs } from 'fs';
import path from 'path';

interface ModelOverride {
  predicate: { custom_model_data: number };
  model: string;
}

interface ItemModel {
  parent: string;
  textures: Record<string, string>;
  overrides: ModelOverride[];
}

interface ExtractedMapping {
  itemType: string;
  enchantment?: string;
  level?: number;
  context?: string;
  modelPath: string;
}

/**
 * Extract all model mappings from modern JSON
 */
function extractModelMappings(json: any, itemType: string): ExtractedMapping[] {
  const mappings: ExtractedMapping[] = [];
  
  function traverse(node: any, currentEnchantment?: string, currentLevel?: number, currentContext?: string): void {
    if (!node || typeof node !== 'object') return;
    
    // Terminal model node
    if (node.type === 'minecraft:model' && node.model) {
      mappings.push({
        itemType,
        enchantment: currentEnchantment,
        level: currentLevel,
        context: currentContext,
        modelPath: node.model
      });
      return;
    }
    
    // Select node with display context
    if (node.type === 'minecraft:select' && node.property === 'minecraft:display_context') {
      for (const case_ of node.cases || []) {
        if (Array.isArray(case_.when)) {
          const contexts = case_.when.join(',');
          traverse(case_.model, currentEnchantment, currentLevel, contexts);
        }
      }
      
      // Handle fallback
      if (node.fallback) {
        traverse(node.fallback, currentEnchantment, currentLevel, 'fallback');
      }
    }
    
    // Select node with component (enchantments)
    else if (node.type === 'minecraft:select' && node.component === 'minecraft:stored_enchantments') {
      for (const case_ of node.cases || []) {
        if (typeof case_.when === 'object' && !Array.isArray(case_.when)) {
          for (const [enchName, level] of Object.entries(case_.when)) {
            const cleanEnchName = enchName.replace('minecraft:', '');
            traverse(case_.model, cleanEnchName, level as number, currentContext);
          }
        }
      }
    }
    
    // Other select nodes
    else if (node.type === 'minecraft:select' && node.cases) {
      for (const case_ of node.cases) {
        traverse(case_.model, currentEnchantment, currentLevel, currentContext);
      }
    }
  }
  
  if (json.model) {
    traverse(json.model);
  }
  
  return mappings;
}

/**
 * Generate CustomModelData overrides
 */
function generateOverrides(mappings: ExtractedMapping[]): { overrides: ModelOverride[], commands: string[] } {
  const overrides: ModelOverride[] = [];
  const commands: string[] = [];
  let cmdId = 1;
  
  // Group by model path to avoid duplicates
  const modelToCmd = new Map<string, number>();
  const cmdToInfo = new Map<number, ExtractedMapping>();
  
  for (const mapping of mappings) {
    const modelPath = mapping.modelPath.replace('minecraft:', '');
    
    if (!modelToCmd.has(modelPath)) {
      modelToCmd.set(modelPath, cmdId);
      cmdToInfo.set(cmdId, mapping);
      
      overrides.push({
        predicate: { custom_model_data: cmdId },
        model: modelPath
      });
      
      // Generate command for this model
      let command = `/give @p ${mapping.itemType}{CustomModelData:${cmdId}`;
      
      if (mapping.enchantment && mapping.level) {
        const enchId = `minecraft:${mapping.enchantment}`;
        command += `,StoredEnchantments:[{id:"${enchId}",lvl:${mapping.level}}]`;
      }
      
      command += `}`;
      
      // Add comment with context info
      let comment = `# ${mapping.enchantment || 'base'}_${mapping.level || 'default'}`;
      if (mapping.context) {
        comment += ` (${mapping.context})`;
      }
      
      commands.push(`${comment}\n${command}`);
      
      cmdId++;
    }
  }
  
  return { overrides, commands };
}

/**
 * Create vanilla item model with overrides
 */
function createItemModel(itemType: string, mappings: ExtractedMapping[]): ItemModel {
  const { overrides } = generateOverrides(mappings);
  
  // Get base texture from item type
  const baseTexture = itemType.replace('minecraft:', 'item/');
  
  return {
    parent: "item/generated",
    textures: {
      layer0: baseTexture
    },
    overrides
  };
}

/**
 * Process a single item file
 */
async function processItemFile(filePath: string, outputDir: string): Promise<void> {
  const itemName = path.basename(filePath, '.json');
  console.log(`Processing ${itemName}...`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(content);
    
    if (!json.model) {
      console.warn(`  No model found in ${filePath}`);
      return;
    }
    
    const itemType = `minecraft:${itemName}`;
    const mappings = extractModelMappings(json, itemType);
    
    if (mappings.length === 0) {
      console.warn(`  No mappings extracted from ${itemName}`);
      return;
    }
    
    console.log(`  Extracted ${mappings.length} model mappings`);
    
    // Generate item model with overrides
    const itemModel = createItemModel(itemType, mappings);
    
    // Create output directories
    const modelsDir = path.join(outputDir, 'assets', 'minecraft', 'models', 'item');
    await fs.mkdir(modelsDir, { recursive: true });
    
    // Write item model
    const modelPath = path.join(modelsDir, `${itemName}.json`);
    await fs.writeFile(modelPath, JSON.stringify(itemModel, null, 2));
    
    // Generate commands file
    const { commands } = generateOverrides(mappings);
    const commandsDir = path.join(outputDir, 'commands');
    await fs.mkdir(commandsDir, { recursive: true });
    
    const commandsPath = path.join(commandsDir, `${itemName}_commands.txt`);
    const commandsContent = `# Commands to get ${itemName} with different models\n# Use these in creative mode or with command blocks\n\n${commands.join('\n\n')}`;
    await fs.writeFile(commandsPath, commandsContent);
    
    console.log(`  Generated ${itemModel.overrides.length} overrides`);
    console.log(`  Created ${itemName}.json and ${itemName}_commands.txt`);
    
  } catch (error) {
    console.error(`  Error processing ${filePath}:`, error);
  }
}

/**
 * Main conversion function
 */
async function convertToCMD(inputDir: string, outputDir: string): Promise<void> {
  console.log('Modern Minecraft → CustomModelData Converter');
  console.log('===========================================');
  console.log('Converting 1.21.4+ component models to 1.21.1 CustomModelData overrides\n');
  
  // Create output structure
  await fs.mkdir(outputDir, { recursive: true });
  
  // Copy pack.mcmeta and pack.png
  try {
    const inputMeta = await fs.readFile(path.join(inputDir, 'pack.mcmeta'), 'utf-8');
    const packMeta = JSON.parse(inputMeta);
    packMeta.pack.description += ' (CMD converted for 1.21.1)';
    
    await fs.writeFile(
      path.join(outputDir, 'pack.mcmeta'),
      JSON.stringify(packMeta, null, 2)
    );
    console.log('Updated pack.mcmeta');
  } catch (error) {
    console.log('Could not update pack.mcmeta');
  }
  
  try {
    await fs.copyFile(
      path.join(inputDir, 'pack.png'),
      path.join(outputDir, 'pack.png')
    );
    console.log('Copied pack.png');
  } catch (error) {
    console.log('Could not copy pack.png');
  }
  
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
      // Directory doesn't exist, skip
    }
  }
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'models'),
    path.join(outputDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'textures'),
    path.join(outputDir, 'assets', 'minecraft', 'textures')
  );
  
  // Process item files
  const itemsDir = path.join(inputDir, 'assets', 'minecraft', 'items');
  
  try {
    const files = await fs.readdir(itemsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`\nProcessing ${jsonFiles.length} item files...\n`);
    
    for (const file of jsonFiles) {
      const filePath = path.join(itemsDir, file);
      await processItemFile(filePath, outputDir);
    }
    
    console.log('\n✅ Conversion complete!');
    console.log(`📁 Output: ${outputDir}`);
    console.log('\n🎮 HOW TO USE:');
    console.log('1. Use the converted resource pack in 1.21.1');
    console.log('2. Use commands from the commands/ folder to get items');
    console.log('3. Or use any mod/plugin that sets CustomModelData values');
    console.log('\n📝 EXAMPLE:');
    console.log('  /give @p minecraft:enchanted_book{CustomModelData:1,StoredEnchantments:[{id:"minecraft:sharpness",lvl:1}]}');
    
  } catch (error) {
    console.error(`Error reading items directory: ${error}`);
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun convert-to-cmd.ts <input-pack-dir> <output-pack-dir>');
    console.log('');
    console.log('Example:');
    console.log('  bun convert-to-cmd.ts . ./Better-Fresher-3D-Books-CMD');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  
  convertToCMD(inputDir, outputDir).catch(error => {
    console.error('Conversion failed:', error);
    process.exit(1);
  });
}

export { convertToCMD, extractModelMappings, generateOverrides };
