/**
 * Claude Code Hook input structure
 * PermissionRequest: session_id, transcript_path, cwd, permission_mode, hook_event_name
 * PreToolUse: above fields + tool_name, tool_input
 */
export interface HookInput {
  session_id: string;
  hook_event_name: string;
  cwd: string;
  transcript_path?: string;
  permission_mode?: string;
  // PreToolUse specific
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/**
 * Hook output structure (PermissionRequest format)
 */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    decision: {
      behavior: 'allow' | 'deny';
      message?: string;
    };
  };
}

/**
 * Pending socket connection
 */
export interface PendingRequest {
  id: string;
  socket: import('net').Socket;
  hookInput: HookInput;
  slackChannel: string;
  slackTs: string;
}
