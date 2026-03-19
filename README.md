# Floww - Autonomous SaaS Documentation Generator

> **🚀 Production-Ready TypeScript Stack**  
> Enterprise-grade AI-powered documentation automation with stealth crawling, knowledge graphs, and intelligent workflow detection.

**Floww** autonomously explores SaaS web applications and generates comprehensive end-user documentation with screenshots, field explanations, workflow guides, and multi-language support.

## 🎯 The Problem

Modern SaaS applications have 50-500 screens with complex workflows. Creating end-user documentation requires:
- Manually navigating each screen
- Capturing screenshots
- Documenting fields and their purposes
- Describing workflows step-by-step
- Translating to multiple languages

**This takes weeks and costs $10k-$100k+ per product.**

## ✨ The Solution

Floww automates this entirely:

```
Your SaaS App → Floww AI Agent → Complete Documentation
```

**What Floww does:**
1. **Autonomously explores** your application like a real user
2. **Detects all screens** and unique pages (even in SPAs)
3. **Captures screenshots** with smart annotations
4. **Understands UI elements** using GPT-4 Vision + Claude
5. **Detects workflows** and business processes
6. **Generates documentation** in Markdown, HTML, PDF
7. **Translates** to multiple languages

## 🚀 Quick Start

### Prerequisites
- **Node.js 20+**
- **PostgreSQL** (or SQLite for quick testing)
- Optional: **Redis** (for background workers)
- Optional: **OpenAI API Key** or **Anthropic API Key** (for AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/juspay/floww.git
cd floww

# Setup backend
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration

# Setup database
npm run db:generate
npm run db:push

# Install Playwright browsers
npx playwright install chromium

# Start backend server
npm run dev

# Backend runs on http://localhost:8000
```

### Run Frontend (Optional)
```bash
cd ../frontend
npm install
npm run dev

# Frontend runs on http://localhost:5173
```

### Basic Usage

#### Option 1: REST API
```bash
# Health check
curl http://localhost:8000/health

# Create a project
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My App","baseUrl":"https://your-app.com"}'

# Start crawling
curl -X POST http://localhost:8000/api/v1/projects/{id}/crawl/start

# Check status
curl http://localhost:8000/api/v1/projects/{id}/crawl/status

# Generate docs
curl -X POST http://localhost:8000/api/v1/projects/{id}/documents/generate \
  -H "Content-Type: application/json" \
  -d '{"format":"markdown"}'
```

#### Option 2: CLI (Coming Soon)
```bash
# Initialize project
npm run cli -- init --url https://your-app.com --name "My App"

# Validate config
npm run cli -- validate

# Check status
npm run cli -- status
```

## 🎯 Features

### 🤖 Autonomous Exploration
- Navigates your app like a real user
- Discovers all pages and screens
- Handles SPAs (React, Vue, Angular, Next.js)
- Smart page fingerprinting to avoid duplicates
- **Stealth mode** - evades bot detection
- **🆕 Interactive crawling** - Opens browser window for user actions (login, forms, CAPTCHA)
- **🆕 Smart navigation** - Only goes deeper from base URL, focuses on features  
- **🆕 Similarity detection** - Prevents repetitive crawling (saves 80-90% time!)

### 🔐 Authentication
- Auto-login with credentials
- Session cookie injection
- Multi-strategy support (email/password, OAuth, session)
- Auth state detection
- **🆕 Visual browser prompts** - Beautiful popups for user interaction

### 📸 Screenshot Capture
- Full-page screenshots
- Element-specific captures  
- Automatic annotation and highlighting
- Annotated screenshots with labels

### 🧠 AI Understanding (GPT-4 + Claude)
- Vision models analyze screenshots
- Text models interpret DOM structure
- Detects field purposes and relationships
- Identifies business workflows
- AI-enhanced documentation generation

### 📊 Knowledge Graph
- Builds complete application graph
- Tracks page relationships
- Workflow detection
- Export to JSON/Graphology format
- **🆕 Optimized graphs** - Filters repetitive patterns automatically

### 📝 Multi-Format Output
- Markdown documentation
- Static HTML sites
- PDF documents (coming soon)
- Word documents (coming soon)

### 🌍 Multi-Language
- Automatic translation via AI
- 50+ languages supported
- Maintains markdown formatting

### 🚀 Background Processing
- BullMQ-based job queue
- Redis-powered workers
- Parallel crawling
- Progress tracking

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                FLOWW SYSTEM (TypeScript)                │
├─────────────────────────────────────────────────────────┤
│  API Layer (Hono Framework)                             │
│  ├── REST API Endpoints                                 │
│  ├── Authentication Middleware                          │
│  └── WebSocket (Coming Soon)                            │
├─────────────────────────────────────────────────────────┤
│  Browser Automation (Playwright)                        │
│  ├── Stealth Browser (Anti-bot detection)               │
│  ├── Auth Handler (Auto-login)                          │
│  ├── Screenshot Capture (Annotated)                     │
│  └── Navigator with human-like behavior                 │
├─────────────────────────────────────────────────────────┤
│  UI Extraction & Analysis                               │
│  ├── DOM Parser                                         │
│  ├── Form/Button/Link Extractor                         │
│  ├── Accessibility Tree Parser                          │
│  └── Element Position Tracking                          │
├─────────────────────────────────────────────────────────┤
│  AI/LLM Integration                                     │
│  ├── OpenAI GPT-4 Vision                                │
│  ├── Anthropic Claude (with Vision)                     │
│  ├── Page Purpose Analyzer                              │
│  ├── Workflow Detector                                  │
│  └── Multi-language Translator                          │
├─────────────────────────────────────────────────────────┤
│  Knowledge Graph (Graphology)                           │
│  ├── Node: Pages, Elements, Forms, Buttons              │
│  ├── Edges: Navigation, Contains, Submits               │
│  ├── Workflow Detection                                 │
│  └── Export/Visualization                               │
├─────────────────────────────────────────────────────────┤
│  Archive System (Wayback Machine style)                 │
│  ├── HTML Snapshot Storage                              │
│  ├── Screenshot Archives                                │
│  ├── Timeline View                                      │
│  └── Diff Engine                                        │
├─────────────────────────────────────────────────────────┤
│  Documentation Generator                                │
│  ├── AI-Enhanced Markdown                               │
│  ├── HTML with Styling                                  │
│  ├── Translation Support                                │
│  └── Screenshot Integration                             │
├─────────────────────────────────────────────────────────┤
│  Background Workers (BullMQ + Redis)                    │
│  ├── Crawl Queue                                        │
│  ├── Graph Building Queue                               │
│  ├── Documentation Queue                                │
│  └── Retry Logic & Progress Tracking                    │
└─────────────────────────────────────────────────────────┘
```

## ⚙️ Configuration

### Environment Variables (.env)

```bash
# Required
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/floww"
# or SQLite: DATABASE_URL="file:./dev.db"

JWT_SECRET="your-super-secret-jwt-key-min-32-characters-long"
PORT=8000
NODE_ENV=development

# Development (disable auth for testing)
DISABLE_AUTH=true

# CORS
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"

# Storage Paths
STORAGE_PATH="./storage"
ARCHIVE_PATH="./archive_storage"
GRAPH_PATH="./graph_storage"
SCREENSHOT_PATH="./storage/screenshots"
OUTPUT_PATH="./storage/output"

# Optional: AI Features (at least one for AI-powered docs)
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
LLM_PROVIDER="openai"  # or "anthropic"

# Optional: Background Workers (requires Redis)
REDIS_URL="redis://localhost:6379"
```

### Project Configuration (floww.yaml)

```yaml
name: "My SaaS Documentation"
baseUrl: "https://app.example.com"

auth:
  type: email_password  # or "session", "oauth", "none"
  email: admin@example.com
  password: ${AUTH_PASSWORD}
  loginUrl: https://app.example.com/login

scope:
  maxDepth: 5
  maxPages: 100
  excludePatterns:
    - "/admin/*"
    - "/api/*"
  includePatterns:
    - "/dashboard/*"
    - "/users/*"
    - "/app/*"
  followExternalLinks: false

output:
  formats:
    - markdown
    - html
  outputDir: ./docs
  includeScreenshots: true
  includeWorkflows: true

screenshot: true
rateLimit: 1.0
headless: true
```

## 💻 Tech Stack

### Backend (TypeScript)
- **Framework**: Hono (lightweight, fast)
- **Database**: Prisma ORM (PostgreSQL/SQLite)
- **Auth**: JWT + bcrypt
- **Browser**: Playwright
- **AI**: OpenAI + Anthropic SDKs
- **Graph**: Graphology
- **Queue**: BullMQ + Redis
- **Validation**: Zod

### Frontend (React + TypeScript)
- **Framework**: React 18 + Vite
- **UI**: Tailwind CSS
- **State**: React Query
- **Routing**: React Router
- **Charts**: Recharts

### Infrastructure
- **Database**: PostgreSQL (prod) / SQLite (dev)
- **Cache/Queue**: Redis (optional)
- **Container**: Docker + Docker Compose
- **Monitoring**: Prometheus + Grafana (optional)

## 📂 Project Structure

```
floww/
├── backend/              # TypeScript Backend
│   ├── src/
│   │   ├── config/       # Environment config
│   │   ├── db/           # Prisma client
│   │   ├── middleware/   # Auth, CORS, logging
│   │   ├── modules/      # API routes
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── crawl/    # Crawler service
│   │   │   ├── archive/
│   │   │   ├── graph/
│   │   │   └── documents/
│   │   ├── services/     # Business logic
│   │   │   ├── ai/       # LLM clients
│   │   │   ├── archive/  # Snapshot storage
│   │   │   ├── browser/  # Playwright, stealth, auth
│   │   │   ├── extraction/ # DOM parser
│   │   │   ├── graph/    # Knowledge graph
│   │   │   ├── documents/ # Doc generator
│   │   │   ├── interactive/ # Human-in-the-loop
│   │   │   └── queue/    # Background workers
│   │   ├── types/        # Zod schemas
│   │   ├── utils/        # Helpers
│   │   ├── cli.ts        # CLI interface
│   │   └── index.ts      # Main server
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
├── frontend/             # React Frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── types/
│   └── package.json
├── storage/              # Generated data
├── archive_storage/      # Wayback-style archives
├── graph_storage/        # Knowledge graphs
└── docs/                 # Documentation output
```

## 🧪 API Endpoints

### Projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects` - List projects
- `GET /api/v1/projects/:id` - Get project
- `PUT /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project
- `GET /api/v1/projects/:id/stats` - Get statistics

### Crawling
- `POST /api/v1/projects/:id/crawl/start` - Start crawl
- `GET /api/v1/projects/:id/crawl/status` - Get status
- `POST /api/v1/projects/:id/crawl/cancel` - Cancel crawl
- `GET /api/v1/projects/:id/crawl/sessions` - List sessions

### Archive
- `GET /api/v1/projects/:id/archive/snapshots` - List snapshots
- `GET /api/v1/projects/:id/archive/timeline` - Get timeline
- `GET /api/v1/projects/:id/archive/compare` - Compare versions

### Knowledge Graph
- `GET /api/v1/projects/:id/graph/export` - Export graph
- `GET /api/v1/projects/:id/graph/stats` - Graph statistics
- `GET /api/v1/projects/:id/graph/nodes` - Get nodes
- `GET /api/v1/projects/:id/graph/workflows` - Detected workflows

### Documentation
- `POST /api/v1/projects/:id/documents/generate` - Generate docs
- `GET /api/v1/projects/:id/documents` - List documents
- `POST /api/v1/projects/:id/documents/translate` - Translate

## 🚀 Deployment

### Docker
```bash
docker-compose up -d
```

### Manual
```bash
# Build backend
cd backend
npm run build
npm start

# Build frontend
cd frontend
npm run build
# Serve dist/ with nginx or any static server
```

## 📊 Roadmap

### ✅ Phase 1: Foundation (COMPLETE)
- [x] TypeScript migration
- [x] REST API with authentication
- [x] Playwright crawler with stealth
- [x] DOM extraction & analysis
- [x] Screenshot capture with annotations
- [x] Knowledge graph builder
- [x] Basic documentation generator
- [x] Archive system (Wayback-style)

### 🚧 Phase 2: AI Enhancement (IN PROGRESS)
- [x] LLM integration (OpenAI + Anthropic)
- [x] Vision model screenshot analysis
- [x] AI-powered documentation
- [x] Multi-language translation
- [ ] Interactive GUI refinement
- [ ] WebSocket real-time updates

### 📅 Phase 3: Enterprise Features
- [ ] PDF export (Puppeteer)
- [ ] Word export (.docx)
- [ ] Confluence integration
- [ ] Notion integration
- [ ] Multi-tenant support
- [ ] SSO integration
- [ ] Webhook notifications
- [ ] Custom extractors (plugin system)

### 🔮 Phase 4: Advanced
- [ ] API documentation from Swagger/OpenAPI
- [ ] Database schema documentation
- [ ] Code documentation from repos
- [ ] Video walkthrough generation
- [ ] Interactive demos (Storylane-style)

## 🏆 Competitive Advantages

| Feature | Floww | Scribe | Tango | Guidde |
|---------|-------|--------|-------|--------|
| **Autonomous exploration** | ✅ Full | ❌ | ❌ | ❌ |
| **SPA support** | ✅ Complete | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial |
| **Stealth mode** | ✅ | ❌ | ❌ | ❌ |
| **Self-hosted** | ✅ | ❌ | ❌ | ❌ |
| **Open source** | ✅ | ❌ | ❌ | ❌ |
| **Multi-format** | ✅ MD/HTML/PDF | ⚠️ Limited | ⚠️ Limited | ❌ Video only |
| **Multi-language** | ✅ AI-powered | ✅ | ✅ | ✅ |
| **Knowledge graph** | ✅ | ❌ | ❌ | ❌ |
| **API-first** | ✅ | ❌ | ❌ | ❌ |
| **Background workers** | ✅ BullMQ | N/A | N/A | N/A |
| **Cost** | Free + API costs | $29+/mo | $20+/mo | $16+/mo |

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please read our Contributing Guide for details.

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/juspay/floww/issues)
- **Discussions**: [GitHub Discussions](https://github.com/juspay/floww/discussions)
- **Email**: support@floww.dev

---

**Built with TypeScript ❤️ by the Floww Team**
