/**
 * 企业微信 / 钉钉 / 飞书 企业自建应用的接口封装：通讯录读取 + 网页扫码登录。
 * 只用到各平台公开的服务端 API；凭证由管理员在系统设置里填写（密钥加密存库）。
 */

export type ImProvider = 'wechat_work' | 'dingtalk' | 'feishu'
export const IM_PROVIDERS: ImProvider[] = ['wechat_work', 'dingtalk', 'feishu']

export interface ExtDept {
  id: string
  parentId: string | null
  name: string
  order: number
}

export interface ExtUser {
  id: string
  name: string
  email?: string
  mobile?: string
  deptIds: string[]
  /** 在职且已激活 */
  active: boolean
}

export interface ExtLoginUser {
  /** 与通讯录同步时相同的用户 ID，用于绑定 */
  id: string
  name?: string
  email?: string
  mobile?: string
}

export interface ImAppConfig {
  /** 企业微信 corpid；钉钉 AppKey（Client ID）；飞书 App ID */
  appId: string
  secret: string
  /** 企业微信应用 AgentId（扫码登录需要） */
  agentId?: string
}

export interface ImClient {
  /** 取一次访问令牌，用于「测试连接」 */
  ping(): Promise<void>
  listDepartments(): Promise<ExtDept[]>
  listUsers(depts: ExtDept[]): Promise<ExtUser[]>
  authorizeUrl(redirectUri: string, state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<ExtLoginUser>
}

type Http = typeof fetch

export class ImApiError extends Error {}

async function json<T>(res: Response, label: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { errcode?: number; errmsg?: string; code?: number; msg?: string }
  if (!res.ok) throw new ImApiError(`${label}: HTTP ${res.status} ${body.errmsg ?? body.msg ?? ''}`.trim())
  if (typeof body.errcode === 'number' && body.errcode !== 0) throw new ImApiError(`${label}: ${body.errcode} ${body.errmsg ?? ''}`.trim())
  if (typeof body.code === 'number' && body.code !== 0) throw new ImApiError(`${label}: ${body.code} ${body.msg ?? ''}`.trim())
  return body
}

const timeout = () => ({ signal: AbortSignal.timeout(15_000) })

// ================= 企业微信 =================

export class WeComClient implements ImClient {
  private base = 'https://qyapi.weixin.qq.com/cgi-bin'
  private token: { value: string; exp: number } | null = null

  constructor(
    private readonly cfg: ImAppConfig,
    private readonly http: Http = fetch,
  ) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now()) return this.token.value
    const url = `${this.base}/gettoken?corpid=${encodeURIComponent(this.cfg.appId)}&corpsecret=${encodeURIComponent(this.cfg.secret)}`
    const r = await json<{ access_token: string; expires_in: number }>(await this.http(url, timeout()), 'wecom gettoken')
    this.token = { value: r.access_token, exp: Date.now() + (r.expires_in - 120) * 1000 }
    return r.access_token
  }

  async ping() {
    await this.accessToken()
  }

  async listDepartments() {
    const t = await this.accessToken()
    const r = await json<{ department: { id: number; name: string; parentid: number; order: number }[] }>(
      await this.http(`${this.base}/department/list?access_token=${t}`, timeout()),
      'wecom department/list',
    )
    return r.department.map((d) => ({
      id: String(d.id),
      parentId: d.parentid ? String(d.parentid) : null,
      name: d.name,
      order: d.order ?? 0,
    }))
  }

  async listUsers(depts: ExtDept[]) {
    const t = await this.accessToken()
    const byId = new Map<string, ExtUser>()
    // 逐个部门读取成员（不递归，避免重复）；status：1 已激活、2 已禁用、4 未激活、5 退出企业
    for (const d of depts) {
      const r = await json<{
        userlist: { userid: string; name: string; mobile?: string; email?: string; biz_mail?: string; department: number[]; status: number }[]
      }>(await this.http(`${this.base}/user/list?access_token=${t}&department_id=${d.id}`, timeout()), 'wecom user/list')
      for (const u of r.userlist) {
        byId.set(u.userid, {
          id: u.userid,
          name: u.name,
          email: u.email || u.biz_mail || undefined,
          mobile: u.mobile || undefined,
          deptIds: u.department.map(String),
          active: u.status === 1,
        })
      }
    }
    return [...byId.values()]
  }

  authorizeUrl(redirectUri: string, state: string) {
    const q = new URLSearchParams({
      login_type: 'CorpApp',
      appid: this.cfg.appId,
      agentid: this.cfg.agentId ?? '',
      redirect_uri: redirectUri,
      state,
    })
    return `https://login.work.weixin.qq.com/wwlogin/sso/login?${q}`
  }

  async exchangeCode(code: string) {
    const t = await this.accessToken()
    const info = await json<{ userid?: string; userid_?: string }>(
      await this.http(`${this.base}/auth/getuserinfo?access_token=${t}&code=${encodeURIComponent(code)}`, timeout()),
      'wecom auth/getuserinfo',
    )
    if (!info.userid) throw new ImApiError('wecom: not a member of this organization')
    const u = await json<{ name?: string; mobile?: string; email?: string; biz_mail?: string }>(
      await this.http(`${this.base}/user/get?access_token=${t}&userid=${encodeURIComponent(info.userid)}`, timeout()),
      'wecom user/get',
    ).catch(() => ({}) as { name?: string; mobile?: string; email?: string; biz_mail?: string })
    return { id: info.userid, name: u.name, mobile: u.mobile || undefined, email: u.email || u.biz_mail || undefined }
  }
}

// ================= 钉钉 =================

export class DingTalkClient implements ImClient {
  private oapi = 'https://oapi.dingtalk.com'
  private token: { value: string; exp: number } | null = null

  constructor(
    private readonly cfg: ImAppConfig,
    private readonly http: Http = fetch,
  ) {}

  private async accessToken() {
    if (this.token && this.token.exp > Date.now()) return this.token.value
    const url = `${this.oapi}/gettoken?appkey=${encodeURIComponent(this.cfg.appId)}&appsecret=${encodeURIComponent(this.cfg.secret)}`
    const r = await json<{ access_token: string; expires_in: number }>(await this.http(url, timeout()), 'dingtalk gettoken')
    this.token = { value: r.access_token, exp: Date.now() + (r.expires_in - 120) * 1000 }
    return r.access_token
  }

  private async post<T>(path: string, body: unknown, label: string) {
    const t = await this.accessToken()
    return json<T>(
      await this.http(`${this.oapi}${path}?access_token=${t}`, {
        ...timeout(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      label,
    )
  }

  async ping() {
    await this.accessToken()
  }

  async listDepartments() {
    // 根部门 ID 为 1，逐层读取子部门
    const out: ExtDept[] = [{ id: '1', parentId: null, name: '', order: 0 }]
    const queue = ['1']
    while (queue.length) {
      const id = queue.shift()!
      const r = await this.post<{ result: { dept_id: number; name: string; parent_id: number }[] }>(
        '/topapi/v2/department/listsub',
        { dept_id: Number(id) },
        'dingtalk department/listsub',
      )
      for (const d of r.result ?? []) {
        out.push({ id: String(d.dept_id), parentId: String(d.parent_id), name: d.name, order: 0 })
        queue.push(String(d.dept_id))
      }
    }
    return out
  }

  async listUsers(depts: ExtDept[]) {
    const byId = new Map<string, ExtUser>()
    for (const d of depts) {
      let cursor = 0
      for (;;) {
        const r = await this.post<{
          result: {
            has_more: boolean
            next_cursor?: number
            list: { userid: string; name: string; mobile?: string; email?: string; org_email?: string; dept_id_list: number[]; active?: boolean }[]
          }
        }>('/topapi/v2/user/list', { dept_id: Number(d.id), cursor, size: 100 }, 'dingtalk user/list')
        for (const u of r.result.list ?? []) {
          byId.set(u.userid, {
            id: u.userid,
            name: u.name,
            email: u.email || u.org_email || undefined,
            mobile: u.mobile || undefined,
            deptIds: (u.dept_id_list ?? []).map(String),
            active: u.active !== false,
          })
        }
        if (!r.result.has_more || r.result.next_cursor === undefined) break
        cursor = r.result.next_cursor
      }
    }
    return [...byId.values()]
  }

  authorizeUrl(redirectUri: string, state: string) {
    const q = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: 'code',
      client_id: this.cfg.appId,
      scope: 'openid corpid',
      state,
      prompt: 'consent',
    })
    return `https://login.dingtalk.com/oauth2/auth?${q}`
  }

  async exchangeCode(code: string) {
    const tok = await json<{ accessToken: string }>(
      await this.http('https://api.dingtalk.com/v1.0/oauth2/userAccessToken', {
        ...timeout(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: this.cfg.appId, clientSecret: this.cfg.secret, code, grantType: 'authorization_code' }),
      }),
      'dingtalk userAccessToken',
    )
    const me = await json<{ unionId: string; nick?: string; mobile?: string; email?: string }>(
      await this.http('https://api.dingtalk.com/v1.0/contact/users/me', {
        ...timeout(),
        headers: { 'x-acs-dingtalk-access-token': tok.accessToken },
      }),
      'dingtalk users/me',
    )
    // 扫码得到的是 unionId，换成企业内 userid 才能与通讯录对应
    const byUnion = await this.post<{ result: { userid: string } }>(
      '/topapi/user/getbyunionid',
      { unionid: me.unionId },
      'dingtalk user/getbyunionid',
    )
    return { id: byUnion.result.userid, name: me.nick, mobile: me.mobile || undefined, email: me.email || undefined }
  }
}

// ================= 飞书 =================

export class FeishuClient implements ImClient {
  private base = 'https://open.feishu.cn/open-apis'
  private token: { value: string; exp: number } | null = null

  constructor(
    private readonly cfg: ImAppConfig,
    private readonly http: Http = fetch,
  ) {}

  private async tenantToken() {
    if (this.token && this.token.exp > Date.now()) return this.token.value
    const r = await json<{ tenant_access_token: string; expire: number }>(
      await this.http(`${this.base}/auth/v3/tenant_access_token/internal`, {
        ...timeout(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: this.cfg.appId, app_secret: this.cfg.secret }),
      }),
      'feishu tenant_access_token',
    )
    this.token = { value: r.tenant_access_token, exp: Date.now() + (r.expire - 120) * 1000 }
    return r.tenant_access_token
  }

  private async get<T>(path: string, label: string) {
    const t = await this.tenantToken()
    return json<T>(await this.http(`${this.base}${path}`, { ...timeout(), headers: { Authorization: `Bearer ${t}` } }), label)
  }

  async ping() {
    await this.tenantToken()
  }

  async listDepartments() {
    const out: ExtDept[] = [{ id: '0', parentId: null, name: '', order: 0 }]
    let pageToken = ''
    for (;;) {
      const r = await this.get<{
        data: {
          has_more: boolean
          page_token?: string
          items?: { open_department_id: string; parent_department_id: string; name: string; order?: string }[]
        }
      }>(
        `/contact/v3/departments/0/children?fetch_child=true&page_size=50&department_id_type=open_department_id${pageToken ? `&page_token=${pageToken}` : ''}`,
        'feishu departments/children',
      )
      for (const d of r.data.items ?? []) {
        out.push({ id: d.open_department_id, parentId: d.parent_department_id || '0', name: d.name, order: Number(d.order ?? 0) })
      }
      if (!r.data.has_more || !r.data.page_token) break
      pageToken = r.data.page_token
    }
    return out
  }

  async listUsers(depts: ExtDept[]) {
    const byId = new Map<string, ExtUser>()
    for (const d of depts) {
      let pageToken = ''
      for (;;) {
        const r = await this.get<{
          data: {
            has_more: boolean
            page_token?: string
            items?: {
              open_id: string
              name: string
              email?: string
              enterprise_email?: string
              mobile?: string
              department_ids?: string[]
              status?: { is_resigned?: boolean; is_activated?: boolean; is_frozen?: boolean }
            }[]
          }
        }>(
          `/contact/v3/users/find_by_department?department_id=${encodeURIComponent(d.id)}&department_id_type=open_department_id&user_id_type=open_id&page_size=50${pageToken ? `&page_token=${pageToken}` : ''}`,
          'feishu users/find_by_department',
        )
        for (const u of r.data.items ?? []) {
          byId.set(u.open_id, {
            id: u.open_id,
            name: u.name,
            email: u.enterprise_email || u.email || undefined,
            mobile: u.mobile || undefined,
            deptIds: u.department_ids ?? [],
            active: !u.status?.is_resigned && !u.status?.is_frozen && u.status?.is_activated !== false,
          })
        }
        if (!r.data.has_more || !r.data.page_token) break
        pageToken = r.data.page_token
      }
    }
    return [...byId.values()]
  }

  authorizeUrl(redirectUri: string, state: string) {
    const q = new URLSearchParams({ client_id: this.cfg.appId, redirect_uri: redirectUri, response_type: 'code', state })
    return `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${q}`
  }

  async exchangeCode(code: string, redirectUri: string) {
    const tok = await json<{ access_token?: string; code?: number; error_description?: string }>(
      await this.http(`${this.base}/authen/v2/oauth/token`, {
        ...timeout(),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.cfg.appId,
          client_secret: this.cfg.secret,
          code,
          redirect_uri: redirectUri,
        }),
      }),
      'feishu oauth/token',
    )
    if (!tok.access_token) throw new ImApiError(`feishu oauth/token: ${tok.error_description ?? 'no access_token'}`)
    const me = await json<{ data: { open_id: string; name?: string; email?: string; enterprise_email?: string; mobile?: string } }>(
      await this.http(`${this.base}/authen/v1/user_info`, { ...timeout(), headers: { Authorization: `Bearer ${tok.access_token}` } }),
      'feishu user_info',
    )
    return {
      id: me.data.open_id,
      name: me.data.name,
      email: me.data.enterprise_email || me.data.email || undefined,
      mobile: me.data.mobile || undefined,
    }
  }
}

export function imClient(provider: ImProvider, cfg: ImAppConfig, http: Http = fetch): ImClient {
  if (provider === 'wechat_work') return new WeComClient(cfg, http)
  if (provider === 'dingtalk') return new DingTalkClient(cfg, http)
  return new FeishuClient(cfg, http)
}
