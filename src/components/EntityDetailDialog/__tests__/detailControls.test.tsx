import { describe, it, expect } from 'vitest'
import { getDetailControls, registerDetailControls } from '../detailControls'
import type { EntityDetailControlsProps } from '../detailControls'

/**
 * The dialog's domain control slot. Empty in this change — these are the rules
 * the card changes that fill it will rely on.
 */
describe('detail control registry', () => {
  const Controls = ({ entity }: EntityDetailControlsProps) => <span>{entity.entity_id}</span>
  const OtherControls = ({ entity }: EntityDetailControlsProps) => <em>{entity.entity_id}</em>

  it('has nothing registered until a card family registers something', () => {
    expect(getDetailControls('light')).toBeUndefined()
  })

  it('hands back what a domain registered, and only for that domain', () => {
    const dispose = registerDetailControls('cover', Controls)

    expect(getDetailControls('cover')).toBe(Controls)
    expect(getDetailControls('lock')).toBeUndefined()

    dispose()
    expect(getDetailControls('cover')).toBeUndefined()
  })

  it('leaves a later registration alone when an earlier disposer runs', () => {
    // Disposal order is not something a registrant controls, and a stale
    // disposer must not tear out controls it never installed.
    const disposeFirst = registerDetailControls('fan', Controls)
    const disposeSecond = registerDetailControls('fan', OtherControls)

    disposeFirst()
    expect(getDetailControls('fan')).toBe(OtherControls)

    disposeSecond()
    expect(getDetailControls('fan')).toBeUndefined()
  })
})
