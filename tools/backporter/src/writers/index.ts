// Writer Strategy Interface

import type { WriteRequest } from "@backporter/file-manager";

export interface FileWriter {
  name: string;
  canWrite(request: WriteRequest): boolean;
  write(request: WriteRequest, outputDir: string): Promise<void>;
}

import { CITPropertiesWriter } from "./cit-properties";
import { PommelModelWriter } from "./pommel-model";
import { TextureCopyWriter } from "./texture-copy";
import { VanillaModelWriter } from "./vanilla-model";

// Writer registry - will be populated as we migrate writers
export const writers: FileWriter[] = [
  new PommelModelWriter(),
  new CITPropertiesWriter(),
  new VanillaModelWriter(),
  new TextureCopyWriter(),
];

export function registerWriter(writer: FileWriter): void {
  writers.push(writer);
}

export function getWriters(): FileWriter[] {
  return [...writers];
}
