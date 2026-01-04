import express, { type Request, type Response } from 'express';
import type { App as SlackApp } from '@slack/bolt';
import type { HookInput, HookOutput, PendingRequest } from './types.js';
import { randomUUID } from 'crypto';
import { logger } from './logger.js';

export function createServer(
  slackApp: SlackApp,
  slackUserId: string,
  port: number
) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Pending requests (id -> PendingRequest)
  const pending = new Map<string, PendingRequest>();

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', pending: pending.size });
  });

  // Approval request (SSE)
  app.post('/approve', async (req: Request, res: Response) => {
    const hookInput = req.body as HookInput;
    const id = randomUUID().slice(0, 8);

    logger.info({ id, hookInput }, 'Received approval request');

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send Slack message
    try {
      // PermissionRequest may not have tool_name, show event type instead
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

      // Store pending request (use result.channel because DM channel is D... not U...)
      pending.set(id, { id, res, hookInput, slackChannel: result.channel!, slackTs: result.ts! });

      // Clean up when client disconnects
      req.on('close', () => {
        pending.delete(id);
      });

    } catch (error) {
      logger.error({ error, id }, 'Slack error');
      const output = makeOutput(hookInput, 'deny', `Slack error: ${error}`);
      res.write(`event: result\ndata: ${JSON.stringify(output)}\n\n`);
      res.end();
    }
  });

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
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `✅ *Allowed* by <@${(body as any).user.id}>` } }],
    });

    // Send result
    const output = makeOutput(req.hookInput, 'allow', 'Allowed via Slack');
    req.res.write(`event: result\ndata: ${JSON.stringify(output)}\n\n`);
    req.res.end();
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
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `❌ *Denied* by <@${(body as any).user.id}>` } }],
    });

    // Send result
    const output = makeOutput(req.hookInput, 'deny', 'Denied via Slack');
    req.res.write(`event: result\ndata: ${JSON.stringify(output)}\n\n`);
    req.res.end();
    pending.delete(value);
  });

  return app.listen(port, () => {
    logger.info({ port }, 'Approval server started');
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
