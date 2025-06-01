#!/usr/bin/env bun

/**
 * Minecraft Resource Pack Downgrade Converter
 * Converts modern Minecraft item model JSON files (1.21.4+) to CIT properties files
 * compatible with CIT Resewn 1.21.1
 */

import { promises as fs } from 'fs';
import path from 'path';

// TypeScript types for modern JSON structure
interface MinecraftModel {
  type: string;
  [key: string]: any;
}

interface SelectNode extends MinecraftModel {
  type: 'minecraft:select';
  property: string;
  cases: Case[];
  fallback?: MinecraftModel;
}

interface ComponentNode extends SelectNode {
  component: string;
}

interface ModelNode extends MinecraftModel {
  type: 'minecraft:model';
  model: string;
}

interface Case {
  when: string[] | Record<string, number> | any;
  model: MinecraftModel;
}

// Result structures
interface ExtractedPredicate {
  itemType: string;
  displayContexts: string[];
  enchantment?: string;
  level?: number;
  modelPath: string;
}

interface CITRule {
  itemType: string;
  enchantment?: string;
  levels: number[];
  hand?: 'left' | 'right';
  modelPath: string;
}

// Type guards
function isSelectNode(node: MinecraftModel): node is SelectNode {
  return node.type === 'minecraft:select';
}

function isComponentNode(node: MinecraftModel): node is ComponentNode {
  return node.type === 'minecraft:select' && 'component' in node;
}

function isModelNode(node: MinecraftModel): node is ModelNode {
  return node.type === 'minecraft:model';
}

/**
 * Maps display contexts to CIT hand constraints
 */
function mapDisplayContextsToHand(contexts: string[]): 'left' | 'right' | undefined {
  const leftContexts = ['firstperson_lefthand', 'thirdperson_lefthand', 'head'];
  const rightContexts = ['firstperson_righthand', 'thirdperson_righthand'];
  
  const hasLeft = contexts.some(ctx => leftContexts.includes(ctx));
  const hasRight = contexts.some(ctx => rightContexts.includes(ctx));
  
  // If only one hand type is present, return that
  if (hasLeft && !hasRight) return 'left';
  if (hasRight && !hasLeft) return 'right';
  
  // GUI contexts and mixed contexts don't get hand constraints
  return undefined;
}

/**
 * Recursively extracts all predicate combinations from JSON
 */
function extractPredicates(
  node: MinecraftModel,
  itemType: string,
  currentContexts: string[] = [],
  currentEnchantment?: string,
  currentLevel?: number
): ExtractedPredicate[] {
  
  if (isModelNode(node)) {
    // Terminal case: we have a model
    return [{
      itemType,
      displayContexts: currentContexts,
      enchantment: currentEnchantment,
      level: currentLevel,
      modelPath: node.model
    }];
  }
  
  if (!isSelectNode(node)) {
    console.warn(`Unsupported node type: ${node.type}`);
    return [];
  }
  
  const results: ExtractedPredicate[] = [];
  
  // Handle display context selection
  if (node.property === 'minecraft:display_context') {
    for (const case_ of node.cases) {
      if (Array.isArray(case_.when)) {
        const contexts = case_.when as string[];
        results.push(...extractPredicates(
          case_.model,
          itemType,
          contexts,
          currentEnchantment,
          currentLevel
        ));
      }
    }
  }
  
  // Handle component-based enchantment selection
  else if (isComponentNode(node) && node.component === 'minecraft:stored_enchantments') {
    for (const case_ of node.cases) {
      if (typeof case_.when === 'object' && !Array.isArray(case_.when)) {
        // Extract enchantment and level from when clause
        for (const [enchName, level] of Object.entries(case_.when)) {
          const cleanEnchName = enchName.replace('minecraft:', '');
          results.push(...extractPredicates(
            case_.model,
            itemType,
            currentContexts,
            cleanEnchName,
            level as number
          ));
        }
      }
    }
  }
  
  // Handle fallback if present
  if (node.fallback) {
    results.push(...extractPredicates(
      node.fallback,
      itemType,
      currentContexts,
      currentEnchantment,
      currentLevel
    ));
  }
  
  return results;
}

/**
 * Collapses predicates by grouping compatible ones
 * For now, we keep individual rules per level since CIT doesn't support model wildcards
 */
function collapsePredicates(predicates: ExtractedPredicate[]): CITRule[] {
  const grouped = new Map<string, ExtractedPredicate[]>();
  
  // Group by (itemType + enchantment + level + context + modelPath)
  for (const pred of predicates) {
    const hand = mapDisplayContextsToHand(pred.displayContexts);
    const key = `${pred.itemType}|${pred.enchantment || 'none'}|${pred.level || 'none'}|${hand || 'any'}|${pred.modelPath}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(pred);
  }
  
  // Convert groups to CIT rules
  const rules: CITRule[] = [];
  
  for (const [key, preds] of grouped) {
    const [itemType, enchantment, levelStr, handStr, modelPath] = key.split('|');
    
    const level = levelStr === 'none' ? undefined : parseInt(levelStr);
    const levels = level !== undefined ? [level] : [];
    const hand = handStr === 'any' ? undefined : (handStr as 'left' | 'right');
    
    rules.push({
      itemType,
      enchantment: enchantment === 'none' ? undefined : enchantment,
      levels,
      hand,
      modelPath
    });
  }
  
  return rules;
}

/**
 * Generates CIT properties file content
 */
function generateCITProperties(rule: CITRule): string {
  const lines: string[] = [];
  
  // Basic item matching
  lines.push(`type=item`);
  lines.push(`items=${rule.itemType}`);
  
  // Model path - convert minecraft: namespace to relative path from CIT directory
  let modelPath = rule.modelPath.replace('minecraft:', '../../../models/');
  if (!modelPath.endsWith('.json')) {
    modelPath += '.json';
  }
  lines.push(`model=${modelPath}`);
  
  // Enchantment matching
  if (rule.enchantment) {
    lines.push(`nbt.StoredEnchantments.0.id=minecraft:${rule.enchantment}`);
    
    if (rule.levels.length > 0) {
      const levelStr = rule.levels.map(l => `${l}s`).join('|');
      lines.push(`nbt.StoredEnchantments.0.lvl=${levelStr}`);
    }
  }
  
  // Hand constraint
  if (rule.hand) {
    lines.push(`hand=${rule.hand}`);
  }
  
  return lines.join('\n') + '\n';
}

/**
 * Processes a single JSON file
 */
async function processItemFile(filePath: string, outputDir: string): Promise<void> {
  console.log(`Processing ${filePath}...`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(content);
    
    if (!json.model) {
      console.warn(`No model found in ${filePath}`);
      return;
    }
    
    const itemName = path.basename(filePath, '.json');
    const predicates = extractPredicates(json.model, `minecraft:${itemName}`);
    
    console.log(`  Extracted ${predicates.length} predicates`);
    
    const rules = collapsePredicates(predicates);
    
    console.log(`  Collapsed to ${rules.length} CIT rules`);
    
    // Generate properties files
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const properties = generateCITProperties(rule);
      
      // Create filename
      let filename = `${itemName}`;
      if (rule.enchantment) {
        filename += `_${rule.enchantment}`;
      }
      if (rule.levels.length > 0) {
        filename += `_${rule.levels.join('_')}`;
      }
      if (rule.hand) {
        filename += `_${rule.hand}`;
      }
      if (rules.length > 1) {
        filename += `_${i + 1}`;
      }
      filename += '.properties';
      
      const outputPath = path.join(outputDir, filename);
      await fs.writeFile(outputPath, properties);
      
      console.log(`    Generated ${filename}`);
    }
    
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

/**
 * Copies a file if it exists
 */
async function copyFileIfExists(src: string, dest: string): Promise<void> {
  try {
    await fs.access(src);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
    console.log(`  Copied ${path.basename(src)}`);
  } catch (error) {
    // File doesn't exist, skip silently
  }
}

/**
 * Creates or updates pack.mcmeta for CIT compatibility
 */
async function createCITPackMeta(inputDir: string, outputDir: string): Promise<void> {
  const inputMetaPath = path.join(inputDir, 'pack.mcmeta');
  const outputMetaPath = path.join(outputDir, 'pack.mcmeta');
  
  let packMeta: any = {
    pack: {
      pack_format: 34, // 1.21.x format
      description: "CIT Resource Pack (converted from modern JSON)"
    }
  };
  
  // Try to read existing pack.mcmeta
  try {
    const existingMeta = await fs.readFile(inputMetaPath, 'utf-8');
    packMeta = JSON.parse(existingMeta);
    
    // Update description to indicate CIT conversion
    if (packMeta.pack?.description) {
      packMeta.pack.description += " (CIT converted)";
    } else {
      packMeta.pack.description = "CIT Resource Pack (converted from modern JSON)";
    }
    
    console.log(`  Updated pack.mcmeta`);
  } catch (error) {
    console.log(`  Created new pack.mcmeta`);
  }
  
  await fs.writeFile(outputMetaPath, JSON.stringify(packMeta, null, 2));
}

/**
 * Recursively copies a directory
 */
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
    // Directory doesn't exist, skip silently
  }
}

/**
 * Main conversion function
 */
async function convertToCIT(inputDir: string, outputDir: string): Promise<void> {
  console.log('Minecraft Resource Pack to CIT Converter');
  console.log('========================================');
  
  // Create proper CIT resource pack structure
  const citDir = path.join(outputDir, 'assets', 'minecraft', 'optifine', 'cit');
  await fs.mkdir(citDir, { recursive: true });
  
  console.log('Setting up CIT resource pack structure...');
  
  // Copy and update pack.mcmeta
  await createCITPackMeta(inputDir, outputDir);
  
  await copyFileIfExists(
    path.join(inputDir, 'pack.png'),
    path.join(outputDir, 'pack.png')
  );
  
  // Copy models and textures directories
  console.log('Copying models and textures...');
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'models'),
    path.join(outputDir, 'assets', 'minecraft', 'models')
  );
  
  await copyDirectory(
    path.join(inputDir, 'assets', 'minecraft', 'textures'),
    path.join(outputDir, 'assets', 'minecraft', 'textures')
  );
  
  // Find all JSON files in the items directory
  const itemsDir = path.join(inputDir, 'assets', 'minecraft', 'items');
  
  try {
    const files = await fs.readdir(itemsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`\nFound ${jsonFiles.length} item files to process\n`);
    
    for (const file of jsonFiles) {
      const filePath = path.join(itemsDir, file);
      await processItemFile(filePath, citDir);
    }
    
    console.log('\nConversion complete!');
    console.log(`CIT resource pack generated in: ${outputDir}`);
    console.log('\nTo test:');
    console.log(`1. Copy the output folder to your .minecraft/resourcepacks/ directory`);
    console.log(`2. Enable CIT Resewn mod (Fabric/Quilt)`);
    console.log(`3. Activate the resource pack in Minecraft`);
    
  } catch (error) {
    console.error(`Error reading items directory: ${error}`);
  }
}

// CLI interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: bun convert-to-cit.ts <input-pack-dir> <output-cit-dir>');
    console.log('');
    console.log('Example:');
    console.log('  bun convert-to-cit.ts . ./cit-output');
    process.exit(1);
  }
  
  const [inputDir, outputDir] = args;
  
  convertToCIT(inputDir, outputDir).catch(error => {
    console.error('Conversion failed:', error);
    process.exit(1);
  });
}

export { convertToCIT, extractPredicates, collapsePredicates, generateCITProperties };
