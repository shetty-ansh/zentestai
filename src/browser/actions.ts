import { Page, BrowserContext, Locator } from 'playwright';
import { config } from '../utils/config';
import { Logger } from '../utils/logger';
import { Action, ActionResult, EnrichedElement } from '../agent/types';
import { StateExtractor } from './state-extractor';

/**
 * Action Executor - Executes LLM-decided actions on the browser
 * 
 * Features:
 * - Multi-selector strategy (CSS → XPath → Text → Role)
 * - New tab detection on click
 * - Retry with exponential backoff
 * - Visibility checks before interaction
 */
export class ActionExecutor {
    private page: Page;
    private context: BrowserContext;
    private stateExtractor: StateExtractor;
    private logger: Logger;

    constructor(
        page: Page,
        context: BrowserContext,
        stateExtractor: StateExtractor,
        logger: Logger
    ) {
        this.page = page;
        this.context = context;
        this.stateExtractor = stateExtractor;
        this.logger = logger;
    }

    /**
     * Update page reference (for when new tabs open)
     */
    setPage(page: Page): void {
        this.page = page;
    }

    /**
     * Execute an action with retry logic
     */
    async execute(action: Action, elements: EnrichedElement[]): Promise<ActionResult> {
        const startTime = Date.now();
        let retriesUsed = 0;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                const result = await this.executeOnce(action, elements);
                return {
                    ...result,
                    duration: Date.now() - startTime,
                    retriesUsed,
                };
            } catch (error) {
                lastError = error as Error;
                retriesUsed = attempt;

                this.logger.logConsole('warning', `Action attempt ${attempt} failed: ${lastError.message}`);

                if (attempt < config.maxRetries) {
                    // Exponential backoff
                    const delay = config.lazyLoadRetryDelayMs * attempt;
                    await this.page.waitForTimeout(delay);
                }
            }
        }

        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            duration: Date.now() - startTime,
            retriesUsed,
        };
    }

    /**
     * Execute action once (no retry)
     */
    private async executeOnce(action: Action, elements: EnrichedElement[]): Promise<ActionResult> {
        switch (action.type) {
            case 'click':
                return await this.handleClick(action.elementId, elements);

            case 'type':
                return await this.handleType(action.elementId, action.text, action.clearFirst, elements);

            case 'clear':
                return await this.handleClear(action.elementId, elements);

            case 'select':
                return await this.handleSelect(action.elementId, action.value, elements);

            case 'navigate':
                return await this.handleNavigate(action.url);

            case 'scroll':
                return await this.handleScroll(action.direction, action.elementId, elements);

            case 'pressKey':
                return await this.handlePressKey(action.key);

            case 'extract':
                return await this.handleExtract(action.elementId, action.description, elements);

            case 'waitForElement':
                return await this.handleWaitForElement(action.elementId, action.timeout, elements);

            case 'screenshot':
                return { success: true }; // Screenshot is always taken

            case 'done':
                return { success: true, data: action.result };

            case 'fail':
                return { success: false, error: action.reason };

            default:
                return { success: false, error: `Unknown action type: ${(action as any).type}` };
        }
    }

    /**
     * Find element using multiple strategies (with scroll-retry)
     */
    private async findElement(elementId: string, elements: EnrichedElement[]): Promise<Locator> {
        const element = elements.find(e => e.id === elementId);
        if (!element) {
            throw new Error(`Element not found: ${elementId}`);
        }

        // Try up to 3 times, scrolling between attempts
        for (let scrollAttempt = 0; scrollAttempt < 3; scrollAttempt++) {
            const locator = await this.tryFindElement(element, elementId);
            if (locator) return locator;

            // Scroll down and retry (invisible to LLM)
            if (scrollAttempt < 2) {
                await this.page.evaluate(() => window.scrollBy(0, 400));
                await this.page.waitForTimeout(150);  // Optimized: reduced from 300ms
            }
        }

        throw new Error(`Element not visible/found with any strategy: ${elementId}`);
    }

    /**
     * Try finding element with multiple strategies (single attempt)
     */
    private async tryFindElement(element: EnrichedElement, elementId: string): Promise<Locator | null> {

        // Strategy 1: Our injected data-agent-id
        const primarySelector = `[data-agent-id="${elementId}"]`;
        try {
            const locator = this.page.locator(primarySelector);
            if (await locator.count() > 0) {
                const first = locator.first();
                if (await first.isVisible({ timeout: 500 })) {  // Optimized: reduced from 1000ms
                    return first;
                }
            }
        } catch { }

        // Strategy 2: XPath backup
        try {
            const xpathLocator = this.page.locator(`xpath=${element.xpathBackup}`);
            if (await xpathLocator.count() > 0) {
                const first = xpathLocator.first();
                if (await first.isVisible({ timeout: 500 })) {  // Optimized: reduced from 1000ms
                    return first;
                }
            }
        } catch { }

        // Strategy 3: Text-based (for buttons and links)
        if (element.text && (element.tag === 'button' || element.tag === 'a')) {
            try {
                const textLocator = this.page.getByText(element.text, { exact: true });
                if (await textLocator.count() > 0) {
                    const first = textLocator.first();
                    if (await first.isVisible({ timeout: 500 })) {  // Optimized: reduced from 1000ms
                        return first;
                    }
                }
            } catch { }
        }

        // Strategy 4: Role-based
        if (element.role) {
            try {
                const roleLocator = this.page.getByRole(element.role as any, {
                    name: element.ariaLabel || element.text || undefined
                });
                if (await roleLocator.count() > 0) {
                    const first = roleLocator.first();
                    if (await first.isVisible({ timeout: 500 })) {  // Optimized: reduced from 1000ms
                        return first;
                    }
                }
            } catch { }
        }

        // Strategy 5: Placeholder-based (for inputs)
        if (element.placeholder) {
            try {
                const placeholderLocator = this.page.getByPlaceholder(element.placeholder);
                if (await placeholderLocator.count() > 0) {
                    const first = placeholderLocator.first();
                    if (await first.isVisible({ timeout: 500 })) {  // Optimized: reduced from 1000ms
                        return first;
                    }
                }
            } catch { }
        }

        return null; // Not found with any strategy
    }

    /**
     * Click with new tab detection
     */
    private async handleClick(elementId: string, elements: EnrichedElement[]): Promise<ActionResult> {
        const locator = await this.findElement(elementId, elements);

        // Wait for element to be ready
        await locator.waitFor({ state: 'visible', timeout: config.waitForElementTimeout });

        // Listen for new tab
        const [newPage] = await Promise.all([
            this.context.waitForEvent('page', { timeout: 3000 }).catch(() => null),
            locator.click(),
        ]);

        // Wait for action to complete
        await this.page.waitForTimeout(config.waitAfterActionMs);

        if (newPage) {
            this.logger.logInfo('Click opened new tab, switching...');
            await newPage.waitForLoadState('domcontentloaded');
            this.page = newPage;
            return { success: true, newTabOpened: true };
        }

        return { success: true };
    }

    /**
     * Type text into an input
     */
    private async handleType(
        elementId: string,
        text: string,
        clearFirst: boolean = false,
        elements: EnrichedElement[]
    ): Promise<ActionResult> {
        const locator = await this.findElement(elementId, elements);

        await locator.waitFor({ state: 'visible', timeout: config.waitForElementTimeout });

        if (clearFirst) {
            await locator.clear();
        }

        await locator.fill(text);
        await this.page.waitForTimeout(config.waitAfterActionMs);

        return { success: true };
    }

    /**
     * Clear an input
     */
    private async handleClear(elementId: string, elements: EnrichedElement[]): Promise<ActionResult> {
        const locator = await this.findElement(elementId, elements);
        await locator.clear();
        return { success: true };
    }

    /**
     * Select option from dropdown
     */
    private async handleSelect(elementId: string, value: string, elements: EnrichedElement[]): Promise<ActionResult> {
        const locator = await this.findElement(elementId, elements);
        await locator.waitFor({ state: 'visible', timeout: config.waitForElementTimeout });

        // Try selecting by label first (most common), then by value
        try {
            await locator.selectOption({ label: value });
        } catch {
            await locator.selectOption({ value: value });
        }

        await this.page.waitForTimeout(config.waitAfterActionMs);
        return { success: true };
    }

    /**
     * Navigate to URL
     */
    private async handleNavigate(url: string): Promise<ActionResult> {
        await this.page.goto(url, {
            timeout: config.waitForNavigationTimeout,
            waitUntil: 'domcontentloaded',
        });
        await this.page.waitForTimeout(config.waitAfterActionMs);
        return { success: true };
    }

    /**
     * Scroll the page
     */
    private async handleScroll(
        direction: 'up' | 'down' | 'toElement',
        elementId?: string,
        elements?: EnrichedElement[]
    ): Promise<ActionResult> {
        if (direction === 'toElement' && elementId && elements) {
            const locator = await this.findElement(elementId, elements);
            await locator.scrollIntoViewIfNeeded();
        } else {
            const delta = direction === 'down' ? 500 : -500;
            await this.page.evaluate((d) => window.scrollBy(0, d), delta);
        }

        await this.page.waitForTimeout(config.waitAfterActionMs);
        return { success: true };
    }

    /**
     * Press keyboard key
     */
    private async handlePressKey(key: string): Promise<ActionResult> {
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(config.waitAfterActionMs);
        return { success: true };
    }

    /**
     * Extract text content
     */
    private async handleExtract(
        elementId?: string,
        description?: string,
        elements?: EnrichedElement[]
    ): Promise<ActionResult> {
        let text: string;

        if (elementId && elements) {
            const locator = await this.findElement(elementId, elements);
            text = await locator.textContent() || '';
        } else {
            // Extract full page text
            text = await this.page.evaluate(() => document.body.innerText);
        }

        // Truncate if too long
        if (text.length > 5000) {
            text = text.slice(0, 5000) + '\n... [truncated]';
        }

        return { success: true, data: text.trim() };
    }

    /**
     * Wait for element to appear
     */
    private async handleWaitForElement(
        elementId: string,
        timeout?: number,
        elements?: EnrichedElement[]
    ): Promise<ActionResult> {
        const selector = `[data-agent-id="${elementId}"]`;
        const waitTimeout = timeout || config.waitForElementTimeout;

        // Try with retries for lazy-loaded content
        for (let i = 0; i < config.lazyLoadRetryCount; i++) {
            try {
                await this.page.waitForSelector(selector, {
                    state: 'visible',
                    timeout: waitTimeout / config.lazyLoadRetryCount,
                });
                return { success: true };
            } catch {
                await this.page.waitForTimeout(config.lazyLoadRetryDelayMs);
            }
        }

        return { success: false, error: `Element ${elementId} not visible after ${waitTimeout}ms` };
    }
}
