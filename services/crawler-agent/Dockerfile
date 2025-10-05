FROM node:20-alpine

# Install git, Python and build tools for tree-sitter compilation
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for tsx)
RUN npm install

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory and create temp directory for repo cloning
RUN chown -R nodejs:nodejs /app && \
    mkdir -p /tmp/axiom-repos && \
    chown -R nodejs:nodejs /tmp/axiom-repos

USER nodejs

# Expose port
EXPOSE 5000

# Start the application in development mode
CMD ["npm", "run", "dev"]