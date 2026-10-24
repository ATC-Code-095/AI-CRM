import { describe, expect, it } from 'vitest'
import { parseCsv } from '../src/modules/import/import.service'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    const rows = parseCsv('a,b\n1,2\n3,4')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('handles quotes and commas', () => {
    const rows = parseCsv('name,remark\n"甲,公司","说""好"""')
    expect(rows[1]).toEqual(['甲,公司', '说"好"'])
  })

  it('skips empty lines', () => {
    const rows = parseCsv('a\n\n1\n')
    expect(rows.length).toBe(2)
  })
})
