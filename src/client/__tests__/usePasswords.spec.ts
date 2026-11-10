// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { usePasswords } from '../usePasswords'

beforeEach(() => sessionStorage.clear())

function setup(enabled = true) {
  return usePasswords({ scope: () => 'https://pan', enabled: () => enabled, fallback: () => 'default' })
}

describe('usePasswords', () => {
  it('prefers typed-here, then own, then typed-above, then remembered, then the default', () => {
    const passwords = setup()
    expect(passwords.resolve('/a/b')).toEqual({ password: 'default' })
    passwords.accept('/a', 'stored', true)
    passwords.forget('/a')
    passwords.accept('/x', 'kept', true)
    expect(passwords.resolve('/x/y')).toEqual({ password: 'kept' })
    passwords.accept('/a', 'above', false)
    expect(passwords.resolve('/a/b')).toEqual({ password: 'above' })
    expect(passwords.resolve('/a/b', 'own')).toEqual({ password: 'own' })
    passwords.accept('/a/b', 'here', false)
    expect(passwords.resolve('/a/b', 'own')).toEqual({ password: 'here' })
  })

  it('reports where a remembered password came from and drops it when stale', () => {
    const passwords = setup()
    passwords.accept('/x', 'kept', true)
    // A fresh page: nothing typed yet, only the tab store.
    const fresh = setup()
    fresh.sync()
    expect(fresh.remembered.value.has('/x')).toBe(true)
    const resolved = fresh.resolve('/x/y')
    expect(resolved).toEqual({ password: 'kept', rememberedAt: '/x' })
    expect(fresh.dropStale(resolved.rememberedAt)).toBe(true)
    expect(fresh.remembered.value.size).toBe(0)
    expect(passwords.resolve('/x/y')).toEqual({ password: 'kept' })
  })

  it('never stores or reads the tab store when disabled', () => {
    const passwords = setup(false)
    passwords.accept('/x', 'pw', true)
    expect(sessionStorage.length).toBe(0)
    expect(setup(false).resolve('/x')).toEqual({ password: 'default' })
  })
})
