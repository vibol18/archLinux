import { describe, expect, it } from 'vitest'
import { packageCatalog } from './catalog'

describe('simulated Arch package catalog', () => {
  it('contains at least 300 distinct package records', () => {
    expect(packageCatalog.length).toBeGreaterThanOrEqual(300)
    expect(new Set(packageCatalog.map(pkg => pkg.name)).size).toBe(packageCatalog.length)
  })
})