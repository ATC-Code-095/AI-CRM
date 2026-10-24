import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp } from 'antd'
import { i18n } from '../i18n'
import LoginPage from '../pages/LoginPage'

describe('LoginPage RTL', () => {
  it('renders login fields', async () => {
    const qc = new QueryClient()
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/login'] },
        React.createElement(
          I18nextProvider,
          { i18n },
          React.createElement(
            QueryClientProvider,
            { client: qc },
            React.createElement(
              AntApp,
              null,
              React.createElement(LoginPage),
            ),
          ),
        ),
      ),
    )
    expect(await screen.findByPlaceholderText(/admin@demo.com/i)).toBeTruthy()
    expect(screen.getByPlaceholderText(/Demo@12345/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /确认|Confirm/i })).toBeTruthy()
    vi.restoreAllMocks()
  })
})
