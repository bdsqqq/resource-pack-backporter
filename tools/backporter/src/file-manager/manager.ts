import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { WriteRequest, FileManager } from "@backporter/file-manager";
import { getMergers } from "@backporter/mergers";
import { getWriters } from "@backporter/writers";

export class FileManagerImpl implements FileManager {
  private requests: WriteRequest[] = [];
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
  }

  addRequests(requests: WriteRequest[]): void {
    this.requests.push(...requests);
  }

  async writeAll(): Promise<void> {
    console.log(`📝 Processing ${this.requests.length} write requests...`);

    // Group requests by path for merging
    const requestsByPath = this.groupRequestsByPath();

    // Merge conflicting requests
    const mergedRequests = await this.mergeRequests(requestsByPath);

    // Write all requests using appropriate writers
    for (const request of mergedRequests) {
      await this.writeRequest(request);
    }
  }

  clear(): void {
    this.requests = [];
  }

  private groupRequestsByPath(): Map<string, WriteRequest[]> {
    const groups = new Map<string, WriteRequest[]>();

    for (const request of this.requests) {
      const key = `${request.type}:${request.path}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(request);
    }

    return groups;
  }

  private async mergeRequests(
    requestsByPath: Map<string, WriteRequest[]>
  ): Promise<WriteRequest[]> {
    const mergedRequests: WriteRequest[] = [];
    const mergers = getMergers();

    for (const [key, requests] of requestsByPath) {
      if (requests.length === 1) {
        mergedRequests.push(requests[0]);
        continue;
      }

      // Find a merger that can handle these requests
      const merger = mergers.find((m) => m.canMerge(requests));
      if (merger) {
        console.log(
          `🔄 Merging ${requests.length} requests for ${key} using ${merger.name}`
        );
        const merged = merger.merge(requests);
        mergedRequests.push(merged);
      } else {
        // No merger found, use highest priority request
        console.warn(
          `⚠️  No merger for ${key}, using highest priority request`
        );
        const sorted = requests.sort(
          (a, b) => (b.priority || 0) - (a.priority || 0)
        );
        mergedRequests.push(sorted[0]);
      }
    }

    return mergedRequests;
  }

  private async writeRequest(request: WriteRequest): Promise<void> {
    const writers = getWriters();
    const writer = writers.find((w) => w.canWrite(request));

    if (!writer) {
      console.error(`❌ No writer found for request type: ${request.type}`);
      return;
    }

    try {
      await writer.write(request, this.outputDir);
      console.log(`✅ Wrote ${request.type}: ${request.path}`);
    } catch (error) {
      console.error(
        `❌ Failed to write ${request.type}: ${request.path}`,
        error
      );
      throw error;
    }
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  }
}
