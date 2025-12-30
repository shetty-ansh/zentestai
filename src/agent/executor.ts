import { Page } from 'playwright';
import {
  Action,
  GotoAction,
  ClickAction,
  FillAction,
  PressAction,
  WaitForAction,
  ScrollAction,
  ExtractTextAction,
  ExtractListAction,
  AssertTextAction,
} from './dsl/types';
import { config } from '../config';

export interface ExecutionResult {
  success: boolean;
  result?: any; // For extractText/extractList, contains extracted data
  error?: string;
}

/**
 * Executes a single action using Playwright
 */

export async function executeAction(
  action: Action,
  page: Page
): Promise<ExecutionResult> {
  const timeout = config.actionTimeout;

  try {
    switch (action.action) {
      case 'goto':
        return await executeGoto(action, page, timeout);
      case 'click':
        return await executeClick(action, page, timeout);
      case 'fill':
        return await executeFill(action, page, timeout);
      case 'press':
        return await executePress(action, page);
      case 'waitFor':
        return await executeWaitFor(action, page, timeout);
      case 'scroll':
        return await executeScroll(action, page);
      case 'extractText':
        return await executeExtractText(action, page);
      case 'extractList':
        return await executeExtractList(action, page);
      case 'assertText':
        return await executeAssertText(action, page, timeout);
      default:
        return {
          success: false,
          error: `Unknown action type: ${(action as any).action}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Executes multiple actions with retry logic
 */
export async function executeActions(
  actions: Action[],
  page: Page,
  retries: number = config.maxRetries
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const action of actions) {
    let lastResult: ExecutionResult | null = null;
    let attempt = 0;

    while (attempt <= retries) {
      lastResult = await executeAction(action, page);

      if (lastResult.success) {
        results.push(lastResult);
        break;
      }

      // If it's the last attempt, add the failure
      if (attempt === retries) {
        results.push(lastResult);
        break;
      }

      // Wait before retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }

    // If action failed and we've exhausted retries, stop execution
    if (lastResult && !lastResult.success) {
      break;
    }
  }

  return results;
}

// Individual action executors

async function executeGoto(
  action: GotoAction,
  page: Page,
  timeout: number
): Promise<ExecutionResult> {
  try {
    await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeClick(
  action: ClickAction,
  page: Page,
  timeout: number
): Promise<ExecutionResult> {
  try {
    const actionTimeout = action.timeout || timeout;
    await page.click(action.selector, { timeout: actionTimeout });
    // Small delay after click to allow page to react
    await page.waitForTimeout(500);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeFill(
  action: FillAction,
  page: Page,
  timeout: number
): Promise<ExecutionResult> {
  try {
    const actionTimeout = action.timeout || timeout;
    await page.fill(action.selector, action.value, { timeout: actionTimeout });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executePress(
  action: PressAction,
  page: Page
): Promise<ExecutionResult> {
  try {
    await page.keyboard.press(action.key);
    // Small delay after key press
    await page.waitForTimeout(300);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeWaitFor(
  action: WaitForAction,
  page: Page,
  timeout: number
): Promise<ExecutionResult> {
  try {
    const actionTimeout = action.timeout || timeout;
    await page.waitForSelector(action.selector, {
      state: 'visible',
      timeout: actionTimeout,
    });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeScroll(
  action: ScrollAction,
  page: Page
): Promise<ExecutionResult> {
  try {
    const amount = action.amount || 500;
    const deltaY = action.direction === 'up' ? -amount : amount;
    await page.mouse.wheel(0, deltaY);
    // Wait for scroll to complete
    await page.waitForTimeout(500);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeExtractText(
  action: ExtractTextAction,
  page: Page
): Promise<ExecutionResult> {
  try {
    const text = await page.textContent(action.selector);
    return {
      success: true,
      result: text || '',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeExtractList(
  action: ExtractListAction,
  page: Page
): Promise<ExecutionResult> {
  try {
    const elements = await page.locator(action.selector).all();
    const results: string[] = [];

    for (const element of elements) {
      const text = await element.textContent();
      if (text) {
        results.push(text.trim());
      }
    }

    return {
      success: true,
      result: results,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeAssertText(
  action: AssertTextAction,
  page: Page,
  timeout: number
): Promise<ExecutionResult> {
  try {
    const text = await page.textContent(action.selector, { timeout });
    const matches = text?.includes(action.expectedText) || false;

    if (!matches) {
      return {
        success: false,
        error: `Expected text "${action.expectedText}" not found. Found: "${text}"`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

