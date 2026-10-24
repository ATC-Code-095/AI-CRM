import { describe, expect, it, vi } from 'vitest'
import { DingTalkClient, FeishuClient, WeComClient } from '../src/modules/im/providers'

/** 按 URL 片段返回 JSON 的假 fetch，并记录调用 */
function fakeFetch(routes: Array<[string, unknown]>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const hit = routes.find(([frag]) => url.includes(frag))
    if (!hit) return new Response('{}', { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: 200 })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('WeCom client', () => {
  it('reads departments and members, mapping status 1 to active', async () => {
    const { fn, calls } = fakeFetch([
      ['/gettoken', { errcode: 0, access_token: 'T', expires_in: 7200 }],
      ['/department/list', { errcode: 0, department: [{ id: 1, name: '公司', parentid: 0, order: 1 }, { id: 2, name: '销售部', parentid: 1, order: 2 }] }],
      ['department_id=1', { errcode: 0, userlist: [{ userid: 'zhang', name: '张三', mobile: '13800000001', email: 'z@x.com', department: [2], status: 1 }] }],
      ['department_id=2', { errcode: 0, userlist: [{ userid: 'li', name: '李四', department: [2], status: 5 }] }],
    ])
    const c = new WeComClient({ appId: 'corp1', secret: 's', agentId: '1000002' }, fn)
    const depts = await c.listDepartments()
    expect(depts).toEqual([
      { id: '1', parentId: null, name: '公司', order: 1 },
      { id: '2', parentId: '1', name: '销售部', order: 2 },
    ])
    const users = await c.listUsers(depts)
    expect(users).toEqual([
      { id: 'zhang', name: '张三', email: 'z@x.com', mobile: '13800000001', deptIds: ['2'], active: true },
      { id: 'li', name: '李四', email: undefined, mobile: undefined, deptIds: ['2'], active: false },
    ])
    expect(calls.filter((c) => c.url.includes('/gettoken'))).toHaveLength(1)
    const url = new URL(c.authorizeUrl('https://crm.example.com/login/sso/wechat_work', 'ST'))
    expect(url.origin + url.pathname).toBe('https://login.work.weixin.qq.com/wwlogin/sso/login')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ login_type: 'CorpApp', appid: 'corp1', agentid: '1000002', state: 'ST' })
  })

  it('exchanges a login code for the member userid', async () => {
    const { fn } = fakeFetch([
      ['/gettoken', { errcode: 0, access_token: 'T', expires_in: 7200 }],
      ['/auth/getuserinfo', { errcode: 0, userid: 'zhang' }],
      ['/user/get', { errcode: 0, name: '张三', email: 'z@x.com' }],
    ])
    const c = new WeComClient({ appId: 'corp1', secret: 's', agentId: '1' }, fn)
    expect(await c.exchangeCode('CODE')).toEqual({ id: 'zhang', name: '张三', email: 'z@x.com', mobile: undefined })
  })

  it('surfaces API error codes', async () => {
    const { fn } = fakeFetch([['/gettoken', { errcode: 40013, errmsg: 'invalid corpid' }]])
    await expect(new WeComClient({ appId: 'x', secret: 's' }, fn).ping()).rejects.toThrow('40013 invalid corpid')
  })
})

describe('DingTalk client', () => {
  it('walks sub-departments and pages through members', async () => {
    const { fn, calls } = fakeFetch([
      ['/gettoken', { errcode: 0, access_token: 'T', expires_in: 7200 }],
      ['/department/listsub', { errcode: 0, result: [] }],
      ['/topapi/v2/user/list', { errcode: 0, result: { has_more: false, list: [{ userid: 'u1', name: '王五', mobile: '+86-13800000002', dept_id_list: [1], active: true }] } }],
    ])
    const c = new DingTalkClient({ appId: 'ak', secret: 's' }, fn)
    const depts = await c.listDepartments()
    expect(depts).toEqual([{ id: '1', parentId: null, name: '', order: 0 }])
    expect(await c.listUsers(depts)).toEqual([{ id: 'u1', name: '王五', email: undefined, mobile: '+86-13800000002', deptIds: ['1'], active: true }])
    expect(JSON.parse(String(calls.find((x) => x.url.includes('/user/list'))!.init!.body))).toEqual({ dept_id: 1, cursor: 0, size: 100 })
  })

  it('exchanges the auth code, reads the user and maps unionId to userid', async () => {
    const { fn, calls } = fakeFetch([
      ['/gettoken', { errcode: 0, access_token: 'T', expires_in: 7200 }],
      ['/oauth2/userAccessToken', { accessToken: 'UAT' }],
      ['/contact/users/me', { unionId: 'UNION', nick: '王五', mobile: '13800000002' }],
      ['/user/getbyunionid', { errcode: 0, result: { userid: 'u1' } }],
    ])
    const c = new DingTalkClient({ appId: 'ak', secret: 'sk' }, fn)
    expect(await c.exchangeCode('AUTH')).toEqual({ id: 'u1', name: '王五', mobile: '13800000002', email: undefined })
    const tokenCall = calls.find((x) => x.url.includes('userAccessToken'))!
    expect(JSON.parse(String(tokenCall.init!.body))).toEqual({ clientId: 'ak', clientSecret: 'sk', code: 'AUTH', grantType: 'authorization_code' })
    expect((calls.find((x) => x.url.includes('users/me'))!.init!.headers as Record<string, string>)['x-acs-dingtalk-access-token']).toBe('UAT')
  })
})

describe('Feishu client', () => {
  it('reads departments and members with the tenant token, treating resigned users as inactive', async () => {
    const { fn, calls } = fakeFetch([
      ['/tenant_access_token/internal', { code: 0, tenant_access_token: 'TT', expire: 7200 }],
      ['/departments/0/children', { code: 0, data: { has_more: false, items: [{ open_department_id: 'od-1', parent_department_id: '0', name: '销售部' }] } }],
      ['department_id=0', { code: 0, data: { has_more: false, items: [] } }],
      ['department_id=od-1', { code: 0, data: { has_more: false, items: [{ open_id: 'ou_1', name: '赵六', email: 'zl@x.com', department_ids: ['od-1'], status: { is_resigned: true } }] } }],
    ])
    const c = new FeishuClient({ appId: 'cli_x', secret: 's' }, fn)
    const depts = await c.listDepartments()
    expect(depts).toEqual([
      { id: '0', parentId: null, name: '', order: 0 },
      { id: 'od-1', parentId: '0', name: '销售部', order: 0 },
    ])
    expect(await c.listUsers(depts)).toEqual([{ id: 'ou_1', name: '赵六', email: 'zl@x.com', mobile: undefined, deptIds: ['od-1'], active: false }])
    expect((calls[1].init!.headers as Record<string, string>).Authorization).toBe('Bearer TT')
    const url = new URL(c.authorizeUrl('https://crm.example.com/login/sso/feishu', 'ST'))
    expect(url.origin + url.pathname).toBe('https://accounts.feishu.cn/open-apis/authen/v1/authorize')
    expect(url.searchParams.get('client_id')).toBe('cli_x')
  })

  it('exchanges the code (OAuth v2) and reads user_info', async () => {
    const { fn, calls } = fakeFetch([
      ['/authen/v2/oauth/token', { code: 0, access_token: 'UAT' }],
      ['/authen/v1/user_info', { code: 0, data: { open_id: 'ou_1', name: '赵六', mobile: '+8613800000003' } }],
    ])
    const c = new FeishuClient({ appId: 'cli_x', secret: 'sec' }, fn)
    expect(await c.exchangeCode('C', 'https://crm.example.com/login/sso/feishu')).toEqual({ id: 'ou_1', name: '赵六', email: undefined, mobile: '+8613800000003' })
    expect(JSON.parse(String(calls[0].init!.body))).toMatchObject({ grant_type: 'authorization_code', client_id: 'cli_x', client_secret: 'sec', code: 'C' })
  })
})
