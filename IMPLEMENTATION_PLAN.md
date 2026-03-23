# Floww: Full Production Implementation Plan

## PROGRESS CHECKPOINT
- [x] Phase 1: Fix Foundation (TS errors + port consistency)
- [x] Phase 2: WebSocket Server
- [x] Phase 3: AI Analysis Service (post-crawl batch with cheerio fallback)
- [x] Phase 4: Fix Knowledge Graph (resolveEdges + real workflow detection)
- [x] Phase 5: Real Document Generation (Markdown + HTML with screenshots)
- [x] Phase 6: Frontend (Documents tab, crawl progress, API methods)
- [x] Phase 7: LLM Graceful Degradation (tryGetLLMClient)
- [x] TypeScript compilation: 0 errors

## Context
Floww is an autonomous SaaS documentation generator. The crawling infrastructure works, but the intelligence layer (AI analysis, doc generation, workflow detection) is hollow. A user who runs a crawl today gets archived pages but **cannot generate documentation** — the core product promise is broken. This plan fixes the end-to-end pipeline: Crawl → Analyze → Generate Docs.

---

## Phase 1: Fix Foundation (TS errors + port consistency)

### 1.1 Fix remaining TypeScript compilation errors
- `backend/src/services/graph/knowledge-graph.ts` — `detectWorkflows()` return type mismatch with `WorkflowResult`
- `backend/src/services/browser/playwright.ts` — `btn.getAttribute('type')` returns `string | null`, graph expects `string`
- `backend/src/utils/auth.ts` — `jwt.sign` overload mismatch (already partially fixed, verify)
- `backend/src/modules/crawl/service.ts` — `pageData` type vs `buildFromPageData` param type (button.type nullability)

### 1.2 Fix port/URL consistency (everything → 8000)
- `frontend/src/hooks/useApi.ts` line 3 — change `8080` → `8000`
- `frontend/vite.config.ts` line 10 — change proxy target `8080` → `8000`
- `frontend/src/components/InteractiveCrawlBanner.tsx` — WS URL `8080` → `8000`
- `frontend/src/components/InteractiveCrawlDialog.tsx` — WS URL `8080` → `8000`
- `frontend/src/pages/ProjectDetail.tsx` — 3 hardcoded fetch URLs `8080` → use api instance

### 1.3 Fix crawl action routing
The `POST /action` route in `crawl/routes.ts` line 184 is mounted under `/api/v1/projects` so it becomes `/api/v1/projects/action`. The string "action" could collide with `/:projectId`. Move this to a clear path: `POST /:projectId/crawl/action` to be consistent.

---

## Phase 2: WebSocket Server

The backend sends WebSocket events but no WS server exists. Frontend tries connecting to `ws://localhost:8000/api/v1/ws/crawl/{sessionId}` and gets nothing.

### 2.1 Add `ws` package
Add `ws` + `@types/ws` to backend dependencies.

### 2.2 Attach WS server to Hono's HTTP server
In `backend/src/index.ts`:
- Capture the `http.Server` from `serve()`
- Create `WebSocketServer` with `noServer: true`
- Handle `upgrade` events for paths matching `/api/v1/ws/crawl/:sessionId`
- Register connections with existing `wsEventManager`

---

## Phase 3: AI Analysis Service (Post-Crawl Batch)

AI analysis runs AFTER crawl completes, not during (to avoid slowing crawl).

### 3.1 Add analysis fields to Prisma schema
Add to `Snapshot` model:
```
analysisJson    Json?    @map("analysis_json")
```

### 3.2 Create AnalysisService
**New file**: `backend/src/services/ai/analysis-service.ts`

- `analyzeSession(projectId, sessionId)` — Iterates all snapshots, runs analysis on each
- `analyzeSnapshot(snapshot)` — Loads screenshot from archive path, calls LLM vision if available
- **Fallback without LLM**: Parse archived HTML with cheerio to extract headings, forms, buttons → build structural `PageAnalysisResult`
- Store results in `snapshot.analysisJson`

Add `cheerio` to dependencies for HTML parsing without browser.

### 3.3 Create analysis routes
**New file**: `backend/src/modules/analysis/routes.ts`
- `POST /:projectId/analyze` — Start batch analysis
- `GET /:projectId/analyze/status` — Progress (X of Y snapshots analyzed)

Register in `index.ts`.

---

## Phase 4: Fix Knowledge Graph

### 4.1 Post-crawl edge resolution
Add `resolveEdges()` to `KnowledgeGraph` class — iterates all link/form element nodes, connects to target pages that now exist in the graph. Call this at end of crawl loop in `service.ts`.

### 4.2 Real workflow detection
Replace stub `detectWorkflows()` with graph path analysis:
- Find form submission chains (Page A has form → submits to Page B)
- Find linear navigation paths (A → B → C, low branching)
- Group by common prefixes (all /users/* pages = User Management workflow)
- If LLM available, enhance with `LLMClient.detectWorkflows()` using the graph + page data

---

## Phase 5: Real Document Generation

This is the core deliverable.

### 5.1 Rewrite document generator
`backend/src/services/documents/generator.ts`

New primary method: `generateFullDocumentation(projectId, sessionId, options)`:
1. Load all snapshots + analysis results from DB
2. Load knowledge graph
3. Detect workflows
4. Generate structured Markdown:
   - **Overview** (AI summary or structural)
   - **Table of Contents**
   - **Per-page sections**: screenshot image, purpose, UI elements table, step-by-step guide, common issues
   - **Workflows**: multi-step guides with screenshots per step
   - **Statistics**

### 5.2 Screenshot embedding
- Markdown: relative paths `![Page](./screenshots/{hash}.png)`, copy screenshots to output dir
- HTML: base64 inline `<img src="data:image/png;base64,...">`

### 5.3 Proper HTML generation
Add `marked` package. Replace regex converter with `marked(markdown)` wrapped in a styled HTML template.

### 5.4 Wire into document routes
Update `POST /:projectId/documents` to use the full pipeline.
Add `GET /:projectId/documents/:id/content` endpoint to serve generated doc content.

### 5.5 Translation support
Wire existing `LLMClient.translate()` — add `language` param to generation options. If language !== 'en', translate the final markdown before saving.

---

## Phase 6: Frontend

### 6.1 Add Documents tab to ProjectDetail
New component: `frontend/src/components/DocumentsPanel.tsx`
- "Generate Documentation" button with options form (title, format, include screenshots, language)
- Document list with status badges (PENDING/GENERATING/COMPLETED/FAILED)
- Download button for completed docs
- Delete button
- Auto-poll while GENERATING

### 6.2 Add API methods to useApi.ts
- `generateDocument`, `getDocuments`, `getDocument`, `downloadDocument`, `deleteDocument`
- `startAnalysis`, `getAnalysisStatus`
- `sendCrawlAction`

### 6.3 Real-time crawl progress
New hook: `frontend/src/hooks/useCrawlProgress.ts`
- WebSocket connection to crawl session
- Returns `{ pagesVisited, pagesTotal, currentUrl, status }`
- Use in ProjectDetail to show progress bar during active crawl

### 6.4 Fix ProjectDetail crawl action calls
Replace 3 hardcoded `fetch()` calls with `sendCrawlAction()` from useApi.

---

## Phase 7: LLM Graceful Degradation

Ensure every LLM-dependent path has a no-LLM fallback:
- `tryGetLLMClient()` returns `null` instead of throwing
- Analysis: structural HTML parsing via cheerio
- Workflow detection: graph-based only
- Doc generation: basic markdown from graph data
- Translation: skip if no LLM

---

## New Dependencies
**Backend**: `ws`, `@types/ws`, `cheerio`, `marked`
**Frontend**: none (all libs already present)

## Files Modified (existing)
- `backend/src/index.ts` — WebSocket server
- `backend/src/modules/crawl/service.ts` — Post-crawl edge resolution + analysis trigger
- `backend/src/modules/documents/routes.ts` — Full pipeline wiring + content endpoint
- `backend/src/services/documents/generator.ts` — Complete rewrite of generation
- `backend/src/services/graph/knowledge-graph.ts` — `resolveEdges()` + `detectWorkflows()` rewrite
- `backend/src/services/ai/llm-client.ts` — Add `tryGetLLMClient()`
- `backend/prisma/schema.prisma` — Add `analysisJson` to Snapshot
- `frontend/src/hooks/useApi.ts` — Fix URL + add doc/analysis methods
- `frontend/src/pages/ProjectDetail.tsx` — Add Documents tab + crawl progress + fix URLs
- `frontend/vite.config.ts` — Fix proxy port
- `frontend/src/components/InteractiveCrawlBanner.tsx` — Fix WS URL
- `frontend/src/components/InteractiveCrawlDialog.tsx` — Fix WS URL
- Various files with remaining TS errors

## Files Created (new)
- `backend/src/services/ai/analysis-service.ts` — Post-crawl AI analysis
- `backend/src/modules/analysis/routes.ts` — Analysis API endpoints
- `frontend/src/components/DocumentsPanel.tsx` — Document generation UI
- `frontend/src/hooks/useCrawlProgress.ts` — Real-time crawl progress hook

## Verification
1. `npx tsc --noEmit` passes with 0 errors
2. Backend starts with `npm run dev` (PORT=8000)
3. Frontend starts with `npm run dev` (PORT=4000), proxies to 8000
4. Create project → Start crawl → See real-time progress → Crawl completes
5. Post-crawl: trigger analysis → see analysis progress
6. Generate documentation → download Markdown with screenshots
7. Generate HTML → self-contained file with embedded screenshots
8. All of the above works WITHOUT LLM keys (graceful degradation)
