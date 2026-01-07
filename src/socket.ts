import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { HookInput, HookOutput } from './types.js';

// Socket path - use tmpdir for cross-platform compatibility
const SOCKET_DIR = path.join(os.tmpdir(), 'claude-slack-approval');
const SOCKET_NAME = 'approval.sock';
const PID_NAME = 'server.pid';

export function getSocketPath(): string {
  return path.join(SOCKET_DIR, SOCKET_NAME);
}

export function getPidPath(): string {
  return path.join(SOCKET_DIR, PID_NAME);
}

export function ensureSocketDir(): void {
  if (!fs.existsSync(SOCKET_DIR)) {
    fs.mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 });
  }
}

export function cleanupSocket(): void {
  const socketPath = getSocketPath();
  if (fs.existsSync(socketPath)) {
    fs.unlinkSync(socketPath);
  }
}

/**
 * Write current process PID to file
 */
export function writePidFile(): void {
  ensureSocketDir();
  fs.writeFileSync(getPidPath(), process.pid.toString(), { mode: 0o600 });
}

/**
 * Remove PID file
 */
export function cleanupPidFile(): void {
  const pidPath = getPidPath();
  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}

/**
 * Check if a process with given PID is running (POSIX standard)
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if server is running by PID file (standard Unix daemon pattern)
 * Returns the PID if running, null if not
 */
export function getRunningServerPid(): number | null {
  const pidPath = getPidPath();

  if (!fs.existsSync(pidPath)) {
    return null;
  }

  try {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf-8').trim(), 10);
    if (isNaN(pid)) {
      cleanupPidFile();
      return null;
    }

    if (isProcessRunning(pid)) {
      return pid;
    }

    // Stale PID file (process died), clean up
    cleanupPidFile();
    cleanupSocket();
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if server is running by trying to connect to socket
 */
export async function isServerRunning(): Promise<boolean> {
  const socketPath = getSocketPath();

  if (!fs.existsSync(socketPath)) {
    return false;
  }

  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Send request to server via Unix socket and wait for response
 */
export async function sendRequest(input: HookInput): Promise<HookOutput | null> {
  const socketPath = getSocketPath();

  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    let data = '';

    // Timeout after 5 minutes (approval might take a while)
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 5 * 60 * 1000);

    socket.on('connect', () => {
      // Send request as JSON followed by newline delimiter
      socket.write(JSON.stringify(input) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
      // Check for complete message (ends with newline)
      if (data.endsWith('\n')) {
        clearTimeout(timeout);
        try {
          const result = JSON.parse(data.trim()) as HookOutput;
          resolve(result);
        } catch {
          resolve(null);
        }
        socket.end();
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    socket.on('close', () => {
      clearTimeout(timeout);
      // If we got data but didn't parse it yet, try now
      if (data && !data.endsWith('\n')) {
        try {
          resolve(JSON.parse(data) as HookOutput);
        } catch {
          resolve(null);
        }
      }
    });
  });
}
