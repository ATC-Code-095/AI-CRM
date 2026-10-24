/**
 * @deprecated 使用 SeedService（AUTO_SEED）或 apps/api/scripts/seed-cli.mjs
 * 保留文件以免外部引用失效。
 */
export async function seed(): Promise<never> {
  throw new Error(
    'Use apps/api/scripts/seed-cli.mjs or AUTO_SEED=true (SeedService). See docs/07-dev-guide.md §6',
  )
}
