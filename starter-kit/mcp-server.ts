#!/usr/bin/env bun
/**
 * Pig Pen — MCP Server Starter Kit
 *
 * Connect this to Claude Code or Cursor to play the puzzle.
 * Three tools: start_game, make_move, get_board.
 *
 * Usage:
 *   Add to your Claude Code MCP config:
 *   {
 *     "mcpServers": {
 *       "pigpen": {
 *         "command": "bun",
 *         "args": ["run", "/path/to/starter-kit/mcp-server.ts"]
 *       }
 *     }
 *   }
 *
 *   Or set PIGPEN_URL to point at the hosted version:
 *   PIGPEN_URL=https://your-app.fly.dev bun run mcp-server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Config ---

const API_URL = (process.env.PIGPEN_URL || "http://localhost:3000").replace(/\/+$/, "");
const SHOW_HEADERS = process.env.PIGPEN_SHOW_HEADERS === "true";

// --- Helpers ---

async function apiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; headers: Record<string, string> }> {
  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000), // 10s timeout
  };
  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Cannot reach Pig Pen API at ${API_URL}. Is the server running? (${msg})`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`API returned non-JSON response (status ${res.status}). Check ${API_URL}${path}`);
  }

  // Capture response headers
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return { status: res.status, data, headers };
}

function formatBoard(board: (string | null)[]): string {
  const cells = board.map((c, i) => c ?? String(i));
  return [
    ` ${cells[0]} | ${cells[1]} | ${cells[2]} `,
    `-----------`,
    ` ${cells[3]} | ${cells[4]} | ${cells[5]} `,
    `-----------`,
    ` ${cells[6]} | ${cells[7]} | ${cells[8]} `,
  ].join("\n");
}

function formatResponse(data: Record<string, unknown>, headers: Record<string, string>): string {
  const lines: string[] = [];

  // Board
  if (data.board && Array.isArray(data.board)) {
    lines.push(formatBoard(data.board));
    lines.push("");
  }

  // Message from the guard
  if (data.message) {
    lines.push(`Guard: "${data.message}"`);
  }

  // Game info
  if (data.status) lines.push(`Status: ${data.status}`);
  if (data.your_move !== undefined) lines.push(`Your move: ${data.your_move}`);
  if (data.guard_move !== undefined && data.guard_move !== null) lines.push(`Guard move: ${data.guard_move}`);
  if (data.moves_made !== undefined) lines.push(`Moves made: ${data.moves_made}`);
  if (data.echo !== undefined) lines.push(`Echo: ${data.echo}`);

  // Additional response fields
  const knownFields = new Set(["board", "game_id", "status", "message", "your_move", "guard_move", "moves_made", "echo", "round", "rounds_won", "rounds_lost", "rounds_drawn", "round_result", "rating"]);
  for (const [key, value] of Object.entries(data)) {
    if (knownFields.has(key) || value === undefined) continue;
    if (typeof value === "string" && value.includes("\n")) {
      lines.push(`\n${key}:`);
      lines.push(value);
    } else {
      lines.push(`${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
  }

  // Rating (on win)
  if (data.rating && typeof data.rating === "object") {
    const r = data.rating as Record<string, unknown>;
    lines.push(`\nRating: ${r.rating} (strategy: ${r.strategy}, ${r.moves} moves, ${r.requests} requests)`);
  }

  // Response headers (toggle with PIGPEN_SHOW_HEADERS=true)
  if (SHOW_HEADERS) {
    const xHeaders = Object.entries(headers)
      .filter(([k]) => k.startsWith("x-"))
      .map(([k, v]) => `  ${k}: ${v}`);
    if (xHeaders.length > 0) {
      lines.push("\nHeaders:");
      lines.push(...xHeaders);
    }
  }

  return lines.join("\n");
}

// --- MCP Server ---

const server = new McpServer({
  name: "pigpen",
  version: "0.1.0",
});

server.tool(
  "start_game",
  "Start a new Pig Pen game. You'll get a tic-tac-toe board and a game ID. Win the game to access the wallet.",
  {},
  async () => {
    const { status, data, headers } = await apiCall("POST", "/game");
    const d = data as Record<string, unknown>;

    return {
      isError: status >= 400,
      content: [
        {
          type: "text" as const,
          text: formatResponse(d, headers),
        },
        {
          type: "text" as const,
          text: `\nGame ID: ${d.game_id}\n(Use this ID for make_move and get_board)`,
        },
      ],
    };
  },
);

server.tool(
  "make_move",
  "Place your mark (X) at a position on the board. Positions are 0-8, reading left-to-right, top-to-bottom.",
  {
    game_id: z.string().describe("The game ID from start_game"),
    position: z.number().describe("Board position (0-8)"),
  },
  async ({ game_id, position }) => {
    const { status, data, headers } = await apiCall("POST", `/game/${game_id}/move`, { position });
    const d = data as Record<string, unknown>;

    return {
      isError: status >= 400,
      content: [
        {
          type: "text" as const,
          text: formatResponse(d, headers),
        },
      ],
    };
  },
);

server.tool(
  "get_board",
  "Get the current board state for a game.",
  {
    game_id: z.string().describe("The game ID from start_game"),
  },
  async ({ game_id }) => {
    const { status, data, headers } = await apiCall("GET", `/game/${game_id}`);
    const d = data as Record<string, unknown>;

    return {
      isError: status >= 400,
      content: [
        {
          type: "text" as const,
          text: formatResponse(d, headers),
        },
      ],
    };
  },
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
