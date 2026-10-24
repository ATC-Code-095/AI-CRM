# Web 镜像：构建前端静态文件，由 nginx 提供，并把 /api/ 转发给 api 服务
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
RUN pnpm install --frozen-lockfile \
  && pnpm -C apps/web exec vite build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
