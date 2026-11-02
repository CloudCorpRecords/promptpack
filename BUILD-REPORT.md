# promptpack — Build Report

MCP Rebuild 1000, Batch 19. Original program build from the
packages-100 plan (cluster C #36), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch19/promptpack.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `promptpack`, npm `@reneturcios/promptpack`,
MCP name `io.github.CloudCorpRecords/promptpack`, version
`0.1.0`, bin `promptpack` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Check a
  prompt-template pack from supplied templates: variables,
  versions, test renders." — 88 chars, verified by count;
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/promptpack:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/promptpack"`),
  `tsconfig.json` (byte-identical to the reference,
  verified by diff), `.gitignore`, `LICENSE` (MIT,
  Copyright (c) 2026 Rene Turcios), `README.md` (fresh
  text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`check --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/promptpack.ts` (core,
  `VERSION = "0.1.0"`, `checkPromptPack`, `formatPayload`)
- `test/promptpack.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/promptpack`,
  smoke-test server-name assertion `promptpack`; the other
  three copied from treeman unchanged)

Plus the parity fixture at
`harness/fixtures/promptpack-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster C #36.

## Tools implemented (1)

- `check_prompt_pack` — arguments: `templates` (array,
  required, at least 1 item) and `renders` (array,
  optional, absent means []). Each template item: `name`
  (string, required, non-empty), `version` (string,
  required, exactly three dot-separated non-negative
  integers), `body` (string, required, may be empty), and
  `variables` (array of strings, optional, absent means
  []). Each render item: `template` (string, required,
  non-empty, naming a pack template) and `values` (object,
  required, a map from variable name to replacement
  string). Required is exactly `["templates"]` at the top
  level, `["name", "version", "body"]` per template, and
  `["template", "values"]` per render.

  Placeholder syntax is pinned: a span `{{` ... `}}` whose
  inner text, trimmed, matches `/^[A-Za-z0-9_]+$/` is a
  placeholder for that trimmed name; a span whose trimmed
  inner text does not match (including the empty span
  `{{}}`) is not a placeholder and is left untouched and
  unreported, and an unterminated `{{` is left untouched
  and unreported. Placeholders per template are the
  distinct names in first-appearance order.

  Returns `{templates, renders, counts}`, where
  `templates` holds one `{name, version, placeholders,
  declared, missing_declarations, unused_declarations,
  status}` per input template in pack order (keys in that
  order; `declared` echoes the supplied variables verbatim,
  `missing_declarations` in placeholder order,
  `unused_declarations` in declared order, `status` "ok"
  when both lists are empty else "issues"); `renders`
  holds one `{template, ok: true, rendered}` or
  `{template, ok: false, missing_values}` per input render
  in input order; and `counts` is `{templates, with_issues,
  renders, renders_ok, renders_failed}` in that key order.

  The fixture literal
  (`harness/fixtures/promptpack-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no harness-level `additionalProperties` — the only
  `additionalProperties` present is inside the spec's own
  schema for the free-form `values` string map, exactly as
  the spec prescribes — confirmed by the parity run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object.
- Validation is path-naming and total: `templates`
  missing, non-array, or empty; a non-object item; a
  missing, empty, or non-string `name`; a missing or
  non-string `version` or one not matching
  `/^\d+\.\d+\.\d+$/` (structural, e.g.
  `templates[0].version must be three dot-separated
  non-negative integers`); a missing or non-string
  `body`; `variables` present but not an array or holding
  a non-string or empty string; `renders` present but not
  an array; a non-object render item; its `template`
  missing, empty, non-string, or naming no pack template;
  or its `values` missing, not an object, or holding a
  non-string value throws an Error naming the offending
  path and produces no partial result (MCP: `isError`;
  CLI: exit 1). Duplicate template names throw
  `duplicate template name: <name>`; duplicate names
  inside one template's `variables` throw an error naming
  the path (`templates[i].variables contains duplicate
  variable name: <name>`). Unknown extra fields are
  ignored, including inside items; a non-object top-level
  argument is treated as {}.
- Renders: replacement is built from a single left-to-right
  scan of the original body, so replacement output is
  never rescanned. A placeholder with no supplied value
  fails only that render (`{template, ok: false,
  missing_values}` with distinct missing names in
  placeholder order) — report data, not an error — while
  an unknown template in a render is a validation error.
  Extra supplied values are ignored.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **67 tests,
  67 pass, 0 fail** — the template report (clean ok case,
  pinned key order, distinct placeholders in
  first-appearance order, missing/unused lists in their
  pinned orders, declared echoed verbatim, absent
  variables, empty body, pack order); span matching and
  rejection (whitespace-padded names including tab/newline
  padding, digit/underscore names, `{{}}`, whitespace-only
  spans, spaces and punctuation inside names, unterminated
  `{{` alone and after a real placeholder, single braces
  and lone `}}`, adjacent placeholders); version format
  (valid 0.0.0 / 1.2.0 / multi-digit, thirteen invalid
  shapes with the exact pinned message and the offending
  index, non-string, missing); duplicates (template names
  naming the duplicated name including among several,
  duplicate declared variables naming the path, the same
  variable in different templates fine, no partial result);
  renders (full replacement, pinned key orders, padded
  spans, repeated placeholders, never-rescan including a
  value naming a missing placeholder, non-placeholder
  spans untouched in output, extra values ignored,
  empty-string values supplied, input order with repeats,
  absent and empty renders); render failure as report data
  (distinct missing names in placeholder order, remaining
  renders and templates still reporting, no-placeholder
  templates, renders ignoring declarations); counts
  including the pinned key order; and every validation
  path (templates missing / non-array / empty, non-object
  top-level treated as {}, non-object items, name / body /
  variables / renders / render template / render values
  each missing and malformed, unknown-template renders,
  unknown extras ignored, no partial result).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0` (run via `node`, as
  with the reference build whose `dist/cli.js` carries the
  same non-executable mode); unknown command exits 2 with
  usage; `check` with no `--input` exits 2;
  `check --input <valid file>` exits 0 and prints the
  hand-checked report for the input with templates
  `welcome` (1.2.0, `{{name}}` / `{{ product }}`,
  declared both, renders `Hi Ada, welcome to
  Promptpacks!`) and `reminder` (0.3.1, `{{name}}` /
  `{{plan}}`, declared only `name`) — welcome ok,
  reminder issues with `missing_declarations: ["plan"]`,
  renders ok 1 / failed 1 with the reminder render
  `{template: "reminder", ok: false, missing_values:
  ["plan"]}`, counts templates 2, with_issues 1, renders
  2, renders_ok 1, renders_failed 1;
  `check --input <invalid file>` (version `"1.2"`) exits
  1 with `error: templates[0].version must be three
  dot-separated non-negative integers`.
- Parity: `harness/parity.py` vs
  `harness/fixtures/promptpack-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/promptpack`, **128 package entries**. The
subsequent offline `npm install --ignore-scripts
--offline`, build, tests, and parity all ran against
this lockfile's tree.

## Gaps / honest notes

- **Pinned judgement calls** (each with a dedicated test
  where applicable): (1) span scanning is left-to-right
  with each `{{` matched to the next `}}`, so a
  non-matching span is consumed whole and verbatim and
  scanning resumes after its `}}` — this is the natural
  reading of the spec's span definition and matches the
  tested cases (empty span, spaced/punctuated names,
  unterminated `{{`); a doubly-nested span is therefore
  not re-examined for an inner placeholder; (2) duplicate
  declared-variable error wording follows the fleet's
  path-naming pattern
  (`templates[i].variables contains duplicate variable
  name: X`) — the spec requires the error to name the
  path but pins no exact wording for this case, unlike
  the duplicate-template-name wording it does pin; (3)
  render value errors name the offending key
  (`renders[i].values.<key> must be a string`) and
  unknown-template errors append the missing name after
  the path — the spec requires naming the path in both
  cases; (4) unknown extra fields are ignored rather
  than rejected, at the top level and inside items (the
  spec says so); (5) a non-object top-level arguments
  value is treated as an empty object, so it fails as
  `templates is required`; (6) error-message wording
  otherwise follows the fleet's path-naming pattern,
  distinguishing a missing field (`... is required`)
  from a malformed one (`... must be ...`), matching
  the spec's example. No other spec ambiguity was found
  in the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
