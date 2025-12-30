# Testing Guide for Autonomous Browser AI Agent

## Prerequisites

### 1. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Copy the example file
cp .env.example .env
```

Edit `.env` and add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

**Get a Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and paste it in your `.env` file

### 2. Install Playwright Browsers

The agent uses Playwright to control the browser. Install Chromium:

```bash
npx playwright install chromium
```

This will download the Chromium browser (~200MB).

## Testing Steps

### Step 1: Simple Test (Recommended First)

Start with a simple navigation task:

```bash
npm run agent run "Navigate to google.com"
```

**Expected behavior:**
- Browser window opens (headed mode)
- Agent navigates to google.com
- Task completes successfully
- Summary shows completed steps
- Log file created in `logs/` directory

### Step 2: Search Test

Test search functionality:

```bash
npm run agent run "Go to google.com and search for 'TypeScript'"
```

**Expected behavior:**
- Navigates to Google
- Finds search box
- Types "TypeScript"
- Presses Enter
- Waits for results

### Step 3: Multi-Step Test

Test multi-step navigation:

```bash
npm run agent run "Go to wikipedia.org, search for 'Artificial Intelligence', and read the first paragraph"
```

**Expected behavior:**
- Multiple steps executed
- Navigation between pages
- Text extraction works
- Task completes

### Step 4: Complex Test (Amazon.in)

Test the full capability with a complex task:

```bash
npm run agent run "Search Amazon.in for noise cancelling headphones under ₹5000 and add the best rated one to cart"
```

**Expected behavior:**
- Navigates to Amazon.in
- Searches for headphones
- Applies price filter
- Scrolls through results
- Extracts ratings/prices
- Selects best rated item
- Adds to cart
- 30-40+ steps executed

**Note:** This is a complex task that may take several minutes.

## What to Watch For

### During Execution

1. **Browser Window**: Should open and you'll see the agent interacting with pages
2. **Console Output**: Real-time logs showing:
   - Plan generation
   - Action execution
   - State updates
   - Any errors

### After Execution

1. **Summary**: Shows success/failure, steps completed, failures, loop count
2. **Log File**: Path to JSON log file in `logs/` directory
3. **Browser**: Should close automatically

## Checking Logs

Logs are saved in the `logs/` directory with format:
```
logs/execution-YYYY-MM-DDTHH-MM-SS-goal_name.log
```

Each log entry is a JSON object:
```json
{
  "timestamp": 1234567890,
  "level": "info",
  "message": "Plan generated",
  "data": { ... }
}
```

View logs:
```bash
# List all logs
ls logs/

# View latest log (example)
cat logs/execution-2024-01-15T10-30-00-navigate_to_google_com.log
```

## Troubleshooting

### Error: "Missing required environment variable: GEMINI_API_KEY"

**Solution:** Make sure `.env` file exists and contains `GEMINI_API_KEY=your_key`

### Error: "Browser not found" or Playwright errors

**Solution:** Install Playwright browsers:
```bash
npx playwright install chromium
```

### Error: "Failed to generate plan"

**Possible causes:**
- Invalid API key
- API quota exceeded
- Network issues

**Solution:** 
- Verify API key in `.env`
- Check [Google AI Studio](https://makersuite.google.com/app/apikey) for quota
- Check internet connection

### Agent gets stuck in a loop

**Expected behavior:** The agent should detect loops and try to recover (up to 3 times). If it exceeds loop retries, it will terminate.

**To adjust:** Edit `.env`:
```env
MAX_LOOP_RETRIES=5  # Increase retry attempts
```

### Agent takes too long

**To adjust timeouts:** Edit `.env`:
```env
MAX_STEPS=100        # Reduce max steps
ACTION_TIMEOUT=15000 # Reduce timeout per action (15 seconds)
```

## Test Cases Summary

| Test | Command | Expected Steps | Complexity |
|------|---------|----------------|------------|
| Simple Navigation | `"Navigate to google.com"` | 1-2 | Low |
| Search | `"Go to google.com and search for 'TypeScript'"` | 5-8 | Low |
| Multi-page | `"Go to wikipedia.org, search for 'AI', read first paragraph"` | 10-15 | Medium |
| Amazon Shopping | `"Search Amazon.in for headphones under ₹5000 and add best rated to cart"` | 30-40+ | High |

## Success Criteria

A successful test should:
- ✅ Complete without fatal errors
- ✅ Show "Task completed successfully" or proper termination reason
- ✅ Generate a log file
- ✅ Browser closes cleanly
- ✅ Console shows step-by-step progress

## Next Steps

After basic testing works:
1. Try different websites
2. Test error recovery (e.g., invalid selectors)
3. Test loop detection with intentionally difficult tasks
4. Review log files to understand agent reasoning
5. Adjust configuration in `.env` as needed

