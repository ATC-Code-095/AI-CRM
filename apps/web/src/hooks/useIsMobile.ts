import { Grid } from 'antd'

/** 是否移动端（与 AppShell 一致） */
export function useIsMobile() {
  const screens = Grid.useBreakpoint()
  return !screens.md
}
