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

  it('prefers a deeper remembered or typed password over an ancestor source password', () => {
    const writer = setup()
    writer.accept('/a/b', 'sub-stored', true)
    const fresh = setup()
    fresh.sync()
    // `/a/b` inherited `/a`'s configured password, but has its own deeper remembered one.
    expect(fresh.resolve('/a/b', 'parent-own', '/a')).toEqual({ password: 'sub-stored', rememberedAt: '/a/b' })
    // Same-depth `own` still beats a remembered password at the same path.
    expect(fresh.resolve('/a/b', 'exact-own', '/a/b')).toEqual({ password: 'exact-own' })
    // Typed password on `/a/b` beats `/a`'s configured password for descendants too.
    fresh.accept('/a/b', 'sub-typed', false)
    expect(fresh.resolve('/a/b/c.txt', 'parent-own', '/a')).toEqual({ password: 'sub-typed' })
    fresh.clearTyped()
    expect(fresh.resolve('/a/b/c.txt', 'parent-own', '/a')).toEqual({ password: 'sub-stored', rememberedAt: '/a/b' })
  })

  it('normalises trailing slashes consistently for typed, remembered and own paths', () => {
    const passwords = setup()
    passwords.accept('/secret/', 'pw1', true)
    expect(passwords.isRemembered('/secret/')).toBe(true)
    expect(passwords.isRemembered('/secret')).toBe(true)
    expect(passwords.resolve('/secret')).toEqual({ password: 'pw1' })

    const fresh = setup()
    fresh.sync()
    expect(fresh.isRemembered('/secret/')).toBe(true)
    expect(fresh.resolve('/secret/sub/', 'parent-own', '/secret/')).toEqual({ password: 'parent-own' })
    fresh.accept('/secret/sub/', 'sub-pw', true)
    const fresh2 = setup()
    fresh2.sync()
    expect(fresh2.resolve('/secret/sub/', 'parent-own', '/secret/')).toEqual({
      password: 'sub-pw',
      rememberedAt: '/secret/sub',
    })
    fresh2.forget('/secret/sub/')
    expect(fresh2.isRemembered('/secret/sub/')).toBe(false)
  })
})
