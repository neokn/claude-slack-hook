# Claude Slack Hook - Development Documentation

Build and develop Claude Code Slack Approval Hook from source.

## Architecture Overview

This hook implements a **client-server architecture** to handle Claude Code approval requests via Slack. The design ensures a single persistent Slack connection while supporting multiple concurrent approval requests.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claude Code                                  │
│                              │                                       │
│                    triggers hook (stdin)                             │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Client Process                          │    │
│  │  1. Read JSON from stdin                                     │    │
│  │  2. Check if server running (PID file)                       │    │
│  │  3. Fork server if needed                                    │    │
│  │  4. Send request via Unix socket                             │    │
│  │  5. Wait for response                                        │    │
│  │  6. Output JSON to stdout                                    │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                              │                                       │
│                        Unix Socket                                   │
│                              │                                       │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │                      Server Process                          │    │
│  │  - Maintains Slack WebSocket connection                      │    │
│  │  - Listens on Unix socket for client requests                │    │
│  │  - Sends approval messages to Slack                          │    │
│  │  - Routes Slack button responses back to clients             │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                              │                                       │
│                     Slack Socket Mode                                │
│                              ▼                                       │
│                        Slack API                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Process Model

### Server Process (Singleton)

- **Lifecycle**: Long-running background process (daemon)
- **Responsibilities**:
  - Maintain persistent Slack WebSocket connection
  - Listen on Unix socket for incoming requests
  - Send approval request messages to Slack
  - Handle Slack button interactions (approve/deny)
  - Route responses back to the appropriate client
- **Identification**: Runs with env var `__CLAUDE_SLACK_SERVER__=1`
- **Process state**: Detached (`Ss` in ps output)

### Client Process (Ephemeral)

- **Lifecycle**: Short-lived, exits after receiving response
- **Responsibilities**:
  - Parse hook input from stdin
  - Ensure server is running (fork if needed)
  - Send request to server via Unix socket
  - Wait for approval/denial response
  - Output result to stdout for Claude Code
- **Process state**: Attached to terminal (`S+` in ps output)

## IPC Mechanism

### Unix Socket

Located at: `$TMPDIR/claude-slack-approval/approval.sock`

**Protocol**:
- Newline-delimited JSON messages
- Client sends `HookInput` JSON + `\n`
- Server responds with `HookOutput` JSON + `\n`

### PID File (Standard Unix Daemon Pattern)

Located at: `$TMPDIR/claude-slack-approval/server.pid`

**Purpose**: Prevent race conditions when multiple clients start simultaneously.

**How it works**:
1. Client checks if PID file exists
2. If exists, read PID and verify process is alive using `kill(pid, 0)`
3. If process alive → server is running, connect via socket
4. If process dead → stale PID file, clean up and fork new server
5. Server writes its PID to file on startup
6. Server removes PID file on graceful shutdown

```typescript
// POSIX standard process existence check
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);  // Signal 0 = just check, don't kill
    return true;
  } catch {
    return false;  // ESRCH = process doesn't exist
  }
}
```

## CLI Arguments

### Value Arguments (with short aliases)

| Long | Short | Description |
|------|-------|-------------|
| `--bot-token` | `-b` | Slack Bot Token (xoxb-...) |
| `--app-token` | `-a` | Slack App Token (xapp-...) |
| `--user-id` | `-u` | Slack User ID to send messages to |
| `--log-level` | `-l` | Log level (default: info) |

### Boolean Flags (no short aliases)

| Flag | Description |
|------|-------------|
| `--test` | Run connection test mode |
| `--stop` | Kill all running processes and cleanup |
| `--only-screen-lock` | Only send notifications when screen is locked |

## Request Flow

### Normal Operation

```
1. Claude Code triggers hook
   │
2. Client starts, reads stdin
   │
3. Client checks PID file
   │
   ├─► PID file exists & process alive → Skip to step 5
   │
   └─► No server running:
       │
       4. Fork server process
          │
          Server: write PID file
          Server: create Unix socket
          Server: connect to Slack
   │
5. Client connects to Unix socket
   │
6. Client sends HookInput JSON
   │
7. Server receives request
   │
8. Server posts message to Slack with buttons
   │
9. User clicks Approve/Deny in Slack
   │
10. Server receives Slack action
    │
11. Server sends HookOutput to client via socket
    │
12. Client outputs JSON to stdout
    │
13. Client exits
    │
14. Claude Code receives approval/denial
```

### Stop Operation (`--stop`)

```
1. Find all claude-slack-hook processes via pgrep
   │
2. Kill each process with SIGTERM (excluding self)
   │
3. Clean up socket file
   │
4. Clean up PID file
   │
5. Report results and exit
```

## File Structure

```
src/
├── index.ts      # Entry point, CLI argument parsing, mode routing
├── client.ts     # Client logic: stdin reading, server forking, socket communication
├── server.ts     # Server logic: Unix socket server, Slack message handling
├── socket.ts     # Shared utilities: paths, PID file, socket helpers
├── logger.ts     # Pino logger configuration
└── types.ts      # TypeScript interfaces for hook I/O
```

## Key Types

```typescript
interface HookInput {
  hook_event_name: string;
  session_id: string;
  cwd: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  permission_mode?: string;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    decision: {
      behavior: 'allow' | 'deny';
      message: string;
    };
  };
}

interface PendingRequest {
  id: string;
  socket: net.Socket;
  hookInput: HookInput;
  slackChannel: string;
  slackTs: string;
}
```

## Install from Source

```bash
git clone https://github.com/neokn/claude-slack-hook.git ~/.claude/hooks/slack-approval
cd ~/.claude/hooks/slack-approval
bun install
bun run compile
```

## Development Commands

```bash
# Development mode (hot reload)
bun run dev

# Compile TypeScript
bun run build

# Compile to standalone binary
bun run compile

# Stop all running processes
bun run stop
```

## Run from Source

If you prefer not to use the compiled binary, run directly with Bun:

```bash
bun run ~/.claude/hooks/slack-approval/src/index.ts \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789
```

## Debugging

### Check running processes

```bash
ps aux | grep claude-slack-hook | grep -v grep
```

Expected output:
- 1 server process (`Ss` state, background)
- 0-N client processes (`S+` state, foreground, waiting for approval)

### Check PID file

```bash
cat $TMPDIR/claude-slack-approval/server.pid
```

### Check socket file

```bash
ls -la $TMPDIR/claude-slack-approval/
```

### View server logs

Server logs are written to stderr using Pino. In development:

```bash
bun run dev 2>&1 | bunx pino-pretty
```

### Manual stop

```bash
./dist/bin/claude-slack-hook --stop
```
