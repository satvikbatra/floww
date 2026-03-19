# Floww Backend - TypeScript

Modern TypeScript backend for the Floww autonomous SaaS documentation generator.

## 🏗️ Architecture

```
backend/
├── src/
│   ├── config/          # Environment & configuration
│   ├── db/              # Prisma database client
│   ├── middleware/      # Auth, CORS, logging
│   ├── modules/         # Feature modules (auth, projects, crawl, etc.)
│   ├── services/        # Business logic (browser, archive, graph)
│   ├── types/           # TypeScript types & schemas
│   ├── utils/           # Helper functions
│   └── index.ts         # App entry point
└── prisma/
    └── schema.prisma    # Database schema
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL (or SQLite for dev)
- pnpm/npm

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env and set your DATABASE_URL and JWT_SECRET

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Start development server
npm run dev
```

Server will start on `http://localhost:8000`

## 📦 Stack

- **Framework**: Hono (lightweight, fast)
- **Database**: Prisma + PostgreSQL
- **Auth**: JWT (jsonwebtoken + bcrypt)
- **Validation**: Zod
- **Browser Automation**: Playwright
- **Knowledge Graph**: Graphology
- **TypeScript**: Latest with strict mode

## 🔑 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Get current user

### Projects
- `POST /api/v1/projects` - Create project
- `GET /api/v1/projects` - List projects
- `GET /api/v1/projects/:id` - Get project
- `PATCH /api/v1/projects/:id` - Update project
- `DELETE /api/v1/projects/:id` - Delete project

### Crawling
- `POST /api/v1/projects/:id/crawl` - Start crawl
- `GET /api/v1/projects/:id/crawl` - List crawl sessions
- `GET /api/v1/projects/:id/crawl/:sessionId` - Get crawl status
- `POST /api/v1/projects/:id/crawl/:sessionId/cancel` - Cancel crawl

### Archive
- `GET /api/v1/projects/:id/archive/snapshots` - List snapshots
- `GET /api/v1/projects/:id/archive/timeline/:urlHash` - Get timeline
- `POST /api/v1/projects/:id/archive/compare` - Compare snapshots
- `GET /api/v1/projects/:id/archive/stats` - Get statistics

### Knowledge Graph
- `GET /api/v1/projects/:id/graph/nodes` - Get nodes
- `GET /api/v1/projects/:id/graph/edges` - Get edges
- `GET /api/v1/projects/:id/graph/stats` - Get statistics
- `GET /api/v1/projects/:id/graph/workflows` - Detect workflows
- `GET /api/v1/projects/:id/graph/visualization` - Export for viz

### Documents
- `POST /ap/v1/projects/:id/documents` - Generate documentation
- `GET /api/v1/projects/:id/documents` - List documents
- `GET /api/v1/projects/:id/documents/:docId` - Get document
- `DELETE /api/v1/projects/:id/documents/:docId` - Delete document

## 🧪 Development

```bash
# Run in dev mode with hot reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Open Prisma Studio (DB GUI)
npm run db:studio
```

## 🔐 Authentication

### Development Mode

Set `DISABLE_AUTH=true` in `.env` to bypass authentication during development.

### Production Mode

1. Register a user via `/api/v1/auth/register`
2. Login to get access token
3. Include token in requests: `Authorization: Bearer <token>`

Default admin user (if auth disabled):
- Email: `admin@floww.dev`
- Password: `admin123`

## 📝 Environment Variables

See `.env.example` for all available options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT tokens (min 32 chars)
- `DISABLE_AUTH` - Bypass auth in development
- `PORT` - Server port (default: 8000)
- `CORS_ORIGINS` - Allowed origins for CORS

## 🗄️ Database

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Create migration
npm run db:migrate

# Push schema without migration
npm run db:push

# Open Prisma Studio
npm run db:studio
```

## 🏭 Production Deployment

```bash
# Build
npm run build

# Set environment variables
export DATABASE_URL="postgresql://..."
export JWT_SECRET="..."
export DISABLE_AUTH=false
export NODE_ENV=production

# Run
npm start
```

## 📊 Features

✅ Complete authentication system with JWT
✅ Project management
✅ Web crawling with Playwright
✅ Wayback Machine-style archiving
✅ Knowledge graph extraction
✅ Automatic documentation generation
✅ TypeScript end-to-end
✅ Clean, modular architecture
✅ Production-ready error handling
✅ Database migrations with Prisma

## 🤝 Contributing

This is a complete migration from Python/FastAPI. The codebase is structured for easy maintenance and extension.

## 📄 License

MIT
