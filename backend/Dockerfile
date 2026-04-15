FROM golang:1.22-bullseye

RUN apt-get update && \
    apt-get install -y build-essential gcc gdb strace && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# We skip copying source here because we'll mount it via docker-compose for dev
