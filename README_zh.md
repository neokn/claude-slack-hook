# Claude Code Slack Approval Hook

透過 Slack 審核 Claude Code 的 PermissionRequest。

[English](./README.md)

## 安裝

### 快速安裝（推薦）

```bash
curl -fsSL https://raw.githubusercontent.com/neokn/claude-slack-hook/main/install.sh | bash
```

### 自行下載

從 [Releases](https://github.com/neokn/claude-slack-hook/releases) 下載（僅支援 macOS Apple Silicon）：

```bash
# 建立目錄
mkdir -p ~/.claude/hooks/slack-approval/dist/bin
mkdir -p ~/.claude/hooks/slack-approval/hook

# 下載 binary
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/claude-slack-hook \
  -o ~/.claude/hooks/slack-approval/dist/bin/claude-slack-hook
chmod +x ~/.claude/hooks/slack-approval/dist/bin/claude-slack-hook

# 下載 hook script
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/approval-hook.sh \
  -o ~/.claude/hooks/slack-approval/hook/approval-hook.sh
chmod +x ~/.claude/hooks/slack-approval/hook/approval-hook.sh
```

## 設定 Slack App

1. 前往 https://api.slack.com/apps
2. 點擊 "Create New App" → "From scratch"
3. 設定 App 名稱（如 "Claude Approval"）和 Workspace
4. 在 **Socket Mode** 頁面：
   - 啟用 Socket Mode
   - 產生 App-Level Token（勾選 `connections:write`）
   - 複製 Token（格式：`xapp-...`）
5. 在 **OAuth & Permissions** 頁面：
   - 加入 Bot Token Scopes：`chat:write`
   - 安裝 App 到 Workspace
   - 複製 Bot User OAuth Token（格式：`xoxb-...`）

## 設定 Claude Code Hook

在 `~/.claude/settings.json` 加入：

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

## 使用

### 測試連線

```bash
sh ~/.claude/hooks/slack-approval/hook/approval-hook.sh \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789 \
  --test
```

會發送測試訊息到 Slack，點擊確認後自動結束。

### 參數說明

| 參數 | 短參數 | 必填 | 說明 |
|------|--------|------|------|
| `--bot-token` | `-b` | ✓ | Bot User OAuth Token |
| `--app-token` | `-a` | ✓ | App-Level Token |
| `--user-id` | `-u` | ✓ | 接收 DM 的 Slack User ID |
| `--port` | `-p` | | 服務端口（預設 4698） |
| `--log-level` | `-l` | | 日誌等級（預設 info） |
| `--test` | `-t` | | 測試模式，驗證連線後退出 |

### 工作流程

1. 檢查螢幕是否上鎖 - 若未上鎖則跳過 Slack 審核（使用本地確認）
2. 審核服務會在需要時自動啟動
3. 使用 Claude Code 時，工具操作會發送 DM 到 Slack 等待審核
4. 在 Slack 點擊 **Approve** 或 **Deny** 按鈕

## 故障排除

- **服務未運行**：會回退到本地 Claude Code 確認
- **檢查服務狀態**：`curl http://localhost:4698/health`

## 開發

請參考 [DEVELOPMENT.md](./DEVELOPMENT.md)
