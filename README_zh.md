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
mkdir -p ~/.claude/hooks/slack-approval

# 下載 binary
curl -fsSL https://github.com/neokn/claude-slack-hook/releases/latest/download/claude-slack-hook \
  -o ~/.claude/hooks/slack-approval/claude-slack-hook
chmod +x ~/.claude/hooks/slack-approval/claude-slack-hook
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
            "command": "~/.claude/hooks/slack-approval/claude-slack-hook --bot-token xoxb-... --app-token xapp-... --user-id U..."
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
~/.claude/hooks/slack-approval/claude-slack-hook \
  --bot-token xoxb-xxx \
  --app-token xapp-xxx \
  --user-id U0123456789 \
  --test
```

會發送測試訊息到 Slack，點擊確認後自動結束。

### 停止執行中的程序

```bash
~/.claude/hooks/slack-approval/claude-slack-hook --stop
```

停止所有執行中的服務程序並清理 socket/PID 檔案。

### 參數說明

| 參數 | 短參數 | 必填 | 說明 |
|------|--------|------|------|
| `--bot-token` | `-b` | ✓ | Bot User OAuth Token |
| `--app-token` | `-a` | ✓ | App-Level Token |
| `--user-id` | `-u` | ✓ | 接收 DM 的 Slack User ID |
| `--log-level` | `-l` | | 記錄等級（預設 info） |
| `--only-screen-lock` | | | 僅在螢幕鎖定時發送 Slack 通知 |
| `--test` | | | 測試模式，驗證連線後結束 |
| `--stop` | | | 停止所有執行中的程序 |

### 工作流程

1. Claude Code 觸發 hook 進行權限請求
2. 若設定 `--only-screen-lock` 且螢幕未鎖定，則跳過 Slack（使用本機確認）
3. 背景服務會在首次請求時自動啟動
4. 服務發送 DM 到 Slack，包含 Approve/Deny 按鈕
5. 在 Slack 點擊 **Approve** 或 **Deny** 按鈕
6. Claude Code 接收審核結果

## 疑難排解

- **服務未執行**：會退回本機 Claude Code 確認
- **檢查執行中的程序**：`ps aux | grep claude-slack-hook`
- **檢查 socket 檔案**：`ls -la $TMPDIR/claude-slack-approval/`
- **停止所有程序**：`~/.claude/hooks/slack-approval/claude-slack-hook --stop`

## 開發

請參考 [DEVELOPMENT.md](./DEVELOPMENT.md)
