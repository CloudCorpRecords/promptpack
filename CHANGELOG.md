# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `check_prompt_pack` MCP tool and
  `check` CLI command checking a caller-supplied pack of
  prompt templates; nothing is published or written.
- Per-template report with the distinct placeholders in
  first-appearance order, the declared variables echoed
  verbatim, the placeholders missing a declaration, the
  declarations never used, and a status of `ok` or
  `issues`. Placeholder spans are `{{name}}` spans whose
  trimmed inner text matches `/^[A-Za-z0-9_]+$/`; any
  other span, and an unterminated `{{`, is left untouched
  and unreported.
- Version format is structural validation: a version
  must be exactly three dot-separated non-negative
  integers, or the input is rejected with a path-naming
  error. Duplicate template names and duplicate declared
  variables are likewise validation errors.
- Deterministic test renders with supplied values:
  successful renders return the fully replaced body and
  replacement output is never rescanned; a render whose
  placeholders lack values is report data
  (`{template, ok: false, missing_values}`), not an
  error, and the remaining renders still report. Counts
  tally templates, templates with issues, renders,
  renders ok, and renders failed.
