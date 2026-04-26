# Stage 1: Install dependencies
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:20-alpine AS runner

WORKDIR /app

# Copy installed production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
