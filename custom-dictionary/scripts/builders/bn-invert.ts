import { BN_SEP } from '../../src/bn-types.ts'
import type { BengaliEntry } from '../../src/bn-types.ts'
import type { DictionaryDataset } from '../../src/types.ts'

function split(value: string): string[] {
  return value ? value.split(BN_SEP) : []
}

/** Derives Bengali-first entries from the English-first dataset. */
export function invertEnglishDataset(dataset: DictionaryDataset): BengaliEntry[] {
  const byBengali = new Map<string, BengaliEntry>()

  for (let i = 0; i < dataset.headwords.length; i++) {
    const headword = dataset.headwords[i] ?? ''
    if (!headword) continue
    const spellings = [dataset.bn[i] ?? '', ...split(dataset.bnAlt[i] ?? '')]
    const romans = [dataset.trans[i] ?? '', ...split(dataset.transAlt[i] ?? '')]

    spellings.forEach((spelling, j) => {
      const bengali = spelling.normalize('NFC').trim()
      if (!bengali) return
      let entry = byBengali.get(bengali)
      if (!entry) {
        entry = {
          bengali,
          roman: romans[j] ?? '',
          romanAlt: [],
          en: headword,
          enAlt: [],
          defBn: '',
          defEn: dataset.def[i] ?? '',
          pos: dataset.pos[i] ?? '',
          synEn: split(dataset.syn[i] ?? ''),
          antEn: split(dataset.ant[i] ?? ''),
          exBn: dataset.exBn?.[i] ?? '',
          exEn: dataset.ex[i] ?? '',
          pron: dataset.pron[i] ?? '',
          usage: '',
        }
        byBengali.set(bengali, entry)
        return
      }
      if (entry.en !== headword && !entry.enAlt.includes(headword)) {
        entry.enAlt.push(headword)
      }
      if (!entry.defEn && dataset.def[i]) entry.defEn = dataset.def[i]!
      if (!entry.exEn && dataset.ex[i]) entry.exEn = dataset.ex[i]!
      if (!entry.exBn && dataset.exBn?.[i]) entry.exBn = dataset.exBn[i]!
      if (!entry.pron && dataset.pron[i]) entry.pron = dataset.pron[i]!
      const roman = romans[j] ?? ''
      if (roman && roman !== entry.roman && !entry.romanAlt.includes(roman)) {
        entry.romanAlt.push(roman)
      }
      for (const syn of split(dataset.syn[i] ?? '')) {
        if (!entry.synEn.includes(syn)) entry.synEn.push(syn)
      }
      for (const ant of split(dataset.ant[i] ?? '')) {
        if (!entry.antEn.includes(ant)) entry.antEn.push(ant)
      }
    })
  }

  return [...byBengali.values()]
}
