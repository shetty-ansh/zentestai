import { Page, BrowserContext } from 'playwright';

// ============================================================================
// ELEMENT TYPES - Enriched with multiple selector strategies
// ============================================================================

/**
 * Enriched element with multiple ways to locate it
 * Addresses: CSS selectors unreliable, need fallbacks
 */
export interface EnrichedElement {
    id: string;                    // Our injected ID: elem_1, elem_2, etc.
    tag: string;                   // HTML tag: button, a, input, div
    text: string;                  // Visible text content (trimmed)
    classes: string[];             // CSS classes (can help LLM understand purpose)
    dataAttrs: Record<string, string>; // data-* attributes
    role: string | null;           // ARIA role (button, link, textbox, etc.)
    ariaLabel: string | null;      // aria-label attribute
    placeholder: string | null;    // For inputs
    href: string | null;           // For links
    type: string | null;           // For inputs: text, submit, checkbox

    // Multiple selector strategies
    selector: string;              // Primary CSS selector (may be unreliable)
    xpathBackup: string;           // Fallback XPath

    // Visibility and position
    isVisible: boolean;            // Currently visible in viewport
    boundingBox: { x: number; y: number; width: number; height: number } | null;

    // Parent context (helps LLM understand hierarchy)
    parentInfo: string | null;     // Brief parent description: "inside nav", "in form#login"
}

// ============================================================================
// PAGE STATE - What we send to Gemini
// ============================================================================

/**
 * Complete page state for LLM decision making
 * Includes: cleaned DOM (with hierarchy), elements, screenshot
 */
export interface PageState {
    url: string;
    title: string;

    // Cleaned DOM - keeps hierarchy and structure, removes only DEFINITELY unnecessary
    // (scripts, styles, hidden, tracking) - per user feedback
    dom: string;

    // Interactive elements with multiple selector strategies
    elements: EnrichedElement[];

    // Screenshot for visual understanding (base64 PNG)
    screenshot: string;

    // Metadata
    timestamp: Date;
    viewportSize: { width: number; height: number };
}

// ============================================================================
// ACTION TYPES - What the LLM can do
// ============================================================================

export type Action =
    | { type: 'click'; elementId: string }
    | { type: 'type'; elementId: string; text: string; clearFirst?: boolean }
    | { type: 'clear'; elementId: string }
    | { type: 'select'; elementId: string; value: string }  // For dropdown menus
    | { type: 'navigate'; url: string }
    | { type: 'scroll'; direction: 'up' | 'down' | 'toElement'; elementId?: string }
    | { type: 'pressKey'; key: string }
    | { type: 'extract'; elementId?: string; description?: string }
    | { type: 'waitForElement'; elementId: string; timeout?: number }
    | { type: 'screenshot' }
    | { type: 'done'; result: string }
    | { type: 'fail'; reason: string };

// ============================================================================
// ACTION RESULT
// ============================================================================

export interface ActionResult {
    success: boolean;
    error?: string;
    data?: any;                    // Extracted text, etc.
    duration?: number;             // Execution time in ms (added by execute wrapper)
    newTabOpened?: boolean;        // If click opened new tab
    retriesUsed?: number;          // How many retries were needed
}

// ============================================================================
// LLM RESPONSE
// ============================================================================

export interface AgentResponse {
    thinking: string;              // LLM's reasoning (logged for debugging)
    action: Action;
    confidence: number;            // 0.0 - 1.0
}

// ============================================================================
// STEP RECORD - History entry
// ============================================================================

export interface StepRecord {
    stepNumber: number;
    timestamp: Date;
    pageUrl: string;
    pageTitle: string;
    action: Action;
    result: ActionResult;
    thinking: string;              // LLM's reasoning for this step
    screenshotPath?: string;       // Path to saved screenshot
}

// ============================================================================
// HISTORY SUMMARY - Compressed history for long tasks
// ============================================================================

export interface HistorySummary {
    stepRange: [number, number];   // e.g., [1, 10]
    summary: string;               // "Searched for product, added to cart"
}

// ============================================================================
// PLAN STEP
// ============================================================================

export interface PlanStep {
    id: number;
    description: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
}

// ============================================================================
// AGENT MEMORY - Full agent state
// ============================================================================

export interface AgentMemory {
    originalGoal: string;
    plan: PlanStep[];
    historySummaries: HistorySummary[];
    recentSteps: StepRecord[];
    keyDiscoveries: string[];      // Important learnings: "site requires login", etc.
    currentStep: number;
    consecutiveFailures: number;
    startTime: Date;
}

// ============================================================================
// AGENT RESULT - Final output
// ============================================================================

export interface AgentResult {
    success: boolean;
    result?: string;               // Text result for summarization tasks
    reason?: string;               // Failure reason
    totalSteps: number;
    duration: number;              // Total execution time in ms
    logPath: string;               // Path to the log file
}

// ============================================================================
// LOOP DETECTION
// ============================================================================

export interface LoopCheckResult {
    detected: boolean;
    type?: 'action_repetition' | 'state_repetition' | 'url_cycling' | 'progress_stall';
    message?: string;
    confidence: number;            // How sure we are this is a real loop
}

export interface RecoveryStrategy {
    strategy: 'retry_different' | 'skip_subgoal' | 'go_back' | 'fail';
    action?: Action;
    reasoning: string;
}
