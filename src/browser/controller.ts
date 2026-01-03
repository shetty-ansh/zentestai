import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../utils/config';
import { Logger } from '../utils/logger';

/**
 * Browser controller - manages Playwright browser instance
 * Handles: launch, navigation, new tab detection, cleanup
 */
export class BrowserController {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private _page: Page | null = null;
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    get page(): Page {
        if (!this._page) {
            throw new Error('Browser not initialized. Call launch() first.');
        }
        return this._page;
    }

    get browserContext(): BrowserContext {
        if (!this.context) {
            throw new Error('Browser not initialized. Call launch() first.');
        }
        return this.context;
    }

    /**
     * Launch browser with configured settings
     */
    async launch(): Promise<void> {
        this.logger.logInfo('Launching browser...');

        // Add stealth args to minimize detection
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--disable-blink-features=AutomationControlled', // Critical for preventing basic bot detection
        ];

        this.browser = await chromium.launch({
            headless: config.browserHeadless,
            slowMo: config.browserSlowMo,
            args,
        });

        this.context = await this.browser.newContext({
            viewport: {
                width: config.browserWindowWidth,
                height: config.browserWindowHeight,
            },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });

        this._page = await this.context.newPage();
        this.setupPageListeners(this._page);

        // Set up new tab detection
        this.context.on('page', async (newPage) => {
            this.logger.logInfo('New tab detected, switching context...');
            this._page = newPage;
            this.setupPageListeners(newPage);
            await this.waitForPageReady();
        });

        this.logger.logInfo(`Browser launched (${config.browserWindowWidth}x${config.browserWindowHeight})`);
    }

    /**
     * Set up listeners for console, errors, and network
     */
    private setupPageListeners(page: Page): void {
        // Console logs
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning') {
                this.logger.logConsole(msg.type(), msg.text());
            }
        });

        // Uncaught errors
        page.on('pageerror', err => {
            this.logger.logPageError(err);
        });

        // Failed requests (4xx/5xx)
        page.on('response', response => {
            const status = response.status();
            if (status >= 400) {
                this.logger.logNetworkError(response.url(), status);
            }
        });
    }

    /**
     * Navigate to URL with proper waiting
     * NOTE: We avoid networkidle as it's unreliable (ads, polling)
     */
    async navigate(url: string): Promise<void> {
        this.logger.logDebug(`Navigating to: ${url}`);

        await this.page.goto(url, {
            timeout: config.waitForNavigationTimeout,
            waitUntil: 'domcontentloaded', // More reliable than networkidle
        });

        // Additional wait for JS execution
        await this.waitForPageReady();
    }

    /**
     * Wait for page to be ready for interaction
     * Uses multiple signals since networkidle is unreliable
     */
    async waitForPageReady(): Promise<void> {
        try {
            // Wait for DOM to be loaded
            await this.page.waitForLoadState('domcontentloaded');

            // Small buffer for JS execution
            await this.page.waitForTimeout(config.waitAfterActionMs);

            // Try to wait for network to calm down, but don't fail if it doesn't
            await this.page.waitForLoadState('load').catch(() => { });

            // Auto-dismiss cookie banners (silent, best-effort)
            await this.dismissCookieBanner();

        } catch (error) {
            this.logger.logDebug(`Page ready wait had issues: ${error}`);
        }
    }

    /**
     * Attempt to dismiss common cookie consent banners (silent, best-effort)
     */
    private async dismissCookieBanner(): Promise<void> {
        const selectors = [
            // Most common cookie banner accept buttons (optimized: reduced from 10 to 5)
            '[id*="cookie"] button:has-text("Accept")',
            '[class*="cookie"] button:has-text("Accept")',
            'button:has-text("Accept all")',
            'button:has-text("Accept cookies")',
            '[id*="consent"] button:has-text("Accept")',
        ];

        for (const selector of selectors) {
            try {
                const button = this.page.locator(selector).first();
                if (await button.isVisible({ timeout: 200 })) {  // Optimized: reduced from 500ms
                    await button.click();
                    this.logger.logDebug('Dismissed cookie banner');
                    return;
                }
            } catch {
                // Silent failure - banner not found or not clickable
            }
        }
    }

    /**
     * Take screenshot of current viewport
     */
    async takeScreenshot(): Promise<string> {
        const buffer = await this.page.screenshot({
            type: 'png',
            fullPage: false, // Just viewport
        });
        return buffer.toString('base64');
    }

    /**
     * Get current page URL
     */
    getUrl(): string {
        return this.page.url();
    }

    /**
     * Get current page title
     */
    async getTitle(): Promise<string> {
        return await this.page.title();
    }

    /**
     * Get viewport size
     */
    getViewportSize(): { width: number; height: number } {
        const size = this.page.viewportSize();
        return size || { width: config.browserWindowWidth, height: config.browserWindowHeight };
    }

    /**
     * Scroll the page
     */
    async scroll(direction: 'up' | 'down', amount: number = 500): Promise<void> {
        const delta = direction === 'down' ? amount : -amount;
        await this.page.evaluate((d) => window.scrollBy(0, d), delta);
        await this.page.waitForTimeout(150); // Optimized: reduced from 300ms
    }

    /**
     * Scroll to specific element
     */
    async scrollToElement(selector: string): Promise<void> {
        await this.page.locator(selector).scrollIntoViewIfNeeded();
        await this.page.waitForTimeout(150);  // Optimized: reduced from 300ms
    }

    /**
     * Press keyboard key
     */
    async pressKey(key: string): Promise<void> {
        await this.page.keyboard.press(key);
        await this.page.waitForTimeout(config.waitAfterActionMs);
    }

    /**
     * Close browser and cleanup
     */
    async close(): Promise<void> {
        this.logger.logInfo('Closing browser...');

        if (this.context) {
            await this.context.close();
        }
        if (this.browser) {
            await this.browser.close();
        }

        this._page = null;
        this.context = null;
        this.browser = null;
    }
}
