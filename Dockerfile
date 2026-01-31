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
    ttf-freefont \
    wget

# Set environment
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Install TypeScript and tsx globally (needed for build and runtime)
RUN npm install -g typescript tsx tsc-esm-fix

# Copy ALL source files first (needed for preinstall script)
COPY . .

# Install ALL dependencies
RUN npm install --legacy-peer-deps

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
CMD ["tsx", "web-server.ts"]
