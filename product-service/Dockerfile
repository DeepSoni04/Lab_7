# CampusConnect Product Microservice Dockerfile
# Web Services & SOA Laboratory • Lab 6
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Expose microservice port
EXPOSE 3002

# Default environment variables
ENV NODE_ENV=production \
    PRODUCT_SERVICE_PORT=3002 \
    PORT=3002

# Start microservice
CMD ["node", "server.js"]
