import path from 'node:path';
import { appendFile, writeFile } from 'node:fs/promises';
import { ensureDir } from './fs.js';

export type CheckpointStatus = 'START' | 'OK' | 'OK_WITH_FALLBACK' | 'WARN' | 'FAIL' | 'SKIP' | 'INFO' | 'ERROR';

export interface CheckpointEvent {
  seq: number;
  timestamp: string;
  checkpoint: string;
  status: CheckpointStatus;
  message?: string;
  details?: Record<string, unknown>;
  durationMs?: number;
}

export class DebugLogger {
  private seq = 0;
  private readonly events: CheckpointEvent[] = [];
  private readonly jsonPath: string;
  private readonly jsonlPath: string;
  private readonly timelinePath: string;
  private startedAt = Date.now();

  constructor(private readonly debugDir: string, private readonly consoleEnabled = true) {
    this.jsonPath = path.join(debugDir, 'acquisition-debug.json');
    this.jsonlPath = path.join(debugDir, 'acquisition-debug.jsonl');
    this.timelinePath = path.join(debugDir, 'acquisition-timeline.txt');
  }

  async init(meta: Record<string, unknown>) {
    await ensureDir(this.debugDir);
    this.startedAt = Date.now();
    this.events.length = 0;
    await writeFile(this.jsonlPath, '', 'utf8');
    await writeFile(this.timelinePath, '', 'utf8');
    await this.emit('RUN', 'START', 'Acquisition started', meta);
  }

  async emit(checkpoint: string, status: CheckpointStatus, message?: string, details?: Record<string, unknown>, durationMs?: number) {
    const event: CheckpointEvent = {
      seq: ++this.seq,
      timestamp: new Date().toISOString(),
      checkpoint,
      status,
      ...(message ? { message } : {}),
      ...(details ? { details } : {}),
      ...(durationMs != null ? { durationMs } : {}),
    };
    this.events.push(event);
    await appendFile(this.jsonlPath, `${JSON.stringify(event)}\n`, 'utf8');
    const elapsed = Date.now() - this.startedAt;
    const line = `[${String(event.seq).padStart(2, '0')}] [${event.status.padEnd(18)}] ${event.checkpoint}${message ? ` :: ${message}` : ''}${details && Object.keys(details).length ? ` | ${compact(details)}` : ''} | +${elapsed}ms\n`;
    await appendFile(this.timelinePath, line, 'utf8');
    if (this.consoleEnabled) {
      const prefix = statusGlyph(status);
      console.log(`${prefix} ${event.checkpoint}${message ? `: ${message}` : ''}${details && Object.keys(details).length ? ` | ${compact(details)}` : ''}`);
    }
  }

  async finish(summary: Record<string, unknown>) {
    const result = {
      schema_version: '1.0',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - this.startedAt,
      events: this.events,
      summary,
    };
    await writeFile(this.jsonPath, JSON.stringify(result, null, 2), 'utf8');
    await appendFile(this.timelinePath, `\nTOTAL durationMs=${result.durationMs}\n`, 'utf8');
  }

  paths() {
    return { jsonPath: this.jsonPath, jsonlPath: this.jsonlPath, timelinePath: this.timelinePath };
  }
}

function statusGlyph(status: CheckpointStatus) {
  switch (status) {
    case 'OK': return '✓';
    case 'OK_WITH_FALLBACK': return '↪';
    case 'WARN': return '!';
    case 'FAIL': return '✗';
    case 'SKIP': return '•';
    default: return '→';
  }
}

function compact(details: Record<string, unknown>) {
  return Object.entries(details)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
    .slice(0, 700);
}
