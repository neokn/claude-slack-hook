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
# Create directories
mkdir -p ~/.claude/hooks/slack-approval/dist/bin
mkdir -p ~/.claude/hooks/slack-approval/hook

# Download binary
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/claude-slack-hook \
  -o ~/.claude/hooks/slack-approval/dist/bin/claude-slack-hook
chmod +x ~/.claude/hooks/slack-approval/dist/bin/claude-slack-hook

# Download hook script
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/approval-hook.sh \
  -o ~/.claude/hooks/slack-approval/hook/approval-hook.sh
chmod +x ~/.claude/hooks/slack-approval/hook/approval-hook.sh
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
            "command": "~/.claude/hooks/slack-approval/hook/approval-hook.sh --bot-token xoxb-... --app-token xapp-... --user-id U..."
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
sh ~/.claude/hooks/slack-approval/hook/approval-hook.sh \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789 \
  --test
```

Sends a test message to Slack. Click confirm to exit.

### Parameters

| Parameter | Short | Required | Description |
|-----------|-------|----------|-------------|
| `--bot-token` | `-b` | ✓ | Bot User OAuth Token |
| `--app-token` | `-a` | ✓ | App-Level Token |
| `--user-id` | `-u` | ✓ | Slack User ID to receive DMs |
| `--port` | `-p` | | Service port (default: 4698) |
| `--log-level` | `-l` | | Log level (default: info) |
| `--test` | `-t` | | Test mode, exit after verification |

### Workflow

1. The approval service starts automatically when needed
2. When using Claude Code, tool operations send a DM to Slack for approval
3. Click **Approve** or **Deny** in Slack

## Troubleshooting

- **Service not running**: Falls back to local Claude Code confirmation
- **Check service status**: `curl http://localhost:4698/health`

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md)
