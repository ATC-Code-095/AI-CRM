import { createHmac } from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BotsService, buildRequest, categoryOf, validateWebhookUrl } from '../src/modules/notify/bots.service'

describe('group bots', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps notification types to categories', () => {
    expect(categoryOf('APPROVAL_TODO')).toBe('APPROVAL')
    expect(categoryOf('LEAD_AUTO_ASSIGN')).toBe('LEAD')
    expect(categoryOf('FOLLOWUP_TIMEOUT')).toBe('LEAD')
    expect(categoryOf('CONTRACT_EXPIRY_URGENT')).toBe('CONTRACT')
    expect(categoryOf('RENEWAL_OPP')).toBe('CONTRACT')
    expect(categoryOf('PAYMENT_NUDGE')).toBe('PAYMENT')
    expect(categoryOf('SEGMENT_AUTO')).toBe('CUSTOMER')
    expect(categoryOf('FUNNEL_STALL')).toBe('FUNNEL')
    expect(categoryOf('API_USAGE_ALERT')).toBe('SYSTEM')
  })

  it('only accepts official https webhook hosts', () => {
    expect(() => validateWebhookUrl('wechat_work', 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x')).not.toThrow()
    expect(() => validateWebhookUrl('dingtalk', 'https://oapi.dingtalk.com/robot/send?access_token=x')).not.toThrow()
    expect(() => validateWebhookUrl('feishu', 'https://open.feishu.cn/open-apis/bot/v2/hook/x')).not.toThrow()
    expect(() => validateWebhookUrl('dingtalk', 'http://oapi.dingtalk.com/robot/send')).toThrow()
    expect(() => validateWebhookUrl('wechat_work', 'https://127.0.0.1/hook')).toThrow()
    expect(() => validateWebhookUrl('wechat_work', 'https://oapi.dingtalk.com/robot/send')).toThrow()
    expect(() => validateWebhookUrl('feishu', 'not a url')).toThrow()
  })

  it('signs DingTalk requests with HMAC-SHA256 of "timestamp\\nsecret"', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const r = buildRequest({ channel: 'dingtalk', webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=t', secret: 'SEC' }, 'T', 'B')
    const sign = createHmac('sha256', 'SEC').update('1700000000000\nSEC').digest('base64')
    expect(r.url).toBe(`https://oapi.dingtalk.com/robot/send?access_token=t&timestamp=1700000000000&sign=${encodeURIComponent(sign)}`)
    expect(r.body).toMatchObject({ msgtype: 'markdown', markdown: { title: 'T' } })
  })

  it('signs Feishu requests with key "timestamp\\nsecret" over an empty message', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
    const r = buildRequest({ channel: 'feishu', webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/x', secret: 'SEC' }, 'T', 'B')
    const sign = createHmac('sha256', '1700000000\nSEC').update('').digest('base64')
    expect(r.body).toMatchObject({ msg_type: 'text', timestamp: '1700000000', sign, content: { text: 'T\nB' } })
  })

  it('treats errcode != 0 in a 200 response as a failure', async () => {
    const svc = new BotsService({} as never)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errcode: 93000, errmsg: 'invalid webhook url' }), { status: 200 }))
    const r = await svc.send({ channel: 'wechat_work', webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x' }, 'T', 'B')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('93000')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 }))
    expect((await svc.send({ channel: 'wechat_work', webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=x' }, 'T', 'B')).ok).toBe(true)
  })
})
