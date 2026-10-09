import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  beginGoogleSheetsCommandStep,
  completeGoogleSheetsCommandStep,
} from '../src/lib/google-sheets-publish.js';

const ROOT = process.cwd();

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function commandTarget(args: string[]): string | undefined {
  const afterSeparator = args.indexOf('--');
  const forwarded = afterSeparator >= 0 ? args.slice(afterSeparator + 1) : [];
  const first = forwarded.find(arg => !arg.startsWith('--') && /^[A-Za-z0-9&-]{1,20}$/.test(arg));
  if (first) return first.toUpperCase();
  return undefined;
}

async function run() {
  const args = process.argv.slice(2);
  const commandName = readOption(args, '--name');
  const executable = readOption(args, '--exec');
  const shellCommand = readOption(args, '--shell-command');
  const separator = args.indexOf('--');
  const commandArgs = separator >= 0 ? args.slice(separator + 1) : [];

  if (!commandName || (!executable && !shellCommand) || (executable && commandArgs.length === 0)) {
    console.error('Usage: tsx scripts/with-google-sheets-step.ts --name <command-name> --exec <executable> -- <args...>');
    console.error('   or: tsx scripts/with-google-sheets-step.ts --name <command-name> --shell-command "<command>"');
    process.exitCode = 2;
    return;
  }

  const target = commandTarget(args);
  const step = await beginGoogleSheetsCommandStep(commandName, target, ROOT, 'cli');
  let child: ChildProcess | undefined;
  let signalReceived: NodeJS.Signals | undefined;


  try {
    child = shellCommand
      ? spawn(shellCommand, [], { cwd: ROOT, shell: true, stdio: ['inherit', 'pipe', 'pipe'], env: process.env })
      : spawn(executable!, commandArgs, { cwd: ROOT, shell: true, stdio: ['inherit', 'pipe', 'pipe'], env: process.env });

    const forwardSignal = (signal: NodeJS.Signals) => {
      signalReceived = signal;
      try { child?.kill(signal); } catch {}
    };
    const onSigInt = () => forwardSignal('SIGINT');
    const onSigTerm = () => forwardSignal('SIGTERM');
    process.once('SIGINT', onSigInt);
    process.once('SIGTERM', onSigTerm);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const value = chunk.toString();
      process.stdout.write(value);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const value = chunk.toString();
      process.stderr.write(value);
    });

    const outcome = await new Promise<{ exitCode: number; error?: string }>(resolve => {
      child!.once('error', error => resolve({ exitCode: 127, error: error.message }));
      child!.once('close', (code, signal) => {
        const exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
        resolve({
          exitCode,
          error: signal ? `Child process ended due to ${signal}` : undefined,
        });
      });
    });

    process.off('SIGINT', onSigInt);
    process.off('SIGTERM', onSigTerm);
    const exitCode = signalReceived === 'SIGINT' && outcome.exitCode === 0 ? 130 : outcome.exitCode;
    await completeGoogleSheetsCommandStep(step, {
      exitCode,
      completedAt: new Date().toISOString(),
      error: outcome.error || (exitCode !== 0 ? `Command exited with code ${exitCode}` : undefined),
    });
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeGoogleSheetsCommandStep(step, {
      exitCode: 1,
      completedAt: new Date().toISOString(),
      error: message,
    }).catch(syncError => console.error('[sheets] Could not finish command step:', syncError));
    console.error(message);
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
