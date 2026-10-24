import type { DbClient } from './doc-no'

/** 读取租户级业务参数（settings 表 scope=TENANT）；未配置时返回 undefined */
export async function tenantSetting(db: DbClient, tenantId: string, key: string): Promise<unknown> {
  const row = await db.setting.findFirst({ where: { tenantId, scope: 'TENANT', key, userId: null } })
  return row?.value ?? undefined
}

/** 业务参数转文本，去首尾空白；空值返回 '' */
export const settingText = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
