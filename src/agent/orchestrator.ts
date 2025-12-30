import { Browser, chromium, Page } from 'playwright';
import { Plan } from './dsl/types';
import { executeActions, ExecutionResult } from './executor';
import { observeBrowser, Observation } from './observer';
import {
  createInitialState,
  updateStateAfterExecution,
  detectLoop,
  handleLoopDetection,
  shouldTerminate,
  formatStateForPlanner,
  State,
} from './state';
import { generatePlan } from './planner';
import { logger } from './logger';
import { config } from '../config';

export interface OrchestratorResult {
  success: boolean;
  reason: string;
  finalState: State;
  logFile?: string;
}

/**
 * Main orchestrator that runs the planner-executor loop
 */
export async function runAgent(goal: string): Promise<OrchestratorResult> {
  // Initialize logger
  logger.initialize(goal);
  logger.info('Agent started', { goal });

  let browser: Browser | null = null;
  let page: Page | null = null;
  let state = createInitialState(goal);
  const previousObservations: Observation[] = [];

  try {
    // Launch browser in headed mode
    browser = await chromium.launch({ headless: false });
    page = await browser.newPage();
    logger.info('Browser launched', { headless: false });

    // Main planner-executor loop
    while (true) {
      // Check termination conditions
      const terminationCheck = shouldTerminate(state);
      if (terminationCheck.terminate) {
        logger.logTermination(terminationCheck.reason || 'Unknown reason', state);
        return {
          success: false,
          reason: terminationCheck.reason || 'Terminated',
          finalState: state,
          logFile: logger.getLogFile() || undefined,
        };
      }

      // Observe current browser state
      const observation = await observeBrowser(page);
      previousObservations.push(observation);
      logger.logObservation(observation);

      // Keep only last 5 observations to manage context size
      if (previousObservations.length > 5) {
        previousObservations.shift();
      }

      // Detect loops
      const loopDetection = detectLoop(state);
      let loopWarning: string | undefined;
      if (loopDetection.isLoop) {
        state = handleLoopDetection(state, loopDetection.warning || '');
        loopWarning = loopDetection.warning;
        logger.warn('Loop detected', { warning: loopWarning, loopCount: state.loopCount });
      }

      // Format state for planner
      const stateString = formatStateForPlanner(state, loopWarning);

      // Generate plan using LLM
      logger.info('Generating plan...');
      let plan: Plan;
      try {
        plan = await generatePlan(goal, stateString, observation, previousObservations);
        logger.logPlan(plan);
      } catch (error) {
        logger.error('Failed to generate plan', { error: error instanceof Error ? error.message : String(error) });
        state.failures++;
        continue; // Try again in next iteration
      }

      // Check if task is done
      if (plan.done) {
        logger.info('Task completed successfully', { completedSteps: state.completedSteps });
        return {
          success: true,
          reason: 'Task completed',
          finalState: state,
          logFile: logger.getLogFile() || undefined,
        };
      }

      // Execute plan steps
      logger.info(`Executing ${plan.steps.length} steps...`);
      const results = await executeActions(plan.steps, page);

      // Log each action result (handle cases where execution stopped early)
      plan.steps.forEach((action, idx) => {
        const result = results[idx];
        if (result) {
          logger.logAction(state.completedSteps + idx + 1, action, result);
        } else {
          // Action wasn't executed due to earlier failure
          logger.logAction(state.completedSteps + idx + 1, action, {
            success: false,
            error: 'Execution stopped due to previous action failure',
          });
        }
      });

      // Update state after execution
      // Pad results array to match plan.steps length (for actions that weren't executed)
      const paddedResults = [...results];
      while (paddedResults.length < plan.steps.length) {
        paddedResults.push({
          success: false,
          error: 'Execution stopped due to previous action failure',
        });
      }
      const finalObservation = await observeBrowser(page);
      state = updateStateAfterExecution(state, plan.steps, paddedResults, finalObservation);
      logger.logState(state);

      // Check if execution failed critically
      const hasCriticalFailure = results.some((r) => !r.success);
      if (hasCriticalFailure) {
        logger.warn('Some actions failed', {
          failedCount: results.filter((r) => !r.success).length,
          totalSteps: results.length,
        });
      }

      // Small delay between cycles
      await page.waitForTimeout(1000);
    }
  } catch (error) {
    logger.error('Fatal error in orchestrator', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      reason: error instanceof Error ? error.message : 'Fatal error',
      finalState: state,
      logFile: logger.getLogFile() || undefined,
    };
  } finally {
    // Cleanup
    try {
      if (page) {
        await page.close();
      }
      if (browser) {
        await browser.close();
      }
      logger.info('Browser closed');
    } catch (error) {
      logger.error('Error closing browser', { error: error instanceof Error ? error.message : String(error) });
    }
  }
}

