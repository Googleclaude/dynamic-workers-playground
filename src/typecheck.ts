import type ts from "typescript";

export type DiagnosticSeverity = "error" | "warning" | "suggestion" | "info";

export interface TypeCheckDiagnostic {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  severity: DiagnosticSeverity;
  code: number;
}

export interface TypeCheckResult {
  diagnostics: TypeCheckDiagnostic[];
  filesChecked: string[];
  durationMs: number;
}

const AMBIENT_DTS = `
// Minimal Cloudflare Worker / Web ambient types for client-side type-checking.
// The runtime ships full types via @cloudflare/workers-types; this is the
// in-browser subset used by the playground type checker so users can run
// type-checks privately without making a server roundtrip.

interface Console {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}
declare var console: Console;

interface Crypto {
  randomUUID(): string;
  subtle: SubtleCrypto;
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
}
interface SubtleCrypto {
  digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer>;
}
declare var crypto: Crypto;

declare function fetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response>;
declare function atob(s: string): string;
declare function btoa(s: string): string;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  decode(input?: BufferSource): string;
}

declare class URL {
  constructor(url: string, base?: string | URL);
  href: string;
  origin: string;
  protocol: string;
  host: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: URLSearchParams;
}
declare class URLSearchParams {
  constructor(init?: string | URLSearchParams | string[][] | Record<string, string>);
  get(name: string): string | null;
  getAll(name: string): string[];
  has(name: string): boolean;
  set(name: string, value: string): void;
  delete(name: string): void;
  append(name: string, value: string): void;
  toString(): string;
}

interface HeadersInit {}
declare class Headers {
  constructor(init?: HeadersInit | Record<string, string> | [string, string][]);
  get(name: string): string | null;
  set(name: string, value: string): void;
  append(name: string, value: string): void;
  has(name: string): boolean;
  delete(name: string): void;
  forEach(cb: (value: string, key: string) => void): void;
}

interface BufferSource {}
type BodyInit = string | ArrayBuffer | Uint8Array | ReadableStream | URLSearchParams | FormData | Blob | null;

interface RequestInit {
  method?: string;
  headers?: HeadersInit | Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
  redirect?: "follow" | "error" | "manual";
}

declare class Request {
  constructor(input: string | URL | Request, init?: RequestInit);
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: ReadableStream | null;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  formData(): Promise<FormData>;
  clone(): Request;
}

interface ResponseInit {
  status?: number;
  statusText?: string;
  headers?: HeadersInit | Record<string, string>;
}

declare class Response {
  constructor(body?: BodyInit, init?: ResponseInit);
  static json(data: unknown, init?: ResponseInit): Response;
  static error(): Response;
  static redirect(url: string | URL, status?: number): Response;
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
  readonly ok: boolean;
  readonly headers: Headers;
  readonly body: ReadableStream | null;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  formData(): Promise<FormData>;
  clone(): Response;
}

interface FormData {}
interface Blob {}
interface ReadableStream<R = unknown> {}
interface WritableStream<W = unknown> {}
interface AbortSignal {}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandlerFetchHandler<Env = unknown> {
  (
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Response | Promise<Response>;
}

interface ExportedHandler<Env = unknown> {
  fetch?: ExportedHandlerFetchHandler<Env>;
}

interface DurableObjectNamespace<T = unknown> {
  get(id: DurableObjectId): DurableObjectStub<T>;
  idFromName(name: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
}
interface DurableObjectId {}
interface DurableObjectStub<T = unknown> {
  fetch(request: Request | string): Promise<Response>;
}

interface KVNamespace {
  get(key: string, type?: "text"): Promise<string | null>;
  get<T = unknown>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string | ArrayBuffer, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
  exec(query: string): Promise<unknown>;
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean }>;
  run(): Promise<unknown>;
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer | string | ReadableStream): Promise<R2Object>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    objects: R2Object[];
    truncated: boolean;
    cursor?: string;
  }>;
}
interface R2Object {
  key: string;
  size: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T = unknown>(): Promise<T>;
}
`;

interface CachedEnv {
  ts: typeof ts;
  vfs: typeof import("@typescript/vfs");
  fsMap: Map<string, string>;
  libVersion: string;
}

let cached: Promise<CachedEnv> | null = null;

async function getEnv(): Promise<CachedEnv> {
  if (cached) return cached;
  cached = (async () => {
    const [tsModule, vfsModule] = await Promise.all([
      import("typescript"),
      import("@typescript/vfs"),
    ]);
    const tsLib = (tsModule.default ?? tsModule) as typeof ts;
    const vfs = vfsModule;

    // lib.es2022 is the ES2022 standard lib (Array, Promise, Map, etc.) —
    // no DOM, no webworker. Custom worker globals (Request, Response, fetch,
    // KVNamespace, ...) come from AMBIENT_DTS below. Total transfer on first
    // load is ~150-200 KB (vs ~2 MB for lib.es2022.full); everything is
    // cached in localStorage after the first hit so subsequent checks are
    // fully offline.
    const fsMap = await vfs.createDefaultMapFromCDN(
      {
        target: tsLib.ScriptTarget.ES2022,
        lib: ["es2022"],
      },
      tsLib.version,
      true,
      tsLib,
      undefined,
      undefined
    );

    return {
      ts: tsLib,
      vfs,
      fsMap,
      libVersion: tsLib.version,
    };
  })();
  return cached;
}

function severityFromCategory(
  ts: typeof import("typescript"),
  category: import("typescript").DiagnosticCategory
): DiagnosticSeverity {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  if (category === ts.DiagnosticCategory.Suggestion) return "suggestion";
  return "info";
}

function flattenMessage(
  ts: typeof import("typescript"),
  messageText: string | import("typescript").DiagnosticMessageChain
): string {
  return ts.flattenDiagnosticMessageText(messageText, "\n");
}

const VIRTUAL_ROOT = "/playground/";
const AMBIENT_PATH = "/playground/__ambient.d.ts";

function toVirtualPath(file: string): string {
  return VIRTUAL_ROOT + file.replace(/^\/+/, "");
}

function fromVirtualPath(virtual: string): string {
  if (virtual.startsWith(VIRTUAL_ROOT)) {
    return virtual.slice(VIRTUAL_ROOT.length);
  }
  return virtual;
}

export async function typecheck(
  files: Record<string, string>
): Promise<TypeCheckResult> {
  const start = Date.now();
  const env = await getEnv();
  const { ts, vfs, fsMap } = env;

  const targetExtensions = /\.(ts|tsx|mts|cts)$/i;
  const userPaths = Object.keys(files).filter((p) => targetExtensions.test(p));
  if (userPaths.length === 0) {
    return {
      diagnostics: [],
      filesChecked: [],
      durationMs: Date.now() - start,
    };
  }

  const projectMap = new Map(fsMap);
  projectMap.set(AMBIENT_PATH, AMBIENT_DTS);
  const virtualRoots: string[] = [AMBIENT_PATH];
  for (const path of userPaths) {
    const virtual = toVirtualPath(path);
    projectMap.set(virtual, files[path]);
    virtualRoots.push(virtual);
  }

  const system = vfs.createSystem(projectMap);
  const compilerOptions: import("typescript").CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
    isolatedModules: true,
    resolveJsonModule: true,
  };

  const venv = vfs.createVirtualTypeScriptEnvironment(
    system,
    virtualRoots,
    ts,
    compilerOptions
  );

  const diagnostics: TypeCheckDiagnostic[] = [];
  const checked: string[] = [];

  for (const path of userPaths) {
    const virtual = toVirtualPath(path);
    const ls = venv.languageService;
    const all = [
      ...ls.getSyntacticDiagnostics(virtual),
      ...ls.getSemanticDiagnostics(virtual),
    ];
    checked.push(path);

    for (const d of all) {
      const file = d.file?.fileName ?? virtual;
      const pos = d.start ?? 0;
      const source = d.file;
      let line = 1;
      let column = 1;
      let endLine: number | undefined;
      let endColumn: number | undefined;
      if (source) {
        const lc = source.getLineAndCharacterOfPosition(pos);
        line = lc.line + 1;
        column = lc.character + 1;
        if (d.length !== undefined) {
          const lcEnd = source.getLineAndCharacterOfPosition(pos + d.length);
          endLine = lcEnd.line + 1;
          endColumn = lcEnd.character + 1;
        }
      }
      diagnostics.push({
        file: fromVirtualPath(file),
        line,
        column,
        endLine,
        endColumn,
        message: flattenMessage(ts, d.messageText),
        severity: severityFromCategory(ts, d.category),
        code: d.code,
      });
    }
  }

  return {
    diagnostics,
    filesChecked: checked,
    durationMs: Date.now() - start,
  };
}

export function summarizeDiagnostics(diagnostics: TypeCheckDiagnostic[]): {
  errors: number;
  warnings: number;
  total: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errors++;
    else if (d.severity === "warning") warnings++;
  }
  return { errors, warnings, total: diagnostics.length };
}

export function __resetCacheForTests(): void {
  cached = null;
}
