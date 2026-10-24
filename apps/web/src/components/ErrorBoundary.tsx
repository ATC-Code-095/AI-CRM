import React from 'react'
import { t } from '../i18n'

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('UI error boundary', error)
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        'div',
        {
          style: {
            padding: 24,
            maxWidth: 480,
            margin: '48px auto',
            textAlign: 'center',
            fontFamily: 'system-ui,sans-serif',
          },
        },
        React.createElement('h2', null, t('cmp.errorBoundary.somethingWentWrong')),
        React.createElement('p', { style: { color: '#646A73' } }, this.state.error.message),
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => window.location.reload(),
            style: {
              marginTop: 16,
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid #DEE0E3',
              background: '#2F6BFF',
              color: '#fff',
              cursor: 'pointer',
            },
          },
          t('cmp.errorBoundary.reload'),
        ),
      )
    }
    return this.props.children
  }
}
