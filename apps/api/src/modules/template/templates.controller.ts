import { Body, Controller, Get, Post } from '@nestjs/common'
import { IsOptional, IsString, MinLength } from 'class-validator'
import { ApiTags } from '@nestjs/swagger'
import type { ActivityTemplate } from '@prisma/client'
import { PERMISSIONS } from '@ai-crm/shared'
import { AuthUser, CurrentUser, Permissions } from '../../common/decorators'
import { PrismaService } from '../../common/prisma/prisma.service'
import { tr } from '../../common/locale'

class CreateTplDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsString()
  @MinLength(1)
  content!: string

  @IsOptional()
  @IsString()
  category?: string
}

/** 内置话术：按当前界面语言返回；占位符 {…} 保持中文键名，渲染时统一替换 */
const builtin = () => [
  {
    id: 'builtin-first-call',
    name: tr('首次电话开场', 'First call opener'),
    category: 'call',
    content: tr(
      '您好，我是{我司}，了解到贵司正在关注{产品}。想占用您3分钟，了解下目前在用的方案和主要痛点？',
      "Hello, this is {我司}. I understand you're looking at {产品}. Could I take 3 minutes to learn about your current solution and main pain points?",
    ),
    isBuiltin: true,
  },
  {
    id: 'builtin-followup',
    name: tr('跟进确认需求', 'Follow-up on requirements'),
    category: 'followup',
    content: tr(
      '上次沟通后我整理了针对贵司的要点：1) {痛点1} 2) {痛点2}。建议下一步：{下一步}。您看本周四下午方便演示吗？',
      'After our last call I summarized your key points: 1) {痛点1} 2) {痛点2}. Suggested next step: {下一步}. Would Thursday afternoon work for a demo?',
    ),
    isBuiltin: true,
  },
  {
    id: 'builtin-quote',
    name: tr('发送报价后跟进', 'Follow-up after sending a quote'),
    category: 'quote',
    content: tr(
      '报价单已发您邮箱，请查收。方案含{模块}，总价{金额}，有效期至{日期}。有任何条款需要调整请直接回复。',
      'The quote is in your inbox. It covers {模块}, total {金额}, valid until {日期}. Reply directly if any terms need changes.',
    ),
    isBuiltin: true,
  },
  {
    id: 'builtin-visit',
    name: tr('拜访结束纪要', 'Visit summary'),
    category: 'visit',
    content: tr(
      '今日拜访确认：1) 决策人 {姓名} 2) 预算区间 {区间} 3) 关键需求 {需求} 4) 下一步 {动作}，预计时间 {日期}。',
      'Confirmed in today\'s visit: 1) decision-maker {姓名} 2) budget range {区间} 3) key needs {需求} 4) next step {动作}, by {日期}.',
    ),
    isBuiltin: true,
  },
  {
    id: 'builtin-lost',
    name: tr('输单回访', 'Lost-deal follow-up'),
    category: 'lost',
    content: tr(
      '感谢贵司的时间。了解到本次因{原因}未合作。若后续有变化，随时联系我。也可先从{轻量方案}开始。',
      'Thank you for your time. I understand we did not move forward because of {原因}. If anything changes, feel free to reach out, or start with {轻量方案}.',
    ),
    isBuiltin: true,
  },
]

function toItem(t: ActivityTemplate) {
  return { id: t.id, name: t.name, content: t.content, category: t.category, isBuiltin: false }
}

/** 跟进话术模板：内置 + 租户自定义 */
@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Permissions(PERMISSIONS.ACTIVITY_READ)
  async list(@CurrentUser() me: AuthUser) {
    const rows = await this.prisma.activityTemplate.findMany({
      where: { tenantId: me.tenantId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
    return { items: [...builtin(), ...rows.map(toItem)] }
  }

  @Post()
  @Permissions(PERMISSIONS.ACTIVITY_WRITE)
  async create(@CurrentUser() me: AuthUser, @Body() dto: CreateTplDto) {
    const row = await this.prisma.activityTemplate.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        content: dto.content,
        category: dto.category ?? 'custom',
        createdById: me.id,
      },
    })
    return toItem(row)
  }
}
