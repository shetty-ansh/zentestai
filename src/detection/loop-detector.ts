import { config } from '../utils/config';
import { LoopCheckResult, StepRecord } from '../agent/types';
import * as crypto from 'crypto';

/**
 * Loop Detector - Multi-strategy detection
 * 
 * Strategies:
 * 1. Action repetition - same action hash 3+ times
 * 2. State repetition - same DOM hash 3+ times  
 * 3. URL cycling - A→B→A→B pattern
 * 
 * If ANY strategy returns true → Ask LLM to confirm
 * (Handles false positives like same URL with different actions)
 */
export class LoopDetector {
    private recentActionHashes: string[] = [];
    private recentStateHashes: string[] = [];
    private recentUrls: string[] = [];

    /**
     * Check if agent is stuck in a loop
     */
    detect(recentSteps: StepRecord[]): LoopCheckResult {
        // Update tracking arrays
        this.updateFromSteps(recentSteps);

        // Check all strategies
        const actionLoop = this.checkActionRepetition();
        const stateLoop = this.checkStateRepetition();
        const urlLoop = this.checkUrlCycling();

        // Return first detected loop
        if (actionLoop.detected) return actionLoop;
        if (stateLoop.detected) return stateLoop;
        if (urlLoop.detected) return urlLoop;

        return { detected: false, confidence: 0 };
    }

    /**
     * Reset detector state
     */
    reset(): void {
        this.recentActionHashes = [];
        this.recentStateHashes = [];
        this.recentUrls = [];
    }

    /**
     * Update internal state from steps
     */
    private updateFromSteps(steps: StepRecord[]): void {
        if (steps.length === 0) return;

        // Keep last N items
        const keepCount = 10;

        // Extract from recent steps
        for (const step of steps.slice(-keepCount)) {
            const actionHash = this.hashAction(step.action);
            this.recentActionHashes.push(actionHash);

            // Simple state hash from URL + action type
            const stateHash = this.hashState(step.pageUrl, step.action);
            this.recentStateHashes.push(stateHash);

            this.recentUrls.push(step.pageUrl);
        }

        // Trim to keep count
        this.recentActionHashes = this.recentActionHashes.slice(-keepCount);
        this.recentStateHashes = this.recentStateHashes.slice(-keepCount);
        this.recentUrls = this.recentUrls.slice(-keepCount);
    }

    /**
     * Strategy 1: Same action repeated N times
     */
    private checkActionRepetition(): LoopCheckResult {
        if (this.recentActionHashes.length < config.loopActionThreshold) {
            return { detected: false, confidence: 0 };
        }

        const lastN = this.recentActionHashes.slice(-config.loopActionThreshold);
        const allSame = lastN.every(h => h === lastN[0]);

        if (allSame) {
            return {
                detected: true,
                type: 'action_repetition',
                message: `Same action repeated ${config.loopActionThreshold}+ times`,
                confidence: 0.7,
            };
        }

        return { detected: false, confidence: 0 };
    }

    /**
     * Strategy 2: Same page state repeated N times
     */
    private checkStateRepetition(): LoopCheckResult {
        if (this.recentStateHashes.length < config.loopStateThreshold) {
            return { detected: false, confidence: 0 };
        }

        // Count occurrences of each state
        const counts = new Map<string, number>();
        for (const hash of this.recentStateHashes) {
            counts.set(hash, (counts.get(hash) || 0) + 1);
        }

        // Check if any state appears too often
        for (const [hash, count] of counts) {
            if (count >= config.loopStateThreshold) {
                return {
                    detected: true,
                    type: 'state_repetition',
                    message: `Same page state occurred ${count} times in recent history`,
                    confidence: 0.6,
                };
            }
        }

        return { detected: false, confidence: 0 };
    }

    /**
     * Strategy 3: URL ping-pong pattern (A→B→A→B)
     */
    private checkUrlCycling(): LoopCheckResult {
        if (this.recentUrls.length < config.loopUrlThreshold) {
            return { detected: false, confidence: 0 };
        }

        const lastN = this.recentUrls.slice(-config.loopUrlThreshold);

        // Check for alternating pattern
        const uniqueUrls = new Set(lastN);
        if (uniqueUrls.size <= 2 && lastN.length >= 4) {
            // Possible ping-pong
            let isPingPong = true;
            for (let i = 2; i < lastN.length; i++) {
                if (lastN[i] !== lastN[i % 2 === 0 ? 0 : 1]) {
                    isPingPong = false;
                    break;
                }
            }

            if (isPingPong) {
                return {
                    detected: true,
                    type: 'url_cycling',
                    message: `URL cycling detected between ${[...uniqueUrls].join(' and ')}`,
                    confidence: 0.8,
                };
            }
        }

        return { detected: false, confidence: 0 };
    }

    /**
     * Hash an action for comparison
     */
    private hashAction(action: any): string {
        const str = JSON.stringify(action);
        return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
    }

    /**
     * Hash state (URL + action type) for comparison
     */
    private hashState(url: string, action: any): string {
        const str = `${url}:${action.type}:${action.elementId || ''}`;
        return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
    }
}
