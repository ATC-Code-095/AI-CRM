import { describe, expect, it } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { formatMoney } from '@ai-crm/shared'

function Money({ value, locale }: { value: string; locale: string }) {
  return React.createElement('span', null, formatMoney(value, locale, 'CNY'))
}

describe('RTL Money', () => {
  it('renders formatted currency', () => {
    render(React.createElement(Money, { value: '1234.50', locale: 'zh-CN' }))
    expect(screen.getByText(/1,234\.50/)).toBeTruthy()
  })
})
