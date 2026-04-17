FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./
RUN pnpm install
COPY frontend/ .
ENV VITE_BACKEND_URL=""
ENV VITE_KEYCLOAK_URL="http://localhost:8180"
ENV VITE_KEYCLOAK_REALM="taskboard"
ENV VITE_KEYCLOAK_CLIENT_ID="taskboard-frontend"
ENV VITE_DEV_AUTH_ENABLED="1"
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
