FROM node:20-alpine

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

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 18000

# Default to HTTP server for container health; allow stdio via npm script
CMD ["npm", "run", "dev"]