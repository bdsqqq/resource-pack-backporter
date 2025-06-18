import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { FileManager, WriteRequest } from "@backporter/file-manager";
import { getMergers } from "@backporter/mergers";
import { getWriters } from "@backporter/writers";
import type { StructuredTracer } from "@logger/index";

export class FileManagerImpl implements FileManager {
  private requests: WriteRequest[] = [];
  private outputDir: string;
  private tracer?: StructuredTracer;

  constructor(outputDir: string, tracer?: StructuredTracer) {
    this.outputDir = outputDir;
    this.tracer = tracer;
  }

  get getOutputDir(): string {
    return this.outputDir;
  }

  addRequests(requests: WriteRequest[]): void {
    this.requests.push(...requests);
  }

  async writeAll(): Promise<void> {
    const span = this.tracer?.startSpan("Write All Files");
    span?.setAttributes({ requestCount: this.requests.length });

    try {
      // Group requests by path for merging
      const requestsByPath = this.groupRequestsByPath();

      // Merge conflicting requests
      const mergedRequests = await this.mergeRequests(requestsByPath);

      // Write all requests using appropriate writers
      const writeSpan = span?.startChild("Write Requests");
      writeSpan?.setAttributes({ mergedRequestCount: mergedRequests.length });

      for (const request of mergedRequests) {
        await this.writeRequest(request);
      }

      writeSpan?.end({ success: true });
      span?.end({
        success: true,
        originalRequests: this.requests.length,
        mergedRequests: mergedRequests.length,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      span?.error("Failed to write files", {
        error: errorMessage,
        stack: errorStack,
      });
      span?.end({ success: false, error: errorMessage });
      throw error;
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
      groups.get(key)?.push(request);
    }

    return groups;
  }

  private async mergeRequests(
    requestsByPath: Map<string, WriteRequest[]>
  ): Promise<WriteRequest[]> {
    const mergedRequests: WriteRequest[] = [];
    const mergers = getMergers();
    const mergeSpan = this.tracer?.startSpan("Merge Conflicting Requests");
    mergeSpan?.setAttributes({ totalGroups: requestsByPath.size });

    try {
      for (const [key, requests] of requestsByPath) {
        if (requests.length === 1) {
          const singleRequest = requests[0];
          if (singleRequest) {
            mergedRequests.push(singleRequest);
          }
          continue;
        }

        // Find a merger that can handle these requests
        const merger = mergers.find((m) => m.canMerge(requests));
        if (merger) {
          mergeSpan?.info(`Merging requests using ${merger.name}`, {
            requestCount: requests.length,
            key,
            mergerName: merger.name,
          });
          const merged = merger.merge(requests);
          if (merged) {
            mergedRequests.push(merged);
          }
        } else {
          // No merger found, use highest priority request
          mergeSpan?.warn("No merger found, using highest priority request", {
            key,
            requestCount: requests.length,
          });
          const sorted = requests.sort((a, b) => (b.priority || 0) - (a.priority || 0));
          const highestPriority = sorted[0];
          if (highestPriority) {
            mergedRequests.push(highestPriority);
          }
        }
      }

      mergeSpan?.end({
        success: true,
        originalRequests: Array.from(requestsByPath.values()).flat().length,
        mergedRequests: mergedRequests.length,
      });
      return mergedRequests;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      mergeSpan?.error("Failed to merge requests", {
        error: errorMessage,
        stack: errorStack,
      });
      mergeSpan?.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private async writeRequest(request: WriteRequest): Promise<void> {
    const writeSpan = this.tracer?.startSpan(`Write ${request.type}`);
    writeSpan?.setAttributes({
      requestType: request.type,
      requestPath: request.path,
    });

    try {
      const writers = getWriters();
      const writer = writers.find((w) => w.canWrite(request));

      if (!writer) {
        writeSpan?.error("No writer found for request type", {
          requestType: request.type,
        });
        writeSpan?.end({ success: false, error: "no_writer_found" });
        return;
      }

      await writer.write(request, this.outputDir);
      writeSpan?.info("File written successfully");
      writeSpan?.end({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      writeSpan?.error("Failed to write file", {
        error: errorMessage,
        stack: errorStack,
      });
      writeSpan?.end({ success: false, error: errorMessage });
      throw error;
    }
  }

  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
  }
}
