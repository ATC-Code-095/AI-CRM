import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    // 集成测试共用同一个运行中的 API、同一个数据库和同一批演示账号：
    // 例如 group-finance 会临时限定管理员可见的法人主体，并行时其他用例列出的客户会变空。
    // 测试文件按顺序执行，避免互相干扰（单个文件内的用例本就顺序执行）。
    fileParallelism: false,
  },
})
