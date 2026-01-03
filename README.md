# Autonomous Browser AI Agent

An AI-powered browser automation agent that accepts natural language prompts and completes multi-step web tasks by controlling a real browser.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers
npx playwright install chromium

# 3. Set up your API key
# Edit .env and add your Gemini API key

# 4. Run the agent
npm run dev run "Search for AI news on Google and summarize the first result"
```

## Usage

```bash
# Basic usage
npm run dev run "<your prompt here>"

# Examples
npm run dev run "Go to google.com and search for weather in Mumbai"
npm run dev run "Go to Wikipedia, search for 'Artificial Intelligence', and tell me the first paragraph"
npm run dev run "Go to TechCrunch, find 3 recent AI startup articles, and summarize each one"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLI: agent run "<prompt>"                    │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR (Agent)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
│  │   Planner   │  │  Executor   │  │  Memory Manager             │ │
│  │  (Gemini)   │  │ (Playwright)│  │  (History + Compression)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
│  ┌─────────────────────────────────┐  ┌───────────────────────────┐│
│  │  Loop Detector (Multi-Strategy) │  │  Logger (Human Readable)  ││
│  └─────────────────────────────────┘  └───────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BROWSER CONTROLLER                              │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │ State Extract │  │ Action Exec   │  │ Screenshot Capture      │ │
│  │ (Cleaned DOM) │  │ (with Retry)  │  │ (for Gemini Vision)     │ │
│  └───────────────┘  └───────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Long Task Handling (50+ steps)
- **Hierarchical Memory**: Keeps full details of recent steps, compresses older steps into summaries
- **History Compression**: Automatically summarizes and compresses history when it exceeds threshold
- **Sliding Window**: Maintains last N steps in full detail for context

### Loop Detection
- **Multi-Strategy Detection**: Action repetition, state repetition, URL cycling
- **LLM Confirmation**: When loop detected, asks LLM to confirm (avoids false positives)
- **Recovery Strategies**: Scroll, try different approach, skip sub-goal

### Robust Element Finding
- **5 Selector Strategies**: data-agent-id → XPath → Text → Role → Placeholder
- **Fallback Chain**: If one strategy fails, automatically tries next
- **Visibility Checks**: Ensures elements are actually visible before interaction

### Dynamic Content Handling
- **No networkidle**: Uses DOM-based waits (more reliable for modern sites)
- **Retry with Backoff**: Retries failed actions with exponential backoff
- **Lazy Load Support**: Configurable delays for dynamically loaded content

## Configuration

All settings in `.env`:

```env
# Gemini API
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-1.5-pro

# Browser Settings
BROWSER_HEADLESS=false
BROWSER_WINDOW_WIDTH=1280
BROWSER_WINDOW_HEIGHT=900

# Agent Settings
MAX_STEPS=100
MAX_RETRIES=3

# Timing (tune for slow sites)
WAIT_AFTER_ACTION_MS=500
LAZY_LOAD_RETRY_COUNT=3
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── agent/
│   ├── orchestrator.ts   # Main agent loop
│   ├── memory.ts         # History & compression
│   └── types.ts          # Shared interfaces
├── browser/
│   ├── controller.ts     # Playwright wrapper
│   ├── state-extractor.ts # DOM cleaning + element extraction
│   └── actions.ts        # Action execution with retry
├── llm/
│   └── gemini.ts         # Gemini API client
├── detection/
│   └── loop-detector.ts  # Multi-strategy loop detection
└── utils/
    ├── logger.ts         # Human-readable logging
    └── config.ts         # Load from .env
```

## Logs

Every run creates detailed logs in `./logs/`:
- Human-readable step-by-step log
- Screenshots for each step (in `logs/screenshots/`)

## How It Works

1. **OBSERVE**: Extract cleaned DOM + interactive elements + screenshot from browser
2. **THINK**: Send state to Gemini, get next action decision
3. **ACT**: Execute action via Playwright (with retry)
4. **EVALUATE**: Check for completion, loops, failures
5. **REPEAT**: Loop until task complete or max steps reached

See `implementation_plan.md` for detailed design.
