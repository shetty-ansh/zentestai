import * as fs from 'fs';
import * as path from 'path';
import { Action } from './dsl/types';
import { ExecutionResult } from './executor';
import { State } from './state';
import { Observation } from './observer';

export type LogLevel = 'info' | 'error' | 'debug' | 'warn';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
}

class Logger {
  private logFile: string | null = null;
  private logEntries: LogEntry[] = [];

  /**
   * Initializes logger with a log file
   */
  initialize(goal: string): void {
    const logsDir = path.join(process.cwd(), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create timestamped log file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sanitizedGoal = goal.slice(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
    this.logFile = path.join(logsDir, `execution-${timestamp}-${sanitizedGoal}.log`);

    this.info('Logger initialized', { goal, logFile: this.logFile });
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  /**
   * Logs an error message
   */
  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  /**
   * Logs a debug message
   */
  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  /**
   * Logs a plan generation
   */
  logPlan(plan: { steps: Action[]; goalCheck: string; done: boolean }): void {
    this.info('Plan generated', {
      stepCount: plan.steps.length,
      goalCheck: plan.goalCheck,
      done: plan.done,
      steps: plan.steps.map((step) => ({
        action: step.action,
        ...(step.action === 'goto' && { url: step.url }),
        ...(step.action === 'click' && { selector: step.selector }),
        ...(step.action === 'fill' && { selector: step.selector, valueLength: step.value.length }),
        ...(step.action === 'press' && { key: step.key }),
        ...(step.action === 'waitFor' && { selector: step.selector }),
        ...(step.action === 'scroll' && { amount: step.amount, direction: step.direction }),
        ...(step.action === 'extractText' && { selector: step.selector }),
        ...(step.action === 'extractList' && { selector: step.selector }),
        ...(step.action === 'assertText' && { selector: step.selector, expectedText: step.expectedText }),
      })),
    });
  }

  /**
   * Logs action execution
   */
  logAction(stepNumber: number, action: Action, result: ExecutionResult): void {
    const actionDesc = this.formatAction(action);
    if (result.success) {
      this.info(`Step ${stepNumber}: ${actionDesc}`, {
        stepNumber,
        action: action.action,
        result: result.result,
      });
    } else {
      this.error(`Step ${stepNumber}: ${actionDesc} failed`, {
        stepNumber,
        action: action.action,
        error: result.error,
      });
    }
  }

  /**
   * Logs state update
   */
  logState(state: State): void {
    this.debug('State update', {
      currentUrl: state.currentUrl,
      completedSteps: state.completedSteps,
      failures: state.failures,
      loopCount: state.loopCount,
      extractedDataCount: state.extractedData.length,
    });
  }

  /**
   * Logs observation
   */
  logObservation(observation: Observation): void {
    this.debug('Observation captured', {
      url: observation.url,
      textLength: observation.visibleText.length,
      hasError: !!observation.error,
    });
  }

  /**
   * Logs termination
   */
  logTermination(reason: string, state: State): void {
    this.warn('Agent terminated', {
      reason,
      finalState: {
        completedSteps: state.completedSteps,
        failures: state.failures,
        loopCount: state.loopCount,
      },
    });
  }

  /**
   * Core logging function
   */
  private log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logEntries.push(entry);

    // Format for console (human-readable)
    const timeStr = new Date(entry.timestamp).toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const consoleMessage = `[${timeStr}] ${levelStr} ${message}`;

    // Output to console with color coding
    switch (level) {
      case 'error':
        console.error(consoleMessage, data || '');
        break;
      case 'warn':
        console.warn(consoleMessage, data || '');
        break;
      case 'debug':
        // Only show debug in file, not console (unless needed)
        break;
      default:
        console.log(consoleMessage, data || '');
    }

    // Write to file (JSON format for analysis)
    if (this.logFile) {
      try {
        const fileEntry = JSON.stringify(entry) + '\n';
        fs.appendFileSync(this.logFile, fileEntry, 'utf8');
      } catch (error) {
        // Silently fail file writing to not interrupt execution
        console.error('Failed to write to log file:', error);
      }
    }
  }

  /**
   * Formats action for display
   */
  private formatAction(action: Action): string {
    switch (action.action) {
      case 'goto':
        return `goto(${action.url})`;
      case 'click':
        return `click(${action.selector})`;
      case 'fill':
        return `fill(${action.selector}, "${action.value.slice(0, 30)}...")`;
      case 'press':
        return `press(${action.key})`;
      case 'waitFor':
        return `waitFor(${action.selector})`;
      case 'scroll':
        return `scroll(${action.amount || 500}px ${action.direction || 'down'})`;
      case 'extractText':
        return `extractText(${action.selector})`;
      case 'extractList':
        return `extractList(${action.selector})`;
      case 'assertText':
        return `assertText(${action.selector}, "${action.expectedText}")`;
      default:
        // Type assertion needed because TypeScript exhaustively narrows action to 'never'
        return (action as { action: string }).action;
    }
  }

  /**
   * Gets the log file path
   */
  getLogFile(): string | null {
    return this.logFile;
  }

  /**
   * Gets all log entries (for testing/debugging)
   */
  getLogEntries(): LogEntry[] {
    return [...this.logEntries];
  }
}

// Singleton instance
export const logger = new Logger();

