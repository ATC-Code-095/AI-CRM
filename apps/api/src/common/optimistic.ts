import { BizException, ErrorCodes } from '@ai-crm/shared'

/** 乐观锁：更新时携带 version，不匹配则 40900 */
export function assertVersion(expected: number | undefined, current: number) {
  if (expected === undefined) return
  if (Number(expected) !== Number(current)) {
    throw new BizException(ErrorCodes.CONFLICT, 'version conflict', [
      { field: 'version', message: `current=${current}` },
    ])
  }
}
