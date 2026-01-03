import { config } from '../utils/config';
import { Logger } from '../utils/logger';
import { BrowserController } from '../browser/controller';
import { StateExtractor } from '../browser/state-extractor';
import { ActionExecutor } from '../browser/actions';
import { GeminiClient } from '../llm/gemini';
import { MemoryManager } from './memory';
import { LoopDetector } from '../detection/loop-detector';
import { AgentResult, StepRecord, PageState } from './types';

/**
 * Agent Orchestrator - Main execution loop
 * 
 * Flow:
 * 1. Initialize browser, Gemini, memory
 * 2. Create high-level plan
 * 3. Loop: observe → think → act → evaluate
 * 4. Handle loops, retries, compression
 * 5. Return result when done/failed
 */
export class AgentOrchestrator {
    private logger: Logger;
    private browser: BrowserController;
    private stateExtractor: StateExtractor;
    private actionExecutor!: ActionExecutor;
    private gemini: GeminiClient;
    private memoryManager: MemoryManager;
    private loopDetector: LoopDetector;

    constructor(goal: string) {
        this.logger = new Logger();
        this.browser = new BrowserController(this.logger);
        this.stateExtractor = new StateExtractor();
        this.gemini = new GeminiClient(this.logger);
        this.memoryManager = new MemoryManager(goal, this.gemini, this.logger);
        this.loopDetector = new LoopDetector();
    }

    /**
     * Run the agent to complete the goal
     */
    async run(): Promise<AgentResult> {
        const memory = this.memoryManager.getMemory();

        this.logger.logSessionStart(memory.originalGoal);

        try {
            // Initialize
            await this.browser.launch();
            this.actionExecutor = new ActionExecutor(
                this.browser.page,
                this.browser.browserContext,
                this.stateExtractor,
                this.logger
            );

            // Create initial plan
            await this.memoryManager.initializePlan();

            // Main loop
            while (memory.currentStep < config.maxSteps) {
                // 1. OBSERVE - Get current page state
                const pageState = await this.stateExtractor.extractState(this.browser.page);
                this.logger.logStep(memory.currentStep + 1, pageState);

                // Save screenshot
                const screenshotPath = await this.logger.saveScreenshot(
                    pageState.screenshot,
                    memory.currentStep + 1
                );

                // 2. THINK - Get action from Gemini
                let response;
                try {
                    response = await this.gemini.getNextAction(memory, pageState);
                    this.logger.logLLMResponse(response);
                } catch (error) {
                    this.logger.logError('LLM call failed', error as Error);
                    memory.consecutiveFailures++;

                    if (memory.consecutiveFailures >= 5) {
                        return this.finalize(false, undefined, 'Too many consecutive LLM failures');
                    }
                    continue;
                }

                // 3. Check for terminal actions
                if (response.action.type === 'done') {
                    return this.finalize(true, response.action.result);
                }

                if (response.action.type === 'fail') {
                    return this.finalize(false, undefined, response.action.reason);
                }

                // 4. ACT - Execute the action
                const result = await this.actionExecutor.execute(response.action, pageState.elements);
                this.logger.logActionResult(result, screenshotPath);

                // Update page reference if new tab opened
                if (result.newTabOpened) {
                    this.actionExecutor.setPage(this.browser.page);
                }

                // 5. Record step
                const stepRecord: StepRecord = {
                    stepNumber: memory.currentStep + 1,
                    timestamp: new Date(),
                    pageUrl: pageState.url,
                    pageTitle: pageState.title,
                    action: response.action,
                    result,
                    thinking: response.thinking,
                    screenshotPath,
                };
                await this.memoryManager.addStep(stepRecord);

                // 6. Check for loops
                const loopCheck = this.loopDetector.detect(memory.recentSteps);
                if (loopCheck.detected) {
                    this.logger.logLoopDetection(loopCheck.type!, loopCheck.message!, false);

                    // Confirm with LLM
                    const confirmation = await this.gemini.confirmLoop(
                        loopCheck.type!,
                        loopCheck.message!,
                        memory.recentSteps
                    );

                    this.logger.logLoopDetection(loopCheck.type!, loopCheck.message!, confirmation.isRealLoop);

                    if (confirmation.isRealLoop) {
                        this.memoryManager.addDiscovery(`Loop detected: ${loopCheck.message}`);

                        // Recovery: Try scrolling or different approach
                        this.logger.logRecovery('scroll_and_retry', 'Trying to scroll and find different elements');
                        await this.browser.scroll('down', 500);

                        // Reset loop detector
                        this.loopDetector.reset();
                    }
                }

                // 7. Check consecutive failures
                if (memory.consecutiveFailures >= 3) {
                    this.memoryManager.addDiscovery(`Multiple failures on: ${pageState.url}`);

                    // Try scrolling as recovery
                    await this.browser.scroll('down', 300);
                }

                // Small delay between steps (optimized: reduced from 500ms)
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Max steps exceeded
            return this.finalize(false, undefined, 'Maximum steps exceeded');

        } catch (error) {
            this.logger.logError('Agent error', error as Error);
            return this.finalize(false, undefined, (error as Error).message);
        }
    }

    /**
     * Cleanup and return result
     */
    private async finalize(
        success: boolean,
        result?: string,
        reason?: string
    ): Promise<AgentResult> {
        const memory = this.memoryManager.getMemory();

        this.logger.logSessionEnd(
            success,
            result,
            reason,
            this.memoryManager.getTotalSteps()
        );

        try {
            await this.browser.close();
        } catch { }

        return {
            success,
            result,
            reason,
            totalSteps: this.memoryManager.getTotalSteps(),
            duration: this.memoryManager.getDuration(),
            logPath: this.logger.getLogPath(),
        };
    }
}
