import { Button } from 'antd'
import { getAccessToken, apiUrl } from '../api/client'
import { t } from '../i18n'

/** 统一 CSV 导出按钮 */
export function ExportCsvButton({
  path,
  filename,
  label,
}: {
  path: string
  filename: string
  label?: string
}) {
  return (
    <Button
      onClick={() => {
        void fetch(apiUrl(`/api/v1${path}`), {
          headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
        })
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
          })
      }}
    >
      {label ?? t('common.exportCsv')}
    </Button>
  )
}
