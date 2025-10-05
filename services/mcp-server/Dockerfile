FROM node:20-alpine

WORKDIR /app

# Install Python 3.11 for tree-sitter compatibility
RUN apk add --no-cache python3 py3-pip

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 18000

# Start the application
CMD ["npm", "start"]
