# Autonomous Browser AI Agent (Lovable-for-QA Prototype)

## Overview

This project is a **working prototype of an autonomous browser AI agent** inspired by modern agent design principles (Anthropic / ReAct-style agents).

The agent accepts **any natural-language prompt** and completes the task **end-to-end** by controlling a **real local browser**.  
It is capable of **long, multi-step, non-trivial workflows (50+ steps)** such as:

- QA-style browser testing
- Multi-page navigation
- Research and data extraction
- Real-world flows like browsing and adding items to cart on Amazon.in

This is **not a hardcoded test runner** and **not a one-shot script**.  
It is an **iterative planner–executor agent**.

UI polish is explicitly out of scope.  
The focus is **agent design, reasoning, correctness, and robustness**.

---

## Project Goals

- Accept a **single natural-language command**
- Control a **real local browser**
- Execute **arbitrarily long, multi-step tasks**
- Track progress and state over time
- Avoid infinite loops or dead ends
- Decide when the task is **complete or failed**
- Produce **execution logs**

---

## CLI Interface (Required)

```bash
agent run "<natural language prompt>"

EXAMPLE - agent run "Search Amazon.in for noise cancelling headphones under ₹5000 and add the best rated one to cart"


HIGH LEVEL ARCHITECTURE (This loop repeats until the task is completed or failed) -
User Prompt
   ↓
Planner (LLM)
   ↓
Action DSL (JSON)
   ↓
Executor (Playwright)
   ↓
Observation (DOM, URL, logs)
   ↓
State Update
   ↓
Planner (loop)



Core Design Principles

This project follows the agent design guidance from
Anthropic – Building Effective Agents:

Incremental planning (not one-shot)

Tool-based execution

Explicit state management

Observation-driven reasoning

Strong guardrails and termination logic


Technology Stack

Next.js (TypeScript)

Playwright – real browser automation

LLM API (Gemini)

CLI interface (no UI required)




Component Breakdown
1. Planner (LLM)

The LLM does not generate full scripts.

Instead, it:

Plans 3–5 steps at a time

Uses only a fixed set of allowed actions

Decides whether the task is done, should continue, or has failed

The planner is invoked after every execution cycle.

2. Action DSL (Tool Interface)

The LLM outputs a structured JSON DSL, not raw Playwright code.
Eg- 
{
  "steps": [
    { "action": "goto", "url": "https://www.amazon.in" },
    { "action": "fill", "selector": "#twotabsearchtextbox", "value": "headphones" },
    { "action": "press", "key": "Enter" }
  ],
  "goalCheck": "Search results visible",
  "done": false
}


The DSL:

Is validated with a schema

Uses a whitelisted action set

Acts as the tool API exposed to the LLM

3. Supported DSL Actions (Initial Set)

These actions are universal and sufficient for any website:

goto

click

fill

press

waitFor

scroll

extractText

extractList

assertText

The action set is finite and controlled.

4. Executor (DSL → Playwright)

Playwright does not understand the DSL natively.

A custom executor maps each DSL action to Playwright commands.

Example:

async function runStep(step, page) {
  switch (step.action) {
    case "goto":
      await page.goto(step.url)
      break
    case "click":
      await page.click(step.selector)
      break
    case "fill":
      await page.fill(step.selector, step.value)
      break
    case "press":
      await page.keyboard.press(step.key)
      break
    case "scroll":
      await page.mouse.wheel(0, step.amount || 500)
      break
    case "extractText":
      return await page.textContent(step.selector)
  }
}

5. State Management (External Memory)

State is stored outside the LLM and passed in every loop.

state = {
  goal: string,
  currentUrl: string,
  completedSteps: number,
  extractedData: [],
  failures: number,
  history: []
}


State enables:

Progress tracking

Loop detection

Recovery from failures

Context-aware planning

6. Planner–Executor Loop (Core Logic)

This loop enables long-running autonomous behavior.

Pseudocode:

while (true) {
  plan = callLLM(goal, state)

  validate(plan)

  for (step of plan.steps) {
    try {
      result = await runStep(step, page)
      state.completedSteps++
      if (result) state.extractedData.push(result)
    } catch (e) {
      state.failures++
      break
    }
  }

  observeBrowser(page, state)

  if (plan.done) break
  if (state.completedSteps > MAX_STEPS) fail()
  if (state.failures > MAX_FAILURES) fail()
}

7. Observation Layer (Agent Perception)

After each execution cycle, the agent observes:

Current URL

Visible page text (summarized)

DOM snapshot

Errors or timeouts

Example:

observation = {
  url: page.url(),
  visibleText: await page.innerText("body").slice(0, 3000),
  domSnapshot: await page.content()
}


Observations are summarized and fed back to the planner.

8. Termination & Safety

Explicit safeguards are enforced:

Maximum total steps

Retry / failure limits

Repeated URL detection

LLM-declared completion (done: true)

This prevents:

Infinite loops

Getting stuck

Unsafe execution

Amazon.in Capability

The agent is designed to handle real-world websites, including Amazon.in.

Supported actions include:

Searching products

Applying filters

Scrolling and pagination

Extracting prices/ratings

Opening product pages

Adding items to cart

⚠️ Checkout/payment is intentionally excluded for safety.

Demo Requirements

At least 3 different prompts

At least one prompt requiring 30–40+ interactions

Execution logs and outputs recorded

Why This Design Works

Not a hardcoded flow

Not a brittle script

Not a monolithic prompt

Follows proven agent architectures

Handles dynamic websites

Scales to complex tasks

One-Line Summary

This project implements an autonomous browser agent using an iterative planner–executor architecture, where an LLM incrementally plans actions, a real browser executes them, observations are fed back, and explicit termination logic ensures safe, long-running task completion.

References

Anthropic – Building Effective Agents

Playwright Documentation

ReAct-style agent architectures

Status

This is a prototype / MVP, focused on correctness, reasoning, and agent design rather than UI or production hardening. 