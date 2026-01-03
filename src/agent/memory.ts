import { config } from '../utils/config';
import { Logger } from '../utils/logger';
import { GeminiClient } from '../llm/gemini';
import { AgentMemory, StepRecord, PlanStep, HistorySummary } from './types';

/**
 * Memory Manager - Handles history compression for long tasks
 * 
 * Features:
 * - Sliding window of recent steps (full detail)
 * - Compressed summaries for older steps
 * - Key discoveries tracking
 */
export class MemoryManager {
    private memory: AgentMemory;
    private gemini: GeminiClient;
    private logger: Logger;

    constructor(goal: string, gemini: GeminiClient, logger: Logger) {
        this.gemini = gemini;
        this.logger = logger;
        this.memory = {
            originalGoal: goal,
            plan: [],
            historySummaries: [],
            recentSteps: [],
            keyDiscoveries: [],
            currentStep: 0,
            consecutiveFailures: 0,
            startTime: new Date(),
        };
    }

    getMemory(): AgentMemory {
        return this.memory;
    }

    /**
     * Initialize plan from goal
     */
    async initializePlan(): Promise<void> {
        this.logger.logInfo('Creating initial plan...');
        const steps = await this.gemini.createPlan(this.memory.originalGoal);

        this.memory.plan = steps.map((desc, i) => ({
            id: i + 1,
            description: desc,
            status: i === 0 ? 'in_progress' : 'pending',
        }));

        this.logger.logDebug(`Plan created with ${this.memory.plan.length} steps`);
    }

    /**
     * Add a completed step
     */
    async addStep(step: StepRecord): Promise<void> {
        this.memory.recentSteps.push(step);
        this.memory.currentStep++;

        // Update consecutive failures
        if (!step.result.success) {
            this.memory.consecutiveFailures++;
        } else {
            this.memory.consecutiveFailures = 0;
        }

        // Check if compression needed
        await this.maybeCompress();
    }

    /**
     * Add a key discovery
     */
    addDiscovery(discovery: string): void {
        if (!this.memory.keyDiscoveries.includes(discovery)) {
            this.memory.keyDiscoveries.push(discovery);
            this.logger.logDebug(`Key discovery: ${discovery}`);
        }
    }

    /**
     * Update plan step status
     */
    updatePlanStep(index: number, status: PlanStep['status']): void {
        if (index >= 0 && index < this.memory.plan.length) {
            this.memory.plan[index].status = status;
        }
    }

    /**
     * Mark current plan step as complete and move to next
     */
    advancePlan(): void {
        const currentIdx = this.memory.plan.findIndex(s => s.status === 'in_progress');
        if (currentIdx >= 0) {
            this.memory.plan[currentIdx].status = 'completed';

            // Find next pending step
            const nextIdx = this.memory.plan.findIndex(s => s.status === 'pending');
            if (nextIdx >= 0) {
                this.memory.plan[nextIdx].status = 'in_progress';
            }
        }
    }

    /**
     * Compress history if needed
     */
    private async maybeCompress(): Promise<void> {
        const totalSteps = this.memory.recentSteps.length;
        const threshold = config.historyWindowSize + config.compressionThreshold;

        if (totalSteps < threshold) {
            return;
        }

        // Take oldest steps for compression
        const toCompress = this.memory.recentSteps.slice(0, config.compressionThreshold);
        const remaining = this.memory.recentSteps.slice(config.compressionThreshold);

        // Get summary from Gemini
        const summary = await this.gemini.summarizeHistory(toCompress);

        // Create history summary
        const stepRange: [number, number] = [
            toCompress[0].stepNumber,
            toCompress[toCompress.length - 1].stepNumber,
        ];

        this.memory.historySummaries.push({
            stepRange,
            summary,
        });

        // Update recent steps
        this.memory.recentSteps = remaining;

        this.logger.logMemoryCompression(
            stepRange[0],
            stepRange[1],
            summary
        );
    }

    /**
     * Get total steps executed
     */
    getTotalSteps(): number {
        return this.memory.currentStep;
    }

    /**
     * Get execution duration in ms
     */
    getDuration(): number {
        return Date.now() - this.memory.startTime.getTime();
    }
}
