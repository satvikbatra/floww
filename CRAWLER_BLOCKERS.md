# Crawler Blockers & Edge Cases
This document outlines known blockers, challenges, and edge cases when crawling modern web applications with Floww.
## Table of Contents
1. [Website Architecture Types](#website-architecture-types)
2. [Navigation Patterns](#navigation-patterns)
3. [Authentication & Authorization](#authentication--authorization)
4. [Anti-Bot Measures](#anti-bot-measures)
5. [Content Loading Patterns](#content-loading-patterns)
6. [Dynamic Content Issues](#dynamic-content-issues)
7. [Technical Limitations](#technical-limitations)
8. [Priority Fixes](#priority-fixes)
---
## Website Architecture Types
### 1. Single Page Applications (SPAs)
**Examples:** Google Meet, Gmail, Figma, React/Vue/Angular apps
**Blockers:**
- No `<a href>` links - Navigation happens via JavaScript
- Client-side routing - URLs change without page reloads (React Router, Vue Router)
- Button-based navigation - Clickable elements don't have href attributes
- State-dependent content - Content changes based on app state, not URL
**Fix Needed:**
- [ ] Detect clickable elements with route attributes (`data-route`, `data-href`, `aria-label`)
- [ ] Simulate button clicks to discover new routes
- [ ] Monitor URL changes after interactions
- [ ] Extract routes from JavaScript bundles (window.__ROUTES__, router config)
- [ ] Parse `manifest.json` or `sitemap.xml` for SPA routes
### 2. Multi-Page Applications (MPAs)
**Status:** Works well for standard `<a>` links
**Edge Cases:**
- Pagination (page=1, page=2, ... page=1000)
- Sort/filter combinations creating duplicate content
- Session IDs in URLs
- Timestamp parameters
**Fix Needed:**
- [ ] Detect pagination patterns
- [ ] Strip tracking parameters (utm_*, fbclid, etc.)
- [ ] Detect canonical URLs
### 3. Hybrid Applications (Next.js, Nuxt.js)
**Fix Needed:**
- [ ] Scroll to bottom to trigger lazy loading
- [ ] Wait for dynamic content insertion
- [ ] Detect intersection observers
---
## Navigation Patterns
### P0: JavaScript Navigation
```html
<button onclick="navigate('/dashboard')">Dashboard</button>
```
- [ ] Click buttons and monitor URL changes
- [ ] Extract navigation intent from event handlers
### P0: Data Attributes
```html
<div data-route="/settings" role="button">Settings</div>
```
- [ ] Extract and parse data-* attributes
### P1: Hash Routing
- [ ] Optionally crawl hash routes
- [ ] Detect if hash changes content
### P1: Form-Based Navigation
- [ ] Detect GET forms
- [ ] Submit with sample data
---
## Authentication & Authorization
### Session Expiry
- [ ] Detect 401/403 errors mid-crawl
- [ ] Detect redirect to login page
- [ ] Re-authenticate automatically
### Cookie Consent Banners (P0)
- [ ] Auto-detect common cookie banner selectors
- [ ] Auto-click "Accept" buttons
- [ ] Maintain list of known banner patterns
### Geographic Restrictions
- [ ] Support proxy rotation
- [ ] Detect content blocked by location
---
## Anti-Bot Measures
### Rate Limiting (P0)
- [ ] Detect 429 responses
- [ ] Respect `Retry-After` header
- [ ] Exponential backoff
- [ ] Proxy rotation
### Cloudflare Challenge
- [ ] Wait for JS challenge completion
- [ ] Store cf_clearance cookie
---
## Content Loading Patterns
### Lazy Loading (P1)
- [ ] Auto-scroll to bottom
- [ ] Trigger IntersectionObserver
- [ ] Wait for all images to load
### Infinite Scroll (P2)
- [ ] Detect infinite scroll pattern
- [ ] Scroll incrementally
- [ ] Stop after N iterations
### Resource Blocking (P0)
- [ ] Block unnecessary resources (.woff, .mp4, .gif)
- [ ] Skip third-party trackers
---
## Dynamic Content Issues
### Modal Dialogs
- [ ] Detect blocking modals
- [ ] Auto-close with Esc or close button
### Shadow DOM (P2)
- [ ] Recursively traverse shadow roots
---
## Priority Fixes
### Critical (P0)
1. SPA Navigation Detection (button clicking + route discovery)
2. Cookie Banner Auto-Dismiss
3. Form Submission (GET forms with sample data)
4. Resource Blocking (fonts, videos, trackers)
5. 429 Detection + Retry-After
### High (P1)
6. Lazy Loading Support (auto-scroll)
7. Session Management (save/restore cookies, re-auth)
8. Cloudflare Challenge Handling
### Medium (P2)
9. Infinite Scroll
10. Shadow DOM Extraction
### Low (P3)
11. Hash Routing
12. WebSocket Content
13. Age Verification
---
## Testing Matrix
| Website Type | Test URL | Expected | Status |
|-------------|----------|----------|--------|
| Traditional MPA | https://example.com | 2-5 pages | Pass |
| Documentation | https://docs.python.org | 10+ pages | Partial |
| React SPA | https://react.dev | 10+ pages | Fail |
| E-commerce | https://demo.vercel.store | 20+ pages | Partial |
| Next.js App | https://nextjs.org | 15+ pages | Partial |
| Google Meet | https://meet.google.com | 5+ pages | Fail |
