import {
  appendNote,
  listFiles,
  readNote,
  writeNote,
} from "./paste-store.server";
import type { McpAuth } from "./mcp-tokens.server";

const PROTOCOL = "2025-03-26";
const SUPPORTED = new Set(["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]);

type RpcId = string | number | null;

type RpcReq = {
  jsonrpc?: string;
  id?: RpcId;
  method?: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "room_info",
    description: "Room id, token label, expiry. No note body.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "note_get",
    description: "Read the full note as plain text.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "note_append",
    description:
      "Append text to the note. Default write. Do not replace the whole note unless asked.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Chunk to append" } },
      required: ["text"],
    },
  },
  {
    name: "note_put",
    description: "Replace the entire note. Destructive. Prefer note_append.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "files_list",
    description: "List files in the room (id, name, mime, size).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function ok(id: RpcId, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: RpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function toolText(text: string, extra?: Record<string, unknown>) {
  return {
    content: [{ type: "text", text }],
    ...(extra ?? {}),
  };
}

async function callTool(auth: McpAuth, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "room_info": {
      const { meta } = await readNote(auth.publicId, { touch: false });
      return toolText(
        JSON.stringify(
          {
            publicId: meta.publicId,
            words: meta.words,
            label: auth.label,
            expiresAt: new Date(meta.expiresAt).toISOString(),
            noteBytes: meta.noteBytes,
          },
          null,
          2,
        ),
      );
    }
    case "note_get": {
      const { content } = await readNote(auth.publicId, { touch: true });
      return toolText(content || "(empty note)");
    }
    case "note_append": {
      const text = typeof args.text === "string" ? args.text : "";
      if (!text) return toolText("Empty append.", { isError: true });
      const { content } = await appendNote(auth.publicId, text);
      return toolText(`Appended ${text.length} chars. Note is now ${content.length} chars.`);
    }
    case "note_put": {
      const text = typeof args.text === "string" ? args.text : "";
      await writeNote(auth.publicId, text);
      return toolText(`Replaced note (${text.length} chars).`);
    }
    case "files_list": {
      const files = await listFiles(auth.publicId, { touch: false });
      return toolText(
        files.length === 0
          ? "(no files)"
          : files.map((f) => `${f.id}\t${f.size}\t${f.name}`).join("\n"),
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleMcpRpc(auth: McpAuth, body: unknown): Promise<{
  status: number;
  payload: unknown | null;
}> {
  if (body === null || typeof body !== "object") {
    return { status: 200, payload: fail(null, -32700, "Parse error") };
  }
  const req = body as RpcReq;
  const id = (req.id ?? null) as RpcId;
  const method = req.method || "";

  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return { status: 204, payload: null };
  }

  if (method === "ping") {
    return { status: 200, payload: ok(id, {}) };
  }

  if (method === "initialize") {
    const requested =
      typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : PROTOCOL;
    const version = SUPPORTED.has(requested) ? requested : PROTOCOL;
    return {
      status: 200,
      payload: ok(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "paste.grok.me", version: "1.0.0" },
        instructions:
          "This MCP is bound to one paste room via the bearer token. Read and write are equally privileged. Prefer note_append. Follow # AGENT in the note.",
      }),
    };
  }

  if (method === "tools/list") {
    return { status: 200, payload: ok(id, { tools: TOOLS }) };
  }

  if (method === "tools/call") {
    const name = typeof req.params?.name === "string" ? req.params.name : "";
    const args =
      req.params?.arguments && typeof req.params.arguments === "object"
        ? (req.params.arguments as Record<string, unknown>)
        : {};
    try {
      const result = await callTool(auth, name, args);
      return { status: 200, payload: ok(id, result) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tool failed";
      return { status: 200, payload: ok(id, toolText(msg, { isError: true })) };
    }
  }

  return { status: 200, payload: fail(id, -32601, `Method not found: ${method}`) };
}
