import {
  Controller,
  Get,
  NotFoundException,
  PayloadTooLargeException,
  Param,
  Post,
  Res,
  UploadedFile,
  Body,
  UseInterceptors,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { PERMISSIONS } from '@zhixiao-crm/shared'
import { AuthUser, CurrentUser, Permissions, Public } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { renderFileToHtml } from './render-doc'
import { settingText, tenantSetting } from '../../common/tenant-setting'

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  // Word / Excel 模板上传
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
])

class UploadMetaDto {
  @IsString()
  @MinLength(1)
  entityType!: string

  @IsString()
  @MinLength(1)
  entityId!: string

  @IsOptional()
  @IsString()
  fileName?: string
}

@ApiTags('file')
@Controller('files')
export class FilesController {
  private readonly root = process.env.FILE_STORAGE_DIR ?? './storage'

  constructor(private readonly prisma: PrismaService) {
    mkdirSync(this.root, { recursive: true })
  }

  @Post()
  @Permissions(PERMISSIONS.FILE_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() me: AuthUser,
    @UploadedFile() file: { originalname?: string; mimetype: string; size: number; buffer: Buffer },
    @Body() meta: UploadMetaDto,
  ) {
    if (!file) throw new NotFoundException('file required')
    if (!ALLOWED.has(file.mimetype)) {
      throw new NotFoundException('unsupported mime')
    }
    // 业务参数 file.max_size_mb（默认 10，上限 100）
    const maxMb = Math.min(100, Number(settingText(await tenantSetting(this.prisma, me.tenantId, 'file.max_size_mb'))) || 10)
    if (file.size > maxMb * 1024 * 1024) {
      throw new PayloadTooLargeException(`file too large (max ${maxMb} MB)`)
    }
    const id = randomUUID()
    const dir = join(this.root, me.tenantId)
    mkdirSync(dir, { recursive: true })
    const storageKey = join(me.tenantId, `${id}.bin`)
    writeFileSync(join(this.root, storageKey), file.buffer)

    return this.prisma.attachment.create({
      data: {
        tenantId: me.tenantId,
        entityType: meta.entityType,
        entityId: meta.entityId,
        fileName: meta.fileName ?? file.originalname ?? 'file',
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
        createdById: me.id,
      },
    })
  }

  @Get('entity/:entityType/:entityId')
  @Permissions(PERMISSIONS.FILE_DOWNLOAD)
  async listByEntity(
    @CurrentUser() me: AuthUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.prisma.attachment.findMany({
      where: { tenantId: me.tenantId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
  }

  @Get(':id')
  @Permissions(PERMISSIONS.FILE_DOWNLOAD)
  async download(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const att = await this.prisma.attachment.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!att) throw new NotFoundException('not found')
    const abs = join(this.root, att.storageKey)
    if (!existsSync(abs)) throw new NotFoundException('file missing')
    res.setHeader('Content-Type', att.mimeType)
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
    )
    res.send(readFileSync(abs))
  }

  /** 解析 Word/Excel 模板为可打印 HTML（按模板排版打印） */
  @Get(':id/render-html')
  @Permissions(PERMISSIONS.FILE_DOWNLOAD)
  async renderHtml(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    const att = await this.prisma.attachment.findFirst({
      where: { id, tenantId: me.tenantId, deletedAt: null },
    })
    if (!att) throw new NotFoundException('not found')
    const abs = join(this.root, att.storageKey)
    if (!existsSync(abs)) throw new NotFoundException('file missing')
    const html = await renderFileToHtml(abs, att.fileName, att.mimeType)
    const lowQuality =
      html.includes('tpl-parse-fail') || html.includes('解析失败') || html.includes('无法可靠解析')
    return { fileName: att.fileName, html, lowQuality }
  }
}

void Public
