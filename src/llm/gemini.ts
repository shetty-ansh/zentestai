import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../utils/config';
import { Logger } from '../utils/logger';
import { AgentMemory, PageState, AgentResponse, Action, EnrichedElement, HistorySummary } from '../agent/types';

/**
 * Gemini API client with vision support
 */
export class GeminiClient {
    private genAI: GoogleGenerativeAI;
    private logger: Logger;
    private currentModel: string;

    constructor(logger: Logger) {
        this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
        this.logger = logger;
        this.currentModel = config.geminiModel;
    }

    /**
     * Get next action from Gemini based on current state
     */
    async getNextAction(memory: AgentMemory, pageState: PageState): Promise<AgentResponse> {
        const prompt = this.buildStepPrompt(memory, pageState);

        this.logger.logDebug(`Calling Gemini (${this.currentModel})...`);
        const startTime = Date.now();

        try {
            const model = this.genAI.getGenerativeModel({ model: this.currentModel });

            const result = await model.generateContent([
                { text: prompt },
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: pageState.screenshot,
                    },
                },
            ]);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.logger.logDebug(`Gemini responded in ${elapsed}s`);

            const response = result.response;
            const text = response.text();

            if (!text) {
                throw new Error('Empty response from Gemini');
            }

            return this.parseResponse(text);

        } catch (error) {
            // Try fallback model if primary fails
            if (this.currentModel !== config.geminiFallbackModel) {
                this.logger.logInfo(`Primary model failed, switching to ${config.geminiFallbackModel}`);
                this.currentModel = config.geminiFallbackModel;
                return this.getNextAction(memory, pageState);
            }
            throw error;
        }
    }

    /**
     * Ask LLM to create high-level plan
     */
    async createPlan(goal: string): Promise<string[]> {
        const prompt = `You are a browser automation agent. Create a high-level plan (5-10 steps) to accomplish this goal:

"${goal}"

Return a JSON array of step descriptions. Each step should be a single, clear objective.
Example: ["Navigate to Google", "Search for the query", "Click first result", "Extract article content", "Summarize and return"]

Respond with ONLY the JSON array, no other text.`;

        const model = this.genAI.getGenerativeModel({ model: this.currentModel });
        const result = await model.generateContent(prompt);
        const text = result.response.text() || '[]';

        try {
            const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            return ['Complete the given task'];
        }
    }

    /**
     * Summarize history steps for compression
     */
    async summarizeHistory(steps: any[]): Promise<string> {
        const prompt = `Summarize these browser automation steps in 2-3 concise sentences. Focus on what was accomplished:

${JSON.stringify(steps, null, 2)}

Respond with ONLY the summary text, no other formatting.`;

        const model = this.genAI.getGenerativeModel({ model: this.currentModel });
        const result = await model.generateContent(prompt);
        return result.response.text() || 'Performed several browser actions.';
    }

    /**
     * Confirm if detected loop is real or false positive
     */
    async confirmLoop(
        loopType: string,
        message: string,
        recentSteps: any[]
    ): Promise<{ isRealLoop: boolean; reasoning: string }> {
        const prompt = `I'm a browser automation agent and detected a potential loop.

Loop type: ${loopType}
Details: ${message}

Recent steps:
${JSON.stringify(recentSteps.slice(-5), null, 2)}

Is this a REAL infinite loop where I'm stuck, or is this intentional behavior (e.g., multiple similar actions on the same page for data extraction)?

Respond with JSON: { "isRealLoop": true/false, "reasoning": "explanation" }`;

        const model = this.genAI.getGenerativeModel({ model: this.currentModel });
        const result = await model.generateContent(prompt);

        try {
            const text = result.response.text() || '{"isRealLoop": false, "reasoning": "Unable to determine"}';
            const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            return { isRealLoop: false, reasoning: 'Parse error, assuming false positive' };
        }
    }

    /**
     * Build the step prompt for Gemini
     */
    private buildStepPrompt(memory: AgentMemory, state: PageState): string {
        // Format plan with status
        const planSection = memory.plan.map((step, i) => {
            const status = step.status === 'completed' ? '✅' :
                step.status === 'in_progress' ? '🔄' :
                    step.status === 'failed' ? '❌' :
                        step.status === 'skipped' ? '⏭️' : '⬜';
            return `${status} ${i + 1}. ${step.description}`;
        }).join('\n');

        // Format history summaries
        const historySummarySection = memory.historySummaries.length > 0
            ? memory.historySummaries.map(h =>
                `- Steps ${h.stepRange[0]}-${h.stepRange[1]}: ${h.summary}`
            ).join('\n')
            : '(No compressed history yet)';

        // Format recent steps
        const recentStepsSection = memory.recentSteps.length > 0
            ? memory.recentSteps.slice(-10).map(s =>
                `Step ${s.stepNumber}: ${s.action.type}${s.action.type === 'click' ? `(${(s.action as any).elementId})` : ''} → ${s.result.success ? '✓' : '✗'}`
            ).join('\n')
            : '(No steps yet)';

        // Format key discoveries
        const discoveriesSection = memory.keyDiscoveries.length > 0
            ? memory.keyDiscoveries.map(d => `- ${d}`).join('\n')
            : '(None yet)';

        // Format interactive elements (visible only, top 30)
        const visibleElements = state.elements
            .filter(e => e.isVisible)
            .slice(0, 30);

        const elementsSection = visibleElements.map(e => {
            const parts = [
                `[${e.id}] ${e.tag}`,
                e.text ? `"${e.text.slice(0, 50)}"` : '',
                e.role ? `role="${e.role}"` : '',
                e.placeholder ? `placeholder="${e.placeholder}"` : '',
                e.href ? `href="${e.href.slice(0, 50)}..."` : '',
                e.parentInfo ? `(${e.parentInfo})` : '',
            ].filter(Boolean).join(' ');
            return parts;
        }).join('\n');

        return `You are an autonomous browser automation agent controlling a real browser.

## AVAILABLE ACTIONS
- click(elementId): Click an element
- type(elementId, text, clearFirst?): Type into input (clearFirst=true to clear first)
- clear(elementId): Clear an input field
- select(elementId, value): Select option from dropdown menu by its label
- navigate(url): Go to URL
- scroll(direction, elementId?): Scroll "up"/"down" or "toElement"
- pressKey(key): Press keyboard key (Enter, Escape, Tab, etc.)
- extract(elementId?, description?): Get text content
- waitForElement(elementId, timeout?): Wait for element
- done(result): Task complete - return result text
- fail(reason): Task impossible

## RULES
1. The DOM shown below is the SOURCE OF TRUTH - only interact with elements you see
2. Take ONE action at a time
3. If element not visible, try scrolling first
4. Always explain your reasoning in "thinking"
5. Use "done" to return text results (summaries, extracted data, etc.)
6. Be methodical - check page changed after each action

## GOAL
${memory.originalGoal}

## PLAN
${planSection || 'No plan created'}

## PROGRESS SUMMARY (Compressed History)
${historySummarySection}

## KEY DISCOVERIES
${discoveriesSection}

## RECENT STEPS
${recentStepsSection}

${memory.consecutiveFailures > 0 ? `
⚠️ WARNING: Last ${memory.consecutiveFailures} action(s) failed. Try a different approach.
` : ''}

## CURRENT PAGE
URL: ${state.url}
Title: ${state.title}

## PAGE DOM (Cleaned, with hierarchy)
\`\`\`html
${state.dom.slice(0, 15000)}${state.dom.length > 15000 ? '\n... [truncated]' : ''}
\`\`\`

## INTERACTIVE ELEMENTS (Visible, top 30)
${elementsSection || '(No interactive elements visible)'}

## SCREENSHOT
[Image attached showing current page state]

---
STEP ${memory.currentStep + 1}: Decide your next action.

Respond with JSON ONLY:
{
  "thinking": "Your analysis and reasoning",
  "action": { "type": "...", ...params },
  "confidence": 0.0-1.0
}`;
    }

    /**
     * Parse LLM response into structured format
     */
    private parseResponse(text: string): AgentResponse {
        // Clean up response (remove markdown code blocks if present)
        let cleaned = text.trim();
        cleaned = cleaned.replace(/```json\n?|\n?```/g, '');
        cleaned = cleaned.replace(/```\n?|\n?```/g, '');

        // Find JSON in response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate structure
        if (!parsed.thinking || !parsed.action || typeof parsed.confidence !== 'number') {
            throw new Error('Response missing required fields');
        }

        return {
            thinking: parsed.thinking,
            action: parsed.action as Action,
            confidence: Math.max(0, Math.min(1, parsed.confidence)),
        };
    }
}
