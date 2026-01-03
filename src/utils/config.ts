import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file
dotenv.config();

export const config = {
    // Gemini API
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',  // Optimized: faster model
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash',

    // Browser Settings
    browserHeadless: process.env.BROWSER_HEADLESS === 'true',
    browserWindowWidth: parseInt(process.env.BROWSER_WINDOW_WIDTH || '1280', 10),
    browserWindowHeight: parseInt(process.env.BROWSER_WINDOW_HEIGHT || '900', 10),
    browserSlowMo: parseInt(process.env.BROWSER_SLOW_MO || '0', 10),  // Optimized: no artificial slowdown

    // Timing & Wait Settings
    waitForNavigationTimeout: parseInt(process.env.WAIT_FOR_NAVIGATION_TIMEOUT || '30000', 10),
    waitForElementTimeout: parseInt(process.env.WAIT_FOR_ELEMENT_TIMEOUT || '5000', 10),
    waitAfterActionMs: parseInt(process.env.WAIT_AFTER_ACTION_MS || '200', 10),  // Optimized: reduced from 500
    lazyLoadRetryCount: parseInt(process.env.LAZY_LOAD_RETRY_COUNT || '3', 10),
    lazyLoadRetryDelayMs: parseInt(process.env.LAZY_LOAD_RETRY_DELAY_MS || '500', 10),  // Optimized: reduced from 1000

    // Agent Settings
    maxSteps: parseInt(process.env.MAX_STEPS || '100', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    historyWindowSize: parseInt(process.env.HISTORY_WINDOW_SIZE || '15', 10),
    compressionThreshold: parseInt(process.env.COMPRESSION_THRESHOLD || '10', 10),

    // Loop Detection
    loopActionThreshold: parseInt(process.env.LOOP_ACTION_THRESHOLD || '3', 10),
    loopStateThreshold: parseInt(process.env.LOOP_STATE_THRESHOLD || '3', 10),
    loopUrlThreshold: parseInt(process.env.LOOP_URL_THRESHOLD || '4', 10),

    // Logging
    logDir: process.env.LOG_DIR || './logs',
    logLevel: process.env.LOG_LEVEL || 'debug',
    saveScreenshots: process.env.SAVE_SCREENSHOTS !== 'false',
};

// Validate required config
export function validateConfig(): void {
    if (!config.geminiApiKey || config.geminiApiKey === 'your_api_key_here') {
        throw new Error('GEMINI_API_KEY is not set in .env file');
    }
}
