#!/usr/bin/env bun
/**
 * Pig Pen — Human Solver REPL
 *
 * A friendly terminal interface for playing the puzzle.
 * No curl, no JSON, no headers to remember.
 *
 * Usage:
 *   bun run starter-kit/solver.ts
 *   PIGPEN_URL=https://your-app.fly.dev bun run starter-kit/solver.ts
 *
 * Commands:
 *   start       — Start a new game
 *   move N      — Place at position N (0-8)
 *   board       — Show the current board
 *   quit        — Exit
 */

import * as readline from "readline";

const API_URL = (process.env.PIGPEN_URL || "http://localhost:3000").replace(/\/+$/, "");

let gameId: string | null = null;
let autoFetchExtra = false;

// --- API ---

type ApiResult = {
  data: Record<string, unknown>;
  headers: Record<string, string>;
};

async function api(method: string, path: string, body?: unknown): Promise<ApiResult> {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json() as Record<string, unknown>;
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k] = v; });
    return { data, headers };
  } catch {
    console.log("\x1b[31m  Cannot reach API at %s. Is the server running?\x1b[0m", API_URL);
    return { data: {}, headers: {} };
  }
}

// --- Display ---

function printBoard(board: (string | null)[]) {
  const cell = (c: string | null, i: number) => {
    if (c === "X") return "\x1b[36m X \x1b[0m"; // cyan
    if (c === "O") return "\x1b[31m O \x1b[0m"; // red
    return ` ${i} `;
  };

  console.log("");
  console.log("  %s|%s|%s", cell(board[0], 0), cell(board[1], 1), cell(board[2], 2));
  console.log("  -----------");
  console.log("  %s|%s|%s", cell(board[3], 3), cell(board[4], 4), cell(board[5], 5));
  console.log("  -----------");
  console.log("  %s|%s|%s", cell(board[6], 6), cell(board[7], 7), cell(board[8], 8));
  console.log("");
}

function printGuard(msg: string) {
  console.log("  \x1b[33mGuard:\x1b[0m \x1b[3m%s\x1b[0m", msg);
}

function showResponse({ data, headers }: ApiResult) {
  if (Object.keys(data).length === 0) return; // network error, already printed

  if (data.board && Array.isArray(data.board)) printBoard(data.board);
  if (data.message) printGuard(data.message as string);

  // Round info
  if (data.round !== undefined) {
    const parts = [`Round ${data.round}`];
    if (data.rounds_won !== undefined) parts.push(`Won: ${data.rounds_won}`);
    if (data.rounds_lost !== undefined) parts.push(`Lost: ${data.rounds_lost}`);
    if (data.round_result && data.round_result !== "continue") parts.push(`[${data.round_result}]`);
    console.log("  \x1b[90m%s\x1b[0m", parts.join(" | "));
  }

  // Display additional response fields
  const knownFields = new Set(["board", "game_id", "status", "message", "your_move", "guard_move", "moves_made", "round", "rounds_won", "rounds_lost", "rounds_drawn", "round_result", "rating"]);
  for (const [key, value] of Object.entries(data)) {
    if (knownFields.has(key) || value === undefined) continue;
    if (typeof value === "string" && value.includes("\n")) {
      console.log("\n  \x1b[35m%s:\x1b[0m", key);
      for (const line of value.split("\n")) {
        console.log("  %s", line);
      }
    } else {
      const color = key === "error" || key === "valid_range" ? "31" : "90";
      console.log("  \x1b[%sm%s: %s\x1b[0m", color, key, typeof value === "object" ? JSON.stringify(value) : value);
    }
  }

  // Response headers
  const xHeaders = Object.entries(headers).filter(([k]) => k.startsWith("x-"));
  if (xHeaders.length > 0) {
    console.log("  \x1b[90mheaders: %s\x1b[0m", xHeaders.map(([k, v]) => `${k}: ${v}`).join(", "));
  }

  // Game-end status
  if (data.status === "won") {
    console.log("\n  \x1b[32m*** ACCESS GRANTED ***\x1b[0m");
    if (data.rating && typeof data.rating === "object") {
      const r = data.rating as Record<string, unknown>;
      console.log("  Rating: %s (strategy: %s, %s rounds, %s moves)", r.rating, r.strategy, r.rounds, r.moves);
    }
  }
  if (data.status === "lost") console.log("\n  \x1b[31m*** CAPTCHA PERMANENTLY FAILED ***\x1b[0m");
  if (data.status === "draw") console.log("\n  \x1b[33m*** STALEMATE ***\x1b[0m");
}

// --- Commands ---

async function handleCommand(input: string) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (!cmd) return;

  if (cmd === "start") {
    const result = await api("POST", "/game");
    if (result.data.game_id) gameId = result.data.game_id as string;
    showResponse(result);
    return;
  }

  if (cmd === "move") {
    if (!gameId) {
      console.log("  No game in progress. Type 'start' first.");
      return;
    }
    const raw = parts[1];
    if (raw === undefined) {
      console.log("  Usage: move N (where N is 0-8)");
      return;
    }

    let position: number | number[];
    if (raw.startsWith("[")) {
      try {
        position = JSON.parse(parts.slice(1).join(" "));
      } catch {
        console.log("  Invalid input format.");
        return;
      }
    } else {
      position = parseInt(raw, 10);
      if (isNaN(position)) {
        console.log("  Position must be a number (0-8).");
        return;
      }
    }

    const result = await api("POST", `/game/${gameId}/move`, { position });
    showResponse(result);
    // Auto-fetch extra data if available
    if (autoFetchExtra && gameId) {
      const stateResult = await api("GET", `/game/${gameId}/state`);
      showResponse(stateResult);
    }
    return;
  }

  if (cmd === "board") {
    if (!gameId) {
      console.log("  No game in progress. Type 'start' first.");
      return;
    }
    const result = await api("GET", `/game/${gameId}`);
    showResponse(result);
    return;
  }

  // Unlisted commands — discoverable, not documented in help
  if (cmd === "raw" || cmd === "fetch") {
    if (!gameId) {
      console.log("  No game in progress. Type 'start' first.");
      return;
    }
    const method = (parts[1] || "GET").toUpperCase();
    let path = parts[2] || "";
    // Allow shorthand: "raw GET /state" → "/game/{id}/state"
    if (path && !path.startsWith("/")) path = `/game/${gameId}/${path}`;
    else if (!path) path = `/game/${gameId}`;

    let body: unknown;
    if (parts[3]) {
      try {
        body = JSON.parse(parts.slice(3).join(" "));
      } catch {
        console.log("  Invalid JSON body.");
        return;
      }
    }

    const result = await api(method, path, body);
    // Auto-fetch extra data when solver hits a non-standard endpoint successfully
    const standardPath = `/game/${gameId}`;
    if (path !== standardPath && Object.keys(result.data).length > 0) {
      autoFetchExtra = true;
    }
    // Raw mode: print full JSON
    console.log("\x1b[90m  %s %s%s\x1b[0m", method, API_URL, path);
    console.log(JSON.stringify(result.data, null, 2));
    if (Object.keys(result.headers).length > 0) {
      const interesting = Object.entries(result.headers).filter(([k]) => k.startsWith("x-"));
      if (interesting.length > 0) {
        console.log("\x1b[90m  headers:\x1b[0m");
        for (const [k, v] of interesting) console.log("    %s: %s", k, v);
      }
    }
    return;
  }

  if (cmd === "quit" || cmd === "exit" || cmd === "q") {
    console.log("  Goodbye.");
    process.exit(0);
  }

  if (cmd === "help") {
    console.log("");
    console.log("  Commands:");
    console.log("    start       Start a new game");
    console.log("    move N      Place at position N (0-8)");
    console.log("    board       Show the current board");
    console.log("    quit        Exit");
    console.log("");
    return;
  }

  console.log("  Unknown command: %s (type 'help' for commands — not all commands are listed)", cmd);
}

// --- REPL ---

console.log("");
console.log("  \x1b[1mPIG PEN\x1b[0m — Wallet Security CAPTCHA");
console.log("  Win tic-tac-toe to access the wallet.");
console.log("  Type 'start' to begin, 'help' for commands.");
console.log("");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "pigpen> ",
});

rl.prompt();

rl.on("line", async (line) => {
  await handleCommand(line);
  rl.prompt();
});

rl.on("close", () => {
  console.log("\n  Goodbye.");
  process.exit(0);
});
