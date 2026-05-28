---
name: rossum_openapi_search
description: Search and explain Rossum's REST API using a locally downloaded OpenAPI snapshot. Use whenever the user asks about Rossum endpoints, request/response shapes, schemas, or API behavior.
---

# Rossum OpenAPI search

A static OpenAPI snapshot is the source of truth for this skill — do not call the live Rossum API and do not browse the docs site. Everything you need is in the local JSON file.

## Snapshot location

`data/rossum-openapi.json` (relative to the repo root).

If the file is missing, ask the user to download a fresh copy from the Rossum API docs (entry point: https://rossum.app/api/docs/openapi/guides/getting-started/#introduction) and place it at that path. Do not guess the download URL.

## Hard rules

- **Never** `Read`, `cat`, `head`, or otherwise load the whole file — it's many thousands of lines and will blow up the context window.
- **Always** query with `jq` (preferred) or `grep` (fallback). Pipe through `head` if a result might still be large.
- **Never** invent endpoint paths or schema names. If `jq` doesn't find it, say so.
- Resolve `$ref` values explicitly: `"$ref": "#/components/schemas/Foo"` means look up `.components.schemas.Foo` and report what's there.

## File layout (OpenAPI 3.x)

- `info.version` — API version of this snapshot
- `tags` — endpoint groupings (Annotations, Queues, Documents, Hooks, ...)
- `paths.<path>.<method>` — endpoint definitions (`get`, `post`, `patch`, `delete`)
  - `.summary`, `.description`, `.parameters`, `.requestBody`, `.responses`, `.tags`
- `components.schemas.<Name>` — reusable data models (referenced via `$ref`)
- `components.securitySchemes` — auth methods

## Workflow

1. **Orient first.** Run a `keys`-style query to see what exists before fetching detail.
2. **Filter, don't dump.** Use `select(contains("..."))` on names; never `jq '.paths' file` without narrowing.
3. **Fetch detail last.** Only pull a full endpoint or schema object once you know its exact key.
4. **Follow refs.** When a response references another schema, do a second `jq` lookup for that schema.

## Recipe book

List every path:

```bash
jq -r '.paths | keys[]' ../data/rossum-openapi.json
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

Parameters for one endpoint:

```bash
jq '.paths."/annotations/{id}".get.parameters' data/rossum-openapi.json
```

Request body schema for one endpoint:

```bash
jq '.paths."/annotations".post.requestBody.content."application/json".schema' data/rossum-openapi.json
```

200 response schema for one endpoint:

```bash
jq '.paths."/annotations/{id}".get.responses."200".content."application/json".schema' data/rossum-openapi.json
```

Grep fallback if `jq` is unavailable:

```bash
grep -n '"/annotations' data/rossum-openapi.json | head -50
```

## Answering style

When explaining an endpoint or schema to the user:

- Quote the method + path verbatim from the spec.
- Summarise required vs optional fields rather than dumping the raw JSON unless they ask for it.
- Mention the snapshot version (`info.version`) if the user asks "is this current?" — anything beyond that is unknown to this skill.
- If something isn't in the snapshot, say "not in the local snapshot" — don't speculate.
