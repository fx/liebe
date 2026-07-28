import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { confirmOptionsConfigSchema } from '../confirmOption'

/**
 * No two card families may declare the same key in the item config schema.
 *
 * `configSchema.ts` merges one fragment per card family into a single
 * `item.config` shape, and `zod.merge()` is **last-one-wins**: a key declared by
 * two families is silently governed by whichever merges last. That is a defect
 * with no symptoms at the point it is introduced — no merge conflict, no failing
 * test, and no diff in the file whose behaviour changed — which is exactly why
 * it needs a guard rather than review attention.
 *
 * It has already shipped once. `stateLabels` is an object in `switchOptions.ts`
 * and a string enum in `coverOptions.ts`; cover merges last, so a switch card
 * carrying its own documented `stateLabels: { onLabel, offLabel }` is rejected
 * outright by the import gate (issue #254). `confirmOption.ts` exists because
 * `confirm` was about to become the second.
 *
 * The guard runs now rather than later because changes 0023–0026 add four more
 * card families to this same flat namespace; it is worth most in the window
 * before they land.
 *
 * **What counts as a collision.** Two per-family fragments declaring one key
 * with DIFFERENT schemas. Where both declare it identically the merge is a
 * no-op and nothing is silently governed — `deviceClassIcon` (switch/cover) and
 * `showPresets` (climate/fan) are in that position today, and are left passing
 * deliberately. They are one type change away from being #254, and that change
 * is the moment this test fires.
 */

/**
 * Indirected through a parameter, as `theme/__tests__/tokens.test.ts` does and
 * for the same reason: Vite rewrites a LITERAL `new URL('./x', import.meta.url)`
 * into an asset reference, which is no longer a `file:` URL and cannot be read
 * from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/**
 * The store modules, as loaders. `import.meta.glob` rather than a dynamic
 * `import()` of a computed path: Vite cannot analyse the latter, and rather
 * than a hand-kept list of families — the thing this guard exists to not
 * depend on — the glob resolves whatever `configSchema.ts` names.
 */
const storeModules = import.meta.glob<Record<string, z.AnyZodObject>>('../*.ts')

/**
 * The fragments that are shared ON PURPOSE, and therefore not participants.
 *
 * The universal fragments carry the option surface every card gets
 * (docs/specs/entity-cards/options/common.md — "Universal options"), and
 * `confirmOption` is one object two families point at rather than two
 * declarations. Flagging either would make the guard wrong, and a guard that is
 * wrong is a guard someone switches off.
 */
const UNIVERSAL_FRAGMENTS = new Set(['cardActionsConfigSchema', 'cardDisplayConfigSchema'])

/** Keys the shared `confirm` fragment contributes wherever it is merged. */
const SHARED_KEYS = new Set(Object.keys(confirmOptionsConfigSchema.shape))

/**
 * Collisions that exist and are tracked elsewhere.
 *
 * `stateLabels` is live today and fixing it means renaming a documented option
 * in one of two shipped families, which needs its own change — so it is skipped
 * here with a pointer rather than left to keep this file red. Nothing else may
 * join this list without the same treatment.
 */
const KNOWN_COLLISIONS = new Map([['stateLabels', 'tracked by issue #254']])

/**
 * The fragments merged into `item.config`, in merge order, read from the source
 * rather than from a list kept beside it — a hand-maintained list would go stale
 * exactly when a new family is added, which is the case this guard exists for.
 */
function readMergedFragments(): { name: string; module: string }[] {
  const source = read('../configSchema.ts')

  const chain = /config: (\w+)((?:\s*\.merge\(\w+\))+)/.exec(source)
  if (!chain) throw new Error('configSchema.ts: could not find the `config:` merge chain')

  const names = [chain[1], ...[...chain[2].matchAll(/\.merge\((\w+)\)/g)].map((m) => m[1])]

  return names.map((name) => {
    const imported = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./(\\w+)'`).exec(
      source
    )
    if (!imported) throw new Error(`configSchema.ts: no import found for ${name}`)
    return { name, module: imported[1] }
  })
}

/** One store module, through the glob above. */
async function loadModule(module: string): Promise<Record<string, z.AnyZodObject>> {
  const loader = storeModules[`../${module}.ts`]
  if (!loader) throw new Error(`no store module found for ./${module}`)
  return loader()
}

/**
 * A schema as a comparable string.
 *
 * Structural rather than referential: two families may legitimately build the
 * same shape from different expressions, and what matters is whether the merge
 * changes how the key validates. Constraints are included — a `number` bounded
 * 1–12 and one bounded 1–168 are different governors of the same key.
 */
function signature(schema: z.ZodTypeAny): string {
  const def = schema._def as Record<string, unknown> & { typeName: string }

  switch (def.typeName) {
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
      return `${def.typeName.replace('Zod', '').toLowerCase()}(${signature(
        (def.innerType ?? def.type) as z.ZodTypeAny
      )})`
    case 'ZodArray':
      return `array(${signature(def.type as z.ZodTypeAny)})`
    case 'ZodEnum':
      return `enum(${[...(def.values as string[])].sort().join('|')})`
    case 'ZodLiteral':
      return `literal(${String(def.value)})`
    case 'ZodUnion':
      return `union(${(def.options as z.ZodTypeAny[]).map(signature).sort().join(',')})`
    case 'ZodObject': {
      const shape = (schema as z.AnyZodObject).shape
      const entries = Object.entries(shape)
        .map(([key, value]) => `${key}:${signature(value as z.ZodTypeAny)}`)
        .sort()
      return `object({${entries.join(',')}})`
    }
    default: {
      const checks = (def.checks ?? []) as { kind: string; value?: unknown }[]
      const constraints = checks
        .map(
          (check) => `${check.kind}${check.value === undefined ? '' : `=${String(check.value)}`}`
        )
        .sort()
        .join(',')
      const base = def.typeName.replace('Zod', '').toLowerCase()
      return constraints ? `${base}[${constraints}]` : base
    }
  }
}

interface Collision {
  key: string
  owners: { fragment: string; signature: string }[]
}

/** Every key two or more per-family fragments govern differently. */
function findCollisions(fragments: { name: string; shape: z.ZodRawShape }[]): Collision[] {
  const declarations = new Map<string, { fragment: string; signature: string }[]>()

  for (const { name, shape } of fragments) {
    if (UNIVERSAL_FRAGMENTS.has(name)) continue

    for (const [key, schema] of Object.entries(shape)) {
      if (SHARED_KEYS.has(key)) continue
      declarations.set(key, [
        ...(declarations.get(key) ?? []),
        { fragment: name, signature: signature(schema as z.ZodTypeAny) },
      ])
    }
  }

  return [...declarations]
    .filter(([, owners]) => new Set(owners.map((owner) => owner.signature)).size > 1)
    .map(([key, owners]) => ({ key, owners }))
}

/** The failure a collision produces: the key, both families, and both shapes. */
function report(collisions: Collision[]): string {
  return collisions
    .map(({ key, owners }) => {
      const lines = owners.map((owner) => `      ${owner.fragment}: ${owner.signature}`).join('\n')
      const winner = owners.at(-1)!.fragment
      return [
        `  "${key}" is declared by ${owners.length} card families with different schemas:`,
        lines,
        `    zod.merge() is last-one-wins, so ${winner} governs it for ALL of them.`,
        `    Give the key a family-specific name, or share ONE fragment the way`,
        `    src/store/confirmOption.ts does.`,
      ].join('\n')
    })
    .join('\n\n')
}

describe('the item config schema', () => {
  it('declares every per-family key in exactly one family', async () => {
    const fragments = await Promise.all(
      readMergedFragments().map(async ({ name, module }) => {
        const schema = (await loadModule(module))[name]
        if (!schema?.shape)
          throw new Error(`${module}.ts does not export a zod object named ${name}`)
        return { name, shape: schema.shape }
      })
    )

    /*
     * The parse is the part of this guard most likely to rot silently: a merge
     * chain written differently, or a fragment that stops being found, would
     * make the check pass by examining nothing. So the inputs are asserted
     * before the property is.
     */
    expect(fragments.length).toBeGreaterThanOrEqual(10)
    expect(fragments.map((fragment) => fragment.name)).toContain('weatherOptionsConfigSchema')
    for (const fragment of fragments) {
      expect(Object.keys(fragment.shape).length).toBeGreaterThan(0)
    }

    const collisions = findCollisions(fragments).filter(
      (collision) => !KNOWN_COLLISIONS.has(collision.key)
    )

    expect(collisions, `\n\n${report(collisions)}\n`).toEqual([])
  })

  it('still needs every exception it is carrying', async () => {
    /*
     * An exception outlives its defect otherwise. When #254 lands, `stateLabels`
     * stops colliding and this fails — which is the reminder to delete the
     * entry rather than leave a permanent hole in the guard above.
     *
     * Deliberately not "the collisions are exactly the known ones": that would
     * report a NEW collision here as well as in the real check, so one defect
     * would fail two tests and neither name would mean what it says.
     */
    const fragments = await Promise.all(
      readMergedFragments().map(async ({ name, module }) => ({
        name,
        shape: (await loadModule(module))[name].shape,
      }))
    )

    const found = new Set(findCollisions(fragments).map((collision) => collision.key))

    for (const [key, tracker] of KNOWN_COLLISIONS) {
      expect(
        found,
        `"${key}" no longer collides — drop it from KNOWN_COLLISIONS (${tracker})`
      ).toContain(key)
    }
  })
})

describe('the collision guard itself', () => {
  /*
   * A guard nobody has seen fail is a guard nobody knows works. These build the
   * shapes the real check looks for, so the detector is exercised rather than
   * trusted — the same reason the parse above asserts its own inputs.
   */
  const family = (name: string, shape: z.ZodRawShape) => ({ name, shape })

  it('reports a key two families govern differently, naming both', () => {
    const collisions = findCollisions([
      family('switchOptionsConfigSchema', {
        stateLabels: z.object({ onLabel: z.string() }).optional(),
      }),
      family('coverOptionsConfigSchema', { stateLabels: z.enum(['percent']).optional() }),
    ])

    expect(collisions).toHaveLength(1)
    expect(collisions[0].key).toBe('stateLabels')
    expect(collisions[0].owners.map((owner) => owner.fragment)).toEqual([
      'switchOptionsConfigSchema',
      'coverOptionsConfigSchema',
    ])

    const message = report(collisions)
    expect(message).toContain('"stateLabels"')
    expect(message).toContain('switchOptionsConfigSchema')
    expect(message).toContain('coverOptionsConfigSchema')
    // The one the merge actually hands the key to.
    expect(message).toContain('coverOptionsConfigSchema governs it for ALL of them')
  })

  it('passes a key two families declare identically', () => {
    // Latent rather than live: nothing is governed differently, so there is
    // nothing to report yet. `deviceClassIcon` and `showPresets` are here today.
    expect(
      findCollisions([
        family('switchOptionsConfigSchema', { deviceClassIcon: z.boolean().optional() }),
        family('coverOptionsConfigSchema', { deviceClassIcon: z.boolean().optional() }),
      ])
    ).toEqual([])
  })

  it('fires the moment one of those two narrows its type', () => {
    // The transition #254 describes: same key, one family tightens, and the
    // other's validation changes with no diff touching it.
    expect(
      findCollisions([
        family('climateOptionsConfigSchema', { showPresets: z.boolean().optional() }),
        family('fanOptionsConfigSchema', { showPresets: z.enum(['pills', 'list']).optional() }),
      ])
    ).toHaveLength(1)
  })

  it('ignores the universal fragments, which every family merges on purpose', () => {
    expect(
      findCollisions([
        family('cardDisplayConfigSchema', { icon: z.string().optional() }),
        family('weatherOptionsConfigSchema', { icon: z.number().optional() }),
      ])
    ).toEqual([])
  })

  it('ignores the shared confirm fragment, which two families point at', () => {
    const confirmKey = [...SHARED_KEYS][0]

    expect(
      findCollisions([
        family('switchOptionsConfigSchema', { [confirmKey]: z.boolean().optional() }),
        family('actionOptionsConfigSchema', { [confirmKey]: z.string().optional() }),
      ])
    ).toEqual([])
  })

  it('tells apart constraints on the same base type', () => {
    // A number bounded 1–12 and one bounded 1–168 govern the same key
    // differently, so the signature has to carry the checks.
    expect(
      findCollisions([
        family('weatherOptionsConfigSchema', { hours: z.number().min(1).max(12).optional() }),
        family('sensorOptionsConfigSchema', { hours: z.number().min(1).max(168).optional() }),
      ])
    ).toHaveLength(1)
  })
})
