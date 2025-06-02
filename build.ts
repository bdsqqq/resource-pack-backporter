#!/usr/bin/env bun

/**
 * Build script - generates all resource pack variants
 */

import { promises as fs } from 'fs';

async function build() {
  console.log('🔨 Building Better Fresher 3D Books resource packs...');
  
  // Clean dist directory
  try {
    await fs.rm('dist', { recursive: true, force: true });
  } catch (error) {
    // Directory doesn't exist, that's fine
  }
  
  await fs.mkdir('dist', { recursive: true });
  console.log('📁 Cleaned dist/ directory');
  
  // Build different variants
  const builds = [
    {
      name: 'Immediate 3D',
      script: 'create-immediate-3d.ts',
      description: 'All books are 3D immediately (simplest)'
    },
    {
      name: 'CustomModelData',
      script: 'fix-specific-models.ts', 
      args: ['.', 'dist'],
      description: 'Specific 3D models via CustomModelData commands'
    },
    {
      name: 'Hybrid',
      script: 'create-hybrid-solution.ts',
      args: ['.', 'dist'], 
      description: 'Default 3D + CustomModelData overrides'
    }
  ];
  
  for (const build of builds) {
    console.log(`\n🏗️  Building ${build.name}...`);
    console.log(`   ${build.description}`);
    
    try {
      const { spawn } = await import('child_process');
      const args = build.args || [];
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('bun', [build.script, ...args], {
          stdio: 'pipe'
        });
        
        let output = '';
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          output += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            console.log(`   ✅ ${build.name} built successfully`);
            resolve();
          } else {
            console.log(`   ❌ ${build.name} failed:`, output);
            reject(new Error(`Build failed with code ${code}`));
          }
        });
      });
      
    } catch (error) {
      console.log(`   ❌ ${build.name} failed:`, error);
    }
  }
  
  console.log('\n🎉 Build complete!');
  console.log('📁 Check dist/ directory for generated resource packs');
  console.log('\n📋 Available builds:');
  
  try {
    const distContents = await fs.readdir('dist');
    distContents.forEach(item => {
      console.log(`   • ${item}`);
    });
  } catch (error) {
    console.log('   Could not list dist contents');
  }
}

if (import.meta.main) {
  build().catch(console.error);
}
