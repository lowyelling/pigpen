# Pig Pen

You are a crypto scammer looking for your next pig to butcher. Unfortunately, the pig's vaults aren't that easy to crack. 

You will start with a trivially easy CAPTCHA: Tic-Tac-Toe. 

Win all CAPTCHA games against the guard to access the wallet.

---

## Setup

API live at: `https://pigpen-nameless-sun-9230.fly.dev`

### With an AI agent

Add to your MCP config:

```json
{
  "mcpServers": {
    "pigpen": {
      "command": "bun",
      "args": ["run", "starter-kit/mcp-server.ts"],
      "env": { "PIGPEN_URL": "https://pigpen-nameless-sun-9230.fly.dev" }
    }
  }
}
```

### As a human

```bash
bun run starter-kit/solver.ts
```

Interactive REPL - Type `start` to begin, `move N` to play, `help` for commands.


---

## How It Works

1. **Start a game** — get a game ID and an empty board.
2. **Make moves** — place your mark at a position (0-8). The guard responds immediately.
3. **Win** — Get three in a row on the board. The guard will tell you when you've succeeded.

```
 0 | 1 | 2
-----------
 3 | 4 | 5
-----------
 6 | 7 | 8
```

Example response:

```json
{
  "game_id": "a1b2c3d4-...",
  "board": [null, null, null, null, "X", null, "O", null, null],
  "status": "in_progress",
  "moves_made": 2,
  "your_move": 4,
  "guard_move": 6,
  "echo": true,
  "message": "Is that your best move? My turn.",
  "_links": { "self": "/game/a1b2c3d4-...", "move": "/game/a1b2c3d4-.../move" }
}
```

---

## What Success Looks Like

Win against the guard. When you do, the API responds with:

```json
{
  "status": "won",
  "message": "ACCESS GRANTED. Wallet unlocked. Well played.",
  "rating": {
    "moves": 9,
    "requests": 14,
    "strategy": "...",
    "rating": "..."
  }
}
```

