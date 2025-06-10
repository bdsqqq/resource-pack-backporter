import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import type { OutputTarget } from './index';

export class BackportFileGenerator {
  private outputDir: string;
  private sourceDir: string;

  constructor(outputDir: string, sourceDir: string) {
    this.outputDir = outputDir;
    this.sourceDir = sourceDir;
  }

  async generateAllFiles(targets: OutputTarget[]): Promise<void> {
    // Sort by priority to ensure correct generation order
    const sortedTargets = targets.sort((a, b) => a.priority - b.priority);

    for (const target of sortedTargets) {
      switch (target.type) {
        case 'pommel':
          await this.writePommelModel(target);
          break;
        case 'cit_property':
          await this.writeCITProperty(target);
          break;
        case 'enhanced_model':
          await this.copyEnhancedModel(target);
          break;
        case 'base_texture':
          await this.copyTexture(target);
          break;
      }
    }
  }

  private async writePommelModel(target: OutputTarget): Promise<void> {
    const filePath = join(this.outputDir, 'assets', 'minecraft', target.file);
    await this.ensureDirectory(filePath);
    
    const content = JSON.stringify(target.content, null, 2);
    await writeFile(filePath, content, 'utf-8');
    
    console.log(`✅ Generated Pommel model: ${target.file}`);
  }

  private async writeCITProperty(target: OutputTarget): Promise<void> {
    const filePath = join(this.outputDir, 'assets', 'minecraft', target.file);
    await this.ensureDirectory(filePath);
    
    // Convert content object to .properties format
    const lines: string[] = [];
    for (const [key, value] of Object.entries(target.content)) {
      lines.push(`${key}=${value}`);
    }
    
    const content = lines.join('\n') + '\n';
    await writeFile(filePath, content, 'utf-8');
    
    console.log(`✅ Generated CIT property: ${target.file}`);
  }

  private async copyEnhancedModel(target: OutputTarget): Promise<void> {
    // Enhanced models should already exist in source, just copy them
    const sourceFile = join(this.sourceDir, 'assets', 'minecraft', target.file);
    const destFile = join(this.outputDir, 'assets', 'minecraft', target.file);
    
    if (existsSync(sourceFile)) {
      await this.ensureDirectory(destFile);
      await copyFile(sourceFile, destFile);
      console.log(`✅ Copied enhanced 3D model: ${target.file}`);
    } else {
      console.warn(`⚠️  Enhanced model not found in source: ${target.file}`);
    }
  }

  private async copyTexture(target: OutputTarget): Promise<void> {
    // Copy texture files from source to output
    const sourceFile = join(this.sourceDir, 'assets', 'minecraft', target.file);
    const destFile = join(this.outputDir, 'assets', 'minecraft', target.file);
    
    if (existsSync(sourceFile)) {
      await this.ensureDirectory(destFile);
      await copyFile(sourceFile, destFile);
      console.log(`✅ Copied texture: ${target.file}`);
    } else {
      console.warn(`⚠️  Texture not found in source: ${target.file}`);
    }
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  }

  // Utility method for preserving animation data
  async preserveAnimationData(sourceModel: any, targetModel: any): Promise<any> {
    // Copy animation-related properties
    if (sourceModel.textures) {
      targetModel.textures = { ...sourceModel.textures, ...targetModel.textures };
    }
    
    if (sourceModel.elements) {
      targetModel.elements = sourceModel.elements.map((element: any) => ({
        ...element,
        light_emission: element.light_emission // Preserve lighting effects
      }));
    }
    
    // Preserve display transformations for proper 3D rendering
    if (sourceModel.display) {
      targetModel.display = sourceModel.display;
    }
    
    return targetModel;
  }
}
