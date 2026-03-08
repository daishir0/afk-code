/**
 * JSONL parser utilities for /rewind and /fork commands.
 * Parses Claude Code conversation JSONL files into turns,
 * and provides backup/truncation helpers.
 */

import { readFile, writeFile, copyFile } from 'fs/promises';

export interface ParsedTurn {
  turnNumber: number;       // 1-indexed
  userMessage: string;      // Display text (truncated to 80 chars)
  timestamp: string;        // ISO timestamp
  startLineIndex: number;   // JSONL line index (0-based)
  endLineIndex: number;     // Last line of this turn (inclusive)
  toolCalls: string[];      // Tool names used in this turn
}

/**
 * Parse a JSONL file into turns.
 * Turn boundary: type:"user" with string content (not tool_result arrays).
 * Meta lines (isMeta, subtype, file-history-snapshot) are not turn boundaries.
 */
export function parseJsonlTurns(jsonlPath: string): Promise<ParsedTurn[]> {
  return readFile(jsonlPath, 'utf-8').then((content) => {
    const lines = content.split('\n').filter(Boolean);
    const turns: ParsedTurn[] = [];
    let currentTurn: ParsedTurn | null = null;

    for (let i = 0; i < lines.length; i++) {
      let data: any;
      try {
        data = JSON.parse(lines[i]);
      } catch {
        continue;
      }

      // Skip meta lines
      if (data.isMeta || data.subtype || data.type === 'file-history-snapshot') {
        // Still extend current turn's endLineIndex
        if (currentTurn) currentTurn.endLineIndex = i;
        continue;
      }

      // Check for user turn boundary
      if (data.type === 'user') {
        const content = data.message?.content;
        // Only string content is a turn boundary (not tool_result arrays)
        if (typeof content === 'string') {
          // Finalize previous turn
          if (currentTurn) {
            turns.push(currentTurn);
          }

          // Extract display text
          const cleanContent = content
            .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
            .trim();
          const userMessage = cleanContent.length > 80
            ? cleanContent.substring(0, 77) + '...'
            : cleanContent;

          currentTurn = {
            turnNumber: turns.length + 1,
            userMessage,
            timestamp: data.timestamp || new Date().toISOString(),
            startLineIndex: i,
            endLineIndex: i,
            toolCalls: [],
          };
          continue;
        }
      }

      // Collect tool calls from assistant messages
      if (data.type === 'assistant' && currentTurn) {
        const msgContent = data.message?.content;
        if (Array.isArray(msgContent)) {
          for (const block of msgContent) {
            if (block.type === 'tool_use' && block.name) {
              if (!currentTurn.toolCalls.includes(block.name)) {
                currentTurn.toolCalls.push(block.name);
              }
            }
          }
        }
      }

      // Extend current turn's endLineIndex
      if (currentTurn) {
        currentTurn.endLineIndex = i;
      }
    }

    // Push final turn
    if (currentTurn) {
      turns.push(currentTurn);
    }

    return turns;
  });
}

/**
 * Create a backup of the JSONL file with timestamp suffix.
 */
export async function backupJsonl(path: string): Promise<string> {
  const timestamp = Date.now();
  const backupPath = `${path}.bak.${timestamp}`;
  await copyFile(path, backupPath);
  return backupPath;
}

/**
 * Truncate a JSONL file to include only lines up to endLineIndex (inclusive).
 */
export async function truncateJsonlToLine(path: string, endLineIndex: number): Promise<void> {
  const content = await readFile(path, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const truncated = lines.slice(0, endLineIndex + 1).join('\n') + '\n';
  await writeFile(path, truncated, 'utf-8');
}

/**
 * Copy a JSONL file truncated to endLineIndex into a new destination.
 */
export async function copyJsonlTruncated(
  src: string,
  dest: string,
  endLineIndex: number
): Promise<void> {
  const content = await readFile(src, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const truncated = lines.slice(0, endLineIndex + 1).join('\n') + '\n';
  await writeFile(dest, truncated, 'utf-8');
}
