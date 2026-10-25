import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { ApiEnvelope } from '@zhixiao-crm/shared'
import { currentLocale, localizeSystemLabels } from '../locale'

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiEnvelope<T> | T> {
    const res = context.switchToHttp().getResponse<{ getHeader: (k: string) => unknown }>()
    // 在请求上下文内取语言，响应回调里不依赖异步上下文
    const locale = currentLocale()
    return next.handle().pipe(
      map((data: T | ApiEnvelope<T>) => {
        const ct = String(res.getHeader('Content-Type') ?? '')
        if (ct.includes('text/csv') || ct.includes('text/plain')) {
          return data as T
        }
        if (data && typeof data === 'object' && 'code' in data && 'data' in data) {
          return localizeSystemLabels(data as ApiEnvelope<T>, locale)
        }
        return { code: 0, message: 'ok', data: localizeSystemLabels((data ?? null) as T, locale) } as ApiEnvelope<T>
      }),
    )
  }
}
