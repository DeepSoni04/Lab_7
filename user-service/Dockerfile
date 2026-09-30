# CampusConnect User Microservice Dockerfile
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
EXPOSE 3001

# Default environment variables
ENV NODE_ENV=production \
    USER_SERVICE_PORT=3001 \
    PORT=3001

# Start microservice
CMD ["node", "server.js"]
