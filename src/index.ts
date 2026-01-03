#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { config, validateConfig } from './utils/config';
import { AgentOrchestrator } from './agent/orchestrator';

const program = new Command();

program
    .name('agent')
    .description('Autonomous Browser AI Agent - Control browser via natural language')
    .version('1.0.0');

program
    .command('run')
    .description('Run the agent with a natural language prompt')
    .argument('<prompt>', 'The task to accomplish')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (prompt: string, options: { verbose?: boolean }) => {
        console.log(chalk.blue('\n🤖 Browser Agent Starting...\n'));
        console.log(chalk.gray(`Goal: ${prompt}\n`));

        try {
            // Validate configuration
            validateConfig();

            // Create and run agent
            const agent = new AgentOrchestrator(prompt);
            const result = await agent.run();

            // Display result
            console.log('\n' + chalk.bold('═'.repeat(60)));

            if (result.success) {
                console.log(chalk.green('\n✅ Task Completed Successfully!\n'));
                if (result.result) {
                    console.log(chalk.white('Result:'));
                    console.log(chalk.cyan(result.result));
                }
            } else {
                console.log(chalk.red('\n❌ Task Failed\n'));
                if (result.reason) {
                    console.log(chalk.yellow(`Reason: ${result.reason}`));
                }
            }

            console.log(chalk.gray(`\nTotal steps: ${result.totalSteps}`));
            console.log(chalk.gray(`Duration: ${(result.duration / 1000).toFixed(1)}s`));
            console.log(chalk.gray(`Log file: ${result.logPath}\n`));

        } catch (error) {
            console.error(chalk.red('\n❌ Error:'), (error as Error).message);
            process.exit(1);
        }
    });

program.parse();
