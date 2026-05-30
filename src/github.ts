interface GitHubContent {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url?: string;
}

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "raw.githubusercontent.com",
  "api.github.com",
]);

const MAX_DEPTH = 10;
const MAX_FILES = 200;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function isSafePath(path: string): boolean {
  if (path === "") return true;
  if (/[\x00-\x1f]/.test(path)) return false;
  return path
    .split("/")
    .every(
      (segment) =>
        segment !== ".." && segment !== "." && SAFE_SEGMENT.test(segment)
    );
}

function isSafeDownloadUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_DOWNLOAD_HOSTS.has(u.hostname)
    );
  } catch {
    return false;
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

    if (
      !owner ||
      !repo ||
      !SAFE_SEGMENT.test(owner) ||
      !SAFE_SEGMENT.test(repo)
    ) {
      return null;
    }

    let branch = "main";
    let path = "";

    if (parts.length > 3 && parts[2] === "tree" && parts[3]) {
      branch = parts[3];
      path = parts.slice(4).join("/");
    }

    if (!SAFE_SEGMENT.test(branch) || !isSafePath(path)) {
      return null;
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
  let totalBytes = 0;

  async function addFile(path: string, downloadUrl: string): Promise<void> {
    if (Object.keys(files).length >= MAX_FILES) {
      throw new Error(`Import exceeds maximum of ${MAX_FILES} files.`);
    }
    const fileResponse = await fetch(downloadUrl);
    if (!fileResponse.ok) return;
    const content = await fileResponse.text();
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Import exceeds maximum total size of ${MAX_TOTAL_BYTES} bytes.`
      );
    }
    const relativePath = basePath ? path.replace(`${basePath}/`, "") : path;
    files[relativePath] = content;
  }

  async function fetchDir(dirPath: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      throw new Error(`Import exceeds maximum directory depth of ${MAX_DEPTH}.`);
    }

    const apiUrl = dirPath
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`
      : `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;

    const response = await fetch(apiUrl, {
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
      if (contents.type === "file" && isSafeDownloadUrl(contents.download_url)) {
        await addFile(contents.path, contents.download_url!);
      }
      return;
    }

    await Promise.all(
      contents.map(async (item) => {
        if (item.type === "file" && isSafeDownloadUrl(item.download_url)) {
          await addFile(item.path, item.download_url!);
          return;
        }

        if (item.type === "dir") {
          await fetchDir(item.path, depth + 1);
        }
      })
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
