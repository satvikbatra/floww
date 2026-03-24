FROM node:20-slim AS base

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy crawler-engine
COPY crawler-engine/package.json crawler-engine/
COPY crawler-engine/tsconfig.json crawler-engine/

# Copy backend
COPY backend/package.json backend/
COPY backend/tsconfig.json backend/
COPY backend/prisma backend/prisma/

# Install all workspace dependencies
RUN npm ci --workspace=crawler-engine --workspace=backend

# Generate Prisma client
RUN cd backend && npx prisma generate

# Build crawler-engine first (backend depends on it)
COPY crawler-engine/src crawler-engine/src/
RUN cd crawler-engine && npx tsc

# Build backend
COPY backend/src backend/src/
RUN cd backend && npx tsc

# --- Production stage ---
FROM node:20-slim AS production

RUN apt-get update && \
    apt-get install -y openssl && \
    npx playwright install-deps chromium && \
    npx playwright install chromium && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/package.json /app/package-lock.json* ./
COPY --from=base /app/tsconfig.base.json ./
COPY --from=base /app/crawler-engine/package.json crawler-engine/
COPY --from=base /app/crawler-engine/dist crawler-engine/dist/
COPY --from=base /app/backend/package.json backend/
COPY --from=base /app/backend/dist backend/dist/
COPY --from=base /app/backend/prisma backend/prisma/

RUN npm ci --workspace=crawler-engine --workspace=backend --omit=dev
RUN cd backend && npx prisma generate

# Create storage directories
RUN mkdir -p backend/storage backend/archive_storage backend/graph_storage backend/storage/output

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

WORKDIR /app/backend
CMD ["node", "dist/index.js"]
