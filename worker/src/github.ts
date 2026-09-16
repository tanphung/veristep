import {MAX_ARTIFACT_BYTES, sameOrigin, utf8Bytes, validateArtifact} from "./policy";
import type {Commitment, Env, Origin, PublishedArtifact} from "./types";

function apiUrl(path: string): URL {
  const url = new URL(path, "https://api.github.com");
  if (url.protocol !== "https:" || url.hostname !== "api.github.com" || url.port || url.username || url.password) throw new Error("Non-canonical GitHub API URL");
  return url;
}

async function githubFetch(env: Pick<Env, "GITHUB_EVIDENCE_TOKEN">, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(apiUrl(path), {
    ...init,
    redirect: "manual",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${env.GITHUB_EVIDENCE_TOKEN}`,
      "content-type": "application/json",
      "user-agent": "VeriStep-worker-v2",
      "x-github-api-version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (response.status >= 300 && response.status < 400) throw new Error("GitHub redirect rejected");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) throw new Error("Unexpected GitHub content type");
  return response;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hexDigest(algorithm: "SHA-1" | "SHA-256", bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return [...new Uint8Array(await crypto.subtle.digest(algorithm, copy.buffer))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function gitBlobId(bytes: Uint8Array): Promise<string> {
  const header = utf8Bytes(`blob ${bytes.byteLength}\0`);
  const body = new Uint8Array(header.byteLength + bytes.byteLength);
  body.set(header); body.set(bytes, header.byteLength);
  return hexDigest("SHA-1", body);
}

async function githubFailure(response: Response, operation: string): Promise<Error> {
  let detail = "request failed";
  try {
    const body = await response.json() as {message?: string; documentation_url?: string};
    detail = [body.message, body.documentation_url].filter(Boolean).join(" | ") || detail;
  } catch { /* HTTP status remains sufficient and no credentials are included. */ }
  return new Error(`${operation}: ${response.status} ${detail}`);
}

async function repoOrigin(env: Env): Promise<{origin: Origin; defaultBranch: string}> {
  const owner = env.EVIDENCE_GITHUB_OWNER;
  const repository = env.EVIDENCE_GITHUB_REPOSITORY;
  const response = await githubFetch(env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`);
  if (!response.ok) throw new Error(`GitHub repository lookup failed: ${response.status}`);
  const data = await response.json() as {id?: number; name?: string; full_name?: string; private?: boolean; default_branch?: string; owner?: {id?: number; login?: string}};
  if (!Number.isSafeInteger(data.id) || !Number.isSafeInteger(data.owner?.id) || data.private !== false || data.name !== repository || data.full_name !== `${owner}/${repository}` || data.owner?.login !== owner || !data.default_branch) {
    throw new Error("GitHub repository provenance mismatch");
  }
  return {origin: {provider: "github", hostname: "api.github.com", owner, owner_id: data.owner.id!, repository, repository_id: data.id!}, defaultBranch: data.default_branch};
}

export async function checkEvidenceRepositoryAccess(env: Env): Promise<boolean> {
  const owner = env.EVIDENCE_GITHUB_OWNER;
  const repository = env.EVIDENCE_GITHUB_REPOSITORY;
  const response = await githubFetch(env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`);
  if (!response.ok) return false;
  const data = await response.json() as {
    full_name?: string;
    private?: boolean;
    owner?: {login?: string};
    permissions?: {push?: boolean};
  };
  return data.full_name === `${owner}/${repository}`
    && data.owner?.login === owner
    && data.private === false
    && data.permissions?.push === true;
}

export async function acquireArtifact(env: Env, commitment: Commitment): Promise<string> {
  const {origin} = await repoOrigin({...env, EVIDENCE_GITHUB_OWNER: commitment.origin.owner, EVIDENCE_GITHUB_REPOSITORY: commitment.origin.repository});
  if (!sameOrigin(origin, commitment.origin)) throw new Error("Frozen GitHub origin identity mismatch");
  const path = commitment.path.split("/").map(encodeURIComponent).join("/");
  const response = await githubFetch(env, `/repos/${encodeURIComponent(origin.owner)}/${encodeURIComponent(origin.repository)}/contents/${path}?ref=${commitment.commit}`);
  if (!response.ok) throw new Error(`GitHub artifact lookup failed: ${response.status}`);
  const data = await response.json() as {type?: string; sha?: string; size?: number; encoding?: string; content?: string};
  if (data.type !== "file" || data.sha !== commitment.blob || data.size !== commitment.byte_length || data.encoding !== "base64" || typeof data.content !== "string") throw new Error("GitHub artifact identity mismatch");
  const bytes = decodeBase64(data.content);
  if (bytes.byteLength !== commitment.byte_length || bytes.byteLength < 1 || bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("GitHub artifact byte length mismatch");
  if (await gitBlobId(bytes) !== commitment.blob || await hexDigest("SHA-256", bytes) !== commitment.sha256) throw new Error("GitHub artifact digest mismatch");
  const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  return validateArtifact(text);
}

async function ensureRunBranch(env: Env, branch: string, defaultBranch: string): Promise<void> {
  const owner = encodeURIComponent(env.EVIDENCE_GITHUB_OWNER), repo = encodeURIComponent(env.EVIDENCE_GITHUB_REPOSITORY);
  const existing = await githubFetch(env, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (existing.ok) return;
  if (existing.status !== 404) throw new Error(`GitHub branch lookup failed: ${existing.status}`);
  const base = await githubFetch(env, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(defaultBranch)}`);
  if (!base.ok) throw new Error("GitHub default branch unavailable");
  const baseJson = await base.json() as {object?: {sha?: string}};
  if (!baseJson.object?.sha || !/^[0-9a-f]{40}$/.test(baseJson.object.sha)) throw new Error("GitHub default branch SHA invalid");
  const created = await githubFetch(env, `/repos/${owner}/${repo}/git/refs`, {method: "POST", body: JSON.stringify({ref: `refs/heads/${branch}`, sha: baseJson.object.sha})});
  if (!created.ok && created.status !== 422) throw await githubFailure(created, "GitHub branch creation failed");
}

export async function publishArtifact(env: Env, runId: string, dealId: string, role: "A" | "B", content: string, expectedOrigin: Origin): Promise<PublishedArtifact> {
  content = validateArtifact(content);
  const {origin, defaultBranch} = await repoOrigin(env);
  if (!sameOrigin(origin, expectedOrigin)) throw new Error(`Hosted evidence repository does not match frozen ${role} origin`);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(dealId) || !/^[a-zA-Z0-9-]{1,64}$/.test(runId)) throw new Error("Unsafe immutable artifact path");
  const branch = defaultBranch;
  const path = `jobs/${dealId}/${role.toLowerCase()}.md`;
  const bytes = utf8Bytes(content);
  const owner = encodeURIComponent(origin.owner), repo = encodeURIComponent(origin.repository), encodedPath = path.split("/").map(encodeURIComponent).join("/");
  let commit = "", blob = "";
  const put = await githubFetch(env, `/repos/${owner}/${repo}/contents/${encodedPath}`, {
    method: "PUT",
    body: JSON.stringify({message: `VeriStep ${dealId} agent ${role}`, content: encodeBase64(bytes), branch}),
  });
  if (put.ok) {
    const data = await put.json() as {commit?: {sha?: string}; content?: {sha?: string}};
    commit = data.commit?.sha ?? ""; blob = data.content?.sha ?? "";
  } else if (put.status === 422) {
    const existing = await githubFetch(env, `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    if (!existing.ok) throw new Error("Existing GitHub artifact cannot be recovered");
    const data = await existing.json() as {sha?: string; size?: number};
    blob = data.sha ?? "";
    const commits = await githubFetch(env, `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(branch)}&per_page=1`);
    const rows = await commits.json() as Array<{sha?: string}>;
    commit = rows[0]?.sha ?? "";
  } else throw await githubFailure(put, "GitHub artifact publication failed");
  const expectedBlob = await gitBlobId(bytes);
  if (!/^[0-9a-f]{40}$/.test(commit) || blob !== expectedBlob) throw new Error("Published GitHub object identity mismatch");
  return {content, commitment: {origin, commit, path, blob, content_type: "text/markdown", encoding: "utf-8", byte_length: bytes.byteLength, sha256: await hexDigest("SHA-256", bytes)}};
}
