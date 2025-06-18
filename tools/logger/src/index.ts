export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  attributes: Record<string, any>;
  level: number;
}

export interface LogEvent {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  spanId?: string;
  attributes?: Record<string, any>;
}

export interface TracerConfig {
  serviceName: string;
  axiomDataset?: string;
  axiomToken?: string;
  enableConsole?: boolean;
  enableAxiom?: boolean;
}

class Span {
  private context: SpanContext;
  private tracer: StructuredTracer;
  private children: Span[] = [];
  private events: LogEvent[] = [];
  private endTime?: number;

  constructor(context: SpanContext, tracer: StructuredTracer) {
    this.context = context;
    this.tracer = tracer;
  }

  setAttributes(attributes: Record<string, any>): this {
    Object.assign(this.context.attributes, attributes);
    return this;
  }

  addEvent(level: LogEvent["level"], message: string, attributes?: Record<string, any>): this {
    const event: LogEvent = {
      timestamp: performance.now(),
      level,
      message,
      spanId: this.context.spanId,
      attributes,
    };

    this.events.push(event);
    this.tracer.logEvent(event, this.context.level);
    return this;
  }

  info(message: string, attributes?: Record<string, any>): this {
    return this.addEvent("info", message, attributes);
  }

  warn(message: string, attributes?: Record<string, any>): this {
    return this.addEvent("warn", message, attributes);
  }

  error(message: string, attributes?: Record<string, any>): this {
    return this.addEvent("error", message, attributes);
  }

  debug(message: string, attributes?: Record<string, any>): this {
    return this.addEvent("debug", message, attributes);
  }

  startChild(operation: string, attributes?: Record<string, any>): Span {
    const childSpan = this.tracer.startSpan(operation, this.context.spanId, attributes);
    this.children.push(childSpan);
    return childSpan;
  }

  end(attributes?: Record<string, any>): void {
    if (attributes) {
      this.setAttributes(attributes);
    }

    this.endTime = performance.now();
    const duration = this.endTime - this.context.startTime;

    this.tracer.endSpan(this, duration);
  }

  getContext(): SpanContext {
    return this.context;
  }

  getDuration(): number | undefined {
    return this.endTime ? this.endTime - this.context.startTime : undefined;
  }

  getEvents(): LogEvent[] {
    return this.events;
  }

  getChildren(): Span[] {
    return this.children;
  }
}

export class StructuredTracer {
  private config: TracerConfig;
  private activeSpans: Map<string, Span> = new Map();
  private rootSpans: Span[] = [];
  private traceId: string;

  constructor(config: TracerConfig) {
    this.config = config;
    this.traceId = this.generateId();
  }

  startSpan(operation: string, parentSpanId?: string, attributes?: Record<string, any>): Span {
    const spanId = this.generateId();
    const level = parentSpanId ? this.getSpanLevel(parentSpanId) + 1 : 0;

    const context: SpanContext = {
      traceId: this.traceId,
      spanId,
      parentSpanId,
      operation,
      startTime: performance.now(),
      attributes: attributes || {},
      level,
    };

    const span = new Span(context, this);
    this.activeSpans.set(spanId, span);

    if (!parentSpanId) {
      this.rootSpans.push(span);
    }

    this.logSpanStart(span);
    return span;
  }

  endSpan(span: Span, duration: number): void {
    this.activeSpans.delete(span.getContext().spanId);
    this.logSpanEnd(span, duration);

    // Ship to Axiom if configured
    if (this.config.enableAxiom && this.config.axiomToken && this.config.axiomDataset) {
      this.shipToAxiom(span, duration);
    }
  }

  logEvent(event: LogEvent, level: number): void {
    if (!this.config.enableConsole) return;

    const indent = this.getIndent(level + 1);
    const prefix = this.getEventPrefix(event.level);
    const message = `${indent}${prefix} ${event.message}`;

    switch (event.level) {
      case "error":
        console.error(message);
        break;
      case "warn":
        console.warn(message);
        break;
      case "debug":
        console.debug(message);
        break;
      default:
        console.log(message);
    }
  }

  private logSpanStart(span: Span): void {
    if (!this.config.enableConsole) return;

    const context = span.getContext();
    const indent = this.getIndent(context.level);
    const prefix = this.getSpanStartPrefix(context.level);

    console.log(`${indent}${prefix} ${context.operation}`);
  }

  private logSpanEnd(span: Span, duration: number): void {
    if (!this.config.enableConsole) return;

    const context = span.getContext();
    const indent = this.getIndent(context.level);
    const prefix = this.getSpanEndPrefix(context.level);
    const durationStr = this.formatDuration(duration);

    console.log(`${indent}${prefix} ${context.operation} completed ${durationStr}`);
  }

  private getIndent(level: number): string {
    if (level === 0) return "";
    return "│  ".repeat(level);
  }

  private getSpanStartPrefix(level: number): string {
    if (level === 0) return "┌─";
    return "├─";
  }

  private getSpanEndPrefix(_level: number): string {
    return "└─";
  }

  private getEventPrefix(level: LogEvent["level"]): string {
    switch (level) {
      case "error":
        return "✗";
      case "warn":
        return "⚠";
      case "info":
        return "✓";
      case "debug":
        return "▪";
      default:
        return "→";
    }
  }

  private getSpanLevel(spanId: string): number {
    const span = this.activeSpans.get(spanId);
    return span ? span.getContext().level : 0;
  }

  private formatDuration(ms: number): string {
    if (ms < 0.001) return `[${(ms * 1000000).toFixed(0)}ns]`; // nanoseconds
    if (ms < 1) return `[${(ms * 1000).toFixed(0)}μs]`; // microseconds
    if (ms < 1000) return `[${ms.toFixed(1)}ms]`; // milliseconds
    if (ms < 60000) return `[${(ms / 1000).toFixed(1)}s]`; // seconds
    return `[${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s]`; // minutes
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private async shipToAxiom(span: Span, duration: number): Promise<void> {
    if (!this.config.axiomToken || !this.config.axiomDataset) return;

    const context = span.getContext();
    const payload = {
      _time: new Date().toISOString(), // Use Date.now() for Axiom timestamps
      service: this.config.serviceName,
      trace_id: context.traceId,
      span_id: context.spanId,
      parent_span_id: context.parentSpanId,
      operation: context.operation,
      duration_ms: duration,
      level: context.level,
      attributes: context.attributes,
      events: span.getEvents().map((event) => ({
        timestamp: new Date().toISOString(),
        level: event.level,
        message: event.message,
        attributes: event.attributes,
      })),
    };

    try {
      const response = await fetch(
        `https://api.axiom.co/v1/datasets/${this.config.axiomDataset}/ingest`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.axiomToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([payload]),
        }
      );

      if (!response.ok) {
        console.warn(`Failed to ship span to Axiom: ${response.statusText}`);
      }
    } catch (error) {
      console.warn("Failed to ship span to Axiom:", error);
    }
  }

  // Utility method to flush all data to Axiom at the end
  async flush(): Promise<void> {
    // Wait for any pending Axiom requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// Global tracer instance
let globalTracer: StructuredTracer | null = null;

export function createTracer(config: TracerConfig): StructuredTracer {
  globalTracer = new StructuredTracer(config);
  return globalTracer;
}

export function getTracer(): StructuredTracer {
  if (!globalTracer) {
    throw new Error("Tracer not initialized. Call createTracer() first.");
  }
  return globalTracer;
}

// Convenience functions
export function startSpan(operation: string, attributes?: Record<string, any>): Span {
  return getTracer().startSpan(operation, undefined, attributes);
}

export function startChildSpan(
  operation: string,
  parentSpanId: string,
  attributes?: Record<string, any>
): Span {
  return getTracer().startSpan(operation, parentSpanId, attributes);
}
