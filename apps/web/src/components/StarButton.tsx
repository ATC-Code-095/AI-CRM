import { Button, Tooltip } from 'antd'
import { StarFilled, StarOutlined } from '@ant-design/icons'
import { useStars, type StarItem } from '../hooks/useUserPref'
import { t } from '../i18n'

/**
 * 关注 / 星标（对标 Salesforce Follow、HubSpot 收藏）
 * 数据存服务端用户偏好，换设备仍在；工作台「我的关注」汇总展示。
 */
export function StarButton({
  type,
  id,
  name,
  size = 'small',
  withText = false,
}: {
  type: StarItem['type']
  id: string
  name: string
  size?: 'small' | 'middle'
  withText?: boolean
}) {
  const { has, toggle, saving } = useStars()
  const on = has(id)
  return (
    <Tooltip title={on ? t('cmp.starButton.unfollow') : t('cmp.starButton.followSeeMyFavorites')}>
      <Button
        size={size}
        type={withText ? 'default' : 'text'}
        loading={saving}
        icon={on ? <StarFilled style={{ color: 'var(--crm-warn)' }} /> : <StarOutlined />}
        onClick={() => toggle({ type, id, name })}
      >
        {withText ? (on ? t('cmp.starButton.following') : t('cmp.starButton.follow')) : null}
      </Button>
    </Tooltip>
  )
}

export default StarButton
