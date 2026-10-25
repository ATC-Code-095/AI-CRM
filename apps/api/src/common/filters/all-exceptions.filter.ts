import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'
import { BizException, ErrorCodes, ApiErrorItem } from '@zhixiao-crm/shared'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()

    if (exception instanceof BizException) {
      return res.status(mapStatus(exception.code)).json({
        code: exception.code,
        message: exception.message,
        data: null,
        errors: exception.errors,
      })
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string }).message ?? exception.message)
      const errors = Array.isArray((body as { message?: unknown }).message)
        ? ((body as { message: string[] }).message.map((m) => ({ message: m })) as ApiErrorItem[])
        : undefined
      return res.status(status).json({
        code: statusToCode(status),
        message: Array.isArray(message) ? (message as string[]).join('; ') : message,
        data: null,
        errors,
      })
    }

    this.logger.error(exception)
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCodes.INTERNAL,
      message: 'Internal server error',
      data: null,
    })
  }
}

function mapStatus(code: number): number {
  if (code === ErrorCodes.VALIDATION_FAILED) return 400
  if (code === ErrorCodes.UNAUTHORIZED) return 401
  if (code === ErrorCodes.FORBIDDEN || code === ErrorCodes.DATA_FORBIDDEN) return 403
  if (code === ErrorCodes.NOT_FOUND) return 404
  if (code === ErrorCodes.CONFLICT) return 409
  if (code === ErrorCodes.UNPROCESSABLE) return 422
  if (code === ErrorCodes.RATE_LIMITED) return 429
  return 400
}

function statusToCode(status: number): number {
  const map: Record<number, number> = {
    400: ErrorCodes.VALIDATION_FAILED,
    401: ErrorCodes.UNAUTHORIZED,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.NOT_FOUND,
    409: ErrorCodes.CONFLICT,
    422: ErrorCodes.UNPROCESSABLE,
    429: ErrorCodes.RATE_LIMITED,
  }
  return map[status] ?? ErrorCodes.INTERNAL
}
