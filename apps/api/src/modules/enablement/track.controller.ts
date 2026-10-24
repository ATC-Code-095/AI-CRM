import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'

/** 1x1 透明 GIF */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

@ApiTags('track')
@Controller('track')
export class TrackController {
  constructor(private readonly prisma: PrismaService) {}

  /** 按发送记录 id 原子累加打开/点击计数（公开端点，id 不可枚举） */
  private async bumpSend(id: string, kind: 'open' | 'click', targetUrl?: string) {
    const now = new Date()
    if (kind === 'open') {
      await this.prisma.$transaction([
        this.prisma.emailSend.updateMany({ where: { id }, data: { openCount: { increment: 1 } } }),
        this.prisma.emailSend.updateMany({ where: { id, openedAt: null }, data: { openedAt: now } }),
        this.prisma.emailSend.updateMany({ where: { id, status: 'SENT' }, data: { status: 'OPENED' } }),
      ])
    } else {
      await this.prisma.$transaction([
        this.prisma.emailSend.updateMany({
          where: { id },
          data: { clickCount: { increment: 1 }, lastClickUrl: targetUrl ?? '', status: 'CLICKED' },
        }),
        this.prisma.emailSend.updateMany({ where: { id, clickedAt: null }, data: { clickedAt: now } }),
      ])
    }
  }

  /** 打开像素 */
  @Public()
  @Get('open/:id.gif')
  async openPixel(@Param('id') raw: string, @Res() res: { set: (h: Record<string, string>) => void; send: (b: Buffer) => void }) {
    const id = raw.replace(/\.gif$/, '')
    void this.bumpSend(id, 'open').catch(() => undefined)
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    })
    res.send(PIXEL)
  }

  /** 点击跳转 */
  @Public()
  @Get('click/:id')
  async click(@Param('id') id: string, @Query('u') u: string, @Res() res: { redirect: (url: string) => void }) {
    void this.bumpSend(id, 'click', u).catch(() => undefined)
    res.redirect(u && /^https?:\/\//i.test(u) ? u : '/')
  }
}
