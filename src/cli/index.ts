import { run } from './run.js';
import { slackSetup, slackRun } from './slack.js';
import { discordSetup, discordRun } from './discord.js';
import { telegramSetup, telegramRun } from './telegram.js';
import { initFiles } from './init.js';
import { heartbeatCommand, cronCommand, memoryCommand, statusCommand } from './openclaw-commands.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'run': {
      // Find -- separator and get command after it
      const separatorIndex = args.indexOf('--');
      if (separatorIndex === -1) {
        console.error('Usage: afk-code run -- <command> [args...]');
        console.error('Example: afk-code run -- claude');
        process.exit(1);
      }
      const runFlags = args.slice(1, separatorIndex);
      const shouldRestart = runFlags.includes('--restart');
      const cmd = args.slice(separatorIndex + 1);
      if (cmd.length === 0) {
        console.error('No command specified after --');
        process.exit(1);
      }

      if (shouldRestart) {
        let stopRestart = false;
        process.on('SIGINT', () => { stopRestart = true; });
        process.on('SIGTERM', () => { stopRestart = true; });

        let attempt = 0;
        while (!stopRestart) {
          attempt++;
          const startTime = Date.now();
          console.log(`[AutoRestart] Starting session (attempt ${attempt})...`);
          await run(cmd);
          if (stopRestart) break;

          const elapsed = Date.now() - startTime;
          const delay = elapsed < 15_000 ? 30_000 : 5_000;
          console.log(`[AutoRestart] Session exited after ${Math.round(elapsed / 1000)}s. Restarting in ${delay / 1000}s...`);
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delay);
            process.once('SIGINT', () => { clearTimeout(timer); stopRestart = true; resolve(); });
            process.once('SIGTERM', () => { clearTimeout(timer); stopRestart = true; resolve(); });
          });
        }
        console.log('[AutoRestart] Stopped.');
      } else {
        await run(cmd);
      }
      break;
    }

    case 'slack': {
      if (args[1] === 'setup') {
        await slackSetup();
      } else {
        await slackRun();
      }
      break;
    }

    case 'discord': {
      if (args[1] === 'setup') {
        await discordSetup();
      } else {
        await discordRun();
      }
      break;
    }

    case 'telegram': {
      if (args[1] === 'setup') {
        await telegramSetup();
      } else {
        // Auto-restart loop (like `run --restart`)
        let stopRestart = false;

        // SIGINT/SIGTERM: set flag so loop exits after current run finishes naturally
        // (telegramRun now calls bot.stop() on signal, which makes await bot.start() resolve)
        const onStop = () => { stopRestart = true; };
        process.on('SIGINT', onStop);
        process.on('SIGTERM', onStop);

        let attempt = 0;
        while (!stopRestart) {
          attempt++;
          const startTime = Date.now();
          if (attempt > 1) {
            console.log(`[AutoRestart] Restarting Telegram bot (attempt ${attempt})...`);
          }
          try {
            await telegramRun();
          } catch (err: any) {
            console.error('[AutoRestart] Telegram bot crashed:', err?.message ?? err);
          }
          if (stopRestart) break;

          const elapsed = Date.now() - startTime;
          // If crashed very quickly (< 10s), wait longer before retry to avoid spam.
          // 45s > Telegram's 30s long-poll timeout, ensuring the old connection expires.
          const delay = elapsed < 10_000 ? 45_000 : 5_000;
          console.log(`[AutoRestart] Telegram bot exited after ${Math.round(elapsed / 1000)}s. Restarting in ${delay / 1000}s...`);
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delay);
            // During sleep, signal should wake us up and stop
            const onWake = () => { clearTimeout(timer); resolve(); };
            process.once('SIGINT', onWake);
            process.once('SIGTERM', onWake);
            setTimeout(() => {
              process.off('SIGINT', onWake);
              process.off('SIGTERM', onWake);
            }, delay);
          });
        }
        process.off('SIGINT', onStop);
        process.off('SIGTERM', onStop);
        console.log('[AutoRestart] Telegram bot stopped.');
      }
      break;
    }

    case 'init': {
      await initFiles();
      break;
    }

    case 'heartbeat': {
      await heartbeatCommand(args.slice(1));
      break;
    }

    case 'cron': {
      await cronCommand(args.slice(1));
      break;
    }

    case 'memory': {
      await memoryCommand(args.slice(1));
      break;
    }

    case 'status': {
      await statusCommand();
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    case undefined: {
      console.log(`
AFK Code - Autonomous AI assistant powered by Claude Code

Commands:
  telegram           Run the Telegram bot (with Heartbeat + Cron)
  telegram setup     Configure Telegram integration
  discord            Run the Discord bot
  discord setup      Configure Discord integration
  slack              Run the Slack bot
  slack setup        Configure Slack integration
  run -- <command>            Start a monitored session
  run --restart -- <command>  Start a monitored session with auto-restart
  init               Initialize memory & personality files
  heartbeat <cmd>    Heartbeat management (status/enable/disable)
  cron <cmd>         Cron job management (list)
  memory <cmd>       Memory management (status/list/today)
  status             Show overall status
  help               Show this help message

Examples:
  afk-code init              # Initialize ~/.afk-code/ files
  afk-code telegram setup    # First-time Telegram configuration
  afk-code telegram          # Start Telegram bot + Heartbeat + Cron
  afk-code run -- claude                           # Start a Claude Code session
  afk-code run --restart -- claude --continue      # Auto-restart on exit
  afk-code heartbeat status  # Check Heartbeat status
  afk-code status            # Show overall system status
`);
      break;
    }

    default: {
      // Treat unknown commands as a program to run
      await run(args);
      break;
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
