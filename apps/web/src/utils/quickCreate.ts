import { useEffect, useRef } from 'react'

/**
 * 全局快捷新建（命令面板 / ⌘K →「新建线索」等）
 *
 * 跨页通信：先写入 sessionStorage 兜底（目标页尚未挂载时也不丢事件），
 * 同时广播 `crm:create` 事件（目标页已挂载时立即响应）。
 */
export type CreateEntity = 'lead' | 'account' | 'contact' | 'opportunity' | 'activity' | 'quote' | 'ticket'

const KEY = 'crm.pendingCreate'

export function requestCreate(entity: CreateEntity) {
  try {
    sessionStorage.setItem(KEY, entity)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('crm:create', { detail: entity }))
}

function consume(entity: CreateEntity): boolean {
  try {
    if (sessionStorage.getItem(KEY) === entity) {
      sessionStorage.removeItem(KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** 列表页挂载时调用：接收来自命令面板的新建指令 */
export function useQuickCreate(entity: CreateEntity, onOpen: () => void) {
  const cb = useRef(onOpen)
  cb.current = onOpen
  useEffect(() => {
    if (consume(entity)) {
      // 等页面首屏查询完成后再打开，避免弹窗被数据重置
      const timer = setTimeout(() => cb.current(), 180)
      return () => clearTimeout(timer)
    }
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === entity) cb.current()
    }
    window.addEventListener('crm:create', handler)
    return () => window.removeEventListener('crm:create', handler)
  }, [entity])
}
