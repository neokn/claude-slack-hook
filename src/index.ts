import { App } from '@slack/bolt';
import { createServer } from './server.js';
import { initLogger } from './logger.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const config: Record<string, string> = {};
  let testMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--test' || arg === '-t') {
      testMode = true;
      continue;
    }
    const key = arg?.replace(/^--?/, '');
    const value = args[i + 1];
    if (key && value && !value.startsWith('-')) {
      config[key] = value;
      i++; // skip next arg since it's the value
    }
  }

  const botToken = config['bot-token'] || config['b'];
  const appToken = config['app-token'] || config['a'];
  const userId = config['user-id'] || config['u'];
  const port = parseInt(config['port'] || config['p'] || '4698', 10);
  const logLevel = config['log-level'] || config['l'] || 'info';

  if (!botToken || !appToken || !userId) {
    console.error(`Usage: node dist/index.js \\
  --bot-token <xoxb-...> \\
  --app-token <xapp-...> \\
  --user-id <U...> \\
  [--port <number>] \\
  [--test]`);
    process.exit(1);
  }

  return { botToken, appToken, userId, port, logLevel, testMode };
}

const { botToken, appToken, userId, port, logLevel, testMode } = parseArgs();
const logger = initLogger(logLevel);

const slackApp = new App({
  token: botToken,
  appToken: appToken,
  socketMode: true,
});

async function runTest() {
  await slackApp.start();
  logger.info('Testing Slack connection...');

  // Send test message
  const result = await slackApp.client.chat.postMessage({
    channel: userId,
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

  logger.info('Test message sent, waiting for response...');

  // Wait for button click
  slackApp.action('test_confirm', async ({ ack, client }) => {
    await ack();

    // Update message (use result.channel because DM channel is D... not U...)
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

    logger.info('Test passed! Slack configuration is correct.');
    process.exit(0);
  });
}

async function main() {
  await slackApp.start();
  logger.info({ port, userId }, 'Slack approval server started');
  createServer(slackApp, userId, port);
}

if (testMode) {
  runTest().catch((err) => {
    logger.error(err, 'Test failed');
    process.exit(1);
  });
} else {
  main().catch((err) => logger.error(err, 'Fatal error'));
}
