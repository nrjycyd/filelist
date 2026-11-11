import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicSecrets, resetPublicSecretsWarning, warnPublicSecrets } from '../devWarnings'

describe('public token / password warning', () => {
  afterEach(() => {
    resetPublicSecretsWarning()
    vi.restoreAllMocks()
  })

  it('finds token and passwords, including per-source ones', () => {
    expect(publicSecrets({})).toEqual([])
    expect(publicSecrets({ token: 't' })).toEqual(['token'])
    expect(publicSecrets({ password: 'p' })).toEqual(['password'])
    expect(publicSecrets({ token: 't', sources: [{ path: '/a' }, { path: '/b', password: 'p' }] })).toEqual(['token', 'password'])
  })

  it('warns once per page load in development, in the page locale', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(warnPublicSecrets({ token: 't' }, 'en-US', true)).toBe(true)
    expect(warnPublicSecrets({ password: 'p' }, 'en-US', true)).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('sets token on <FileList>')
    expect(warn.mock.calls[0][0]).toContain('/guide/security')
  })

  it('stays silent in production and when nothing is public', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(warnPublicSecrets({ token: 't' }, 'zh-CN', false)).toBe(false)
    expect(warnPublicSecrets({ title: 'x' } as never, 'zh-CN', true)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })
})
