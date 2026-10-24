/** 线索状态 */
export enum LeadStatus {
  NEW = 'NEW',
  ACCEPTED = 'ACCEPTED',
  CULTIVATING = 'CULTIVATING',
  CONVERTED = 'CONVERTED',
  CLOSED_LOST = 'CLOSED_LOST',
}

/** 线索来源 */
export enum LeadSource {
  WEB_FORM = 'WEB_FORM',
  PHONE = 'PHONE',
  REFERRAL = 'REFERRAL',
  EXHIBITION = 'EXHIBITION',
  COLD_CALL = 'COLD_CALL',
  ADS = 'ADS',
  PARTNER = 'PARTNER',
  OTHER = 'OTHER',
}

export enum AccountLevel {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export enum AccountStage {
  POTENTIAL = 'POTENTIAL',
  ACTIVE = 'ACTIVE',
  AT_RISK = 'AT_RISK',
  CHURNED = 'CHURNED',
}

export enum AccountScale {
  MICRO = 'MICRO',
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  ENTERPRISE = 'ENTERPRISE',
}

export enum ContactDecisionRole {
  ECONOMIC = 'ECONOMIC',
  USER = 'USER',
  TECH = 'TECH',
  CHAMPION = 'CHAMPION',
  OTHER = 'OTHER',
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum ContractStatus {
  DRAFT = 'DRAFT',
  APPROVING = 'APPROVING',
  EFFECTIVE = 'EFFECTIVE',
  FINISHED = 'FINISHED',
  TERMINATED = 'TERMINATED',
  REJECTED = 'REJECTED',
}

export enum PaymentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  RECONCILED = 'RECONCILED',
  REJECTED = 'REJECTED',
}

export enum PaymentPlanStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  BANK = 'BANK',
  CHECK = 'CHECK',
  ALIPAY = 'ALIPAY',
  WECHAT = 'WECHAT',
  OTHER = 'OTHER',
}

export enum TicketStatus {
  NEW = 'NEW',
  PROCESSING = 'PROCESSING',
  WAITING_CUSTOMER = 'WAITING_CUSTOMER',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketType {
  ISSUE = 'ISSUE',
  QUESTION = 'QUESTION',
  REQUEST = 'REQUEST',
  BUG = 'BUG',
}

export enum TicketSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum ActivityType {
  TASK = 'TASK',
  VISIT = 'VISIT',
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  NOTE = 'NOTE',
}

export enum ActivityStatus {
  PLANNED = 'PLANNED',
  DONE = 'DONE',
  CANCELED = 'CANCELED',
}

export enum ActivitySource {
  MANUAL = 'MANUAL',
  AI = 'AI',
  API = 'API',
  /** 跟进计划（Cadence）自动生成 */
  CADENCE = 'CADENCE',
}

export enum DataScope {
  SELF = 'SELF',
  TEAM = 'TEAM',
  DEPARTMENT = 'DEPARTMENT',
  ALL = 'ALL',
  CUSTOM = 'CUSTOM',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ApprovalEntityType {
  QUOTE = 'QUOTE',
  CONTRACT = 'CONTRACT',
  PAYMENT = 'PAYMENT',
}

export enum CampaignStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  FINISHED = 'FINISHED',
}

export enum GoalMetric {
  REVENUE = 'REVENUE',
  NEW_OPP = 'NEW_OPP',
  WON_AMOUNT = 'WON_AMOUNT',
}

export enum PeriodType {
  MONTH = 'MONTH',
  QUARTER = 'QUARTER',
  YEAR = 'YEAR',
}

export enum ShareRole {
  COLLABORATOR = 'COLLABORATOR',
  VIEWER = 'VIEWER',
}

export enum EntityType {
  LEAD = 'LEAD',
  ACCOUNT = 'ACCOUNT',
  CONTACT = 'CONTACT',
  OPPORTUNITY = 'OPPORTUNITY',
  TICKET = 'TICKET',
  QUOTE = 'QUOTE',
  CONTRACT = 'CONTRACT',
  PAYMENT = 'PAYMENT',
}

/** 默认管道阶段 code */
export enum StdStageCode {
  PROSPECTING = 'PROSPECTING',
  DISCOVERY = 'DISCOVERY',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  WON = 'WON',
  LOST = 'LOST',
}

export enum LocaleCode {
  ZH_CN = 'zh-CN',
  EN_US = 'en-US',
  ZH_TW = 'zh-TW',
  JA_JP = 'ja-JP',
}

export const SUPPORTED_LOCALES = [LocaleCode.ZH_CN, LocaleCode.EN_US] as const
export const DEFAULT_LOCALE = LocaleCode.ZH_CN
export const DEFAULT_TIMEZONE = 'Asia/Shanghai'
