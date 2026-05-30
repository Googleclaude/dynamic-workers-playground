import { exports } from "cloudflare:workers";
import { createWorker } from "@cloudflare/worker-bundler";
import { BodyTooLargeError, readJsonWithLimit } from "./body-limit";
import { handleGitHubImport } from "./github";
import { handleConsentAudit, handleRightsRequest } from "./lgpd";
import {
  redactString,
  scanFiles,
  type ComplianceViolation,
} from "./compliance";

export { DynamicWorkerTail, LogSession } from "./logging";
export { LgpdRateLimit } from "./lgpd-rate-limit";

// Maximum total payload accepted for /api/run (10 MB uncompressed).
const MAX_RUN_BODY_BYTES = 10 * 1024 * 1024;
// Maximum number of source files per run request.
const MAX_FILE_COUNT = 50;
// Maximum size of a single source file (1 MB).
const MAX_FILE_BYTES = 1 * 1024 * 1024;

// Security headers added to every API response.
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "interest-cohort=()",
};

function withSecurityHeaders(response: Response): Response {
  const res = new Response(response.body, response);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

type LoaderExports = {
  LogSession: {
    getByName(name: string): {
      waitForLogs(): Promise<{ getLogs(timeoutMs: number): Promise<unknown[]> }>;
    };
  };
  DynamicWorkerTail(options: { props: { workerId: string } }): Fetcher;
};

const runtimeExports = exports as LoaderExports;

interface BundleInfo {
  mainModule: string;
  modules: string[];
  warnings: string[];
}

interface WorkerState {
  bundleInfo: BundleInfo | null;
  buildTime: number;
}

interface RunRequestBody {
  files: Record<string, string>;
  version: number;
  pathname?: string;
  options?: {
    bundle?: boolean;
    minify?: boolean;
  };
}

async function createWorkerId(
  files: Record<string, string>,
  options?: RunRequestBody["options"]
): Promise<string> {
  const sortedFiles = Object.keys(files)
    .sort()
    .map((path) => [path, files[path]]);

  const payload = JSON.stringify({
    files: sortedFiles,
    bundle: options?.bundle ?? true,
    minify: options?.minify ?? false,
  });

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  )
    .join("")
    .slice(0, 16);

  return `dynamic-workers-playground-worker-${hash}`;
}

async function executeWorker(
  worker: WorkerStub,
  state: WorkerState,
  workerId: string,
  sourceWarnings: ComplianceViolation[],
  pathname = "/"
): Promise<Response> {
  const entrypoint = worker.getEntrypoint() as Fetcher & {
    __warmup__?: () => Promise<void>;
  };

  const loadStart = Date.now();
  try {
    await entrypoint.__warmup__?.();
  } catch {
    // Warmup intentionally calls a method that does not exist so the worker cold-starts.
  }
  const loadTime = Date.now() - loadStart;

  const { buildTime, bundleInfo } = state;
  const logSessionStub = runtimeExports.LogSession.getByName(workerId);
  const logWaiter = await logSessionStub.waitForLogs();

  const runStart = Date.now();
  const request = new Request(
    `https://example.com${pathname.startsWith("/") ? pathname : `/${pathname}`}`
  );

  let workerResponse: Response;
  let responseBody = "";
  let workerError: { message: string; stack?: string } | null = null;

  try {
    workerResponse = await entrypoint.fetch(request);
    responseBody = await workerResponse.text();

    if (workerResponse.status >= 500) {
      workerError = {
        message: responseBody || "Worker returned an internal error.",
      };
    }
  } catch (error) {
    workerError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    workerResponse = new Response("Worker execution failed", { status: 500 });
  }

  const runTime = Date.now() - runStart;
  const rawLogs = (await logWaiter.getLogs(1000)) as Array<{
    level: string;
    message: string;
    timestamp: number;
  }>;

  const runtimeViolations: ComplianceViolation[] = [];

  // Redact PII / secrets from every output channel before sending to client.
  const redactedHeaders: Record<string, string> = {};
  workerResponse.headers.forEach((value, key) => {
    const { redacted, violations } = redactString(value, "response");
    redactedHeaders[key] = redacted;
    runtimeViolations.push(...violations);
  });

  const { redacted: redactedBody, violations: bodyViolations } = redactString(
    responseBody,
    "response"
  );
  runtimeViolations.push(...bodyViolations);

  const redactedLogs = rawLogs.map((log, index) => {
    const { redacted, violations } = redactString(log.message, "log", {
      logIndex: index,
    });
    runtimeViolations.push(...violations);
    return { ...log, message: redacted };
  });

  let redactedWorkerError: { message: string; stack?: string } | null = null;
  if (workerError) {
    const { redacted: redactedMessage, violations: msgViolations } =
      redactString(workerError.message, "response");
    runtimeViolations.push(...msgViolations);
    redactedWorkerError = { message: redactedMessage };
    if (workerError.stack) {
      const { redacted: redactedStack, violations: stackViolations } =
        redactString(workerError.stack, "response");
      runtimeViolations.push(...stackViolations);
      redactedWorkerError.stack = redactedStack;
    }
  }

  const safeBundleInfo = bundleInfo
    ? {
        mainModule: redactInPlace(bundleInfo.mainModule),
        modules: bundleInfo.modules.map(redactInPlace),
        warnings: bundleInfo.warnings.map(redactInPlace),
      }
    : { mainModule: "(cached)", modules: [], warnings: [] };

  return Response.json({
    bundleInfo: safeBundleInfo,
    response: {
      status: workerResponse.status,
      headers: redactedHeaders,
      body: redactedBody,
    },
    workerError: redactedWorkerError,
    logs: redactedLogs,
    timing: {
      buildTime,
      loadTime,
      runTime,
      totalTime: buildTime + loadTime + runTime,
    },
    compliance: {
      blocked: false,
      violations: [...sourceWarnings, ...runtimeViolations].map(
        redactViolationFile
      ),
    },
  });
}

function redactInPlace(value: string): string {
  return redactString(value, "response").redacted;
}

function redactViolationFile(v: ComplianceViolation): ComplianceViolation {
  return v.file ? { ...v, file: redactInPlace(v.file) } : v;
}

function buildErrorResponse(error: unknown): Response {
  // Log internally, but redact first: CF observability ingests console.* raw,
  // so an unredacted message/stack would leak any secret the guest worker's
  // error happened to embed. Redact both channels, never return the stack.
  const rawMessage = error instanceof Error ? error.message : "Unknown error";
  const redactedMessage = redactInPlace(rawMessage);
  if (error instanceof Error && error.stack) {
    console.error(
      "Error in dynamic-workers-playground:",
      redactedMessage,
      redactInPlace(error.stack)
    );
  } else {
    console.error("Error in dynamic-workers-playground:", redactedMessage);
  }
  return Response.json({ error: redactedMessage }, { status: 500 });
}

function normalizeFiles(
  files: Record<string, string>
): Record<string, string> {
  const normalized = Object.fromEntries(
    Object.entries(files)
      .map(([path, contents]) => [path.trim(), contents])
      .filter(([path]) => path.length > 0)
  );

  if (!normalized["package.json"]) {
    const entryPoint =
      normalized["src/index.ts"] || normalized["src/index.js"]
        ? Object.keys(normalized).find(
            (file) => file === "src/index.ts" || file === "src/index.js"
          )
        : Object.keys(normalized).find(
            (file) => file.endsWith(".ts") || file.endsWith(".js")
          );

    normalized["package.json"] = JSON.stringify(
      {
        name: "dynamic-workers-playground-worker",
        main: entryPoint ?? "src/index.ts",
      },
      null,
      2
    );
  }

  return normalized;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/github" && request.method === "POST") {
      return withSecurityHeaders(await handleGitHubImport(request));
    }

    if (
      url.pathname === "/api/lgpd/rights-request" &&
      request.method === "POST"
    ) {
      return withSecurityHeaders(await handleRightsRequest(request, env));
    }

    if (
      url.pathname === "/api/lgpd/consent-audit" &&
      request.method === "POST"
    ) {
      return withSecurityHeaders(await handleConsentAudit(request, env));
    }

    if (url.pathname === "/api/run" && request.method === "POST") {
      try {
        // Fast-path: reject early when the (advisory) Content-Length already
        // exceeds the cap, before reading a single byte.
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_RUN_BODY_BYTES) {
          return withSecurityHeaders(
            Response.json({ error: "Request body too large." }, { status: 413 })
          );
        }

        // Authoritative enforcement: count bytes off the stream and abort on
        // overflow. A missing or chunked Content-Length can't bypass this.
        const { files, pathname, options } = await readJsonWithLimit<RunRequestBody>(
          request,
          MAX_RUN_BODY_BYTES
        );

        if (!files || typeof files !== "object" || Array.isArray(files)) {
          return withSecurityHeaders(
            Response.json({ error: "files must be an object." }, { status: 400 })
          );
        }

        const fileEntries = Object.entries(files);
        if (fileEntries.length === 0) {
          return withSecurityHeaders(
            Response.json(
              { error: "At least one source file is required." },
              { status: 400 }
            )
          );
        }

        if (fileEntries.length > MAX_FILE_COUNT) {
          return withSecurityHeaders(
            Response.json(
              { error: `Too many files (max ${MAX_FILE_COUNT}).` },
              { status: 400 }
            )
          );
        }

        for (const [name, content] of fileEntries) {
          if (typeof name !== "string" || typeof content !== "string") {
            return withSecurityHeaders(
              Response.json(
                { error: "File names and contents must be strings." },
                { status: 400 }
              )
            );
          }
          if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) {
            return withSecurityHeaders(
              Response.json(
                { error: `File "${name}" exceeds the 1 MB size limit.` },
                { status: 400 }
              )
            );
          }
        }

        const normalizedFiles = normalizeFiles(files);

        // Compliance scan: block if secrets found; collect redact-only violations.
        const allViolations = scanFiles(normalizedFiles);
        const blocking = allViolations.filter((v) => v.severity === "block");
        if (blocking.length > 0) {
          return withSecurityHeaders(
            Response.json(
              {
                error:
                  "Compliance check failed: secrets detected in source files.",
                compliance: {
                  blocked: true,
                  violations: blocking.map(redactViolationFile),
                },
              },
              { status: 400 }
            )
          );
        }
        const sourceWarnings = allViolations.filter(
          (v) => v.severity === "redact"
        );

        const workerId = await createWorkerId(normalizedFiles, options);
        const state: WorkerState = {
          bundleInfo: null,
          buildTime: 0,
        };
        const contextExports = (ctx as unknown as { exports: LoaderExports }).exports;

        const worker = env.LOADER.get(workerId, async () => {
          const buildStart = Date.now();
          const { mainModule, modules, wranglerConfig, warnings } =
            await createWorker({
              files: normalizedFiles,
              bundle: options?.bundle ?? true,
              minify: options?.minify ?? false,
            });

          state.buildTime = Date.now() - buildStart;
          state.bundleInfo = {
            mainModule,
            modules: Object.keys(modules),
            warnings: warnings ?? [],
          };

          return {
            mainModule,
            modules: modules as Record<string, string>,
            compatibilityDate:
              wranglerConfig?.compatibilityDate ?? "2026-01-01",
            compatibilityFlags: wranglerConfig?.compatibilityFlags ?? [],
            env: {
              API_KEY: "sk-example-key-12345",
              DEBUG: "true",
              WORKER_ID: workerId,
            },
            globalOutbound: null,
            tails: [
              contextExports.DynamicWorkerTail({
                props: { workerId },
              }),
            ],
          };
        });

        return withSecurityHeaders(
          await executeWorker(worker, state, workerId, sourceWarnings, pathname ?? "/")
        );
      } catch (error) {
        if (error instanceof BodyTooLargeError) {
          return withSecurityHeaders(
            Response.json({ error: error.message }, { status: 413 })
          );
        }
        if (error instanceof SyntaxError) {
          return withSecurityHeaders(
            Response.json({ error: "Invalid JSON body." }, { status: 400 })
          );
        }
        return withSecurityHeaders(buildErrorResponse(error));
      }
    }

    return withSecurityHeaders(new Response("Not found", { status: 404 }));
  },
} satisfies ExportedHandler<Env>;
