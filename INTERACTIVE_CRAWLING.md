# Interactive Crawling Features 🤖✨

## Overview

Floww now supports **fully interactive crawling** with real-time user prompts and a **smart navigation strategy** that only goes deeper from the provided URL.

## 🎯 New Features

### 1. **Browser-Based User Interaction**
Instead of terminal prompts, Floww opens a **visible Chrome window** where you can:
- Log in manually
- Fill required forms
- Solve CAPTCHAs
- Handle 2FA
- Make decisions on-the-fly

### 2. **Depth-Only Navigation Strategy** 
When you provide a URL, the crawler **only goes deeper** in the site hierarchy:

```
Base URL: https://example.com/products

✅ Will Crawl:
  - https://example.com/products/laptops
  - https://example.com/products/laptops/macbook
  - https://example.com/products/phones/iphone

❌ Won't Crawl:
  - https://example.com/ (shallower)
  - https://example.com/about (different branch)
  - https://external-site.com (different domain)
```

This prevents crawling the entire website and focuses only on **feature exploration** under the provided URL.

### 3. **Real-Time User Prompts**
Beautiful popups appear in your frontend when the crawler needs help:
- Countdown timer
- Clear instructions
- Multiple actions (Continue, Skip, Cancel)
- Queue of pending prompts

## 🚀 How to Use

### Starting an Interactive Crawl

#### Option 1: Via Frontend (Recommended)
```typescript
import { InteractiveCrawlDialog } from './components/InteractiveCrawlDialog'

function CrawlPage() {
  const [sessionId, setSessionId] = useState<string>()

  const handleStartCrawl = async () => {
    const response = await fetch('/api/v1/projects/{id}/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          depthOnlyMode: true,         // Only go deeper (default: true)
          maxDepth: 5,                 // Max depth from base URL
          maxPages: 50,
          usePersistentProfile: true,  // Use your Chrome profile (default: true) ✨
        }
      })
    })
    
    const { sessionId } = await response.json()
    setSessionId(sessionId)
  }

  return (
    <>
      <button onClick={handleStartCrawl}>Start Crawl</button>
      {sessionId && (
        <InteractiveCrawlDialog 
          sessionId={sessionId}
          onAction={(promptId, action, data) => {
            // Handle user actions
            fetch(`/api/v1/crawl/action`, {
              method: 'POST',
              body: JSON.stringify({ promptId, action, data })
            })
          }}
        />
      )}
    </>
  )
}
```

#### Option 2: Via CLI
```bash
# Start crawl with depth-only mode
npm run crawl -- \
  --url https://example.com/products \
  --pages 50 \
  --no-headless  # Show browser window

# Will only crawl URLs under /products/
```

### Navigation Strategies

Configure in your project config:

```typescript
const config = {
  // Strategy 1: Depth Only (Default - Recommended)
  depthOnlyMode: true,
  maxDepth: 5,  // How many levels deeper to go
  
  // Strategy 2: Same Domain
  depthOnlyMode: false,
  
  // Patterns work with both strategies
  includePatterns: ['/products/', '/features/'],
  excludePatterns: ['/logout', '/api/', '*.pdf'],
}
```

## 🎬 User Interaction Flow

### When Crawler Encounters an Obstacle

1. **Browser Window Opens** 
   - Automatically opens a visible Chrome window
   - Shows the page that needs interaction

2. **Frontend Banner Appears** ✨
   - A **prominent floating banner** appears at the top of your Floww dashboard
   - Shows "⏸️ Waiting for Your Input" with clear instructions
   - **Remains visible even if browser overlay disappears**

3. **User Completes Action**
   - User logs in / fills form / solves CAPTCHA in browser window
   - Returns to Floww dashboard
   - Clicks the big **"✓ Continue Crawling"** button in the banner

4. **Crawling Resumes**
   - Crawler continues automatically
   - Banner disappears
   - Progress updates in real-time via WebSocket

### 💡 Why Two Places for Buttons?

**In Browser (floating overlay):**
- Quick action if you're already in the browser
- Auto re-appears after page reloads
- Keyboard shortcuts (Ctrl+Enter, Ctrl+S, Ctrl+X)

**In Your Dashboard (floating banner):** ⭐ **Recommended**
- **Always visible and reliable**
- Can't be lost after redirects
- Bigger, more prominent buttons
- Works even if browser loses overlay

### 🔐 Browser Profile & Stealth Mode

**Floww uses an advanced undetected browser** that bypasses Google and other bot detection systems!

```typescript
config: {
  usePersistentProfile: true,  // Default: true ✨
}
```

**How it works:**
- ✅ **Uses real Chrome** (not Chromium)
- ✅ **14+ stealth patches** to avoid detection
- ✅ **Persistent profile** at `~/.floww/browser-profile`
- ✅ **Bypasses Google bot detection**
- ✅ **Works with Facebook, Instagram, LinkedIn, etc.**

**First Time Setup:**
1. Start crawl → browser opens
2. Log in to your accounts normally
3. Complete any 2FA/verification
4. Click "Continue Crawling"
5. ✅ Logins saved for future crawls!

**Future Crawls:**
- Browser opens → you're already logged in!
- No security warnings
- No bot detection
- Seamless experience

**What's protected against:**
- ❌ Webdriver detection
- ❌ Canvas fingerprinting
- ❌ WebGL fingerprinting
- ❌ Chrome automation flags
- ❌ Headless detection
- ❌ Plugin spoofing
- ❌ Battery API detection
- ❌ And 10+ more techniques!

**Profile location:**
```bash
# macOS/Linux
~/.floww/browser-profile

# Windows
%USERPROFILE%\.floww\browser-profile
```

**To use a fresh session:**
```typescript
config: {
  usePersistentProfile: false,  // No saved logins
}
```

#### 🎯 Works With All Major Platforms

The undetected browser seamlessly handles login for:

**Social Media:**
- ✅ Google (Meet, Drive, Gmail, etc.)
- ✅ Facebook, Instagram
- ✅ Twitter (X), LinkedIn
- ✅ Reddit, Quora

**Development:**
- ✅ GitHub, GitLab
- ✅ Stack Overflow
- ✅ Notion, Confluence

**SaaS & Business:**
- ✅ Salesforce, HubSpot
- ✅ Slack, Microsoft Teams
- ✅ Jira, Trello

**First-time login tips:**
1. Log in normally as you would in your regular browser
2. Complete 2FA/verification if prompted (this is normal)
3. Check "Remember me" or "Stay signed in" for best results
4. Click "Continue Crawling" once logged in
5. Future crawls will use your saved session automatically!

### Supported Obstacles

| Obstacle | What Happens |
|----------|-------------|
| 🔐 **Login Form** | Browser window opens at login page. User logs in manually. |
| 📝 **Required Form** | Browser shows form. User fills required fields. |
| 🤖 **CAPTCHA** | Browser displays CAPTCHA. User solves it. |
| 🔑 **2FA** | Browser waits for 2FA code. User enters code. |
| ⚠️ **Unexpected Page** | Crawler pauses. User decides: skip or continue. |

## 🎨 Browser Helper UI

A floating overlay appears in the browser:

```
┌─────────────────────────────────┐
│ 🤖 Floww Crawler                │
│    LOGIN REQUIRED                │
│                                  │
│ Please log in to continue        │
│ crawling this application.       │
│                                  │
│ [✓ Continue Crawling]            │
│ [⏭ Skip This Page]              │
│ [✕ Stop Crawling]               │
└─────────────────────────────────┘
```

## 📡 WebSocket Events

Real-time events sent to frontend:

```typescript
// Event types
'crawl:started'           // Crawl began
'crawl:progress'          // Progress update (pages visited, queue size)
'crawl:completed'         // Crawl finished
'crawl:failed'            // Crawl error

'page:visited'            // New page crawled
'page:skipped'            // Page skipped by user
'page:error'              // Page error

'interaction:required'    // User action needed
'interaction:waiting'     // Waiting for user
'interaction:completed'   // User completed action
'interaction:timeout'     // User didn't respond in time

'user:action:requested'   // Popup should appear
'user:action:provided'    // User clicked action
```

### Connecting to WebSocket

```typescript
const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/crawl/${sessionId}`)

ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data)
  
  switch (type) {
    case 'user:action:requested':
      // Show popup dialog
      showInteractionDialog(data)
      break
      
    case 'crawl:progress':
      // Update progress bar
      setProgress(data.pagesVisited / data.pagesTotal)
      break
      
    case 'page:visited':
      // Add to visited list
      addVisitedPage(data.url, data.title)
      break
  }
}
```

## 🛠️ API Reference

### Configuration Options

```typescript
interface CrawlConfig {
  // Navigation strategy
  depthOnlyMode?: boolean        // Default: true
  maxDepth?: number              // Default: 5
  
  // Limits
  maxPages?: number              // Default: 100
  
  // Patterns
  includePatterns?: string[]     // URLs to include
  excludePatterns?: string[]     // URLs to exclude
  
  // Behavior
  delayMs?: number              // Delay between requests (default: 1000)
  headless?: boolean            // Run headless? (default: true for auto, false for interactive)
  
  // Interaction
  interactionTimeout?: number   // Timeout for user actions (default: 300000ms = 5min)
}
```

### User Action Response

```typescript
interface UserActionResponse {
  promptId: string
  action: 'continue' | 'skip' | 'cancel'
  data?: Record<string, any>  // Form data, credentials, etc.
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│           Frontend (React)              │
│  - InteractiveCrawlDialog component    │
│  - WebSocket connection                 │
│  - Real-time progress                   │
└────────────┬────────────────────────────┘
             │
             │ WebSocket
             │
┌────────────▼────────────────────────────┐
│      Backend (Node.js/Hono)             │
│  - WebSocketEventManager                │
│  - CrawlerService                       │
│  - URLNavigator (depth-only strategy)   │
└────────────┬────────────────────────────┘
             │
             │ Controls
             │
┌────────────▼────────────────────────────┐
│      Browser (Playwright)               │
│  - BrowserInteractiveHandler            │
│  - Visible Chrome window                │
│  - Floating helper UI overlay           │
└─────────────────────────────────────────┘
```

## 📋 Examples

### Example 1: Crawl Product Features Only

```typescript
await startCrawl({
  baseUrl: 'https://shopify.com/products',
  config: {
    depthOnlyMode: true,  // Only go under /products/
    maxDepth: 3,
    maxPages: 50,
    includePatterns: ['/features/'],
    excludePatterns: ['/pricing', '/blog'],
  }
})

// Will crawl:
// /products/features/inventory
// /products/features/analytics
// /products/features/shipping
//
// Won't crawl:
// /pricing (excluded)
// /blog (excluded)
// /about (not under /products/)
```

### Example 2: Handle Login Flow

```typescript
// Crawler automatically detects login page
// Browser window opens
// User logs in manually
// User clicks "Continue Crawling" in browser or frontend
// Crawler resumes with authenticated session
```

### Example 3: Skip Unwanted Pages

```typescript
// When popup appears:
// - Click "Continue" → Proceed with crawling
// - Click "Skip" → Skip this page, continue with others
// - Click "Cancel" → Stop entire crawl
```

## 🎯 Best Practices

1. **Use Depth-Only Mode for Feature Exploration**
   ```typescript
   { depthOnlyMode: true, maxDepth: 3-5 }
   ```

2. **Set Reasonable Timeouts**
   ```typescript
   { interactionTimeout: 300000 }  // 5 minutes
   ```

3. **Use Include Patterns for Focus**
   ```typescript
   { includePatterns: ['/features/', '/docs/'] }
   ```

4. **Monitor Via WebSocket**
   - Show progress bar
   - Display current URL
   - Show interaction prompts

5. **Test with Visible Browser First**
   ```typescript
   { headless: false }
   ```

## 🐛 Troubleshooting

### Browser Doesn't Open
- Check `headless: false` in config
- Ensure Playwright is installed: `npx playwright install chromium`

### Popup Doesn't Appear
- Check WebSocket connection
- Verify `sessionId` is correct
- Check browser console for errors

### Crawler Goes to Unwanted URLs
- Use `depthOnlyMode: true`
- Add `excludePatterns`
- Check `baseUrl` is correct

### Timeout Too Short
- Increase `interactionTimeout`
- Default is 5 minutes

## 🔧 Configuration Files

### Project Config (floww.yaml)

```yaml
name: "My SaaS App"
baseUrl: "https://example.com/products"

scope:
  maxDepth: 5
  maxPages: 100
  depthOnlyMode: true  # New!
  includePatterns:
    - "/features/"
    - "/docs/"
  excludePatterns:
    - "/logout"
    - "/api/"
    - "*.pdf"

auth:
  type: "none"  # Will prompt interactively if needed

output:
  formats: ["markdown", "html"]
  includeScreenshots: true
```

## 📚 Related Files

- `backend/src/services/interactive/browser-handler.ts` - Browser UI handler
- `backend/src/services/navigation/url-strategy.ts` - Navigation logic
- `backend/src/services/events/websocket-manager.ts` - WebSocket events
- `backend/src/modules/crawl/service.ts` - Main crawl service
- `frontend/src/components/InteractiveCrawlDialog.tsx` - Frontend dialog

## 🎉 Summary

With these new features, Floww is now:
- ✅ **User-friendly**: Visual browser interaction instead of terminal
- ✅ **Focused**: Only crawls relevant pages under your URL
- ✅ **Interactive**: Real-time prompts and updates
- ✅ **Smart**: Automatically detects and handles obstacles
- ✅ **Beautiful**: Modern UI with countdown timers and smooth animations

Happy crawling! 🚀
