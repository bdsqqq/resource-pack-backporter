#!/usr/bin/env bun

/**
 * Debug CIT script - creates a simple test to verify CIT is working
 */

import { promises as fs } from 'fs';
import path from 'path';

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

async function createSimpleTest(outputPath: string): Promise<void> {
  const debugDir = path.join(outputPath, 'debug-cit-test');
  await fs.mkdir(debugDir, { recursive: true });
  
  // Create assets structure
  const citDir = path.join(debugDir, 'assets', 'minecraft', 'optifine', 'cit');
  await fs.mkdir(citDir, { recursive: true });
  
  // Create simple pack.mcmeta
  const packMeta = {
    pack: {
      pack_format: 34,
      description: "Simple CIT Debug Test"
    }
  };
  
  await fs.writeFile(
    path.join(debugDir, 'pack.mcmeta'),
    JSON.stringify(packMeta, null, 2)
  );
  
  // Create a very simple CIT rule for regular books
  const simpleBookRule = `type=item
items=minecraft:book
model=../../../models/item/books_3d/book_3d.json
`;
  
  await fs.writeFile(
    path.join(citDir, 'simple_book.properties'),
    simpleBookRule
  );
  
  // Copy the model file we need
  const modelsDir = path.join(debugDir, 'assets', 'minecraft', 'models', 'item', 'books_3d');
  await fs.mkdir(modelsDir, { recursive: true });
  
  // Copy the book_3d.json model from the original pack
  await fs.copyFile(
    path.join(process.cwd(), 'assets', 'minecraft', 'models', 'item', 'books_3d', 'book_3d.json'),
    path.join(modelsDir, 'book_3d.json')
  );
  
  // Copy textures directory
  const texturesDir = path.join(debugDir, 'assets', 'minecraft', 'textures');
  await copyDirectory(
    path.join(process.cwd(), 'assets', 'minecraft', 'textures'),
    texturesDir
  );
  
  console.log(`Simple CIT debug test created in: ${debugDir}`);
  console.log('This test pack has:');
  console.log('- One simple CIT rule for books');
  console.log('- No hand constraints or complex logic');
  console.log('- Just changes all books to use book_3d.json model');
  console.log('\nCopy this to your resourcepacks folder and test!');
}

if (import.meta.main) {
  createSimpleTest('.').catch(console.error);
}
