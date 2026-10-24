import { Card, Empty, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

export default function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <Card>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t(titleKey)}
      </Typography.Title>
      <Empty description={t('common.empty')} />
    </Card>
  )
}
