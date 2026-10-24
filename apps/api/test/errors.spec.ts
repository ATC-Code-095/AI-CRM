import { describe, expect, it } from 'vitest'
import { ErrorCodes, BizException } from '../../packages/shared/src/errors'

describe('error envelope contract', () => {
  it('codes are stable', () => {
    expect(ErrorCodes.VALIDATION_FAILED).toBe(40000)
    expect(ErrorCodes.DATA_FORBIDDEN).toBe(40301)
    expect(ErrorCodes.CONFLICT).toBe(40900)
  })
  it('BizException carries code and fields', () => {
    const e = new BizException(ErrorCodes.UNPROCESSABLE, 'x', [{ field: 'a', message: 'm' }])
    expect(e.code).toBe(42200)
    expect(e.errors?.[0].field).toBe('a')
  })
})
