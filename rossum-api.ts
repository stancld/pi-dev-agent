import { Type, type TSchema } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { writeFile, mkdir } from "fs/promises";
import { readFileSync } from "fs";
import { join } from "path";

//One place to read config + auth
function RossumConfig() {
  const apiBaseUrl = process.env.ROSSUM_API_BASE_URL;
  const token = process.env.ROSSUM_API_TOKEN;
  if (!apiBaseUrl || !token)
    throw new Error("Set ROSSUM_API_BASE_URL and ROSSUM_API_TOKEN");
  return { apiBaseUrl, token };
}

// Fetch one object by path (e.g. `/queues/123`) with auth.
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

// Filter values an agent can pass. Arrays become repeated query params
// (`?status=x&status=y`), which is how Rossum expects multi-value filters —
// not a single comma-joined string.
type QueryScalar = string | number | boolean;
type RossumQuery = Record<string, QueryScalar | QueryScalar[]>;

// Follow cursor-based pagination from a starting path, collecting every result.
// The `next` URL carries an opaque signed cursor — follow it verbatim, never rebuild it.
async function rossumListAll(
  path: string,
  query: RossumQuery = {},
  pageSize = 100,
): Promise<unknown[]> {
  const { apiBaseUrl } = RossumConfig();
  const search = new URLSearchParams({ page_size: String(pageSize) });
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.set(key, String(value));
    }
  }
  let url: string | null = `${apiBaseUrl}${path}?${search}`;
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

// Allow-list of Rossum collections (API path segments) to expose as tools.
// Each yields a `get_<singular>` + `list_<collection>` pair; the list tool's
// filters are derived from the OpenAPI spec at load time (see below).
// Mirrors rossum-mcp's read-only (get + search) object set. Add a collection
// to expose it; both endpoints are looked up against the spec at load time.
const ALLOWED = [
  "queues",
  "workspaces",
  "schemas",
  "engines",
  "rules",
  "hooks",
  "annotations",
  "users",
  "email_templates",
  "organization_groups",
  "relations",
  "document_relations",
] as const;

// ---- OpenAPI spec → typebox filters -----------------------------------------

// The spec is a runtime JSON document (types in rossum-schema.ts are erased at
// runtime, so we read the spec itself). Loaded relative to this module, not cwd.
const spec = JSON.parse(
  readFileSync(new URL("./data/rossum-openapi.json", import.meta.url), "utf-8"),
);

// Pagination params we drive ourselves — never exposed as agent filters.
const PAGINATION = new Set(["page_size", "cursor", "page"]);

// Anthropic restricts tool-schema property keys to this pattern. Rossum has a
// few odd filter names (e.g. `fields!`, a sideloading directive) that violate
// it; we skip those rather than let the whole tool list be rejected.
const VALID_KEY = /^[a-zA-Z0-9_.-]{1,64}$/;

// Resolve a JSON pointer like "#/components/parameters/workspace" against spec.
function resolveRef(ref: string): any {
  return ref
    .replace(/^#\//, "")
    .split("/")
    .reduce((node, key) => node[key], spec);
}

// Map a single OpenAPI schema node to a typebox schema, carrying the
// description through so it reaches the agent's tool schema.
function schemaToTypebox(schema: any): TSchema {
  const options = schema.description ? { description: schema.description } : {};
  if (Array.isArray(schema.enum)) {
    return Type.Union(
      schema.enum.map((v: string | number) => Type.Literal(v)),
      options,
    );
  }
  switch (schema.type) {
    case "integer":
      return Type.Integer(options);
    case "number":
      return Type.Number(options);
    case "boolean":
      return Type.Boolean(options);
    case "array":
      return Type.Array(schemaToTypebox(schema.items), options);
    default:
      return Type.String(options);
  }
}

// Build the typebox filter object for a collection's list endpoint, reading the
// query parameters straight from the spec (resolving any $refs).
function filtersFromSpec(collection: string): TSchema {
  const params = spec.paths[`/api/v1/${collection}`]?.get?.parameters ?? [];
  const props: Record<string, TSchema> = {};
  for (const item of params) {
    const param = item.$ref ? resolveRef(item.$ref) : item;
    if (param.in !== "query" || PAGINATION.has(param.name)) continue;
    if (!VALID_KEY.test(param.name)) continue;
    props[param.name] = Type.Optional(
      schemaToTypebox({ ...param.schema, description: param.description }),
    );
  }
  return Type.Object(props);
}

// ---- Tool factories ---------------------------------------------------------

// `get_<singular>`: numeric id -> fetch `/<collection>/<id>`. Assumes a regular
// plural (trailing "s"); add an explicit singular here if that ever breaks.
function getTool(collection: string) {
  const singular = collection.replace(/s$/, "");
  return defineTool({
    name: `get_${singular}`,
    label: `Get ${singular}`,
    description: `Get one ${singular} by its numeric id.`,
    parameters: Type.Object({
      id: Type.Integer({ description: `${singular} ID` }),
    }),
    execute: async (_id, params) => {
      const data = await rossumGet(`/${collection}/${params.id}`);
      const text = await writeJsonToFile(data, `get_${singular}`);
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}

// `list_<collection>`: params are the spec-derived filters.
function listTool(collection: string, filters: TSchema) {
  return defineTool({
    name: `list_${collection}`,
    label: `List ${collection}`,
    description: `List ${collection} in the Rossum organization.`,
    parameters: filters,
    execute: async (_id, params) => {
      // Drop unset optional filters, then pass through as query params.
      const query = Object.fromEntries(
        Object.entries(params as Record<string, unknown>).filter(
          ([, v]) => v !== undefined,
        ),
      ) as RossumQuery;
      const data = await rossumListAll(`/${collection}`, query);
      const text = await writeJsonToFile(data, `list_${collection}`);
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}

// One get + one list tool per allowed collection.
export const rossumTools = ALLOWED.flatMap((collection) => [
  getTool(collection),
  listTool(collection, filtersFromSpec(collection)),
]);
