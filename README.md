# Claude Code Slack Approval Hook

Approve Claude Code PermissionRequest via Slack.

[繁體中文](./README_zh.md)

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/neokn/claude-slack-hook/main/install.sh | bash
```

### Manual Download

Download from [Releases](https://github.com/neokn/claude-slack-hook/releases) (macOS Apple Silicon only):

```bash
# Create directory
mkdir -p ~/.claude/hooks/slack-approval

# Download binary
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/claude-slack-hook \
  -o ~/.claude/hooks/slack-approval/claude-slack-hook
chmod +x ~/.claude/hooks/slack-approval/claude-slack-hook
```

## Slack App Setup

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Set App name (e.g., "Claude Approval") and Workspace
4. On the **Socket Mode** page:
   - Enable Socket Mode
   - Generate App-Level Token (check `connections:write`)
   - Copy the Token (format: `xapp-...`)
5. On the **OAuth & Permissions** page:
   - Add Bot Token Scopes: `chat:write`
   - Install App to Workspace
   - Copy Bot User OAuth Token (format: `xoxb-...`)

## Configure Claude Code Hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/slack-approval/claude-slack-hook --bot-token xoxb-... --app-token xapp-... --user-id U..."
          }
        ]
      }
    ]
  }
}
```

## Usage

### Test Connection

```bash
~/.claude/hooks/slack-approval/claude-slack-hook \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789 \
  --test
```

Sends a test message to Slack. Click confirm to exit.

### Stop Running Processes

```bash
~/.claude/hooks/slack-approval/claude-slack-hook --stop
```

Stops all running server processes and cleans up socket/PID files.

### Parameters

| Parameter | Short | Required | Description |
|-----------|-------|----------|-------------|
| `--bot-token` | `-b` | ✓ | Bot User OAuth Token |
| `--app-token` | `-a` | ✓ | App-Level Token |
| `--user-id` | `-u` | ✓ | Slack User ID to receive DMs |
| `--log-level` | `-l` | | Log level (default: info) |
| `--only-screen-lock` | | | Only send Slack notification when screen is locked |
| `--test` | | | Test mode, verify connection then exit |
| `--stop` | | | Stop all running processes |

### Workflow

1. Claude Code triggers the hook with a permission request
2. If `--only-screen-lock` is set and screen is not locked, skip Slack (use local confirmation)
3. The background server starts automatically on first request
4. The server sends a DM to Slack with Approve/Deny buttons
5. Click **Approve** or **Deny** in Slack
6. Claude Code receives the decision

## Troubleshooting

- **Service not running**: Falls back to local Claude Code confirmation
- **Check running processes**: `ps aux | grep claude-slack-hook`
- **Check socket file**: `ls -la $TMPDIR/claude-slack-approval/`
- **Stop all processes**: `~/.claude/hooks/slack-approval/claude-slack-hook --stop`

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md)
