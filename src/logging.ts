import { DurableObject, RpcTarget, WorkerEntrypoint, exports } from "cloudflare:workers";

export interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

type DynamicWorkerEventKind = "request" | "log" | "exception";

interface StructuredDynamicWorkerEvent {
  source: "dynamic-worker-tail";
  workerId: string;
  kind: DynamicWorkerEventKind;
  level: string;
  message: string;
  timestamp: number;
  outcome?: string;
  method?: string;
  url?: string;
  path?: string;
  status?: number;
  name?: string;
  stack?: string;
}

function normalizeLogMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry))).join(" ");
  }

  return typeof message === "string" ? message : JSON.stringify(message);
}

function isFetchTraceEvent(event: TraceItem["event"]): event is TraceItemFetchEventInfo {
  return event !== null && "request" in event;
}

function toRequestSummary(event: TraceItem, workerId: string): StructuredDynamicWorkerEvent | null {
  if (!isFetchTraceEvent(event.event)) {
    return null;
  }

  const parsedUrl = new URL(event.event.request.url);
  const path = parsedUrl.pathname;
  // Drop the query string and any credentials before persisting: it can carry
  // tokens or other personal data (LGPD art. 6 — minimization).
  const url = `${parsedUrl.origin}${parsedUrl.pathname}`;
  const status = event.event.response?.status;

  return {
    source: "dynamic-worker-tail",
    workerId,
    kind: "request",
    level: event.outcome === "exception" ? "error" : "info",
    message: `${event.event.request.method} ${path}${status !== undefined ? ` -> ${status}` : ""} (${event.outcome})`,
    timestamp: event.eventTimestamp ?? Date.now(),
    outcome: event.outcome,
    method: event.event.request.method,
    url,
    path,
    status
  };
}

function toExceptionEvents(event: TraceItem, workerId: string): StructuredDynamicWorkerEvent[] {
  return event.exceptions.map((exception: TraceException) => ({
    source: "dynamic-worker-tail",
    workerId,
    kind: "exception",
    level: "error",
    message: exception.message,
    timestamp: exception.timestamp,
    name: exception.name,
    stack: exception.stack
  }));
}

function toLogEvents(event: TraceItem, workerId: string): StructuredDynamicWorkerEvent[] {
  return event.logs.map((log: TraceLog) => ({
    source: "dynamic-worker-tail",
    workerId,
    kind: "log",
    level: log.level,
    message: normalizeLogMessage(log.message),
    timestamp: log.timestamp
  }));
}

function toRealtimeLogEntries(events: StructuredDynamicWorkerEvent[]): LogEntry[] {
  return events
    .filter((event) => event.kind !== "request")
    .map((event) => ({
      level: event.level,
      message: event.kind === "exception" && event.name ? `${event.name}: ${event.message}` : event.message,
      timestamp: event.timestamp
    }));
}

class LogWaiter extends RpcTarget {
  private logs: LogEntry[] = [];
  private resolve: ((logs: LogEntry[]) => void) | undefined;

  // Called once getLogs settles so the owning session can drop its reference.
  constructor(private readonly onSettled: () => void = () => {}) {
    super();
  }

  addLogs(logs: LogEntry[]) {
    this.logs.push(...logs);
    if (this.resolve) {
      this.resolve(this.logs);
      this.resolve = undefined;
    }
  }

  async getLogs(timeoutMs: number): Promise<LogEntry[]> {
    if (this.logs.length > 0) {
      this.onSettled();
      return this.logs;
    }

    return new Promise<LogEntry[]>((resolve) => {
      const settle = (logs: LogEntry[]) => {
        this.onSettled();
        resolve(logs);
      };
      const timeout = setTimeout(() => settle(this.logs), timeoutMs);
      this.resolve = (logs) => {
        clearTimeout(timeout);
        settle(logs);
      };
    });
  }
}

export class LogSession extends DurableObject {
  // Multiple runs can share a workerId (the id is a hash of the source files),
  // so a single session may have several concurrent waiters. Track them all and
  // broadcast incoming logs to each, rather than silently dropping the previous
  // waiter on every waitForLogs() call.
  private waiters = new Set<LogWaiter>();

  async addLogs(logs: LogEntry[]) {
    for (const waiter of this.waiters) {
      waiter.addLogs(logs);
    }
  }

  async waitForLogs(): Promise<LogWaiter> {
    const waiter: LogWaiter = new LogWaiter(() => this.waiters.delete(waiter));
    this.waiters.add(waiter);
    return waiter;
  }
}

interface DynamicWorkerTailProps {
  workerId: string;
}

export class DynamicWorkerTail extends WorkerEntrypoint<never, DynamicWorkerTailProps> {
  override async tail(events: TraceItem[]) {
    const logSessionStub = exports.LogSession.getByName(this.ctx.props.workerId);

    for (const event of events) {
      const structuredEvents: StructuredDynamicWorkerEvent[] = [];
      const requestSummary = toRequestSummary(event, this.ctx.props.workerId);

      if (requestSummary) {
        structuredEvents.push(requestSummary);
      }

      structuredEvents.push(...toLogEvents(event, this.ctx.props.workerId));
      structuredEvents.push(...toExceptionEvents(event, this.ctx.props.workerId));

      if (structuredEvents.length > 0) {
        for (const structuredEvent of structuredEvents) {
          console.log(structuredEvent);
        }

        await logSessionStub.addLogs(toRealtimeLogEntries(structuredEvents));
      }
    }
  }
}
