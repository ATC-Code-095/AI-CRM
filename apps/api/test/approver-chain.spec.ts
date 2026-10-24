import { describe, expect, it } from 'vitest'
import { resolveApproverChain, type ApproverLookup, type ApproverUser } from '../src/modules/workflow/approver-chain'

/** 组织：rep → mgr → boss；admin、admin2 为超级管理员 */
function org(users: Array<Partial<ApproverUser> & { id: string }>, admins: string[]): ApproverLookup {
  const map = new Map(users.map((u) => [u.id, { managerId: null, status: 'ACTIVE', deletedAt: null, ...u } as ApproverUser]))
  return { findUser: async (id) => map.get(id) ?? null, superAdmins: async () => admins }
}
const TWO_LEVELS = [
  { type: 'MANAGER', levels: 1 },
  { type: 'MANAGER', levels: 2 },
]

describe('resolveApproverChain', () => {
  const base = [
    { id: 'rep', managerId: 'mgr' },
    { id: 'mgr', managerId: 'boss' },
    { id: 'boss' },
    { id: 'admin' },
    { id: 'admin2' },
  ]

  it('两级分别交给直属上级与上级的上级', async () => {
    expect(await resolveApproverChain(org(base, ['admin']), 'rep', TWO_LEVELS)).toEqual(['mgr', 'boss'])
  })

  it('上级链不够长时，缺的那级交给超级管理员', async () => {
    expect(await resolveApproverChain(org(base, ['admin']), 'mgr', TWO_LEVELS)).toEqual(['boss', 'admin'])
  })

  it('没有上级时交给超级管理员，且同一人不重复审批', async () => {
    expect(await resolveApproverChain(org(base, ['admin']), 'boss', TWO_LEVELS)).toEqual(['admin'])
  })

  it('申请人不能审批自己的单：唯一超级管理员自己提交时找不到审批人', async () => {
    expect(await resolveApproverChain(org(base, ['admin']), 'admin', TWO_LEVELS)).toEqual([])
  })

  it('申请人是超级管理员时交给另一位超级管理员', async () => {
    expect(await resolveApproverChain(org(base, ['admin', 'admin2']), 'admin', TWO_LEVELS)).toEqual(['admin2'])
  })

  it('跳过已停用或已删除的上级，继续向上找', async () => {
    const users = [
      { id: 'rep', managerId: 'gone' },
      { id: 'gone', managerId: 'mgr', status: 'DISABLED' },
      { id: 'mgr', managerId: 'boss', deletedAt: new Date() },
      { id: 'boss' },
    ]
    expect(await resolveApproverChain(org(users, ['admin']), 'rep', TWO_LEVELS)).toEqual(['boss', 'admin'])
  })

  it('上级链成环时不会死循环', async () => {
    const users = [
      { id: 'a', managerId: 'b' },
      { id: 'b', managerId: 'a' },
    ]
    expect(await resolveApproverChain(org(users, ['admin']), 'a', TWO_LEVELS)).toEqual(['b', 'admin'])
  })

  it('未知步骤类型交给超级管理员；规则为空时默认直属上级一级', async () => {
    expect(await resolveApproverChain(org(base, ['admin']), 'rep', [{ type: 'ROLE' }])).toEqual(['admin'])
    expect(await resolveApproverChain(org(base, ['admin']), 'rep', [])).toEqual(['mgr'])
  })
})
