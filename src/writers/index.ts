// Writer Strategy Interface

import type { WriteRequest } from '../file-manager';

export interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}

import { PommelModelWriter } from './pommel-model';
import { CITPropertiesWriter } from './cit-properties';
import { VanillaModelWriter } from './vanilla-model';
import { TextureCopyWriter } from './texture-copy';

// Writer registry - will be populated as we migrate writers
export const writers: FileWriter[] = [
  new PommelModelWriter(),
  new CITPropertiesWriter(),
  new VanillaModelWriter(),
  new TextureCopyWriter()
];

export function registerWriter(writer: FileWriter): void {
  writers.push(writer);
}

export function getWriters(): FileWriter[] {
  return [...writers];
}
