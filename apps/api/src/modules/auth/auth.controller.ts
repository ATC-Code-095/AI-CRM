import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { AuthService } from './auth.service'
import { AuthUser, CurrentUser, Public } from '../../common/decorators'

class LoginDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(8)
  password!: string
}

class RefreshDto {
  @IsString()
  refreshToken!: string
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password)
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken)
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, user.tenantId)
  }
}
