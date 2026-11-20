import fs from 'node:fs'
import path from 'node:path'
import type { BengaliEntry } from '../../src/bn-types.ts'

/** A hand-written override; the Bengali key is the map key. */
export type BengaliOverride = Partial<Omit<BengaliEntry, 'bengali'>>

/** Reads curated.json and idioms.json, keyed by NFC-normalized Bengali. */
export function loadBengaliOverrides(dir: string): Map<string, BengaliOverride> {
  const map = new Map<string, BengaliOverride>()
  for (const file of ['curated.json', 'idioms.json']) {
    const filePath = path.join(dir, file)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing Bengali override file: ${filePath}`)
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, BengaliOverride>
    for (const [key, value] of Object.entries(raw)) {
      const normalized = key.normalize('NFC')
      map.set(normalized, { ...map.get(normalized), ...value })
    }
  }
  return map
}

/** Applies overrides; curated/idiom values win over derived values. */
export function applyBengaliOverrides(
  derived: BengaliEntry[],
  overrides: Map<string, BengaliOverride>,
): BengaliEntry[] {
  const byBengali = new Map(derived.map((e) => [e.bengali, { ...e }]))
  for (const [bengali, override] of overrides) {
    const base = byBengali.get(bengali) ?? {
      bengali,
      roman: '', romanAlt: [], en: '', enAlt: [], defBn: '', defEn: '', pos: '',
      synEn: [], antEn: [], exBn: '', exEn: '', pron: '', usage: '',
    }
    byBengali.set(bengali, { ...base, ...override, bengali })
  }
  return [...byBengali.values()]
}
