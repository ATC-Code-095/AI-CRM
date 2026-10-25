import { Controller, Get, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Public } from '../../common/decorators'
import { tr } from '../../common/locale'

@Controller()
export class RootController {
  @Public()
  @Get()
  root(@Req() req: Request, @Res() res: Response) {
    const base = `${req.protocol}://${req.get('host')}`
    res.status(200).json({
      code: 0,
      message: 'ok',
      data: {
        name: 'ZhiXiao CRM API',
        version: 'v1',
        api: `${base}/api/v1`,
        health: `${base}/api/v1/health`,
        login: `POST ${base}/api/v1/auth/login`,
        web: tr('请打开 Web 前端（登录页）', 'Open the web front end (login page)'),
        docs: `${base}/api/v1/docs`,
      },
    })
  }

  @Public()
  @Get('api')
  apiIndex(@Req() req: Request, @Res() res: Response) {
    const base = `${req.protocol}://${req.get('host')}`
    res.status(200).json({
      code: 0,
      message: 'ok',
      data: {
        version: 'v1',
        health: `${base}/api/v1/health`,
        auth: ['POST /api/v1/auth/login', 'POST /api/v1/auth/refresh', 'GET /api/v1/auth/me'],
        users: ['GET /api/v1/users', 'POST /api/v1/users'],
      },
    })
  }
}
