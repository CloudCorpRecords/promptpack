/**
 * promptpack core: check a caller-supplied pack of prompt
 * templates and run caller-supplied test renders.
 *
 *   checkPromptPack(args) -> { templates, renders, counts }
 *
 * Placeholder syntax (pinned): a span `{{` ... `}}` whose
 * inner text, trimmed, matches /^[A-Za-z0-9_]+$/ is a
 * placeholder for that trimmed name. A span whose trimmed
 * inner text does not match (including the empty span
 * `{{}}`) is NOT a placeholder: it is left untouched and
 * unreported. An unterminated `{{` is left untouched and
 * unreported. Placeholders per template are the distinct
 * placeholder names in first-appearance order in the body.
 *
 * Per template the report is {name, version, placeholders,
 * declared, missing_declarations, unused_declarations,
 * status} with keys in that order: declared echoes the
 * supplied variables list verbatim (absent -> []);
 * missing_declarations is the placeholders not present in
 * declared, in placeholder order; unused_declarations is
 * the declared names never used as a placeholder, in
 * declared order; status is "ok" when both lists are
 * empty, else "issues".
 *
 * Version format: `version` must match /^\d+\.\d+\.\d+$/
 * exactly, else a validation error naming the path (this
 * is structural, not a report finding). Duplicate template
 * names are a validation error naming the duplicated name
 * ("duplicate template name: X"). Duplicate names inside
 * one template's `variables` are a validation error naming
 * the path.
 *
 * Renders run in input order. For each render: the named
 * template must exist in the pack, else a validation error
 * naming the path (renders[i].template). Every value in
 * `values` must be a string, else a validation error
 * naming the path. Replacement: each placeholder span is
 * replaced by values[name]; replacement output is NEVER
 * rescanned. A placeholder with no supplied value makes
 * that render fail — the render entry is {template,
 * ok: false, missing_values} with missing_values the
 * distinct missing names in placeholder order — while a
 * successful render entry is {template, ok: true,
 * rendered} with the fully replaced body. Extra supplied
 * values are ignored. A render failure is report data,
 * NOT a validation error: the remaining templates and
 * renders still report.
 *
 * Validation is strict and path-naming: any malformed
 * input throws an Error naming the offending path and no
 * partial result is produced. Unknown extra fields are
 * ignored, including inside items; a non-object top-level
 * argument is treated as {}.
 */
import type {
  CheckedTemplate,
  PromptPackCounts,
  PromptPackResult,
  RenderResult,
} from "./types.js";

export const VERSION = "0.1.0";

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const PLACEHOLDER_RE = /^[A-Za-z0-9_]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface TemplateFacts {
  name: string;
  version: string;
  body: string;
  variables: string[];
}

interface RenderFacts {
  template: string;
  values: Record<string, string>;
}

/**
 * Walk a body left to right, splitting it into literal
 * segments and placeholder spans. A span starts at `{{`
 * and ends at the next `}}`; if there is no closing `}}`
 * the rest of the body is literal. A span whose trimmed
 * inner text matches the placeholder pattern is a
 * placeholder; any other span is literal, verbatim.
 */
function scanBody(
  body: string,
): Array<{ kind: "literal"; text: string } | { kind: "placeholder"; name: string }> {
  const parts: Array<
    { kind: "literal"; text: string } | { kind: "placeholder"; name: string }
  > = [];
  let i = 0;
  while (i < body.length) {
    const start = body.indexOf("{{", i);
    if (start === -1) {
      parts.push({ kind: "literal", text: body.slice(i) });
      break;
    }
    const end = body.indexOf("}}", start + 2);
    if (end === -1) {
      parts.push({ kind: "literal", text: body.slice(i) });
      break;
    }
    if (start > i) parts.push({ kind: "literal", text: body.slice(i, start) });
    const inner = body.slice(start + 2, end).trim();
    if (PLACEHOLDER_RE.test(inner)) {
      parts.push({ kind: "placeholder", name: inner });
    } else {
      parts.push({ kind: "literal", text: body.slice(start, end + 2) });
    }
    i = end + 2;
  }
  return parts;
}

/** Distinct placeholder names in first-appearance order. */
function placeholdersOf(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of scanBody(body)) {
    if (part.kind === "placeholder" && !seen.has(part.name)) {
      seen.add(part.name);
      out.push(part.name);
    }
  }
  return out;
}

function parseTemplate(item: unknown, index: number): TemplateFacts {
  const at = `templates[${index}]`;
  if (!isRecord(item)) throw new Error(`${at} must be an object`);

  if (item.name === undefined) throw new Error(`${at}.name is required`);
  if (typeof item.name !== "string" || item.name.length === 0) {
    throw new Error(`${at}.name must be a non-empty string`);
  }

  if (item.version === undefined) throw new Error(`${at}.version is required`);
  if (typeof item.version !== "string") {
    throw new Error(`${at}.version must be a string`);
  }
  if (!VERSION_RE.test(item.version)) {
    throw new Error(
      `${at}.version must be three dot-separated non-negative integers`,
    );
  }

  if (item.body === undefined) throw new Error(`${at}.body is required`);
  if (typeof item.body !== "string") {
    throw new Error(`${at}.body must be a string`);
  }

  let variables: string[] = [];
  if (item.variables !== undefined) {
    if (!Array.isArray(item.variables)) {
      throw new Error(`${at}.variables must be an array`);
    }
    variables = item.variables.map((v, j) => {
      if (typeof v !== "string" || v.length === 0) {
        throw new Error(`${at}.variables[${j}] must be a non-empty string`);
      }
      return v;
    });
    const seenVars = new Set<string>();
    for (const v of variables) {
      if (seenVars.has(v)) {
        throw new Error(`${at}.variables contains duplicate variable name: ${v}`);
      }
      seenVars.add(v);
    }
  }

  return { name: item.name, version: item.version, body: item.body, variables };
}

function parseRender(
  item: unknown,
  index: number,
  pack: Map<string, TemplateFacts>,
): RenderFacts {
  const at = `renders[${index}]`;
  if (!isRecord(item)) throw new Error(`${at} must be an object`);

  if (item.template === undefined) throw new Error(`${at}.template is required`);
  if (typeof item.template !== "string" || item.template.length === 0) {
    throw new Error(`${at}.template must be a non-empty string`);
  }
  if (!pack.has(item.template)) {
    throw new Error(`${at}.template names no template in the pack: ${item.template}`);
  }

  if (item.values === undefined) throw new Error(`${at}.values is required`);
  if (!isRecord(item.values)) {
    throw new Error(`${at}.values must be an object`);
  }
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(item.values)) {
    if (typeof value !== "string") {
      throw new Error(`${at}.values.${key} must be a string`);
    }
    values[key] = value;
  }

  return { template: item.template, values };
}

function runRender(facts: RenderFacts, pack: Map<string, TemplateFacts>): RenderResult {
  const template = pack.get(facts.template)!;
  const parts = scanBody(template.body);

  const seenMissing = new Set<string>();
  const missing: string[] = [];
  for (const part of parts) {
    if (
      part.kind === "placeholder" &&
      !Object.prototype.hasOwnProperty.call(facts.values, part.name) &&
      !seenMissing.has(part.name)
    ) {
      seenMissing.add(part.name);
      missing.push(part.name);
    }
  }
  if (missing.length > 0) {
    return { template: facts.template, ok: false, missing_values: missing };
  }

  // Replacement output is built from the original scan only
  // and is never rescanned.
  let rendered = "";
  for (const part of parts) {
    rendered += part.kind === "literal" ? part.text : facts.values[part.name];
  }
  return { template: facts.template, ok: true, rendered };
}

/** Check a caller-supplied pack of prompt templates. */
export function checkPromptPack(args: unknown): PromptPackResult {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.templates === undefined) throw new Error("templates is required");
  if (!Array.isArray(raw.templates) || raw.templates.length === 0) {
    throw new Error("templates must be a non-empty array");
  }

  const facts = raw.templates.map((item, i) => parseTemplate(item, i));

  const seenNames = new Set<string>();
  for (const f of facts) {
    if (seenNames.has(f.name)) {
      throw new Error(`duplicate template name: ${f.name}`);
    }
    seenNames.add(f.name);
  }

  let renderFacts: RenderFacts[] = [];
  if (raw.renders !== undefined) {
    if (!Array.isArray(raw.renders)) {
      throw new Error("renders must be an array");
    }
    const pack = new Map(facts.map((f) => [f.name, f]));
    renderFacts = raw.renders.map((item, i) => parseRender(item, i, pack));
  }

  const pack = new Map(facts.map((f) => [f.name, f]));

  const templates: CheckedTemplate[] = facts.map((f) => {
    const placeholders = placeholdersOf(f.body);
    const declared = [...f.variables];
    const declaredSet = new Set(declared);
    const placeholderSet = new Set(placeholders);
    const missing_declarations = placeholders.filter((p) => !declaredSet.has(p));
    const unused_declarations = declared.filter((d) => !placeholderSet.has(d));
    return {
      name: f.name,
      version: f.version,
      placeholders,
      declared,
      missing_declarations,
      unused_declarations,
      status:
        missing_declarations.length === 0 && unused_declarations.length === 0
          ? "ok"
          : "issues",
    };
  });

  const renders: RenderResult[] = renderFacts.map((r) => runRender(r, pack));

  const counts: PromptPackCounts = {
    templates: templates.length,
    with_issues: templates.filter((t) => t.status === "issues").length,
    renders: renders.length,
    renders_ok: renders.filter((r) => r.ok).length,
    renders_failed: renders.filter((r) => !r.ok).length,
  };

  return { templates, renders, counts };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
