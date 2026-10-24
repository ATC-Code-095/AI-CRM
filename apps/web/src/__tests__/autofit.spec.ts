import { describe, expect, it } from 'vitest'
import { cellToText, computeFitWidths, type FitColumn } from '../utils/autoFit'

/** 等宽假字体：每字符 8px，粗体 ×1.1 */
const measure = (t: string, bold = false) => t.length * 8 * (bold ? 1.1 : 1)

const col = (title: string, samples: string[], extra: Partial<FitColumn> = {}): FitColumn => ({
  key: title,
  title,
  samples,
  ...extra,
})

describe('computeFitWidths 报表列宽自适应', () => {
  it('内容较窄时把富余宽度摊给各列，且刚好铺满容器', () => {
    const cols = [col('阶段', ['初步接洽']), col('数量', ['94']), col('金额', ['1169601.00'])]
    const r = computeFitWidths(cols, { containerWidth: 900, measure })
    expect(r.overflow).toBe(false)
    expect(r.totalWidth).toBe(900)
    // 每列都不小于全局最小列宽
    for (const w of r.widths) expect(w).toBeGreaterThanOrEqual(72)
    // 摊薄后各列宽度差距不应过大（不会出现一列吃掉全部空白）
    const max = Math.max(...r.widths)
    const min = Math.min(...r.widths)
    expect(max - min).toBeLessThanOrEqual(160)
  })

  it('尊重列定义里的 width 作为下限，不把文字压到换行', () => {
    const cols = [col('评分', ['95 · A'], { providedWidth: 120 }), col('备注', ['这是一段很长的备注文字内容'])]
    const r = computeFitWidths(cols, { containerWidth: 400, measure })
    expect(r.widths[0]).toBeGreaterThanOrEqual(120)
    // 长文本列宽度必须容纳内容（16 个汉字 = 128px + padding）
    expect(r.widths[1]).toBeGreaterThanOrEqual(128)
  })

  it('内容总宽超过容器时开启横向滚动，不做压缩', () => {
    const cols = [
      col('客户名称', ['超长客户名称一二三四五六七八九十']),
      col('地址', ['广东省深圳市南山区科技园南区某大厦 18 楼 1801 室']),
      col('备注', ['备注内容同样非常非常长需要占位']),
    ]
    const r = computeFitWidths(cols, { containerWidth: 300, measure })
    expect(r.overflow).toBe(true)
    expect(r.totalWidth).toBeGreaterThan(300)
    expect(r.widths.every((w) => w > 0)).toBe(true)
  })

  it('容器宽度未知（0）时退回自然宽度，列宽不得为 0', () => {
    const cols = [col('A', ['1']), col('B', ['2'])]
    const r = computeFitWidths(cols, { containerWidth: 0, measure })
    expect(r.overflow).toBe(false)
    for (const w of r.widths) expect(w).toBeGreaterThan(0)
  })

  it('maxWidth 生效：极长内容不会把单列撑到失控', () => {
    const cols = [col('描述', ['x'.repeat(200)]), col('数量', ['1'])]
    const r = computeFitWidths(cols, { containerWidth: 1200, measure, maxWidth: 300 })
    expect(r.widths[0]).toBeLessThanOrEqual(300)
  })
})

describe('cellToText', () => {
  it('只把可测量的原始值转成文本', () => {
    expect(cellToText('abc')).toBe('abc')
    expect(cellToText(12.5)).toBe('12.5')
    expect(cellToText(null)).toBe('')
    expect(cellToText({ name: 'x' })).toBe('')
  })
})
