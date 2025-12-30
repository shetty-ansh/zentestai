import { Action } from './dsl/types';
import { Observation } from './observer';
import { config } from '../config';

export interface State {
  goal: string;
  currentUrl: string;
  completedSteps: number;
  extractedData: any[];
  failures: number;
  history: HistoryEntry[];
  loopCount: number; // Number of times we've detected a loop
  lastUrls: string[]; // Last N URLs for loop detection
}

export interface HistoryEntry {
  url: string;
  action: string;
  timestamp: number;
  success: boolean;
  error?: string;
}

const MAX_URL_HISTORY = 5; // Track last 5 URLs for loop detection

/**
 * Creates initial state from a goal
 */
export function createInitialState(goal: string): State {
  return {
    goal,
    currentUrl: '',
    completedSteps: 0,
    extractedData: [],
    failures: 0,
    history: [],
    loopCount: 0,
    lastUrls: [],
  };
}

/**
 * Updates state after executing actions
 */
export function updateStateAfterExecution(
  state: State,
  actions: Action[],
  results: Array<{ success: boolean; error?: string; result?: any }>,
  observation: Observation
): State {
  const newState = { ...state };
  newState.currentUrl = observation.url;

  // Update history
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = results[i];
    newState.history.push({
      url: observation.url,
      action: `${action.action}${action.action === 'goto' ? `(${action.url})` : action.action === 'click' || action.action === 'fill' ? `(${action.selector})` : ''}`,
      timestamp: Date.now(),
      success: result?.success || false,
      error: result?.error,
    });

    if (result?.success) {
      newState.completedSteps++;
      
      // Store extracted data
      if (result.result !== undefined) {
        newState.extractedData.push({
          action: action.action,
          selector: 'selector' in action ? action.selector : undefined,
          data: result.result,
          timestamp: Date.now(),
        });
      }
    } else {
      newState.failures++;
    }
  }

  // Update URL history for loop detection
  if (observation.url && observation.url !== 'unknown') {
    newState.lastUrls.push(observation.url);
    // Keep only last N URLs
    if (newState.lastUrls.length > MAX_URL_HISTORY) {
      newState.lastUrls.shift();
    }
  }

  return newState;
}

/**
 * Detects if we're in a loop (repeated URLs or actions)
 */
export function detectLoop(state: State): { isLoop: boolean; warning?: string } {
  // Check for repeated URLs
  if (state.lastUrls.length >= 3) {
    const lastUrl = state.lastUrls[state.lastUrls.length - 1];
    const urlCount = state.lastUrls.filter((url) => url === lastUrl).length;
    
    if (urlCount >= 3) {
      return {
        isLoop: true,
        warning: `Detected loop: visited URL "${lastUrl}" ${urlCount} times. Consider trying a different approach.`,
      };
    }
  }

  // Check for repeated action sequences (last 3 actions repeated)
  if (state.history.length >= 6) {
    const recent = state.history.slice(-6);
    const firstThree = recent.slice(0, 3).map((h) => h.action);
    const lastThree = recent.slice(3, 6).map((h) => h.action);
    
    if (
      firstThree[0] === lastThree[0] &&
      firstThree[1] === lastThree[1] &&
      firstThree[2] === lastThree[2]
    ) {
      return {
        isLoop: true,
        warning: `Detected loop: repeated action sequence "${firstThree.join(' → ')}". Consider trying a different approach.`,
      };
    }
  }

  return { isLoop: false };
}

/**
 * Increments loop count and checks if we've exceeded retry limit
 */
export function handleLoopDetection(state: State, loopWarning: string): State {
  const newState = { ...state };
  newState.loopCount++;
  
  return newState;
}

/**
 * Checks if state indicates we should terminate
 */
export function shouldTerminate(state: State): { terminate: boolean; reason?: string } {
  if (state.completedSteps >= config.maxSteps) {
    return {
      terminate: true,
      reason: `Maximum steps (${config.maxSteps}) reached`,
    };
  }

  if (state.failures >= config.maxFailures) {
    return {
      terminate: true,
      reason: `Maximum failures (${config.maxFailures}) reached`,
    };
  }

  if (state.loopCount >= config.maxLoopRetries) {
    return {
      terminate: true,
      reason: `Maximum loop retries (${config.maxLoopRetries}) exceeded`,
    };
  }

  return { terminate: false };
}

/**
 * Formats state for planner input
 */
export function formatStateForPlanner(state: State, loopWarning?: string): string {
  const parts: string[] = [];

  parts.push(`Goal: ${state.goal}`);
  parts.push(`Current URL: ${state.currentUrl}`);
  parts.push(`Completed Steps: ${state.completedSteps}/${config.maxSteps}`);
  parts.push(`Failures: ${state.failures}/${config.maxFailures}`);
  
  if (state.loopCount > 0) {
    parts.push(`Loop Count: ${state.loopCount}/${config.maxLoopRetries}`);
  }

  if (loopWarning) {
    parts.push(`⚠️ LOOP WARNING: ${loopWarning}`);
  }

  if (state.extractedData.length > 0) {
    parts.push(`\nExtracted Data (${state.extractedData.length} items):`);
    state.extractedData.slice(-5).forEach((item, idx) => {
      parts.push(`  ${idx + 1}. ${item.action}: ${JSON.stringify(item.data).slice(0, 100)}`);
    });
  }

  if (state.history.length > 0) {
    parts.push(`\nRecent History (last 5 actions):`);
    state.history.slice(-5).forEach((entry, idx) => {
      const status = entry.success ? '✓' : '✗';
      parts.push(`  ${status} ${entry.action}${entry.error ? ` - Error: ${entry.error}` : ''}`);
    });
  }

  return parts.join('\n');
}

