import { BN_DATASET_VERSION, BN_SEP } from '../../src/bn-types.ts'
import type { BengaliDataset, BengaliEntry } from '../../src/bn-types.ts'

/** All columns in the Bengali dataset, in declaration order. */
export const BN_COLUMNS = [
  'headwords', 'roman', 'romanAlt', 'en', 'enAlt', 'defBn', 'defEn', 'pos',
  'synEn', 'antEn', 'exBn', 'exEn', 'pron', 'usage',
] as const

/** Serializes entries to a sorted columnar dataset. */
export function serializeBengaliDataset(entries: BengaliEntry[]): BengaliDataset {
  const sorted = [...entries].sort((a, b) => a.bengali.localeCompare(b.bengali))
  return {
    v: BN_DATASET_VERSION,
    headwords: sorted.map((e) => e.bengali),
    roman: sorted.map((e) => e.roman),
    romanAlt: sorted.map((e) => e.romanAlt.join(BN_SEP)),
    en: sorted.map((e) => e.en),
    enAlt: sorted.map((e) => e.enAlt.join(BN_SEP)),
    defBn: sorted.map((e) => e.defBn),
    defEn: sorted.map((e) => e.defEn),
    pos: sorted.map((e) => e.pos),
    synEn: sorted.map((e) => e.synEn.join(BN_SEP)),
    antEn: sorted.map((e) => e.antEn.join(BN_SEP)),
    exBn: sorted.map((e) => e.exBn),
    exEn: sorted.map((e) => e.exEn),
    pron: sorted.map((e) => e.pron),
    usage: sorted.map((e) => e.usage),
  }
}

/** Expands a SEP-joined column value. */
function split(value: string): string[] {
  return value ? value.split(BN_SEP) : []
}

/** Deserializes a validated columnar dataset back into entries. */
export function deserializeBengaliDataset(dataset: BengaliDataset): BengaliEntry[] {
  assertBengaliDataset(dataset)
  return dataset.headwords.map((bengali, i) => ({
    bengali,
    roman: dataset.roman[i] ?? '',
    romanAlt: split(dataset.romanAlt[i] ?? ''),
    en: dataset.en[i] ?? '',
    enAlt: split(dataset.enAlt[i] ?? ''),
    defBn: dataset.defBn[i] ?? '',
    defEn: dataset.defEn[i] ?? '',
    pos: dataset.pos[i] ?? '',
    synEn: split(dataset.synEn[i] ?? ''),
    antEn: split(dataset.antEn[i] ?? ''),
    exBn: dataset.exBn[i] ?? '',
    exEn: dataset.exEn[i] ?? '',
    pron: dataset.pron[i] ?? '',
    usage: dataset.usage[i] ?? '',
  }))
}

/** Throws a descriptive error on a version mismatch or malformed column. */
export function assertBengaliDataset(dataset: unknown): asserts dataset is BengaliDataset {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('Bengali dataset is not an object')
  }
  const d = dataset as Record<string, unknown>
  if (d['v'] !== BN_DATASET_VERSION) {
    throw new Error(`Bengali dataset version ${String(d['v'])} !== ${BN_DATASET_VERSION}`)
  }
  const headwords = d['headwords']
  if (!Array.isArray(headwords)) throw new Error('Bengali dataset has no headwords column')
  for (const column of BN_COLUMNS) {
    const arr = d[column]
    if (!Array.isArray(arr) || arr.length !== headwords.length) {
      throw new Error(`Bengali dataset column "${column}" has the wrong length`)
    }
  }
}
