FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/.npmrc ./
RUN pnpm install

COPY frontend/ .

# Production: no dev-auth, Keycloak URL injected at build time
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM=taskboard
ARG VITE_KEYCLOAK_CLIENT_ID=taskboard-frontend
ENV VITE_BACKEND_URL=""
ENV VITE_DEV_AUTH_ENABLED=""
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL}
ENV VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM}
ENV VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID}

RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
