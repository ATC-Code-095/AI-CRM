/** 业务错误码 — 与 docs/01-tech-stack.md §3.6 一致 */
export const ErrorCodes = {
  OK: 0,
  VALIDATION_FAILED: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  DATA_FORBIDDEN: 40301,
  NOT_FOUND: 40400,
  CONFLICT: 40900,
  UNPROCESSABLE: 42200,
  RATE_LIMITED: 42900,
  INTERNAL: 50000,
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export interface ApiErrorItem {
  field?: string
  message: string
}

export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
  errors?: ApiErrorItem[]
}

export interface PageResult<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

export class BizException extends Error {
  constructor(
    public readonly code: ErrorCode | number,
    message: string,
    public readonly errors?: ApiErrorItem[],
  ) {
    super(message)
    this.name = 'BizException'
  }
}
