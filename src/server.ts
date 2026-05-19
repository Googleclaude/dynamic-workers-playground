import { exports } from "cloudflare:workers";
import { createWorker } from "@cloudflare/worker-bundler";
import { handleGitHubImport } from "./github";
import {
  redactString,
  scanFiles,
  type ComplianceViolation,
} from "./compliance";

export { DynamicWorkerTail, LogSession } from "./logging";

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
  method?: string;
  body?: string;
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

interface RequestOptions {
  pathname: string;
  method: string;
  body: string;
}

async function executeWorker(
  worker: WorkerStub,
  state: WorkerState,
  workerId: string,
  sourceWarnings: ComplianceViolation[],
  requestOptions: RequestOptions
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
  const { pathname, method, body } = requestOptions;
  const methodAllowsBody = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const request = new Request(
    `https://example.com${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    {
      method,
      headers: methodAllowsBody && body
        ? { "content-type": "application/json" }
        : undefined,
      body: methodAllowsBody && body ? body : undefined,
    }
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
    const { redacted: redactedMessage, violations: messageViolations } =
      redactString(workerError.message, "response");
    runtimeViolations.push(...messageViolations);
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
  console.error("Error in dynamic-workers-playground:", error);
  const rawMessage = error instanceof Error ? error.message : "Unknown error";
  const rawStack = error instanceof Error ? error.stack : undefined;
  return Response.json(
    {
      error: redactInPlace(rawMessage),
      stack: rawStack ? redactInPlace(rawStack) : undefined,
    },
    { status: 500 }
  );
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
      return handleGitHubImport(request);
    }

    if (url.pathname === "/api/run" && request.method === "POST") {
      try {
        const {
          files,
          pathname,
          method,
          body: requestBody,
          options,
        } = (await request.json()) as RunRequestBody;

        if (!files || Object.keys(files).length === 0) {
          return Response.json(
            { error: "At least one source file is required." },
            { status: 400 }
          );
        }

        const normalizedFiles = normalizeFiles(files);

        const allViolations = scanFiles(normalizedFiles);
        const blocking = allViolations.filter((v) => v.severity === "block");
        if (blocking.length > 0) {
          return Response.json(
            {
              error:
                "Compliance check failed: secrets detected in source files.",
              compliance: {
                blocked: true,
                violations: blocking.map(redactViolationFile),
              },
            },
            { status: 400 }
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

        const allowedMethods = new Set([
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "HEAD",
        ]);
        const normalizedMethod =
          method && allowedMethods.has(method.toUpperCase())
            ? method.toUpperCase()
            : "GET";

        return executeWorker(worker, state, workerId, sourceWarnings, {
          pathname: pathname ?? "/",
          method: normalizedMethod,
          body: typeof requestBody === "string" ? requestBody : "",
        });
      } catch (error) {
        return buildErrorResponse(error);
      }
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
