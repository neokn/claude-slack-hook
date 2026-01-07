import { spawn, execFileSync } from 'child_process';
import type { HookInput } from './types.js';
import { getRunningServerPid, sendRequest } from './socket.js';

/**
 * Read JSON input from stdin
 */
export async function readStdin(): Promise<HookInput> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(input) as HookInput;
}

/**
 * Check if macOS screen is locked
 * Returns true if screen is locked, false otherwise
 */
export function isScreenLocked(): boolean {
  try {
    // Step 1: Get system info via ioreg (no shell needed)
    const ioregOutput = execFileSync('/usr/sbin/ioreg', ['-n', 'Root', '-d1', '-a'], {
      encoding: 'utf-8',
      timeout: 2000,
    });

    // Step 2: Parse plist with PlistBuddy
    const result = execFileSync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'print :IOConsoleUsers:0:CGSSessionScreenIsLocked', '/dev/stdin'],
      {
        encoding: 'utf-8',
        timeout: 2000,
        input: ioregOutput,
      }
    ).trim();

    return result === 'true';
  } catch {
    // If check fails, assume not locked (allow operation)
    return false;
  }
}

/**
 * Fork the current process as a background server
 */
export async function forkServer(args: string[]): Promise<boolean> {
  const execPath = process.execPath;
  const scriptPath = process.argv[1];

  // If running as compiled binary, execPath is the binary itself
  // If running via bun/node, we need to include the script path
  const spawnArgs = scriptPath ? [scriptPath, ...args] : args;

  const child = spawn(execPath, spawnArgs, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      __CLAUDE_SLACK_SERVER__: '1', // Internal marker for server mode
    },
  });

  child.unref();

  // Wait for server to be ready (max 10 seconds)
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (getRunningServerPid() !== null) {
      return true;
    }
  }

  return false;
}

/**
 * Main client logic
 */
export async function runClient(
  args: string[],
  options: { onlyScreenLock: boolean }
): Promise<void> {
  // Read input from stdin
  const input = await readStdin();

  // If --only-screen-lock is set, only send notifications when screen is locked
  if (options.onlyScreenLock && !isScreenLocked()) {
    // Screen not locked, silently exit (let Claude Code handle it)
    process.exit(0);
  }

  // Ensure server is running (check PID file)
  if (getRunningServerPid() === null) {
    const started = await forkServer(args);
    if (!started) {
      // Failed to start server, silently exit
      process.exit(0);
    }
  }

  // Send request and wait for response
  const result = await sendRequest(input);

  if (result) {
    // Output result to stdout for Claude Code
    console.log(JSON.stringify(result));
  }

  // Exit (don't wait for anything else)
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
