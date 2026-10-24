import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { PasswordController } from './password.controller'
import { JwtModule } from '@nestjs/jwt'

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-change-me',
    }),
  ],
  controllers: [AuthController, PasswordController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
