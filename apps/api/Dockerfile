# API 镜像：容器启动时自动执行数据库迁移，再启动服务（端口 3001）
FROM node:22-alpine
# Prisma 需要 openssl 识别 OpenSSL 版本
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
COPY . .
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
RUN pnpm install --frozen-lockfile \
  && pnpm -C apps/api exec prisma generate \
  && pnpm -C apps/api build
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
