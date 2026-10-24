import { tr } from '../../common/locale'

function colToIdx(letters: string): number {
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n
}


/** 解析 Word 文档流 → HTML，尽量保持原排版 */
function docxXmlToHtml(xml: string, esc: (s: string) => string): string {
  // 取 body 内容，按 w:p / w:tbl 顺序输出
  const bodyM = xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/)
  const body = bodyM ? bodyM[1] : xml

  const unesc = (t: string) =>
    t
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')

  /** 从 run/para XML 取富文本片段 */
  function runHtml(rXml: string): string {
    const rPr = (rXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]
    const texts = [...rXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => unesc(m[1])).join('')
    const hasBreak = /<w:br[\s/>]/.test(rXml)
    const hasTab = /<w:tab[\s/>]/.test(rXml)
    let out = esc(texts)
    if (hasTab) out = '&emsp;&emsp;' + out
    if (hasBreak) out += '<br/>'
    if (!texts && !hasBreak) return ''
    const bold = /<w:b[\s/>]|<w:b\/>/.test(rPr)
    const italic = /<w:i[\s/>]/.test(rPr)
    const underline = /<w:u[\s/>]/.test(rPr)
    const szM = rPr.match(/<w:sz w:val="(\d+)"/)
    const sz = szM ? Number(szM[1]) / 2 : 0
    const colorM = rPr.match(/<w:color w:val="([0-9A-Fa-f]{6})"/)
    const color = colorM && colorM[1] !== 'auto' ? colorM[1] : ''
    let style = ''
    if (sz) style += `font-size:${sz}pt;`
    if (color) style += `color:#${color};`
    let inner = out
    if (bold) inner = `<b>${inner}</b>`
    if (italic) inner = `<i>${inner}</i>`
    if (underline) inner = `<u>${inner}</u>`
    return style ? `<span style="${style}">${inner}</span>` : inner
  }

  /** 段落 → p / 标题 / 列表 */
  function paraHtml(pXml: string): string {
    const pPr = (pXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0]
    // 先取 hyperlink，再取其余 run，避免重复
    const linkParts = [...pXml.matchAll(/<w:hyperlink[\s\S]*?<\/w:hyperlink>/g)].map((m) =>
      [...m[0].matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)].map((x) => runHtml(x[0])).join(''),
    )
    const pWithoutLinks = pXml.replace(/<w:hyperlink[\s\S]*?<\/w:hyperlink>/g, '')
    const runs = [...pWithoutLinks.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)].map((m) => runHtml(m[0]))
    let inner = [...runs, ...linkParts].join('')
    if (!inner.trim()) {
      return '<p style="margin:2px 0">&nbsp;</p>'
    }
    const styleM = pPr.match(/<w:pStyle w:val="([^"]+)"/)
    const pStyle = styleM ? styleM[1] : ''
    const jcM = pPr.match(/<w:jc w:val="([^"]+)"/)
    const jc = jcM ? jcM[1] : ''
    const spacingM = pPr.match(/<w:spacing[^>]*w:before="(\d+)"/)
    const before = spacingM ? Number(spacingM[1]) / 20 : 0
    const alignMap: Record<string, string> = {
      center: 'center',
      right: 'right',
      both: 'justify',
      left: 'left',
    }
    // Word 样式 ID：1/21/31=heading1/2/3；a/a0/2/3=列表
    const headingLevel: Record<string, number> = {
      '1': 1,
      '21': 2,
      '31': 3,
      Heading1: 1,
      Heading2: 2,
      Heading3: 3,
    }
    const isList = pStyle === 'a' || pStyle === 'a0' || pStyle === '2' || pStyle === '3' || /List\s*(Number|Bullet)/i.test(pStyle)
    let tag = 'p'
    let extra = ''
    if (!isList && (pStyle in headingLevel || /^heading/i.test(pStyle) || pStyle === 'Title')) {
      const n = headingLevel[pStyle] ?? 2
      tag = `h${Math.max(1, Math.min(4, n))}`
    } else if (isList) {
      const bullet = pStyle === 'a0' || /Bullet/i.test(pStyle)
      inner = (bullet ? '&#8226; ' : '&#9656; ') + inner
      extra = 'margin:3px 0 3px 1.2em;'
    }
    let style = extra
    if (alignMap[jc]) style += `text-align:${alignMap[jc]};`
    if (before > 0) style += `margin-top:${Math.round(before)}pt;`
    if (tag.startsWith('h') && !alignMap[jc]) style += 'text-align:center;'
    return `<${tag}${style ? ` style="${style}"` : ''}>${inner}</${tag}>`
  }

  /** 表格 → table */
  function tableHtml(tXml: string): string {
    const rows = [...tXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((r) => r[0])
    const htmlRows = rows.map((rXml, ri) => {
      const cells = [...rXml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>|<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((c) => c[0])
      const tds = cells.map((cXml) => {
        const tcPr = (cXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0]
        const spanM = tcPr.match(/<w:gridSpan w:val="(\d+)"/)
        const span = spanM ? Number(spanM[1]) : 1
        const paras = [...cXml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((m) => paraHtml(m[0]))
        // 单元格内段落去外层 p，用 br 连接
        const inner = paras
          .map((x) => x.replace(/^<p[^>]*>/, '').replace(/<\/p>$/, '').replace(/^<h\d[^>]*>/, '').replace(/<\/h\d>$/, ''))
          .join('<br/>')
        const attr = span > 1 ? ` colspan="${span}"` : ''
        const isHeader = ri === 0
        const style = isHeader
          ? 'border:1px solid #94a3b8;padding:6px 8px;background:#f1f5f9;font-weight:700'
          : 'border:1px solid #94a3b8;padding:6px 8px;vertical-align:top'
        return `<td${attr} style="${style}">${inner || '&nbsp;'}</td>`
      })
      return `<tr>${tds.join('')}</tr>`
    })
    return `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:12px">${htmlRows.join('')}</table>`
  }

  // 按文档流切分段落与表格
  const parts: string[] = []
  const re = /<w:p[\s>][\s\S]*?<\/w:p>|<w:tbl>[\s\S]*?<\/w:tbl>|<w:tbl[\s>][\s\S]*?<\/w:tbl>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const chunk = m[0]
    if (chunk.startsWith('<w:tbl')) parts.push(tableHtml(chunk))
    else parts.push(paraHtml(chunk))
  }
  const html = parts.join('')
  return html || `<p>${tr('（空 Word 模板）', '(Empty Word template)')}</p>`
}

/** Word/Excel → 打印用 HTML（Node unzip+xml，不依赖 Python） */
export async function renderFileToHtml(abs: string, fileName: string, mime: string): Promise<string> {
  const { execFileSync } = await import('child_process')
  const lower = fileName.toLowerCase()
  const esc = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const unzipText = (entry: string): string => {
    try {
      return execFileSync('unzip', ['-p', abs, entry], {
        encoding: 'utf8',
        timeout: 8000,
        maxBuffer: 4 * 1024 * 1024,
      })
    } catch {
      return ''
    }
  }

  // CSV 纯文本
  if (lower.endsWith('.csv') || mime === 'text/csv') {
    const { readFileSync } = await import('fs')
    const raw = readFileSync(abs, 'utf8')
    const rows = raw
      .split(/\r?\n/)
      .filter((r) => r.trim())
      .slice(0, 200)
      .map((r) => `<tr>${r.split(',').map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%">${rows.join('')}</table>`
  }

  // DOCX：按文档流还原 Word 排版（标题/对齐/加粗/字号/列表/表格）
  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const xml = unzipText('word/document.xml')
    if (!xml) return `<p class="tpl-parse-fail">${tr('Word 解析失败：无法读取 document.xml', 'Could not parse the Word file: document.xml is unreadable')}</p>`
    return docxXmlToHtml(xml, esc)
  }

  // XLSX
  if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) {
    const shared = unzipText('xl/sharedStrings.xml')
    const strings = [...shared.matchAll(/<si[\s>][\s\S]*?<\/si>/g)].map((m) =>
      [...m[0].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join(''),
    )
    const sheet = unzipText('xl/worksheets/sheet1.xml') || unzipText('xl/worksheets/sheet.xml')
    if (!sheet) return `<p class="tpl-parse-fail">${tr('Excel 解析失败：无法读取工作表', 'Could not parse the Excel file: no readable sheet')}</p>`
    // 合并单元格 → colspan/rowspan
    const cover = new Set<string>()
    const span = new Map<string, { cs: number; rs: number }>()
    for (const m of sheet.matchAll(/<mergeCell[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) {
      const c1 = colToIdx(m[1])
      const r1 = Number(m[2])
      const c2 = colToIdx(m[3])
      const r2 = Number(m[4])
      span.set(`${r1},${c1}`, { cs: c2 - c1 + 1, rs: r2 - r1 + 1 })
      for (let rr = r1; rr <= r2; rr++)
        for (let cc = c1; cc <= c2; cc++) if (!(rr === r1 && cc === c1)) cover.add(`${rr},${cc}`)
    }
    const grid = new Map<string, string>()
    for (const rowXml of sheet.split(/<row[\s>]/).slice(1)) {
      const rowTag = rowXml.slice(0, rowXml.indexOf('>'))
      const rNum = Number((rowTag.match(/r="(\d+)"/) || [])[1] ?? 0)
      if (!rNum) continue
      for (const c of rowXml.split(/<c[\s>]/).slice(1)) {
        const ref = (c.match(/r="([A-Z]+)(\d+)"/) || [])[1]
        const col = ref ? colToIdx(ref) : 0
        const isS = /t="s"/.test(c)
        const isInline = /t="inlineStr"/.test(c)
        let txt = ''
        if (isInline) txt = [...c.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join('')
        else {
          const v = (c.match(/<v>([^<]*)<\/v>/) || [])[1] ?? ''
          txt = isS ? (strings[Number(v)] ?? v) : v
        }
        grid.set(`${rNum},${col}`, txt)
      }
    }
    const rowsIdx = [...grid.keys()].map((k) => Number(k.split(',')[0]))
    const colsIdx = [...grid.keys()].map((k) => Number(k.split(',')[1]))
    const rMax = Math.max(0, ...rowsIdx)
    const cMax = Math.max(0, ...colsIdx)
    const htmlRows: string[] = []
    for (let r = 1; r <= Math.min(rMax, 200); r++) {
      const tds: string[] = []
      for (let c = 1; c <= Math.min(cMax, 30); c++) {
        const key = `${r},${c}`
        if (cover.has(key)) continue
        const sp = span.get(key)
        const txt = esc(grid.get(key) ?? '')
        const attrs = sp ? ` colspan="${sp.cs}" rowspan="${sp.rs}"` : ''
        const isTitle = r === 1 && (sp?.cs ?? 1) >= 4
        const style = isTitle
          ? 'border:1px solid #333;padding:6px;text-align:center;font-size:18px;font-weight:700'
          : 'border:1px solid #333;padding:6px;vertical-align:top'
        tds.push(`<td${attrs} style="${style}">${txt}</td>`)
      }
      if (tds.length) htmlRows.push(`<tr>${tds.join('')}</tr>`)
    }
    if (!htmlRows.length) return `<p>${tr('（空 Excel 模板）', '(Empty Excel template)')}</p>`
    return `<table class="tpl-sheet" style="border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed">${htmlRows.join('')}</table>`
  }

  // 旧版 xls（OLE/BIFF）：按单元格还原表格排版；doc 仅抽文本
  try {
    const { readFileSync } = await import('fs')
    const buf = readFileSync(abs)
    const isDoc = lower.endsWith('.doc') && !lower.endsWith('.docx')
    if (isDoc) {
      const strings = extractOleStrings(buf)
      const body = strings
        .filter((x) => x.trim() && !/^(ThisWorkbook|Workbook|SummaryInformation|Root Entry|CompObj)/i.test(x))
        .slice(0, 80)
        .map((t) => `<p>${esc(t)}</p>`)
        .join('')
      return body || `<p class="tpl-parse-fail">${tr('旧版 .doc 无法解析，请另存为 .docx 后上传。', 'Legacy .doc files cannot be parsed. Save as .docx and upload again.')}</p>`
    }
    const grid = parseXlsGrid(buf)
    if (grid.length && grid.some((r) => r.some((c) => c && c.trim()))) {
      const maxCol = Math.max(...grid.map((r) => r.length))
      const rows = grid
        .slice(0, 200)
        .map((r) => {
          const cells: string[] = []
          for (let c = 0; c < maxCol; c++) cells.push(`<td>${esc(r[c] ?? '')}</td>`)
          return `<tr>${cells.join('')}</tr>`
        })
        .join('')
      return `<table class="tpl-sheet" border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:12px">${rows}</table>`
    }
    // 兜底：纯文本
    const strings = extractOleStrings(buf)
    const BAD = /^(IHDR|IDAT|IEND|pHYs|tEXt|ThisWorkbook|Workbook|Sheet\d*|Book\d*|Root Entry|CompObj|SummaryInformation|DocumentSummaryInformation|Microsoft|PNG)/i
    const clean = strings
      .map((x) => x.trim())
      .filter((x) => x.length >= 2 && x.length <= 500)
      .filter((x) => !BAD.test(x))
      .filter((x) => /[一-龥]|[A-Za-z]{3,}/.test(x))
    const seen = new Set<string>()
    const uniq = clean.filter((x) => (seen.has(x) ? false : (seen.add(x), true)))
    if (uniq.length >= 2) {
      return `<div class="tpl-parsed">${uniq.slice(0, 120).map((t) => `<p>${esc(t)}</p>`).join('')}</div>`
    }
    return tr(
      `<div class="tpl-parse-fail"><p>旧版 .xls/.doc 无法解析出表格正文。</p><p>建议：用 Excel/WPS 另存为 <b>.xlsx</b> 再上传，或在「编辑正文」里写入模板内容。</p></div>`,
      `<div class="tpl-parse-fail"><p>No table content could be read from this legacy .xls/.doc file.</p><p>Save it as <b>.xlsx</b> in Excel/WPS and upload again, or enter the template content under "Edit body".</p></div>`,
    )
  } catch {
    return `<p class="tpl-parse-fail">${tr('模板解析失败，请检查文件格式', 'Could not parse the template. Check the file format.')}</p>`
  }
}

/** 解析 OLE2 复合文档中的 Workbook/Book 流 */
function readOleWorkbookStream(buf: Buffer): Buffer | null {
  try {
    if (buf.length < 512) return null
    // OLE2 magic: D0 CF 11 E0 A1 B1 1A E1
    const isOle =
      buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0
    if (!isOle) return buf // 非 OLE，按裸 BIFF 扫
    const sectorSize = 1 << buf.readUInt16LE(0x1e)
    const miniSectorSize = 1 << buf.readUInt16LE(0x20)
    const numFat = buf.readUInt32LE(0x2c)
    const firstDir = buf.readUInt32LE(0x30)
    const miniCutoff = buf.readUInt32LE(0x38)
    const firstMiniFat = buf.readUInt32LE(0x3c)
    const firstDifat = buf.readUInt32LE(0x44)

    const sectorOff = (sec: number) => 512 + sec * sectorSize
    const readSector = (sec: number) => {
      const off = sectorOff(sec)
      if (off + sectorSize > buf.length) return Buffer.alloc(sectorSize)
      return buf.subarray(off, off + sectorSize)
    }

    // DIFAT
    const difat: number[] = []
    for (let i = 0; i < 109; i++) {
      const v = buf.readUInt32LE(0x4c + i * 4)
      if (v < 0xfffffffa) difat.push(v)
    }
    let difatSec = firstDifat
    let guard = 0
    while (difatSec < 0xfffffffa && guard++ < 64) {
      const sec = readSector(difatSec)
      const n = sectorSize / 4 - 1
      for (let i = 0; i < n; i++) {
        const v = sec.readUInt32LE(i * 4)
        if (v < 0xfffffffa) difat.push(v)
      }
      difatSec = sec.readUInt32LE(sectorSize - 4)
    }

    // FAT
    const fat: number[] = []
    for (const fs of difat.slice(0, numFat > 0 ? numFat : difat.length)) {
      const sec = readSector(fs)
      for (let i = 0; i < sectorSize / 4; i++) fat.push(sec.readUInt32LE(i * 4))
    }

    const readChain = (start: number, maxBytes = 8 * 1024 * 1024) => {
      const parts: Buffer[] = []
      let sec = start
      let total = 0
      let g = 0
      while (sec < 0xfffffffa && g++ < 100000 && total < maxBytes) {
        const chunk = readSector(sec)
        parts.push(Buffer.from(chunk))
        total += chunk.length
        sec = fat[sec] ?? 0xfffffffe
      }
      return Buffer.concat(parts)
    }

    // 目录
    const dir = readChain(firstDir, 1024 * 1024)
    let wbStart = -1
    let wbSize = 0
    let rootStart = 0
    for (let i = 0; i + 128 <= dir.length; i += 128) {
      const nameLen = dir.readUInt16LE(i + 0x40)
      if (nameLen < 2 || nameLen > 64) continue
      const name = dir.toString('utf16le', i, i + nameLen - 2)
      const start = dir.readUInt32LE(i + 0x74)
      const size = dir.readUInt32LE(i + 0x78)
      if (name === 'Workbook' || name === 'Book') {
        wbStart = start
        wbSize = size
      }
      if (name === 'Root Entry') rootStart = start
    }
    if (wbStart < 0) return null

    // mini stream
    if (wbSize < miniCutoff && rootStart < 0xfffffffa) {
      const miniFat = readChain(firstMiniFat, 256 * 1024)
      const miniStream = readChain(rootStart, 4 * 1024 * 1024)
      const parts: Buffer[] = []
      let sec = wbStart
      let g = 0
      while (sec < 0xfffffffa && g++ < 10000) {
        const off = sec * miniSectorSize
        parts.push(Buffer.from(miniStream.subarray(off, off + miniSectorSize)))
        sec = miniFat.readUInt32LE(sec * 4)
      }
      return Buffer.concat(parts).subarray(0, wbSize)
    }
    return readChain(wbStart).subarray(0, wbSize)
  } catch {
    return null
  }
}

/** 解码 BIFF RK 数值 */
function decodeRk(rkRaw: number): number {
  const rk = rkRaw | 0
  let v: number
  if (rk & 2) {
    v = rk >> 2
  } else {
    const b = Buffer.alloc(8)
    b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4)
    b.writeUInt32LE(0, 0)
    v = b.readDoubleLE(0)
  }
  return rk & 1 ? v / 100 : v
}

/** 解析 BIFF8 工作表为二维网格（保留行列位置，还 Excel 原排版） */
function parseXlsGrid(buf: Buffer): string[][] {
  let wb = readOleWorkbookStream(buf) ?? buf
  // 兜底：若流开头不是 BIFF BOF，尝试从首个 BOF(0x0809) 起扫
  if (wb.length > 8 && !(wb[0] === 0x09 && wb[1] === 0x08)) {
    for (let i = 0; i + 8 < wb.length; i++) {
      if (wb[i] === 0x09 && wb[i + 1] === 0x08) {
        const ln = wb.readUInt16LE(i + 2)
        if (ln === 8 || ln === 16) {
          wb = wb.subarray(i)
          break
        }
      }
    }
  }
  // 1) SST
  const sst: string[] = []
  try {
    let i = 0
    while (i + 8 < wb.length) {
      const type = wb.readUInt16LE(i)
      const len = wb.readUInt16LE(i + 2)
      if (type === 0x00fc && len >= 8) {
        let pos = i + 4
        const unique = wb.readUInt32LE(pos + 4)
        pos += 8
        if (unique > 0 && unique < 50000) {
          for (let n = 0; n < unique && pos + 3 < wb.length; n++) {
            const cch = wb.readUInt16LE(pos)
            pos += 2
            if (!cch || cch > 8192) break
            const flags = wb.readUInt8(pos)
            pos += 1
            const high = (flags & 1) !== 0
            let cRun = 0
            let cbExt = 0
            if (flags & 0x08) {
              if (pos + 2 > wb.length) break
              cRun = wb.readUInt16LE(pos)
              pos += 2
            }
            if (flags & 0x04) {
              if (pos + 4 > wb.length) break
              cbExt = wb.readUInt32LE(pos)
              pos += 4
            }
            const byteLen = high ? cch * 2 : cch
            if (pos + byteLen > wb.length) break
            const s = high
              ? wb.toString('utf16le', pos, pos + byteLen)
              : wb.toString('latin1', pos, pos + byteLen)
            pos += byteLen + cRun * 4 + cbExt
            sst.push(s)
          }
          break
        }
      }
      // 步进记录（len=0 也要越过 4 字节头）
      if (len < 0x8000 && i + 4 + len <= wb.length) i += 4 + len
      else i += 1
    }
  } catch {
    /* ignore */
  }

  // 2) 单元格
  const cells = new Map<string, string>()
  const put = (r: number, c: number, v: string) => {
    if (r < 0 || r > 500 || c < 0 || c > 80) return
    if (v !== '' && v != null) cells.set(`${r},${c}`, v)
  }
  try {
    let i = 0
    while (i + 4 <= wb.length) {
      const type = wb.readUInt16LE(i)
      const len = wb.readUInt16LE(i + 2)
      const data = wb.subarray(i + 4, i + 4 + len)
      if (i + 4 + len > wb.length) break

      if (type === 0x00fd && len >= 10) {
        // LABELSST
        const r = data.readUInt16LE(0)
        const c = data.readUInt16LE(2)
        const isst = data.readUInt32LE(6)
        put(r, c, sst[isst] ?? '')
      } else if (type === 0x0204 && len >= 8) {
        // LABEL
        const r = data.readUInt16LE(0)
        const c = data.readUInt16LE(2)
        const cch = data.readUInt16LE(6)
        const flags = data.readUInt8(8)
        const high = (flags & 1) !== 0
        const byteLen = high ? cch * 2 : cch
        const s = high
          ? data.toString('utf16le', 9, 9 + byteLen)
          : data.toString('latin1', 9, 9 + byteLen)
        put(r, c, s)
      } else if (type === 0x0203 && len >= 14) {
        // NUMBER
        const r = data.readUInt16LE(0)
        const c = data.readUInt16LE(2)
        put(r, c, String(data.readDoubleLE(6)))
      } else if (type === 0x027e && len >= 10) {
        // RK
        const r = data.readUInt16LE(0)
        const c = data.readUInt16LE(2)
        put(r, c, String(decodeRk(data.readUInt32LE(6))))
      } else if (type === 0x00bd && len >= 6) {
        // MULRK
        const r = data.readUInt16LE(0)
        const cFirst = data.readUInt16LE(2)
        const cLast = data.readUInt16LE(len - 2)
        let p = 4
        for (let col = cFirst; col <= cLast && p + 6 <= len - 2; col++) {
          const rk = data.readUInt32LE(p + 2)
          put(r, col, String(decodeRk(rk)))
          p += 6
        }
      } else if (type === 0x0201 && len >= 6) {
        // BLANK
        put(data.readUInt16LE(0), data.readUInt16LE(2), '')
      } else if (type === 0x0207 && len >= 3) {
        // STRING（公式字符串结果）：写到最近公式单元格——简化忽略
      }

      if (len < 0x8000 && i + 4 + len <= wb.length) i += 4 + len
      else i += 1
    }
  } catch {
    /* ignore */
  }

  if (!cells.size) return []
  const rowsIdx = [...cells.keys()].map((k) => Number(k.split(',')[0]))
  const colsIdx = [...cells.keys()].map((k) => Number(k.split(',')[1]))
  const rMin = Math.min(...rowsIdx)
  const rMax = Math.max(...rowsIdx)
  const cMin = Math.min(...colsIdx)
  const cMax = Math.max(...colsIdx)
  const grid: string[][] = []
  for (let r = rMin; r <= rMax; r++) {
    const row: string[] = []
    for (let c = cMin; c <= cMax; c++) row.push(cells.get(`${r},${c}`) ?? '')
    // trim trailing empty
    while (row.length && !row[row.length - 1]) row.pop()
    grid.push(row)
  }
  // trim leading empty rows
  while (grid.length && !grid[0].some((x) => x && x.trim())) grid.shift()
  return grid
}

/** 从 OLE/BIFF 抽取字符串（doc / 兜底） */
function extractOleStrings(buf: Buffer): string[] {
  const out: string[] = []
  try {
    const wb = readOleWorkbookStream(buf) ?? buf
    for (let i = 0; i + 8 < wb.length; i++) {
      if (wb[i] !== 0xfc || wb[i + 1] !== 0x00) continue
      const len = wb.readUInt16LE(i + 2)
      if (len < 8 || len > 0x8000) continue
      let pos = i + 4
      const end = Math.min(pos + len, wb.length)
      const unique = wb.readUInt32LE(pos + 4)
      pos += 8
      if (unique <= 0 || unique > 20000) continue
      for (let n = 0; n < unique && pos + 3 < end; n++) {
        const cch = wb.readUInt16LE(pos)
        pos += 2
        if (!cch || cch > 4096) break
        const flags = wb.readUInt8(pos)
        pos += 1
        const high = (flags & 0x01) !== 0
        let cRun = 0
        let cbExt = 0
        if (flags & 0x08) {
          if (pos + 2 > wb.length) break
          cRun = wb.readUInt16LE(pos)
          pos += 2
        }
        if (flags & 0x04) {
          if (pos + 4 > wb.length) break
          cbExt = wb.readUInt32LE(pos)
          pos += 4
        }
        const byteLen = high ? cch * 2 : cch
        if (pos + byteLen > wb.length) break
        const s = high
          ? wb.toString('utf16le', pos, pos + byteLen)
          : wb.toString('latin1', pos, pos + byteLen)
        pos += byteLen + cRun * 4 + cbExt
        if (s.trim()) out.push(s)
      }
      if (out.length) break
    }
  } catch {
    /* ignore */
  }
  if (out.length < 2) {
    const u16 = buf.toString('utf16le')
    const cnRuns = u16.match(/[一-龥][一-龥0-9A-Za-z，。；：、！？（）【】《》\s]{1,80}/g) || []
    out.push(...cnRuns.slice(0, 40))
    const ascii = buf.toString('latin1')
    const words = ascii.match(/[A-Za-z][A-Za-z0-9 _-]{3,40}/g) || []
    out.push(
      ...words
        .filter((w) => !/^(IHDR|IDAT|IEND|pHYs|ThisWorkbook|Workbook|Sheet|Microsoft|Root)/i.test(w))
        .slice(0, 20),
    )
  }
  return out
}
