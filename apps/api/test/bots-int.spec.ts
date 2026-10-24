import { describe, expect, it } from 'vitest'
import request from 'supertest'

const BASE = process.env.API_URL || 'http://127.0.0.1:3001'
const PASS = process.env.PASS || 'Demo@12345'

async function auth(email: string) {
  const res = await request(BASE).post('/api/v1/auth/login').send({ email, password: PASS })
  expect(res.status).toBe(200)
  return { Authorization: `Bearer ${res.body.data.accessToken}` }
}

describe('group bot settings', () => {
  it('saves bots, masks secrets, keeps them on re-save and rejects non-official hosts', async () => {
    const admin = await auth('admin@demo.com')
    const before = (await request(BASE).get('/api/v1/notify/bots').set(admin).expect(200)).body.data.items
    try {
      const saved = await request(BASE)
        .put('/api/v1/notify/bots')
        .set(admin)
        .send({
          items: [
            {
              name: 'int-钉钉',
              channel: 'dingtalk',
              webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=int-test',
              secret: 'SECint',
              categories: ['APPROVAL'],
              enabled: false,
            },
          ],
        })
        .expect(200)
      const bot = saved.body.data.items[0]
      expect(bot.hasSecret).toBe(true)
      expect(bot.secret).toBeUndefined()

      // 不传 secret 再保存：沿用原密钥
      const again = await request(BASE)
        .put('/api/v1/notify/bots')
        .set(admin)
        .send({ items: [{ ...bot, hasSecret: undefined, name: 'int-钉钉-2' }] })
      expect(again.status).toBe(200)
      expect(again.body.data.items[0].hasSecret).toBe(true)

      const bad = await request(BASE)
        .put('/api/v1/notify/bots')
        .set(admin)
        .set('X-UI-Locale', 'en-US')
        .send({ items: [{ name: 'x', channel: 'wechat_work', webhookUrl: 'https://evil.example.com/hook', categories: [], enabled: true }] })
      expect(bad.status).toBe(400)
      expect(bad.body.message).toContain('official')

      // 销售没有系统设置权限
      const rep = await auth('rep@demo.com')
      expect((await request(BASE).put('/api/v1/notify/bots').set(rep).send({ items: [] })).status).toBe(403)
    } finally {
      await request(BASE).put('/api/v1/notify/bots').set(admin).send({ items: before.map((b: Record<string, unknown>) => ({ ...b, hasSecret: undefined })) })
    }
  })
})
