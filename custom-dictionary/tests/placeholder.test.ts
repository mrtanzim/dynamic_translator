import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/index.ts'

describe('custom-dictionary placeholder', () => {
  it('project is configured and tests run', () => {
    expect(true).toBe(true)
  })

  it('VERSION is exported as a string', () => {
    expect(typeof VERSION).toBe('string')
    expect(VERSION).toBe('0.1.0')
  })
})
