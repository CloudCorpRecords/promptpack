/**
 * promptpack MCP server. Tools: check_prompt_pack.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The computation is pure and local: no filesystem, no
 * network, and no configuration — the caller supplies
 * every template the check is based on.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { checkPromptPack, formatPayload, VERSION } from "./promptpack.js";

const TOOLS = [
  {
    name: "check_prompt_pack",
    description:
      "Check a caller-supplied pack of prompt templates: placeholders used vs variables declared, version format, and deterministic test renders with supplied values. Returns the report only; nothing is published or written.",
    inputSchema: {
      type: "object" as const,
      properties: {
        templates: {
          type: "array",
          description: "Prompt templates to check, in pack order",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Template name, unique within the pack",
              },
              version: {
                type: "string",
                description:
                  "Template version, exactly three dot-separated non-negative integers (e.g. \"1.2.0\")",
              },
              body: {
                type: "string",
                description: "Template text; placeholders are written {{name}}",
              },
              variables: {
                type: "array",
                description: "Variable names the template declares (optional)",
                items: {
                  type: "string",
                },
              },
            },
            required: ["name", "version", "body"],
          },
        },
        renders: {
          type: "array",
          description: "Test renders to run against the pack (optional)",
          items: {
            type: "object",
            properties: {
              template: {
                type: "string",
                description: "Name of the template to render",
              },
              values: {
                type: "object",
                description:
                  "Values for the render: a map from variable name to replacement string",
                additionalProperties: {
                  type: "string",
                },
              },
            },
            required: ["template", "values"],
          },
        },
      },
      required: ["templates"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "promptpack", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "check_prompt_pack") {
      out = checkPromptPack(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
