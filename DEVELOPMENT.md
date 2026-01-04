# Development Guide

Build and develop Claude Code Slack Approval Hook from source.

## Architecture

```
Claude Code Hook → HTTP → Slack Bolt (Socket Mode) → Slack
```

## Install from Source

```bash
git clone https://github.com/neokn/claude-slack-hook.git ~/.claude/hooks/slack-approval
cd ~/.claude/hooks/slack-approval
bun install
bun run build
bun run compile  # Compile to binary
```

## Development Commands

```bash
# Development mode (hot reload)
bun run dev

# Compile TypeScript
bun run build

# Compile to standalone binary
bun run compile
```

## Run from Source

If you prefer not to use the compiled binary, run directly with Bun:

```bash
bun run ~/.claude/hooks/slack-approval/src/index.ts \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789
```

## Project Structure

```
.
├── src/              # TypeScript source code
├── dist/             # Compiled JavaScript
├── dist/bin/         # Compiled binary
├── hook/             # Hook shell script
└── .github/          # GitHub Actions workflows
```
