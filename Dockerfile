# ==========================================
# WhatsApp Multi-Session API - Dockerfile
# ==========================================

FROM node:20-alpine

# Install dependencies untuk Baileys
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set environment
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm install --production=false

# Copy source code
COPY . .

# Create data directory for SQLite & sessions
RUN mkdir -p /app/data && \
    mkdir -p /app/baileys_auth_info && \
    chmod -R 755 /app/data /app/baileys_auth_info

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# Start application
CMD ["npx", "tsx", "web-server.ts"]
