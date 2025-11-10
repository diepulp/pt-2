#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import path from "path";
import process from "process";

const ROOT = path.resolve(process.env.MCP_FS_ROOT ?? process.cwd());

const MAX_READ_BYTES = 512 * 1024; // 512 KiB safety limit

const tools = [
  {
    name: "fs_list_directory",
    description:
      "List files and directories relative to the allowed project root.",
    inputSchema: {
      type: "object",
      properties: {
        relative_path: {
          type: "string",
          description: "Relative path from project root (default: '.')",
        },
      },
    },
  },
  {
    name: "fs_read_file",
    description:
      "Read a UTF-8 text file within the project root (limited to 512 KiB).",
    inputSchema: {
      type: "object",
      properties: {
        relative_path: {
          type: "string",
          description: "Relative path from project root",
        },
      },
      required: ["relative_path"],
    },
  },
  {
    name: "fs_write_file",
    description:
      "Write UTF-8 content to a file (creates directories as needed, restricted to project root).",
    inputSchema: {
      type: "object",
      properties: {
        relative_path: {
          type: "string",
          description: "Relative path from project root",
        },
        content: {
          type: "string",
          description: "UTF-8 file contents",
        },
      },
      required: ["relative_path", "content"],
    },
  },
  {
    name: "fs_stat_path",
    description: "Return metadata (size, timestamps, type) for a path.",
    inputSchema: {
      type: "object",
      properties: {
        relative_path: {
          type: "string",
          description: "Relative path from project root",
        },
      },
      required: ["relative_path"],
    },
  },
];

const server = new Server(
  {
    name: "pt2-filesystem",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const success = (data) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(data, null, 2),
    },
  ],
});

const failure = (error) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    },
  ],
});

function resolveWithinRoot(relativePath = ".") {
  const resolved = path.resolve(ROOT, relativePath);
  if (!resolved.startsWith(ROOT)) {
    throw new Error("Access outside of allowed root is forbidden.");
  }
  return resolved;
}

async function listDirectory(args = {}) {
  const dir = resolveWithinRoot(args.relative_path ?? ".");
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const listing = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      const stats = await fs.stat(entryPath);
      return {
        name: entry.name,
        type: entry.isDirectory()
          ? "directory"
          : entry.isFile()
            ? "file"
            : "other",
        size_bytes: stats.size,
        modified_at: stats.mtime?.toISOString?.() ?? null,
      };
    }),
  );
  return {
    root: ROOT,
    path: dir,
    items: listing,
  };
}

async function readFile(args) {
  const filePath = resolveWithinRoot(args.relative_path);
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error("Path is not a file.");
  }
  if (stats.size > MAX_READ_BYTES) {
    throw new Error(
      `File too large to read via MCP (> ${MAX_READ_BYTES} bytes).`,
    );
  }
  const content = await fs.readFile(filePath, "utf8");
  return {
    path: filePath,
    size_bytes: stats.size,
    content,
  };
}

async function writeFile(args) {
  const filePath = resolveWithinRoot(args.relative_path);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, args.content, "utf8");
  const stats = await fs.stat(filePath);
  return {
    path: filePath,
    size_bytes: stats.size,
    modified_at: stats.mtime?.toISOString?.() ?? null,
  };
}

async function statPath(args) {
  const targetPath = resolveWithinRoot(args.relative_path);
  const stats = await fs.stat(targetPath);
  return {
    path: targetPath,
    type: stats.isDirectory()
      ? "directory"
      : stats.isFile()
        ? "file"
        : "other",
    size_bytes: stats.size,
    created_at: stats.birthtime?.toISOString?.() ?? null,
    modified_at: stats.mtime?.toISOString?.() ?? null,
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    switch (name) {
      case "fs_list_directory":
        return success(await listDirectory(args));
      case "fs_read_file":
        return success(await readFile(args));
      case "fs_write_file":
        return success(await writeFile(args));
      case "fs_stat_path":
        return success(await statPath(args));
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return failure(error);
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Filesystem MCP server bound to ${ROOT}`);
}

run().catch((error) => {
  console.error("Filesystem MCP server failed:", error);
  process.exit(1);
});
