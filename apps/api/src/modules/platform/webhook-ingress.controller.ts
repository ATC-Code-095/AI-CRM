import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common'
import { IsOptional, IsString } from 'class-validator'
import { Public } from '../../common/decorators'
import { verifyWebhookSignature } from '../../common/webhook-sign'
import { BizException, ErrorCodes } from '@zhixiao-crm/shared'

class IngressDto {
  @IsOptional()
  @IsString()
  note?: string

  @IsOptional()
  payload?: unknown
}

/** 外部系统回调入口：POST /webhooks/ingress/:secret */
@Controller('webhooks')
export class WebhookIngressController {
  @Public()
  @Post('ingress/:secret')
  @HttpCode(200)
  ingress(
    @Param('secret') secret: string,
    @Req() req: {
      headers: Record<string, string | undefined>
      body: unknown
      rawBody?: string
    },
    @Body() dto: IngressDto,
  ) {
    const raw = req.rawBody ?? JSON.stringify(req.body ?? {})
    const sig = req.headers['x-zhixiao-crm-signature']
    if (sig) {
      const ok = verifyWebhookSignature(secret, raw, sig)
      if (!ok) {
        throw new BizException(ErrorCodes.UNAUTHORIZED, 'bad signature')
      }
    }
    return { ok: true, received: true, note: dto.note ?? null }
  }
}
