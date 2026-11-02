# promptpack

A pack of prompt templates tends to drift quietly:
someone renames a variable in one template and forgets its
declaration, a template declares variables it no longer
uses, a version string gets typed as `1.2` instead of
`1.2.0`, and nobody finds out until a render fails in
production. promptpack checks the whole pack at once,
before that happens. You supply each template's name,
version, body, and the variables it declares, plus any
test renders you want exercised. promptpack compares the
placeholders actually used in each body against its
declarations, checks every version string, runs the
renders deterministically with the values you gave, and
hands back one report. Nothing is published, written, or
fetched; the pack you describe is the only input.

Placeholders are written `{{name}}`. A span counts as a
placeholder only when its inner text, once trimmed, is a
plain name made of letters, digits, and underscores —
so `{{ name }}` is a placeholder for `name`, while
`{{}}`, `{{first name}}`, `{{user-name}}`, and an
unterminated `{{` are ordinary text: left untouched in
renders and never mentioned in the report. Each
template's placeholders are the distinct names it uses,
in the order they first appear in the body.

For every template the report echoes its declared
variables and lists two findings: placeholders with no
declaration (`missing_declarations`, in placeholder
order) and declarations no placeholder uses
(`unused_declarations`, in declaration order). A template
with neither finding is `ok`; any finding makes it
`issues`. Version trouble is stricter than a finding: a
version that is not exactly three dot-separated
non-negative integers, a duplicated template name, or a
duplicated declared variable rejects the whole input
with an error naming the offending path — there are no
partial results for malformed input.

Test renders run in the order you supply them. Each one
names a template and gives values for its variables.
Every placeholder in that template is replaced by its
supplied value, and the replacement text itself is never
rescanned, so a value that happens to contain `{{other}}`
stays exactly as given. Extra values are ignored. If a
placeholder has no supplied value, that render does not
blow up the check: its entry reports `ok: false` with
the distinct missing names in placeholder order, and the
remaining templates and renders still report. Naming a
template that is not in the pack, or giving a non-string
value, is malformed input and errors like any other
validation failure.

## CLI

```bash
npx @reneturcios/promptpack check --input args.json
npx @reneturcios/promptpack --version
```

`args.json` contains the full arguments object:

```json
{
  "templates": [
    {
      "name": "welcome",
      "version": "1.2.0",
      "body": "Hi {{name}}, welcome to {{ product }}!",
      "variables": ["name", "product"]
    },
    {
      "name": "reminder",
      "version": "0.3.1",
      "body": "Hi {{name}}, your {{plan}} renews soon.",
      "variables": ["name"]
    }
  ],
  "renders": [
    {
      "template": "welcome",
      "values": { "name": "Ada", "product": "Promptpacks" }
    },
    {
      "template": "reminder",
      "values": { "name": "Ada" }
    }
  ]
}
```

The report is printed as JSON:

```json
{
  "templates": [
    {
      "name": "welcome",
      "version": "1.2.0",
      "placeholders": ["name", "product"],
      "declared": ["name", "product"],
      "missing_declarations": [],
      "unused_declarations": [],
      "status": "ok"
    },
    {
      "name": "reminder",
      "version": "0.3.1",
      "placeholders": ["name", "plan"],
      "declared": ["name"],
      "missing_declarations": ["plan"],
      "unused_declarations": [],
      "status": "issues"
    }
  ],
  "renders": [
    {
      "template": "welcome",
      "ok": true,
      "rendered": "Hi Ada, welcome to Promptpacks!"
    },
    {
      "template": "reminder",
      "ok": false,
      "missing_values": ["plan"]
    }
  ],
  "counts": {
    "templates": 2,
    "with_issues": 1,
    "renders": 2,
    "renders_ok": 1,
    "renders_failed": 1
  }
}
```

Exit codes: `0` on success, `1` on a runtime error
(including an unreadable or invalid input file, or
invalid input), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/promptpack mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "promptpack": {
      "command": "npx",
      "args": ["-y", "@reneturcios/promptpack", "mcp"]
    }
  }
}
```

### Tools

- `check_prompt_pack` — Check a caller-supplied pack of
  prompt templates: placeholders used vs variables
  declared, version format, and deterministic test
  renders with supplied values.
  - `templates` (array, required, at least 1 item) —
    prompt templates to check, in pack order; each item:
    - `name` (string, required, non-empty) — template
      name, unique within the pack
    - `version` (string, required) — template version,
      exactly three dot-separated non-negative integers
      (e.g. `"1.2.0"`)
    - `body` (string, required, may be empty) —
      template text; placeholders are written `{{name}}`
    - `variables` (array of strings, optional) —
      variable names the template declares; absent
      means `[]`
  - `renders` (array, optional) — test renders to run
    against the pack; absent means `[]`; each item:
    - `template` (string, required, non-empty) — name
      of the template to render
    - `values` (object, required) — values for the
      render: a map from variable name to replacement
      string

  Returns `{templates, renders, counts}`, where
  `templates` holds one `{name, version, placeholders,
  declared, missing_declarations, unused_declarations,
  status}` per input template in pack order, `renders`
  holds one `{template, ok, rendered}` or `{template,
  ok, missing_values}` per input render in input order,
  and `counts` is `{templates, with_issues, renders,
  renders_ok, renders_failed}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/promptpack
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/promptpack check --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
