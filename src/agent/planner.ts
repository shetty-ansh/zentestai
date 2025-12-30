import { GoogleGenAI } from '@google/genai';
import { Plan, parsePlan } from './dsl/types';
import { config } from '../config';
import { Observation, summarizeObservation } from './observer';
import { formatStateForPlanner } from './state';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * Generates a plan using Gemini LLM
 */
export async function generatePlan(
  goal: string,
  state: string,
  observation: Observation,
  previousObservations: Observation[] = []
): Promise<Plan> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(goal, state, observation, previousObservations);
  const fullPrompt = systemPrompt + '\n\n' + userPrompt;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: fullPrompt,
    });

    const text = response.text || '';
    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const plan = extractPlanFromResponse(text);
    return plan;
  } catch (error) {
    throw new Error(
      `Failed to generate plan: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Builds the system prompt with action DSL specification
 */
function buildSystemPrompt(): string {
  return `You are an autonomous browser agent that plans and executes tasks on websites.

Your job is to generate a JSON plan with 3-5 steps to progress toward the user's goal.

AVAILABLE ACTIONS:
1. goto - Navigate to a URL
   {"action": "goto", "url": "https://example.com"}

2. click - Click an element
   {"action": "click", "selector": "#button-id", "timeout": 30000}

3. fill - Fill an input field
   {"action": "fill", "selector": "#input-id", "value": "text to enter", "timeout": 30000}

4. press - Press a keyboard key
   {"action": "press", "key": "Enter"}

5. waitFor - Wait for an element to appear
   {"action": "waitFor", "selector": "#element-id", "timeout": 30000}

6. scroll - Scroll the page
   {"action": "scroll", "amount": 500, "direction": "down"}

7. extractText - Extract text from an element
   {"action": "extractText", "selector": "#text-element"}

8. extractList - Extract text from multiple elements
   {"action": "extractList", "selector": ".list-item"}

9. assertText - Assert text content matches
   {"action": "assertText", "selector": "#element", "expectedText": "expected text"}

OUTPUT FORMAT:
You must respond with ONLY a valid JSON object in this format:
{
  "steps": [
    {"action": "goto", "url": "https://example.com"},
    {"action": "click", "selector": "#button"}
  ],
  "goalCheck": "Description of what to verify after execution",
  "done": false
}

RULES:
- Generate 3-5 steps per plan (not more, not less)
- Use CSS selectors for elements (e.g., "#id", ".class", "button")
- Set "done": true only when the goal is fully completed
- If you detect a loop or are stuck, try a different approach
- Be specific with selectors based on the visible text provided
- If an action fails, the next plan should account for the error`;
}

/**
 * Builds the user prompt with current context
 */
function buildUserPrompt(
  goal: string,
  state: string,
  observation: Observation,
  previousObservations: Observation[]
): string {
  const parts: string[] = [];

  parts.push('=== CURRENT TASK ===');
  parts.push(goal);
  parts.push('');

  parts.push('=== CURRENT STATE ===');
  parts.push(state);
  parts.push('');

  parts.push('=== CURRENT PAGE OBSERVATION ===');
  parts.push(summarizeObservation(observation));
  parts.push('');

  if (previousObservations.length > 0) {
    parts.push('=== PREVIOUS OBSERVATIONS (for context) ===');
    previousObservations.slice(-3).forEach((obs, idx) => {
      parts.push(`Observation ${idx + 1}:`);
      parts.push(`URL: ${obs.url}`);
      if (obs.error) {
        parts.push(`Error: ${obs.error}`);
      }
      parts.push('');
    });
  }

  parts.push('=== YOUR TASK ===');
  parts.push('Generate a JSON plan with 3-5 steps to progress toward the goal.');
  parts.push('If the goal is complete, set "done": true.');
  parts.push('If you see loop warnings, try a completely different approach.');
  parts.push('');
  parts.push('Respond with ONLY the JSON plan, no other text.');

  return parts.join('\n');
}

/**
 * Extracts and parses plan from LLM response
 */
function extractPlanFromResponse(response: string): Plan {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  
  if (jsonMatch) {
    try {
      return parsePlan(JSON.parse(jsonMatch[1]));
    } catch (e) {
      // Fall through to try parsing the whole response
    }
  }

  // Try to find JSON object in the response
  const jsonObjectMatch = response.match(/\{[\s\S]*"steps"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      return parsePlan(JSON.parse(jsonObjectMatch[0]));
    } catch (e) {
      // Fall through
    }
  }

  // Try parsing the entire response as JSON
  try {
    return parsePlan(JSON.parse(response.trim()));
  } catch (e) {
    throw new Error(
      `Failed to parse plan from LLM response. Response: ${response.slice(0, 500)}`
    );
  }
}

