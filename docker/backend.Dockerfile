FROM rust:1.93-slim AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ .
# Production build: no dev-auth feature
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/taskboard-backend /usr/local/bin/taskboard-backend
COPY backend/migrations ./migrations
EXPOSE 8080
CMD ["taskboard-backend"]
