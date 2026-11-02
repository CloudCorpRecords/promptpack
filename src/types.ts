/**
 * promptpack types.
 *
 * promptpack checks a caller-supplied pack of prompt
 * templates. For each template the caller supplies its
 * name, its version, its body text (with placeholders
 * written {{name}}), and optionally the variable names
 * it declares. The caller may also supply test renders:
 * a template name plus a map of values. From that data
 * alone, as pure local computation, promptpack reports:
 *
 *   - one checked entry per template: the distinct
 *     placeholders in first-appearance order, the declared
 *     variables echoed verbatim, the placeholders with no
 *     declaration, the declarations never used, and a
 *     status of "ok" or "issues"
 *   - one entry per render: either the fully rendered
 *     body, or a failure listing the distinct missing
 *     values in placeholder order
 *   - counts: templates, templates with issues, renders,
 *     renders ok, and renders failed
 *
 * A span {{ ... }} whose inner text, trimmed, matches
 * /^[A-Za-z0-9_]+$/ is a placeholder for that trimmed
 * name; any other span, and an unterminated {{, is left
 * untouched and unreported. Nothing is published or
 * written anywhere.
 */

/** Status assigned to one checked template. */
export type TemplateStatus = "ok" | "issues";

/** One checked template, in pack order. */
export interface CheckedTemplate {
  /** Template name, echoed from the input. */
  name: string;
  /** Template version, echoed from the input. */
  version: string;
  /** Distinct placeholder names in first-appearance order. */
  placeholders: string[];
  /** Declared variable names, echoed verbatim (absent means []). */
  declared: string[];
  /** Placeholders not present in declared, in placeholder order. */
  missing_declarations: string[];
  /** Declared names never used as a placeholder, in declared order. */
  unused_declarations: string[];
  /** "ok" when both declaration lists are empty, else "issues". */
  status: TemplateStatus;
}

/** A successful test render. */
export interface RenderOk {
  /** Name of the template that was rendered. */
  template: string;
  /** Discriminator: the render succeeded. */
  ok: true;
  /** The fully replaced body. */
  rendered: string;
}

/** A failed test render: report data, not a validation error. */
export interface RenderFailed {
  /** Name of the template that was rendered. */
  template: string;
  /** Discriminator: the render failed. */
  ok: false;
  /** Distinct missing value names in placeholder order. */
  missing_values: string[];
}

/** One test render result, in input order. */
export type RenderResult = RenderOk | RenderFailed;

/** Tallies for the whole pack check. */
export interface PromptPackCounts {
  /** Number of templates checked. */
  templates: number;
  /** Templates whose status is "issues". */
  with_issues: number;
  /** Number of renders run. */
  renders: number;
  /** Renders that succeeded. */
  renders_ok: number;
  /** Renders that failed for missing values. */
  renders_failed: number;
}

/** The full prompt-pack report. */
export interface PromptPackResult {
  /** One checked entry per input template, in pack order. */
  templates: CheckedTemplate[];
  /** One entry per input render, in input order. */
  renders: RenderResult[];
  /** Tallies for templates and renders. */
  counts: PromptPackCounts;
}
