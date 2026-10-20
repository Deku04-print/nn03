# ==========================================
# TALENT ALIGN - FRONTEND MULTI-STAGE DOCKERFILE
# ==========================================

# ----------------- Stage 1: Build Stage -----------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (--legacy-peer-deps for React 19 compatibility)
RUN npm install -f 

# Copy frontend source code
COPY . ./

# Build production bundle
RUN npm run build

# ----------------- Stage 2: Serve with Nginx -----------------
FROM nginx:1.27-alpine

# Remove default nginx static assets and config
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy production build artifacts from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Expose web server port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
