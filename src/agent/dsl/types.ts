
// Base action types
export type ActionType =
  | 'goto'
  | 'click'
  | 'fill'
  | 'press'
  | 'waitFor'
  | 'scroll'
  | 'extractText'
  | 'extractList'
  | 'assertText';

// Individual action interfaces
export interface GotoAction {
  action: 'goto';
  url: string;
}

export interface ClickAction {
  action: 'click';
  selector: string;
  timeout?: number;
}

export interface FillAction {
  action: 'fill';
  selector: string;
  value: string;
  timeout?: number;
}

export interface PressAction {
  action: 'press';
  key: string;
}

export interface WaitForAction {
  action: 'waitFor';
  selector: string;
  timeout?: number;
}

export interface ScrollAction {
  action: 'scroll';
  amount?: number; // pixels to scroll (default: 500)
  direction?: 'up' | 'down';
}

export interface ExtractTextAction {
  action: 'extractText';
  selector: string;
}

export interface ExtractListAction {
  action: 'extractList';
  selector: string;
}

export interface AssertTextAction {
  action: 'assertText';
  selector: string;
  expectedText: string;
}

// Union type for all actions
export type Action =
  | GotoAction
  | ClickAction
  | FillAction
  | PressAction
  | WaitForAction
  | ScrollAction
  | ExtractTextAction
  | ExtractListAction
  | AssertTextAction;

// Plan structure returned by planner
export interface Plan {
  steps: Action[];
  goalCheck: string; // Description of what to check after execution
  done: boolean; // Whether the task is complete
}

// Type guard functions for validation

export function isValidActionType(action: string): action is ActionType {
  const validActions: ActionType[] = [
    'goto',
    'click',
    'fill',
    'press',
    'waitFor',
    'scroll',
    'extractText',
    'extractList',
    'assertText',
  ];
  return validActions.includes(action as ActionType);
}

export function isValidGotoAction(action: any): action is GotoAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'goto' &&
    typeof action.url === 'string' &&
    action.url.length > 0
  );
}

export function isValidClickAction(action: any): action is ClickAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'click' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0 &&
    (action.timeout === undefined || typeof action.timeout === 'number')
  );
}

export function isValidFillAction(action: any): action is FillAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'fill' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0 &&
    typeof action.value === 'string' &&
    (action.timeout === undefined || typeof action.timeout === 'number')
  );
}

export function isValidPressAction(action: any): action is PressAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'press' &&
    typeof action.key === 'string' &&
    action.key.length > 0
  );
}

export function isValidWaitForAction(action: any): action is WaitForAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'waitFor' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0 &&
    (action.timeout === undefined || typeof action.timeout === 'number')
  );
}

export function isValidScrollAction(action: any): action is ScrollAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'scroll' &&
    (action.amount === undefined || typeof action.amount === 'number') &&
    (action.direction === undefined || action.direction === 'up' || action.direction === 'down')
  );
}

export function isValidExtractTextAction(action: any): action is ExtractTextAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'extractText' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0
  );
}

export function isValidExtractListAction(action: any): action is ExtractListAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'extractList' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0
  );
}

export function isValidAssertTextAction(action: any): action is AssertTextAction {
  return (
    action &&
    typeof action === 'object' &&
    action.action === 'assertText' &&
    typeof action.selector === 'string' &&
    action.selector.length > 0 &&
    typeof action.expectedText === 'string'
  );
}

/**
 * Validates if an object is a valid Action
 */
export function isValidAction(action: any): action is Action {
  if (!action || typeof action !== 'object' || !action.action) {
    return false;
  }

  switch (action.action) {
    case 'goto':
      return isValidGotoAction(action);
    case 'click':
      return isValidClickAction(action);
    case 'fill':
      return isValidFillAction(action);
    case 'press':
      return isValidPressAction(action);
    case 'waitFor':
      return isValidWaitForAction(action);
    case 'scroll':
      return isValidScrollAction(action);
    case 'extractText':
      return isValidExtractTextAction(action);
    case 'extractList':
      return isValidExtractListAction(action);
    case 'assertText':
      return isValidAssertTextAction(action);
    default:
      return false;
  }
}

/**
 * Validates if an object is a valid Plan
 */
export function isValidPlan(plan: any): plan is Plan {
  if (!plan || typeof plan !== 'object') {
    return false;
  }

  if (!Array.isArray(plan.steps)) {
    return false;
  }

  if (plan.steps.length === 0 || plan.steps.length > 5) {
    return false; // Planner should generate 3-5 steps
  }

  // Validate all steps
  for (const step of plan.steps) {
    if (!isValidAction(step)) {
      return false;
    }
  }

  if (typeof plan.goalCheck !== 'string') {
    return false;
  }

  if (typeof plan.done !== 'boolean') {
    return false;
  }

  return true;
}

/**
 * Parses and validates a Plan from JSON (e.g., from LLM response)
 */
export function parsePlan(json: any): Plan {
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  if (!isValidPlan(json)) {
    throw new Error('Invalid plan structure');
  }

  return json;
}

