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
      const cmd = args.slice(separatorIndex + 1);
      if (cmd.length === 0) {
        console.error('No command specified after --');
        process.exit(1);
      }
      await run(cmd);
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
        await telegramRun();
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
  run -- <command>   Start a monitored session
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
  afk-code run -- claude     # Start a Claude Code session
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
