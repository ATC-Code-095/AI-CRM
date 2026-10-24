import { describe, expect, it } from 'vitest'
import { WebMobileBridge } from '../../packages/mobile-bridge/src'

describe('WebMobileBridge', () => {
  it('platform is web', async () => {
    const b = new WebMobileBridge()
    expect(b.getPlatform()).toBe('web')
    const ver = await b.getAppVersion()
    expect(ver.startsWith('web')).toBe(true)
  })

  it('has required methods', () => {
    const b = new WebMobileBridge() as unknown as Record<string, unknown>
    for (const m of [
      'getCurrentPosition',
      'reverseGeocode',
      'callPhone',
      'secureGet',
      'secureSet',
    ]) {
      expect(typeof b[m]).toBe('function')
    }
  })
})
