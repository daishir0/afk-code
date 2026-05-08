/**
 * JSONL parser utilities for /rewind and /fork commands.
 * Parses Claude Code conversation JSONL files into turns,
 * and provides backup/truncation helpers.
 */

import { createReadStream, createWriteStream } from 'fs';
import { writeFile, copyFile } from 'fs/promises';
import { createInterface } from 'readline';

export interface ParsedTurn {
  turnNumber: number;       // 1-indexed
  userMessage: string;      // Display text (truncated to 80 chars)
  timestamp: string;        // ISO timestamp
  startLineIndex: number;   // JSONL line index (0-based)
  endLineIndex: number;     // Last line of this turn (inclusive)
  toolCalls: string[];      // Tool names used in this turn
}

/**
 * Parse a JSONL file into turns using streaming to avoid OOM on large files.
 * Turn boundary: type:"user" with string content (not tool_result arrays).
 * Meta lines (isMeta, subtype, file-history-snapshot) are not turn boundaries.
 */
export function parseJsonlTurns(jsonlPath: string): Promise<ParsedTurn[]> {
  return new Promise((resolve, reject) => {
    const turns: ParsedTurn[] = [];
    let currentTurn: ParsedTurn | null = null;
    let lineIndex = 0;

    const rl = createInterface({
      input: createReadStream(jsonlPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) {
        lineIndex++;
        return;
      }

      let data: any;
      try {
        data = JSON.parse(line);
      } catch {
        lineIndex++;
        return;
      }

      const i = lineIndex;

      // Skip meta lines
      if (data.isMeta || data.subtype || data.type === 'file-history-snapshot') {
        if (currentTurn) currentTurn.endLineIndex = i;
        lineIndex++;
        return;
      }

      // Check for user turn boundary
      if (data.type === 'user') {
        const content = data.message?.content;
        if (typeof content === 'string') {
          if (currentTurn) {
            turns.push(currentTurn);
          }

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
          lineIndex++;
          return;
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

      if (currentTurn) {
        currentTurn.endLineIndex = i;
      }
      lineIndex++;
    });

    rl.on('close', () => {
      if (currentTurn) turns.push(currentTurn);
      resolve(turns);
    });

    rl.on('error', reject);
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
 * Uses streaming to avoid OOM on large files.
 */
export async function truncateJsonlToLine(path: string, endLineIndex: number): Promise<void> {
  const lines = await readLinesUpTo(path, endLineIndex);
  await writeFile(path, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Copy a JSONL file truncated to endLineIndex into a new destination.
 * Uses streaming to avoid OOM on large files.
 */
export async function copyJsonlTruncated(
  src: string,
  dest: string,
  endLineIndex: number
): Promise<void> {
  const lines = await readLinesUpTo(src, endLineIndex);
  await writeFile(dest, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Stream-read a JSONL file and return lines up to endLineIndex (inclusive).
 */
function readLinesUpTo(filePath: string, endLineIndex: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const result: string[] = [];
    let lineIndex = 0;

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      if (!line.trim()) {
        lineIndex++;
        return;
      }
      if (lineIndex <= endLineIndex) {
        result.push(line);
      }
      if (lineIndex >= endLineIndex) {
        rl.close();
      }
      lineIndex++;
    });

    rl.on('close', () => resolve(result));
    rl.on('error', reject);
  });
}
