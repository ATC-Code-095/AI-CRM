import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { getBuildInfo } from '../../scripts/build-info.mjs'

const buildInfo = getBuildInfo()

/** 构建产物写入版本信息：dist/version.json + index.html 的 <meta name="app-version"> */
function buildInfoPlugin(): Plugin {
  return {
    name: 'aicrm-build-info',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { name: 'app-version', content: `${buildInfo.version}+${buildInfo.commit}` },
        injectTo: 'head',
      },
    ],
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(buildInfo, null, 2) + '\n',
      })
    },
  }
}

const MANUAL_DIR = resolve(fileURLToPath(new URL('../../docs/manual', import.meta.url)))
const MANUAL_MIME: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? listFiles(p) : [p]
  })
}

/** 帮助中心：docs/manual 是唯一来源，开发时直接读取，构建时复制到 dist/manual */
function manualPlugin(): Plugin {
  return {
    name: 'aicrm-manual',
    configureServer(server) {
      server.middlewares.use('/manual', (req, res, next) => {
        const file = resolve(MANUAL_DIR, '.' + decodeURIComponent((req.url ?? '').split('?')[0]))
        if (!file.startsWith(MANUAL_DIR + sep) || !existsSync(file) || statSync(file).isDirectory()) return next()
        res.setHeader('Content-Type', MANUAL_MIME[extname(file)] ?? 'application/octet-stream')
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const file of listFiles(MANUAL_DIR)) {
        this.emitFile({
          type: 'asset',
          fileName: `manual/${relative(MANUAL_DIR, file).split(sep).join('/')}`,
          source: readFileSync(file),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), buildInfoPlugin(), manualPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(buildInfo.version),
    __APP_COMMIT__: JSON.stringify(buildInfo.commit),
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          const p = id.replace(/\\/g, '/')
          // React 必须单独成块（含 pnpm 路径），避免 antd 重复打包导致 #426
          if (
            /\/(react|react-dom|react-router|react-router-dom|scheduler|loose-envify|js-tokens)(\/|$)/.test(
              p,
            ) ||
            /\/\.pnpm\/react(@|\/)/.test(p) ||
            /\/\.pnpm\/react-dom(@|\/)/.test(p) ||
            /\/\.pnpm\/scheduler@/.test(p)
          ) {
            return 'react'
          }
          // antd 不再强制合成一个块：由 Rollup 按页面引用拆分，首屏只加载用到的组件
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    setupFiles: ['./src/__tests__/setup.ts'],
    environmentMatchGlobs: [
      ['**/__tests__/**/*rtl*', 'jsdom'],
      ['**/*.spec.tsx', 'jsdom'],
    ],
  },
})
