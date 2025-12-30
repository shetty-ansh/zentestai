#!/usr/bin/env node

import { runAgent } from '../agent/orchestrator';
import { logger } from '../agent/logger';

/**
 * Parses command line arguments
 * Expected format: agent run "<prompt>"
 */
function parseArgs(): { command: string; prompt?: string } {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return { command: 'help' };
  }

  if (args[0] === 'run') {
    if (args.length < 2) {
      console.error('Error: Missing prompt. Usage: agent run "<prompt>"');
      process.exit(1);
    }

    // Join all arguments after "run" to handle prompts with spaces
    // Remove surrounding quotes if present
    let prompt = args.slice(1).join(' ');
    prompt = prompt.replace(/^["']|["']$/g, '');

    return { command: 'run', prompt };
  }

  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    return { command: 'help' };
  }

  return { command: 'unknown' };
}

/**
 * Displays help message
 */
function showHelp(): void {
  console.log(`
Autonomous Browser AI Agent

Usage:
  npm run agent run "<prompt>"

Examples:
  npm run agent run "Navigate to google.com"
  npm run agent run "Search Amazon.in for headphones under ₹5000 and add the best rated one to cart"
  npm run agent run "Go to wikipedia.org and find information about TypeScript"

Commands:
  run <prompt>    Execute the agent with the given natural language prompt
  help            Show this help message

Environment Variables:
  GEMINI_API_KEY  (Required) Your Gemini API key
  MAX_STEPS       Maximum steps before termination (default: 200)
  MAX_FAILURES    Maximum failures before termination (default: 10)
  MAX_RETRIES     Retry attempts per action (default: 3)
  MAX_LOOP_RETRIES Maximum loop recovery attempts (default: 3)
  ACTION_TIMEOUT  Timeout per action in ms (default: 30000)
  OBSERVATION_TEXT_LIMIT Maximum visible text chars (default: 3000)

Logs:
  Execution logs are saved to the logs/ directory with timestamps.
`);
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const { command, prompt } = parseArgs();

  if (command === 'help') {
    showHelp();
    process.exit(0);
  }

  if (command === 'unknown') {
    console.error(`Unknown command: ${process.argv[2]}`);
    console.error('Run "npm run agent help" for usage information.');
    process.exit(1);
  }

  if (command === 'run' && prompt) {
    // Handle graceful shutdown
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      console.log(`\n${signal} received. Shutting down gracefully...`);
      logger.warn('Shutdown signal received', { signal });
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    try {
      console.log(`\n🤖 Autonomous Browser AI Agent`);
      console.log(`📋 Goal: ${prompt}\n`);

      const result = await runAgent(prompt);

      console.log('\n' + '='.repeat(60));
      if (result.success) {
        console.log('✅ Task completed successfully!');
      } else {
        console.log('❌ Task terminated');
      }
      console.log(`📊 Reason: ${result.reason}`);
      console.log(`📈 Completed Steps: ${result.finalState.completedSteps}`);
      console.log(`⚠️  Failures: ${result.finalState.failures}`);
      console.log(`🔄 Loop Count: ${result.finalState.loopCount}`);
      
      if (result.logFile) {
        console.log(`📝 Log file: ${result.logFile}`);
      }
      console.log('='.repeat(60) + '\n');

      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\n❌ Fatal error:', error instanceof Error ? error.message : String(error));
      logger.error('Fatal error in CLI', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      process.exit(1);
    }
  }
}

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

