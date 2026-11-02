import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkPromptPack } from "../src/promptpack.js";

/**
 * All tests are pure local computation over inline template
 * packs: no filesystem, no network. Placeholder span
 * matching and rejection (empty span, whitespace-padded
 * names, non-name spans, unterminated {{), distinct
 * placeholders in first-appearance order, declared /
 * missing / unused lists and their orders, the status, the
 * version format as structural validation, duplicate
 * template names and duplicate declared variables, renders
 * (success, never-rescan, extra values, failure as report
 * data vs unknown template as a validation error), counts
 * with the pinned key order, and every validation path are
 * each pinned.
 */

type T = Record<string, unknown>;

const tpl = (over: T = {}): T => ({
  name: "greet",
  version: "1.0.0",
  body: "Hi {{name}}!",
  variables: ["name"],
  ...over,
});

const check = (templates: unknown, over: T = {}) =>
  checkPromptPack({ templates, ...over });

const one = (over: T = {}) => check([tpl(over)]).templates[0];

describe("checkPromptPack — template report", () => {
  it("a clean template is ok with placeholders, declared, and empty findings", () => {
    assert.deepEqual(one({}), {
      name: "greet",
      version: "1.0.0",
      placeholders: ["name"],
      declared: ["name"],
      missing_declarations: [],
      unused_declarations: [],
      status: "ok",
    });
  });

  it("template report keys are in the pinned order", () => {
    assert.deepEqual(Object.keys(one({})), [
      "name",
      "version",
      "placeholders",
      "declared",
      "missing_declarations",
      "unused_declarations",
      "status",
    ]);
  });

  it("placeholders are distinct in first-appearance order", () => {
    const out = one({
      body: "{{b}} {{a}} {{b}} {{c}} {{a}}",
      variables: ["a", "b", "c"],
    });
    assert.deepEqual(out.placeholders, ["b", "a", "c"]);
  });

  it("missing_declarations are placeholders not declared, in placeholder order", () => {
    const out = one({
      body: "{{z}} {{a}} {{m}}",
      variables: ["a"],
    });
    assert.deepEqual(out.missing_declarations, ["z", "m"]);
    assert.equal(out.status, "issues");
  });

  it("unused_declarations are declared names never used, in declared order", () => {
    const out = one({
      body: "{{b}}",
      variables: ["x", "b", "y", "a"],
    });
    assert.deepEqual(out.unused_declarations, ["x", "y", "a"]);
    assert.equal(out.status, "issues");
  });

  it("declared echoes the supplied variables list verbatim", () => {
    const out = one({ body: "", variables: ["Beta", "alpha_1", "X"] });
    assert.deepEqual(out.declared, ["Beta", "alpha_1", "X"]);
  });

  it("absent variables means declared [] and every placeholder is missing", () => {
    const { variables: _v, ...rest } = tpl();
    const out = check([rest]).templates[0];
    assert.deepEqual(out.declared, []);
    assert.deepEqual(out.missing_declarations, ["name"]);
    assert.equal(out.status, "issues");
  });

  it("an empty body has no placeholders; declared names are all unused", () => {
    const out = one({ body: "" });
    assert.deepEqual(out.placeholders, []);
    assert.deepEqual(out.unused_declarations, ["name"]);
    assert.equal(out.status, "issues");
  });

  it("an empty body with no declared variables is ok", () => {
    const out = one({ body: "", variables: [] });
    assert.equal(out.status, "ok");
  });

  it("name and version echo verbatim", () => {
    const out = one({ name: "my_tpl 2", version: "10.20.30" });
    assert.equal(out.name, "my_tpl 2");
    assert.equal(out.version, "10.20.30");
  });

  it("multiple templates report in pack order", () => {
    const out = check([tpl({ name: "second" }), tpl({ name: "first", body: "" , variables: [] })]);
    assert.deepEqual(out.templates.map((t) => t.name), ["second", "first"]);
  });
});

describe("checkPromptPack — placeholder span matching", () => {
  it("whitespace-padded names are placeholders for the trimmed name", () => {
    for (const body of ["{{ name }}", "{{name }}", "{{ name}}", "{{\tname\n}}"]) {
      const out = one({ body });
      assert.deepEqual(out.placeholders, ["name"], body);
    }
  });

  it("names may contain letters, digits, and underscores, including a leading digit", () => {
    const out = one({
      body: "{{user_2}} {{_x}} {{A9}} {{9lives}}",
      variables: ["user_2", "_x", "A9", "9lives"],
    });
    assert.deepEqual(out.placeholders, ["user_2", "_x", "A9", "9lives"]);
    assert.equal(out.status, "ok");
  });

  it("the empty span {{}} is not a placeholder", () => {
    const out = one({ body: "a {{}} b", variables: [] });
    assert.deepEqual(out.placeholders, []);
    assert.equal(out.status, "ok");
  });

  it("a whitespace-only span is not a placeholder", () => {
    const out = one({ body: "a {{   }} b", variables: [] });
    assert.deepEqual(out.placeholders, []);
  });

  it("spans with spaces inside the name are not placeholders", () => {
    const out = one({ body: "{{first name}}", variables: [] });
    assert.deepEqual(out.placeholders, []);
  });

  it("spans with punctuation in the name are not placeholders", () => {
    for (const body of ["{{user-name}}", "{{user.name}}", "{{user!}}", "{{a/b}}", "{{a b}}", "{{ a-b }}"]) {
      assert.deepEqual(one({ body, variables: [] }).placeholders, [], body);
    }
  });

  it("an unterminated {{ is not a placeholder and is unreported", () => {
    const out = one({ body: "Hi {{name", variables: [] });
    assert.deepEqual(out.placeholders, []);
    assert.equal(out.status, "ok");
  });

  it("an unterminated {{ after a real placeholder leaves the placeholder reported", () => {
    const out = one({ body: "{{a}} and {{b", variables: ["a"] });
    assert.deepEqual(out.placeholders, ["a"]);
  });

  it("single braces and a lone }} are not placeholders", () => {
    const out = one({ body: "{name} and }} and { {name}}", variables: [] });
    assert.deepEqual(out.placeholders, []);
  });

  it("adjacent placeholders are each found", () => {
    const out = one({ body: "{{a}}{{b}}{{a}}", variables: ["a", "b"] });
    assert.deepEqual(out.placeholders, ["a", "b"]);
  });
});

describe("checkPromptPack — version format (structural validation)", () => {
  it("valid versions pass: 0.0.0, 1.2.0, and multi-digit components", () => {
    for (const version of ["0.0.0", "1.2.0", "10.20.300"]) {
      assert.equal(one({ version }).version, version);
    }
  });

  it("invalid versions name templates[i].version with the pinned wording", () => {
    for (const version of ["1.2", "1.2.3.4", "v1.2.3", "1.2.x", "1..3", "1.2.", ".1.2", "1.2.3 ", " 1.2.3", "1.2.3-beta", "", "1-2-3"]) {
      assert.throws(() => one({ version }), {
        message: "templates[0].version must be three dot-separated non-negative integers",
      }, version);
    }
  });

  it("the error names the index of the offending template", () => {
    assert.throws(
      () => check([tpl({}), tpl({ name: "b", version: "2.0" })]),
      { message: "templates[1].version must be three dot-separated non-negative integers" },
    );
  });

  it("a non-string version is an error naming the path", () => {
    assert.throws(() => one({ version: 123 }), {
      message: "templates[0].version must be a string",
    });
  });

  it("a missing version is an error naming the path as required", () => {
    const { version: _v, ...rest } = tpl();
    assert.throws(() => check([rest]), {
      message: "templates[0].version is required",
    });
  });
});

describe("checkPromptPack — duplicates", () => {
  it("duplicate template names are an error naming the duplicated name", () => {
    assert.throws(() => check([tpl({}), tpl({ version: "2.0.0" })]), {
      message: "duplicate template name: greet",
    });
  });

  it("the duplicate error names the second occurrence's name among several", () => {
    assert.throws(
      () => check([tpl({ name: "a" }), tpl({ name: "b" }), tpl({ name: "b", body: "" })]),
      { message: "duplicate template name: b" },
    );
  });

  it("duplicate names inside one template's variables name the path", () => {
    assert.throws(() => one({ variables: ["name", "x", "name"] }), {
      message: "templates[0].variables contains duplicate variable name: name",
    });
  });

  it("the same variable name in different templates is fine", () => {
    const out = check([tpl({}), tpl({ name: "other" })]);
    assert.equal(out.counts.templates, 2);
  });

  it("no partial result is produced on a duplicate", () => {
    assert.throws(() => check([tpl({}), tpl({})]));
  });
});

describe("checkPromptPack — renders", () => {
  const pack = () => [
    tpl({}),
    tpl({ name: "bye", body: "Bye {{name}}, from {{ place }}.", variables: ["name", "place"] }),
  ];

  it("a successful render replaces every placeholder span", () => {
    const out = check(pack(), {
      renders: [{ template: "greet", values: { name: "Ada" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "Hi Ada!" }]);
  });

  it("rendered entries have keys in the order template, ok, rendered", () => {
    const out = check(pack(), {
      renders: [{ template: "greet", values: { name: "Ada" } }],
    });
    assert.deepEqual(Object.keys(out.renders[0]), ["template", "ok", "rendered"]);
  });

  it("whitespace-padded spans render with the trimmed name's value", () => {
    const out = check(pack(), {
      renders: [{ template: "bye", values: { name: "Ada", place: "SF" } }],
    });
    assert.deepEqual(out.renders, [
      { template: "bye", ok: true, rendered: "Bye Ada, from SF." },
    ]);
  });

  it("repeated placeholders are all replaced by the one value", () => {
    const out = check([tpl({ body: "{{x}}-{{x}}-{{x}}", variables: ["x"] })], {
      renders: [{ template: "greet", values: { x: "7" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "7-7-7" }]);
  });

  it("replacement output is never rescanned: a value containing {{other}} stays literal", () => {
    const out = check([tpl({ body: "{{a}}", variables: ["a"] })], {
      renders: [{ template: "greet", values: { a: "{{b}}", b: "SHOULD-NOT-APPEAR" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "{{b}}" }]);
  });

  it("never-rescan also holds when the value names a missing placeholder", () => {
    const out = check([tpl({ body: "{{a}} {{c}}", variables: ["a", "c"] })], {
      renders: [{ template: "greet", values: { a: "{{c}}", c: "see" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "{{c}} see" }]);
  });

  it("non-placeholder spans are left untouched in a render", () => {
    const out = check(
      [tpl({ body: "A {{}} B {{first name}} C {{name}} D {{oops", variables: ["name"] })],
      { renders: [{ template: "greet", values: { name: "N" } }] },
    );
    assert.deepEqual(out.renders, [
      { template: "greet", ok: true, rendered: "A {{}} B {{first name}} C N D {{oops" },
    ]);
  });

  it("extra supplied values are ignored", () => {
    const out = check(pack(), {
      renders: [{ template: "greet", values: { name: "Ada", extra: "ignored", other: "x" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "Hi Ada!" }]);
  });

  it("an empty-string value is a supplied value and renders empty", () => {
    const out = check(pack(), {
      renders: [{ template: "greet", values: { name: "" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "Hi !" }]);
  });

  it("renders run in input order, including repeats of one template", () => {
    const out = check(pack(), {
      renders: [
        { template: "bye", values: { name: "Ada", place: "SF" } },
        { template: "greet", values: { name: "Bo" } },
        { template: "bye", values: { name: "Cy", place: "LA" } },
      ],
    });
    assert.deepEqual(out.renders.map((r) => r.template), ["bye", "greet", "bye"]);
  });

  it("absent renders means an empty renders list", () => {
    assert.deepEqual(check(pack()).renders, []);
  });

  it("an empty renders array is valid and renders nothing", () => {
    assert.deepEqual(check(pack(), { renders: [] }).renders, []);
  });
});

describe("checkPromptPack — render failure is report data, not an error", () => {
  it("a missing value fails the render with distinct missing names in placeholder order", () => {
    const out = check(
      [tpl({ body: "{{z}} {{a}} {{z}} {{m}}", variables: ["z", "a", "m"] })],
      { renders: [{ template: "greet", values: { a: "1" } }] },
    );
    assert.deepEqual(out.renders, [
      { template: "greet", ok: false, missing_values: ["z", "m"] },
    ]);
  });

  it("failed render entries have keys in the order template, ok, missing_values", () => {
    const out = check([tpl({})], {
      renders: [{ template: "greet", values: {} }],
    });
    assert.deepEqual(Object.keys(out.renders[0]), ["template", "ok", "missing_values"]);
  });

  it("a failed render does not stop the remaining renders or templates from reporting", () => {
    const out = check(
      [tpl({}), tpl({ name: "bye", body: "Bye {{name}}", variables: ["name"] })],
      {
        renders: [
          { template: "greet", values: {} },
          { template: "bye", values: { name: "Ada" } },
        ],
      },
    );
    assert.deepEqual(out.renders, [
      { template: "greet", ok: false, missing_values: ["name"] },
      { template: "bye", ok: true, rendered: "Bye Ada" },
    ]);
    assert.equal(out.templates.length, 2);
  });

  it("a render of a template with no placeholders succeeds with any values", () => {
    const out = check([tpl({ body: "static", variables: [] })], {
      renders: [{ template: "greet", values: {} }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "static" }]);
  });

  it("a render ignores declarations: values for undeclared placeholders still render", () => {
    const out = check([tpl({ variables: [] })], {
      renders: [{ template: "greet", values: { name: "Ada" } }],
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "Hi Ada!" }]);
    assert.equal(out.templates[0].status, "issues");
  });
});

describe("checkPromptPack — counts and output shape", () => {
  it("output keys are templates, renders, counts in that order", () => {
    assert.deepEqual(Object.keys(check([tpl({})])), ["templates", "renders", "counts"]);
  });

  it("counts tally templates, with_issues, renders, renders_ok, renders_failed in pinned key order", () => {
    const out = check(
      [
        tpl({}),
        tpl({ name: "bad", body: "{{x}}", variables: [] }),
        tpl({ name: "unused", body: "static", variables: ["q"] }),
      ],
      {
        renders: [
          { template: "greet", values: { name: "Ada" } },
          { template: "bad", values: {} },
          { template: "greet", values: {} },
        ],
      },
    );
    assert.deepEqual(out.counts, {
      templates: 3,
      with_issues: 2,
      renders: 3,
      renders_ok: 1,
      renders_failed: 2,
    });
    assert.deepEqual(Object.keys(out.counts), [
      "templates",
      "with_issues",
      "renders",
      "renders_ok",
      "renders_failed",
    ]);
  });

  it("counts with no renders are zero for renders, renders_ok, and renders_failed", () => {
    assert.deepEqual(check([tpl({})]).counts, {
      templates: 1,
      with_issues: 0,
      renders: 0,
      renders_ok: 0,
      renders_failed: 0,
    });
  });
});

describe("checkPromptPack — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => checkPromptPack(args), { message });

  it("templates missing is an error naming templates", () => {
    throws({}, "templates is required");
    throws({ renders: [] }, "templates is required");
  });

  it("a non-object top-level argument is treated as {} and fails on templates", () => {
    throws(null, "templates is required");
    throws([], "templates is required");
    throws("x", "templates is required");
    throws(42, "templates is required");
    throws(undefined, "templates is required");
  });

  it("templates not an array or empty names templates", () => {
    throws({ templates: "x" }, "templates must be a non-empty array");
    throws({ templates: {} }, "templates must be a non-empty array");
    throws({ templates: 3 }, "templates must be a non-empty array");
    throws({ templates: [] }, "templates must be a non-empty array");
  });

  it("an item that is not an object names its index", () => {
    throws({ templates: ["x"] }, "templates[0] must be an object");
    throws({ templates: [null] }, "templates[0] must be an object");
    throws({ templates: [[]] }, "templates[0] must be an object");
    throws({ templates: [tpl({}), 7] }, "templates[1] must be an object");
  });

  it("name missing, empty, or non-string names templates[i].name", () => {
    const { name: _n, ...noName } = tpl();
    throws({ templates: [noName] }, "templates[0].name is required");
    throws({ templates: [tpl({ name: "" })] }, "templates[0].name must be a non-empty string");
    throws({ templates: [tpl({ name: 42 })] }, "templates[0].name must be a non-empty string");
    throws({ templates: [tpl({ name: null })] }, "templates[0].name must be a non-empty string");
  });

  it("body missing or non-string names templates[i].body", () => {
    const { body: _b, ...noBody } = tpl();
    throws({ templates: [noBody] }, "templates[0].body is required");
    for (const bad of [42, true, null, [], {}]) {
      throws({ templates: [tpl({ body: bad })] }, "templates[0].body must be a string");
    }
  });

  it("variables present but not an array names templates[i].variables", () => {
    for (const bad of ["name", 42, true, null, {}]) {
      throws({ templates: [tpl({ variables: bad })] }, "templates[0].variables must be an array");
    }
  });

  it("variables holding a non-string or empty string names templates[i].variables[j]", () => {
    throws({ templates: [tpl({ variables: ["name", 42] })] }, "templates[0].variables[1] must be a non-empty string");
    throws({ templates: [tpl({ variables: [""] })] }, "templates[0].variables[0] must be a non-empty string");
    throws({ templates: [tpl({ variables: [null] })] }, "templates[0].variables[0] must be a non-empty string");
    throws({ templates: [tpl({}), tpl({ name: "b", variables: [[]] })] }, "templates[1].variables[0] must be a non-empty string");
  });

  it("renders present but not an array names renders", () => {
    for (const bad of ["x", 42, true, null, {}]) {
      throws({ templates: [tpl({})], renders: bad }, "renders must be an array");
    }
  });

  it("a render item that is not an object names its index", () => {
    throws({ templates: [tpl({})], renders: ["x"] }, "renders[0] must be an object");
    throws({ templates: [tpl({})], renders: [null] }, "renders[0] must be an object");
    throws({ templates: [tpl({})], renders: [[]] }, "renders[0] must be an object");
  });

  it("render template missing, empty, or non-string names renders[i].template", () => {
    throws({ templates: [tpl({})], renders: [{ values: {} }] }, "renders[0].template is required");
    throws({ templates: [tpl({})], renders: [{ template: "", values: {} }] }, "renders[0].template must be a non-empty string");
    throws({ templates: [tpl({})], renders: [{ template: 9, values: {} }] }, "renders[0].template must be a non-empty string");
  });

  it("a render naming no pack template is a validation error naming renders[i].template", () => {
    throws(
      { templates: [tpl({})], renders: [{ template: "nope", values: {} }] },
      "renders[0].template names no template in the pack: nope",
    );
    throws(
      {
        templates: [tpl({})],
        renders: [
          { template: "greet", values: { name: "Ada" } },
          { template: "ghost", values: {} },
        ],
      },
      "renders[1].template names no template in the pack: ghost",
    );
  });

  it("render values missing or not an object names renders[i].values", () => {
    throws({ templates: [tpl({})], renders: [{ template: "greet" }] }, "renders[0].values is required");
    for (const bad of ["x", 42, true, null, []]) {
      throws(
        { templates: [tpl({})], renders: [{ template: "greet", values: bad }] },
        "renders[0].values must be an object",
      );
    }
  });

  it("a render value that is not a string names renders[i].values.<key>", () => {
    for (const bad of [42, true, null, [], {}]) {
      throws(
        { templates: [tpl({})], renders: [{ template: "greet", values: { name: bad } }] },
        "renders[0].values.name must be a string",
      );
    }
  });

  it("unknown extra fields are ignored, including inside items and renders", () => {
    const out = checkPromptPack({
      templates: [tpl({ extra: true, note: "ignored" })],
      renders: [{ template: "greet", values: { name: "Ada" }, label: "smoke" }],
      generated_by: "test",
    });
    assert.deepEqual(out.renders, [{ template: "greet", ok: true, rendered: "Hi Ada!" }]);
    assert.equal(out.counts.templates, 1);
  });

  it("no partial result is produced on invalid input deep in the list", () => {
    assert.throws(() =>
      check([tpl({}), tpl({ name: "b" }), tpl({ name: "c", version: "nope" })]),
    );
    assert.throws(() =>
      check([tpl({})], {
        renders: [
          { template: "greet", values: { name: "Ada" } },
          { template: "greet", values: { name: 1 } },
        ],
      }),
    );
  });
});
