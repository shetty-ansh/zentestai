import { Page } from 'playwright';
import { config } from '../config';

export interface Observation {
  url: string;
  visibleText: string;
  domSnapshot: string;
  timestamp: number;
  error?: string;
}

/**
 * Observes the current browser state and returns structured observation
 */
export async function observeBrowser(page: Page, error?: string): Promise<Observation> {
  try {
    const url = page.url();
    
    // Get visible text (limited to observationTextLimit)
    let visibleText = '';
    try {
      const bodyText = await page.locator('body').textContent();
      visibleText = bodyText || '';
      // Truncate if too long
      if (visibleText.length > config.observationTextLimit) {
        visibleText = visibleText.slice(0, config.observationTextLimit) + '...';
      }
    } catch (e) {
      visibleText = 'Unable to extract visible text';
    }

    // Get DOM snapshot (full HTML)
    let domSnapshot = '';
    try {
      domSnapshot = await page.content();
    } catch (e) {
      domSnapshot = 'Unable to capture DOM snapshot';
    }

    return {
      url,
      visibleText,
      domSnapshot,
      timestamp: Date.now(),
      error: error,
    };
  } catch (error) {
    // Fallback observation if page access fails
    return {
      url: 'unknown',
      visibleText: 'Unable to observe page state',
      domSnapshot: '',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Summarizes observation for planner input (reduces token usage)
 */
export function summarizeObservation(observation: Observation): string {
  const parts: string[] = [];

  parts.push(`URL: ${observation.url}`);
  
  if (observation.error) {
    parts.push(`Error: ${observation.error}`);
  }

  parts.push(`Visible Text (first ${config.observationTextLimit} chars):`);
  parts.push(observation.visibleText);

  return parts.join('\n\n');
}

