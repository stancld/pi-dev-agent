---
name: rossum_search
description: Search and explain Rossum using locally downloaded snapshots — the REST API (OpenAPI) and the product knowledge base (help-center articles). Use whenever the user asks about Rossum endpoints, schemas, API behavior, features, or user-facing documentation.
---

# Rossum search

Two static snapshots are the source of truth for this skill — do not call the live Rossum API and do not browse the docs site. Everything you need is in the local JSON files.

## Snapshot locations

| Snapshot       | Path                              | Source                                                                   |
| -------------- | --------------------------------- | ------------------------------------------------------------------------ |
| OpenAPI spec   | `data/rossum-openapi.json`        | https://rossum.app/api/docs/openapi/guides/getting-started/#introduction |
| Knowledge base | `data/rossum-knowledge-base.json` | https://knowledge-base.rossum.ai/ (scraped)                              |

If a file is missing, ask the user to refresh it from the source above. Do not guess download URLs.

## Hard rules

- **Never** `Read`, `cat`, `head`, or otherwise load a whole file — they are large and will blow up the context window.
- **Always** query with `jq` (preferred) or `grep` (fallback). Pipe through `head` if a result might still be large.
- **Never** invent endpoint paths, schema names, article slugs, or URLs. If `jq` doesn't find it, say so.
- Resolve OpenAPI `$ref` values explicitly: `"$ref": "#/components/schemas/Foo"` means look up `.components.schemas.Foo` and report what's there.
- In the knowledge base, `.articles[].title` is often empty — identify articles by `.slug` and look at the first line of `.content` for the real title.

## File layouts

**OpenAPI** (`data/rossum-openapi.json`, OpenAPI 3.x):

- `info.version` — API version of this snapshot
- `tags` — endpoint groupings (Annotations, Queues, Documents, Hooks, ...)
- `paths.<path>.<method>` — endpoint definitions (`get`, `post`, `patch`, `delete`)
  - `.summary`, `.description`, `.parameters`, `.requestBody`, `.responses`, `.tags`
- `components.schemas.<Name>` — reusable data models (referenced via `$ref`)
- `components.securitySchemes` — auth methods

**Knowledge base** (`data/rossum-knowledge-base.json`):

- `.scraped_at` — ISO timestamp of when the snapshot was taken
- `.articles[]` — list of articles, each with:
  - `.slug` — stable id used in the URL
  - `.title` — frequently empty; do not rely on it
  - `.url` — canonical knowledge-base URL
  - `.content` — markdown body (starts with `Title: ...`)

## Picking the right snapshot

| User is asking about                                                   | Use                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Endpoints, request/response shapes, status codes, auth, query params   | OpenAPI                                                               |
| What a feature does, how to configure it, extension behavior, UI flows | Knowledge base                                                        |
| Both / unsure                                                          | Start with knowledge base for concepts, then OpenAPI for wire details |

## Workflow

1. **Orient first.** Run a `keys`-style or `length`/`slug` listing to see what exists before fetching detail.
2. **Filter, don't dump.** Use `select(... | contains("..."))`; never `jq '.paths'` or `jq '.articles'` without narrowing.
3. **Fetch detail last.** Only pull a full endpoint, schema, or article once you know its exact key/slug.
4. **Follow refs.** When an OpenAPI response references another schema, do a second `jq` lookup for that schema.

## Data Location:

```
.pi-agent/skiils/../../data
```

## Recipe book — OpenAPI

List every path:

```bash
jq -r '.paths | keys[]' data/rossum-openapi.json
```

Find paths containing a keyword (case-insensitive):

```bash
jq -r '.paths | keys[] | select(ascii_downcase | contains("annotation"))' data/rossum-openapi.json
```

Methods + summaries for one path:

```bash
jq '.paths."/annotations/{id}" | to_entries | map({method: .key, summary: .value.summary})' data/rossum-openapi.json
```

Full definition of one endpoint:

```bash
jq '.paths."/annotations/{id}".get' data/rossum-openapi.json
```

List all schema names:

```bash
jq -r '.components.schemas | keys[]' data/rossum-openapi.json
```

Look up a schema by name:

```bash
jq '.components.schemas.Annotation' data/rossum-openapi.json
```

Find schemas matching a keyword:

```bash
jq -r '.components.schemas | keys[] | select(ascii_downcase | contains("queue"))' data/rossum-openapi.json
```

All endpoints under a tag (e.g. "Annotations"):

```bash
jq -r '
  .paths
  | to_entries[]
  | .key as $p
  | .value
  | to_entries[]
  | select(.value.tags // [] | index("Annotations"))
  | "\(.key | ascii_upcase) \($p) — \(.value.summary // "")"
' data/rossum-openapi.json
```

Parameters / request body / 200 response for one endpoint:

```bash
jq '.paths."/annotations/{id}".get.parameters' data/rossum-openapi.json
jq '.paths."/annotations".post.requestBody.content."application/json".schema' data/rossum-openapi.json
jq '.paths."/annotations/{id}".get.responses."200".content."application/json".schema' data/rossum-openapi.json
```

Grep fallback:

```bash
grep -n '"/annotations' data/rossum-openapi.json | head -50
```

## Recipe book — Knowledge base

Snapshot freshness and size:

```bash
jq -r '.scraped_at' data/rossum-knowledge-base.json
jq '.articles | length' data/rossum-knowledge-base.json
```

List all article slugs:

```bash
jq -r '.articles[].slug' data/rossum-knowledge-base.json
```

Filter slugs by keyword (case-insensitive):

```bash
jq -r '.articles[].slug | select(ascii_downcase | contains("hook"))' data/rossum-knowledge-base.json
```

Find articles whose content mentions a keyword:

```bash
jq -r '.articles[] | select(.content | ascii_downcase | contains("formula")) | .slug' data/rossum-knowledge-base.json
```

Read one article in full by slug:

```bash
jq -r '.articles[] | select(.slug == "accounts-payable-checks-extension") | .content' data/rossum-knowledge-base.json
```

URL for one slug:

```bash
jq -r '.articles[] | select(.slug == "...") | .url' data/rossum-knowledge-base.json
```

Grep fallback:

```bash
grep -n '"slug"' data/rossum-knowledge-base.json | head -50
```

## Answering style

- For API answers: quote the method + path verbatim; summarise required vs optional fields rather than dumping raw JSON unless asked.
- For knowledge-base answers: cite article by slug and URL; summarise rather than dumping the markdown unless asked.
- If the user asks "is this current?", quote `info.version` (OpenAPI) or `.scraped_at` (knowledge base). Anything beyond that is unknown to this skill.
- If something isn't in the relevant snapshot, say "not in the local snapshot" — don't speculate or fall back to live sources.
