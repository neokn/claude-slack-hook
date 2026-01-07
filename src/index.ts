// Early debug check (before imports) - only log if --log-level debug or -l debug
const IS_DEBUG = process.argv.includes('debug') &&
  (process.argv.includes('--log-level') || process.argv.includes('-l'));
const debug = (msg: string) => IS_DEBUG && process.stderr.write(`[DEBUG] ${msg}\n`);

debug('Starting...');

import { execFileSync } from 'child_process';
import { App, LogLevel } from '@slack/bolt';
import { createServer, setupSlackActions } from './server.js';
import { initLogger } from './logger.js';
import { runClient } from './client.js';
import { cleanupSocket, cleanupPidFile } from './socket.js';
import type { PendingRequest } from './types.js';

debug('Imports loaded');

// Internal marker for forked server process (not user-facing)
const IS_FORKED_SERVER = process.env['__CLAUDE_SLACK_SERVER__'] === '1';

interface Config {
  botToken: string;
  appToken: string;
  userId: string;
  logLevel: string;
  testMode: boolean;
  stopMode: boolean;
  onlyScreenLock: boolean;
  rawArgs: string[];
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  let testMode = false;
  let stopMode = false;
  let onlyScreenLock = false; // Default: always send notifications
  const rawArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Boolean flags (no short aliases, no values)
    if (arg === '--test') {
      testMode = true;
      continue;
    }

    if (arg === '--stop') {
      stopMode = true;
      continue;
    }

    if (arg === '--only-screen-lock') {
      onlyScreenLock = true;
      rawArgs.push(arg);
      continue;
    }

    if (!arg) continue;
    const key = arg.replace(/^--?/, '');
    const value = args[i + 1];
    if (key && value && !value.startsWith('-')) {
      config[key] = value;
      rawArgs.push(arg, value);
      i++;
    }
  }

  const botToken = config['bot-token'] || config['b'] || '';
  const appToken = config['app-token'] || config['a'] || '';
  const userId = config['user-id'] || config['u'] || '';
  const logLevel = config['log-level'] || config['l'] || 'info';

  return {
    botToken,
    appToken,
    userId,
    logLevel,
    testMode,
    stopMode,
    onlyScreenLock,
    rawArgs,
  };
}

debug('Parsing args...');
const config = parseArgs();
debug('Config: ' + JSON.stringify(config));
const logger = initLogger(config.logLevel);
debug('Logger initialized');

// Test mode: verify Slack connection
async function runTest() {
  if (!config.botToken || !config.appToken || !config.userId) {
    console.error(`Usage: claude-slack-hook --bot-token <xoxb-...> --app-token <xapp-...> --user-id <U...> --test`);
    process.exit(1);
  }

  console.log('🔌 Connecting to Slack (Socket Mode)...');
  console.log('   If this hangs, check that:');
  console.log('   1. Socket Mode is enabled in your Slack app settings');
  console.log('   2. Your app token (xapp-...) is valid and has connections:write scope');
  console.log('');

  const slackApp = new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
    logLevel: LogLevel.DEBUG,
  });

  // Add timeout for connection attempt
  const CONNECTION_TIMEOUT = 15000; // 15 seconds
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT / 1000}s`));
    }, CONNECTION_TIMEOUT);
  });

  try {
    await Promise.race([slackApp.start(), timeoutPromise]);
  } catch (error: any) {
    console.error('❌ Failed to connect to Slack');
    console.error('');

    const errMsg = error?.message || String(error);
    const errCode = error?.code || error?.data?.error;

    if (errCode === 'invalid_auth' || errMsg.includes('invalid_auth')) {
      console.error('   Error: Invalid authentication');
      console.error('   → Check that your bot token (xoxb-...) is correct');
    } else if (errCode === 'not_allowed_token_type' || errMsg.includes('not_allowed_token_type')) {
      console.error('   Error: Wrong token type');
      console.error('   → Make sure you\'re using an App-Level Token (xapp-...) not a Bot Token');
    } else if (errMsg.includes('timeout')) {
      console.error('   Error: Connection timeout');
      console.error('   → Socket Mode may not be enabled in your Slack app');
      console.error('   → Go to: https://api.slack.com/apps → Your App → Socket Mode → Enable');
    } else {
      console.error('   Error:', errMsg);
      if (errCode) console.error('   Code:', errCode);
    }

    console.error('');
    console.error('   Troubleshooting:');
    console.error('   1. Go to https://api.slack.com/apps and select your app');
    console.error('   2. Click "Socket Mode" in the left sidebar');
    console.error('   3. Ensure "Enable Socket Mode" is toggled ON');
    console.error('   4. Under "App-Level Tokens", verify your token has connections:write scope');

    process.exit(1);
  }

  console.log('✅ Connected to Slack!');
  logger.info('Testing Slack connection...');

  const result = await slackApp.client.chat.postMessage({
    channel: config.userId,
    text: '🧪 Slack Approval Connection Test',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🧪 Connection Test', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: 'Click any button to confirm connection is working' },
      },
      {
        type: 'actions',
        block_id: 'test_action',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Confirm', emoji: true },
            style: 'primary',
            action_id: 'test_confirm',
          },
        ],
      },
    ],
  });

  console.log('📨 Test message sent to Slack!');
  console.log('👆 Please click the "✅ Confirm" button in Slack to complete the test...');
  console.log('');

  slackApp.action('test_confirm', async ({ ack, client }) => {
    await ack();

    await client.chat.update({
      channel: result.channel!,
      ts: result.ts!,
      text: '✅ Test Successful',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '✅ *Connection test passed!* Slack configuration is correct.' },
        },
      ],
    });

    console.log('');
    console.log('🎉 Test passed! Slack configuration is correct.');
    console.log('   You can now use this hook with Claude Code.');
    process.exit(0);
  });
}

// Stop mode: kill all running processes and cleanup
function runStop() {
  console.log('🛑 Stopping claude-slack-hook processes...');

  const currentPid = process.pid;
  let killedCount = 0;

  // Find all claude-slack-hook processes using pgrep
  try {
    const pgrepOutput = execFileSync('/usr/bin/pgrep', ['-f', 'claude-slack-hook'], {
      encoding: 'utf-8',
    }).trim();

    const pids = pgrepOutput
      .split('\n')
      .map((p) => parseInt(p, 10))
      .filter((pid) => !isNaN(pid) && pid !== currentPid);

    // Kill each process individually
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
        killedCount++;
      } catch {
        // Process might have already exited
      }
    }
  } catch {
    // pgrep returns non-zero if no processes found - that's OK
  }

  // Cleanup socket and PID files
  try {
    cleanupSocket();
    cleanupPidFile();
    console.log('🧹 Socket and PID files cleaned up');
  } catch {
    // Files might not exist
  }

  if (killedCount > 0) {
    console.log(`✅ Killed ${killedCount} process(es)`);
  } else {
    console.log('ℹ️  No running processes found');
  }

  process.exit(0);
}

// Server mode: run Unix socket server + Slack (called internally by forked process)
async function runServer() {
  if (!config.botToken || !config.appToken || !config.userId) {
    logger.error('Missing required Slack configuration');
    process.exit(1);
  }

  const slackApp = new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
  });

  const pending = new Map<string, PendingRequest>();
  setupSlackActions(slackApp, pending);

  await slackApp.start();
  logger.info({ userId: config.userId }, 'Slack connection established');

  createServer(slackApp, config.userId, pending);
}

// Main entry point
async function main() {
  // Stop mode (explicit --stop flag)
  if (config.stopMode) {
    runStop();
    return;
  }

  // Test mode (explicit --test flag)
  if (config.testMode) {
    await runTest();
    return;
  }

  // Forked server process (internal)
  if (IS_FORKED_SERVER) {
    await runServer();
    return;
  }

  // Default: client mode (hook triggered by Claude Code)
  // Client will fork a server if needed
  await runClient(config.rawArgs, {
    onlyScreenLock: config.onlyScreenLock,
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
