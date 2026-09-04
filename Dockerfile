FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY src ./src
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/index.ts"]
