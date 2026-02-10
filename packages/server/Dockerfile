# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/

# Install dependencies
RUN npm ci --workspace=@ursalock/server

# Copy source
COPY packages/server ./packages/server

# Build
WORKDIR /app/packages/server
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy built files
COPY --from=builder /app/packages/server/dist ./dist
COPY --from=builder /app/packages/server/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Create data directory for SQLite
RUN mkdir -p /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3456
ENV DATABASE_PATH=/app/data/vault.db

EXPOSE 3456

CMD ["node", "dist/index.js"]
