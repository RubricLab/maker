FROM oven/bun:1.3.12
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun --bun run build
EXPOSE 8080
CMD ["bun", "src/railway.ts"]
