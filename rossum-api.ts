import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

//One place to read config + auth
function RossumConfig() {
  const apiBaseUrl = process.env.ROSSUM_API_BASE_URL;
  const token = process.env.ROSSUM_API_TOKEN;
  if (!apiBaseUrl || !token)
    throw new Error("Set ROSSUM_API_BASE_URL and ROSSUM_API_TOKEN");
  return { apiBaseUrl, token };
}

async function rossumGet(path: string): Promise<unknown> {
  const { apiBaseUrl, token } = RossumConfig();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) throw new Error(`Rossum ${path} -> ${res.status}`);
  return res.json();
}

// One page from any Rossum list endpoint.
interface RossumListPage {
  pagination: { next: string | null; previous: string | null };
  results: unknown[];
}

// Fetch an absolute URL with auth — used to follow the `next` cursor URL directly.
async function rossumFetch(url: string): Promise<unknown> {
  const { token } = RossumConfig();
  const res = await fetch(url, {
    headers: { Authorization: `token ${token}` },
  });
  if (!res.ok) throw new Error(`Rossum ${url} -> ${res.status}`);
  return res.json();
}

// Follow cursor-based pagination from a starting path, collecting every result.
// The `next` URL carries an opaque signed cursor — follow it verbatim, never rebuild it.
async function rossumListAll(path: string, pageSize = 100): Promise<unknown[]> {
  const { apiBaseUrl } = RossumConfig();
  let url: string | null = `${apiBaseUrl}${path}?page_size=${pageSize}`;
  const all: unknown[] = [];
  while (url) {
    const page = (await rossumFetch(url)) as RossumListPage;
    all.push(...page.results);
    url = page.pagination.next; // opaque next URL, or null when exhausted
  }
  return all;
}

let listCounter = 0;

// Write a JSON result (a single object or a list) to a file; return a one-line summary + the path.
async function writeJsonToFile(
  data: unknown,
  toolName: string,
): Promise<string> {
  const dir = join(process.cwd(), ".pi-agent", "workspace");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${toolName}-${++listCounter}.json`);
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
  const summary = Array.isArray(data) ? `${data.length} items` : "1 object";
  return `Saved ${summary} to ${file}. Read that file to inspect.`;
}

export const getQueue = defineTool({
  name: "get_queue",
  label: "Get queue",
  description: "Get one queue by its numeric id.",
  parameters: Type.Object({
    id: Type.Integer({ description: "Queue ID" }),
  }),
  execute: async (_id, params) => {
    const data = await rossumGet(`/queues/${params.id}`);
    const text = await writeJsonToFile(data, "get_queue");
    return { content: [{ type: "text", text }], details: {} };
  },
});

export const getWorkspace = defineTool({
  name: "get_workspace",
  label: "Get workspace",
  description: "Get one workspace by its numeric id.",
  parameters: Type.Object({
    id: Type.Integer({ description: "Workspace ID" }),
  }),
  execute: async (_id, params) => {
    const data = await rossumGet(`/workspaces/${params.id}`);
    const text = await writeJsonToFile(data, "get_workspace");
    return { content: [{ type: "text", text }], details: {} };
  },
});

export const listQueues = defineTool({
  name: "list_queues",
  label: "List queues",
  description: "List document-processing queues in the Rossum organization.",
  parameters: Type.Object({}), // no inputs
  execute: async (_id, _params) => {
    const data = await rossumListAll("/queues");
    const text = await writeJsonToFile(data, "list_queues");
    return { content: [{ type: "text", text }], details: {} };
  },
});

export const listWorkspaces = defineTool({
  name: "list_workspaces",
  label: "List workspaces",
  description: "List workspaces in the Rossum organization.",
  parameters: Type.Object({}), // no inputs
  execute: async (_id, _params) => {
    const data = await rossumListAll("/workspaces");
    const text = await writeJsonToFile(data, "list_workspaces");
    return { content: [{ type: "text", text }], details: {} };
  },
});
