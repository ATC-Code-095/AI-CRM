import type { ForecastCommit, OpportunityBattlecard } from '@prisma/client'

/** 输出与原 settings JSON 一致的字段结构，前端无需改动 */

export function toForecastCommit(f: ForecastCommit) {
  return {
    userId: f.userId,
    userName: f.userName,
    month: f.month,
    commitAmount: Number(f.commitAmount).toFixed(2),
    bestAmount: Number(f.bestAmount).toFixed(2),
    worstAmount: Number(f.worstAmount).toFixed(2),
    note: f.note,
    submittedAt: f.submittedAt.toISOString(),
  }
}

export function toBattlecard(b: OpportunityBattlecard) {
  return {
    competitors: b.competitors,
    stakeholders: b.stakeholders,
    winThemes: b.winThemes,
    risks: b.risks,
    actions: (Array.isArray(b.actions) ? b.actions : []) as Array<{ text: string; done: boolean }>,
    updatedAt: b.updatedAt.toISOString(),
    updatedBy: b.updatedByName,
  }
}
