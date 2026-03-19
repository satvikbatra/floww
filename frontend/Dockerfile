FROM node:20-alpine

WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies)
RUN npm install

# Copy source code
COPY . .

# Expose Vite's default port
EXPOSE 4000

# Start Vite dev server with host binding
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "4000"]
