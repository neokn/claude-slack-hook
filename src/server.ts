import * as net from 'net';
import type { App as SlackApp } from '@slack/bolt';
import type { HookInput, HookOutput, PendingRequest } from './types.js';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';
import { getSocketPath, ensureSocketDir, cleanupSocket, writePidFile, cleanupPidFile } from './socket.js';

export function createServer(
  slackApp: SlackApp,
  slackUserId: string,
  pending: Map<string, PendingRequest>
) {
  // Ensure socket directory exists and clean up old socket
  ensureSocketDir();
  cleanupSocket();

  // Write PID file (standard Unix daemon pattern)
  writePidFile();

  const socketPath = getSocketPath();

  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', async (chunk) => {
      buffer += chunk.toString();

      // Check for complete message (newline-delimited)
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;

      const message = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      try {
        const hookInput = JSON.parse(message) as HookInput;
        await handleRequest(hookInput, socket, slackApp, slackUserId, pending);
      } catch (error) {
        logger.error({ error }, 'Failed to parse request');
        const output: HookOutput = {
          hookSpecificOutput: {
            hookEventName: 'unknown',
            decision: { behavior: 'deny', message: 'Parse error' },
          },
        };
        socket.write(JSON.stringify(output) + '\n');
        socket.end();
      }
    });

    socket.on('error', (error) => {
      logger.debug({ error }, 'Socket error');
    });
  });

  // Handle server errors
  server.on('error', (error) => {
    logger.error({ error }, 'Server error');
    process.exit(1);
  });

  // Cleanup on exit
  const cleanup = () => {
    cleanupSocket();
    cleanupPidFile();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  server.listen(socketPath, () => {
    logger.info({ socketPath }, 'Unix socket server started');
  });

  return server;
}

async function handleRequest(
  hookInput: HookInput,
  socket: net.Socket,
  slackApp: SlackApp,
  slackUserId: string,
  pending: Map<string, PendingRequest>
) {
  const id = randomUUID().slice(0, 8);
  logger.info({ id, hookInput }, 'Received approval request');

  try {
    // Build Slack message
    const title = hookInput.tool_name || hookInput.hook_event_name || 'Permission Request';
    const details = hookInput.tool_input
      ? JSON.stringify(hookInput.tool_input, null, 2)
      : `Session: ${hookInput.session_id}\nMode: ${hookInput.permission_mode || 'default'}`;

    const result = await slackApp.client.chat.postMessage({
      channel: slackUserId,
      text: `Approval Request: ${title}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '🔐 Claude Code Approval Request', emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Type:*\n\`${title}\`` },
            { type: 'mrkdwn', text: `*Directory:*\n\`${hookInput.cwd}\`` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Details:*\n\`\`\`${details.slice(0, 2500)}\`\`\`` },
        },
        {
          type: 'actions',
          block_id: `approval_${id}`,
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Allow', emoji: true },
              style: 'primary',
              action_id: 'approve',
              value: id,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Deny', emoji: true },
              style: 'danger',
              action_id: 'deny',
              value: id,
            },
          ],
        },
      ],
    });

    // Store pending request
    pending.set(id, {
      id,
      socket,
      hookInput,
      slackChannel: result.channel!,
      slackTs: result.ts!,
    });

    // Clean up if client disconnects
    socket.on('close', () => {
      pending.delete(id);
    });
  } catch (error) {
    logger.error({ error, id }, 'Slack error');
    const output = makeOutput(hookInput, 'deny', `Slack error: ${error}`);
    socket.write(JSON.stringify(output) + '\n');
    socket.end();
  }
}

export function setupSlackActions(
  slackApp: SlackApp,
  pending: Map<string, PendingRequest>
) {
  // Slack action: allow
  slackApp.action('approve', async ({ body, ack, client }) => {
    await ack();
    const value = (body as any).actions[0].value;
    const req = pending.get(value);
    if (!req) return;

    // Update Slack message
    await client.chat.update({
      channel: req.slackChannel,
      ts: req.slackTs,
      text: '✅ Allowed',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `✅ *Allowed* by <@${(body as any).user.id}>` },
        },
      ],
    });

    // Send result via socket
    const output = makeOutput(req.hookInput, 'allow', 'Allowed via Slack');
    req.socket.write(JSON.stringify(output) + '\n');
    req.socket.end();
    pending.delete(value);
  });

  // Slack action: deny
  slackApp.action('deny', async ({ body, ack, client }) => {
    await ack();
    const value = (body as any).actions[0].value;
    const req = pending.get(value);
    if (!req) return;

    // Update Slack message
    await client.chat.update({
      channel: req.slackChannel,
      ts: req.slackTs,
      text: '❌ Denied',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `❌ *Denied* by <@${(body as any).user.id}>` },
        },
      ],
    });

    // Send result via socket
    const output = makeOutput(req.hookInput, 'deny', 'Denied via Slack');
    req.socket.write(JSON.stringify(output) + '\n');
    req.socket.end();
    pending.delete(value);
  });
}

function makeOutput(input: HookInput, behavior: 'allow' | 'deny', message: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      decision: { behavior, message },
    },
  };
}
