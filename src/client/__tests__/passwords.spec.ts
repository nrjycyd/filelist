// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  findRememberedPassword,
  forgetFolderPassword,
  rememberedFolders,
  rememberFolderPassword,
} from '../passwords'
import { isWithin } from '../utils'

describe('remembered passwords', () => {
  beforeEach(() => sessionStorage.clear())

  it('matches the closest remembered folder at or above a path', () => {
    rememberFolderPassword('https://pan', '/a', 'pa')
    rememberFolderPassword('https://pan', '/a/b/', 'pb')
    expect(findRememberedPassword('https://pan', '/a/b/c')).toEqual({ path: '/a/b', password: 'pb' })
    expect(findRememberedPassword('https://pan', '/a/x')).toEqual({ path: '/a', password: 'pa' })
    expect(findRememberedPassword('https://pan', '/ab')).toBeNull()
    expect(findRememberedPassword('https://other', '/a')).toBeNull()
    expect(rememberedFolders('https://pan').sort()).toEqual(['/a', '/a/b'])
  })

  it('forgets and cleans up empty storage', () => {
    rememberFolderPassword('https://pan', '/a', 'pa')
    forgetFolderPassword('https://pan', '/a')
    expect(findRememberedPassword('https://pan', '/a')).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('treats paths on segment boundaries', () => {
    expect(isWithin('/a/b', '/a')).toBe(true)
    expect(isWithin('/ab', '/a')).toBe(false)
    expect(isWithin('/anything', '/')).toBe(true)
  })
})
