interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  download_url?: string;
}

// Guardrails to prevent a single import from exhausting Worker resources or
// tripping GitHub's rate limiter (SSRF/DoS hardening).
const MAX_DEPTH = 12;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB per file
const FETCH_CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 15_000;

function fetchWithTimeout(
  input: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

// Strip a known directory prefix without the pitfalls of String.replace
// (which only replaces the first occurrence and treats the needle literally).
function stripBasePath(fullPath: string, basePath: string): string {
  if (!basePath) return fullPath;
  const prefix = `${basePath}/`;
  return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += limit) {
    await Promise.all(items.slice(i, i + limit).map(worker));
  }
}

function parseGitHubUrl(urlString: string): {
  owner: string;
  repo: string;
  branch: string;
  path: string;
} | null {
  try {
    const url = new URL(urlString);

    if (url.hostname !== "github.com") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];

    if (!owner || !repo) {
      return null;
    }

    let branch = "main";
    let path = "";

    if (parts.length > 3 && parts[2] === "tree" && parts[3]) {
      branch = parts[3];
      path = parts.slice(4).join("/");
    }

    return { owner, repo, branch, path };
  } catch {
    return null;
  }
}

async function fetchGitHubDirectory(
  owner: string,
  repo: string,
  branch: string,
  basePath: string
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  async function addFile(item: GitHubContent): Promise<void> {
    if (!item.download_url) return;
    if (Object.keys(files).length >= MAX_FILES) {
      throw new Error(`Import exceeds the ${MAX_FILES}-file limit.`);
    }
    if (item.size !== undefined && item.size > MAX_FILE_BYTES) {
      // Skip oversized files rather than failing the whole import.
      return;
    }

    const fileResponse = await fetchWithTimeout(item.download_url);
    if (!fileResponse.ok) return;

    const content = await fileResponse.text();
    if (content.length > MAX_FILE_BYTES) return;
    files[stripBasePath(item.path, basePath)] = content;
  }

  async function fetchDir(dirPath: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      throw new Error(`Import exceeds the maximum directory depth of ${MAX_DEPTH}.`);
    }

    const apiUrl = dirPath
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`
      : `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;

    const response = await fetchWithTimeout(apiUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "dynamic-workers-playground"
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository or path not found: ${owner}/${repo}/${dirPath || "(root)"}`);
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const contents = (await response.json()) as GitHubContent | GitHubContent[];

    if (!Array.isArray(contents)) {
      if (contents.type === "file") {
        await addFile(contents);
      }
      return;
    }

    const fileItems = contents.filter((item) => item.type === "file");
    const dirItems = contents.filter((item) => item.type === "dir");

    await runWithConcurrency(fileItems, FETCH_CONCURRENCY, addFile);
    await runWithConcurrency(dirItems, FETCH_CONCURRENCY, (item) =>
      fetchDir(item.path, depth + 1)
    );
  }

  await fetchDir(basePath, 0);
  return files;
}

export async function handleGitHubImport(request: Request): Promise<Response> {
  try {
    const { url } = (await request.json()) as { url?: string };

    if (!url) {
      return Response.json({ error: "Missing GitHub URL." }, { status: 400 });
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      return Response.json(
        {
          error:
            "Invalid GitHub URL. Use a repository URL like https://github.com/owner/repo/tree/branch/path"
        },
        { status: 400 }
      );
    }

    const { owner, repo, branch, path } = parsed;
    const files = await fetchGitHubDirectory(owner, repo, branch, path);

    if (Object.keys(files).length === 0) {
      return Response.json({ error: "No files found at that GitHub location." }, { status: 404 });
    }

    return Response.json({
      files,
      source: {
        owner,
        repo,
        branch,
        path,
        url
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to import GitHub files."
      },
      { status: 500 }
    );
  }
}
