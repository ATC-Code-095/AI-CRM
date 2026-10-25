import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware'
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware'
import { RequestLogMiddleware } from './common/middleware/request-log.middleware'
import { localeMiddleware } from './common/locale'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const security = new SecurityHeadersMiddleware()
  const rate = new RateLimitMiddleware()
  const reqLog = new RequestLogMiddleware()
  app.use(localeMiddleware)
  app.use(security.use.bind(security))
  app.use(rate.use.bind(rate))
  app.use(reqLog.use.bind(reqLog))
  app.setGlobalPrefix('api/v1', { exclude: ['', 'api'] })
  // 手机 App 的页面从本地加载：iOS 为 capacitor://localhost，Android 为 https://localhost（androidScheme）。
  // 鉴权用请求头里的 Bearer Token 而非 Cookie，固定放行这两个来源即可
  const MOBILE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost']
  app.enableCors({
    origin: [
      ...(process.env.CORS_ORIGIN ?? 'http://localhost:5174,http://127.0.0.1:5174').split(','),
      ...MOBILE_APP_ORIGINS,
    ],
    credentials: true,
  })
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  )
  app.useGlobalInterceptors(new TransformInterceptor())
  app.useGlobalFilters(new AllExceptionsFilter())

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZhiXiao CRM API')
    .setDescription('销售过程驱动一体化 CRM')
    .setVersion('v1')
    .addBearerAuth()
    .build()
  const doc = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('api/v1/docs', app, doc)

  const port = Number(process.env.PORT ?? 3001)
  await app.listen(port)
  console.log(`API listening on :${port}`)
  console.log(`Swagger: http://127.0.0.1:${port}/api/v1/docs`)
}

void bootstrap()
