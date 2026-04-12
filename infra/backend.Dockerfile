FROM rust:1.93-slim AS builder

WORKDIR /app
COPY backend/ .
RUN cargo build --release --features dev-auth

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/taskboard-backend /usr/local/bin/taskboard-backend
EXPOSE 8080
CMD ["taskboard-backend"]
