import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import { Action, ActionResult, StepRecord, AgentResponse, PageState } from '../agent/types';

/**
 * Human-readable logger with auto-save to file
 * Creates detailed, formatted logs for each step
 */
export class Logger {
    private logPath: string;
    private screenshotDir: string;
    private sessionId: string;
    private buffer: string[] = [];

    constructor() {
        this.sessionId = this.generateSessionId();

        // Ensure log directory exists
        if (!fs.existsSync(config.logDir)) {
            fs.mkdirSync(config.logDir, { recursive: true });
        }

        // Create session log file
        this.logPath = path.join(config.logDir, `session_${this.sessionId}.log`);
        this.screenshotDir = path.join(config.logDir, 'screenshots', this.sessionId);

        if (config.saveScreenshots && !fs.existsSync(this.screenshotDir)) {
            fs.mkdirSync(this.screenshotDir, { recursive: true });
        }
    }

    private generateSessionId(): string {
        const now = new Date();
        return now.toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .slice(0, 19);
    }

    private write(message: string): void {
        this.buffer.push(message);
        fs.appendFileSync(this.logPath, message + '\n');

        if (config.logLevel === 'debug') {
            console.log(message);
        }
    }

    getLogPath(): string {
        return this.logPath;
    }

    getScreenshotDir(): string {
        return this.screenshotDir;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Session Logging
    // ═══════════════════════════════════════════════════════════════════════════

    logSessionStart(goal: string): void {
        const header = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                        BROWSER AGENT SESSION                                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Started: ${new Date().toISOString().padEnd(66)}║
║  Session: ${this.sessionId.padEnd(66)}║
╠══════════════════════════════════════════════════════════════════════════════╣
║  GOAL:                                                                        ║
║  ${this.wrapText(goal, 76).padEnd(76)}║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
        this.write(header);
    }

    logSessionEnd(success: boolean, result?: string, reason?: string, totalSteps?: number): void {
        const footer = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                           SESSION COMPLETE                                    ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Status: ${success ? '✅ SUCCESS' : '❌ FAILED'.padEnd(68)}║
║  Total Steps: ${String(totalSteps || 0).padEnd(63)}║
║  Ended: ${new Date().toISOString().padEnd(69)}║
${result ? `╠══════════════════════════════════════════════════════════════════════════════╣
║  RESULT:                                                                      ║
${this.wrapTextMultiLine(result, 76)}` : ''}
${reason ? `╠══════════════════════════════════════════════════════════════════════════════╣
║  REASON: ${reason.padEnd(68)}║` : ''}
╚══════════════════════════════════════════════════════════════════════════════╝
`;
        this.write(footer);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Step Logging
    // ═══════════════════════════════════════════════════════════════════════════

    logStep(stepNumber: number, state: PageState): void {
        const stepHeader = `
═══════════════════════════════════════════════════════════════════════════════
STEP ${stepNumber} | ${new Date().toISOString()} | ${state.url}
═══════════════════════════════════════════════════════════════════════════════

📄 PAGE: ${state.title}
🔗 URL: ${state.url}
📊 Elements found: ${state.elements.length}
${state.elements.length < 10 ? '⚠️ WARNING: Very few elements found - Page may be blocked, empty, or not fully loaded' : ''}
`;
        this.write(stepHeader);
    }

    logLLMResponse(response: AgentResponse): void {
        const thinkingSection = `
📋 LLM THINKING:
   "${this.wrapText(response.thinking, 73)}"

🎯 ACTION:
   Type: ${response.action.type}
   ${this.formatAction(response.action)}
   Confidence: ${(response.confidence * 100).toFixed(0)}%
`;
        this.write(thinkingSection);
    }

    logActionResult(result: ActionResult, screenshotPath?: string): void {
        const resultSection = `
📊 RESULT:
   Status: ${result.success ? '✅ Success' : '❌ Failed'}
   Duration: ${result.duration}ms
   ${result.retriesUsed ? `Retries used: ${result.retriesUsed}` : ''}
   ${result.newTabOpened ? '🆕 New tab opened' : ''}
   ${result.error ? `Error: ${result.error}` : ''}
   ${result.data ? `Data: ${String(result.data).slice(0, 100)}...` : ''}
   ${screenshotPath ? `📸 Screenshot: ${screenshotPath}` : ''}

───────────────────────────────────────────────────────────────────────────────
`;
        this.write(resultSection);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Special Events
    // ═══════════════════════════════════════════════════════════════════════════

    logLoopDetection(type: string, message: string, isConfirmed: boolean): void {
        const loopSection = `
⚠️ LOOP DETECTION
   Type: ${type}
   Message: ${message}
   Confirmed by LLM: ${isConfirmed ? 'Yes - triggering recovery' : 'No - false positive'}
───────────────────────────────────────────────────────────────────────────────
`;
        this.write(loopSection);
    }

    logRecovery(strategy: string, reasoning: string): void {
        const recoverySection = `
🔄 RECOVERY TRIGGERED
   Strategy: ${strategy}
   Reasoning: ${reasoning}
───────────────────────────────────────────────────────────────────────────────
`;
        this.write(recoverySection);
    }

    logMemoryCompression(fromStep: number, toStep: number, summary: string): void {
        const compressionSection = `
💾 MEMORY COMPRESSION
   Steps ${fromStep}-${toStep} compressed
   Summary: "${summary}"
───────────────────────────────────────────────────────────────────────────────
`;
        this.write(compressionSection);
    }

    logConsole(type: string, text: string): void {
        const icon = type === 'error' ? '🛑' : type === 'warning' ? '⚠️' : 'ℹ️';
        this.write(`   ${icon} [Browser] ${type.toUpperCase()}: ${text.slice(0, 200)}`);
    }

    logPageError(error: Error): void {
        this.write(`   🔥 [Browser] UNCAUGHT ERROR: ${error.message}`);
    }

    logNetworkError(url: string, status: number): void {
        this.write(`   🌐 [Browser] HTTP ${status}: ${url}`);
    }

    logError(message: string, error?: Error): void {
        const errorSection = `
❌ ERROR: ${message}
   ${error ? error.stack : ''}
───────────────────────────────────────────────────────────────────────────────
`;
        this.write(errorSection);
    }

    logInfo(message: string): void {
        this.write(`ℹ️  ${message}`);
    }

    logDebug(message: string): void {
        if (config.logLevel === 'debug') {
            this.write(`🔍 ${message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════════════════

    private formatAction(action: Action): string {
        switch (action.type) {
            case 'click':
                return `Element: ${action.elementId}`;
            case 'type':
                return `Element: ${action.elementId}, Text: "${action.text}"`;
            case 'navigate':
                return `URL: ${action.url}`;
            case 'scroll':
                return `Direction: ${action.direction}${action.elementId ? `, To: ${action.elementId}` : ''}`;
            case 'pressKey':
                return `Key: ${action.key}`;
            case 'extract':
                return `${action.elementId ? `Element: ${action.elementId}` : 'Full page'}`;
            case 'waitForElement':
                return `Element: ${action.elementId}`;
            case 'done':
                return `Result: "${action.result.slice(0, 50)}..."`;
            case 'fail':
                return `Reason: ${action.reason}`;
            default:
                return JSON.stringify(action);
        }
    }

    private wrapText(text: string, width: number): string {
        if (text.length <= width) return text;
        return text.slice(0, width - 3) + '...';
    }

    private wrapTextMultiLine(text: string, width: number): string {
        const lines: string[] = [];
        const words = text.split(' ');
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + ' ' + word).length <= width) {
                currentLine = currentLine ? currentLine + ' ' + word : word;
            } else {
                if (currentLine) lines.push(`║  ${currentLine.padEnd(76)}║`);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(`║  ${currentLine.padEnd(76)}║`);

        return lines.join('\n');
    }

    /**
     * Save screenshot and return path
     */
    async saveScreenshot(screenshot: string, stepNumber: number): Promise<string> {
        if (!config.saveScreenshots) return '';

        const filename = `step_${String(stepNumber).padStart(3, '0')}.png`;
        const filepath = path.join(this.screenshotDir, filename);

        const buffer = Buffer.from(screenshot, 'base64');
        fs.writeFileSync(filepath, buffer);

        return filepath;
    }
}
