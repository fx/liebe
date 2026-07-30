import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CardMeta,
  CardName,
  CardState,
  CardValue,
  Chip,
  IconCircle,
  Pill,
  PillGroup,
  Slider,
  Sparkline,
  anatomyPart,
} from '..'

/**
 * These assertions are about the *contract*: the class names themes and tests
 * target, the `data-*` attributes that carry domain and state, and the fact
 * that colour reaches a part as a triplet reference rather than as a Radix
 * scale or a literal. Computed styling is not asserted here — jsdom applies no
 * stylesheet — so the sheet itself is checked in `anatomyStyles.test.ts`.
 */

describe('anatomyPart', () => {
  it('defaults to the generic domain colour and stamps no state', () => {
    expect(anatomyPart('liebe-icon', { domain: 'light' })).toEqual({
      className: 'liebe-icon',
      'data-color': 'default',
      'data-domain': 'light',
      'data-active': undefined,
      style: undefined,
    })
  })

  it('will not compile without the domain half of the selector contract', () => {
    // The guard is the type, not a runtime check: an omitted `domain` makes
    // React drop `data-domain` altogether, which silently unhooks the part from
    // every domain-scoped theme rule. This assertion fails `npm run typecheck`
    // the moment the prop goes back to optional.
    // @ts-expect-error — `domain` is required.
    expect(anatomyPart('liebe-icon', {})['data-domain']).toBeUndefined()
  })

  it('stamps the domain, the colour and the active state', () => {
    expect(anatomyPart('liebe-icon', { color: 'light', domain: 'light', active: true })).toEqual({
      className: 'liebe-icon',
      'data-color': 'light',
      'data-domain': 'light',
      'data-active': 'true',
      style: undefined,
    })
  })

  it('keeps the part class first when the caller adds its own', () => {
    expect(anatomyPart('liebe-chip', { domain: 'light', className: 'extra' }).className).toBe(
      'liebe-chip extra'
    )
  })

  it('overrides the triplet inline for a data-driven colour', () => {
    // A bulb's real RGB is the one documented exception to token-only colour;
    // the tint is mixed at the same 20% the token layer derives it at.
    //
    // `--liebe-part-color` is the same value under the name the theming
    // contract publishes, and it has to move with the live hue rather than with
    // the `data-color` triplet: a theme reading "this part's colour" on a bulb
    // rendering its own RGB would otherwise be told amber while the part paints
    // orange (docs/changes/0036-theming-contract-gaps.md PR 3).
    expect(
      anatomyPart('liebe-icon', { color: 'light', domain: 'light', hue: 'rgb(255, 170, 80)' }).style
    ).toEqual({
      '--liebe-part-color': 'rgb(255, 170, 80)',
      '--part-color': 'rgb(255, 170, 80)',
      '--part-tint': 'color-mix(in srgb, rgb(255, 170, 80) 20%, transparent)',
      '--part-text': 'var(--liebe-fg)',
      '--part-glyph': 'var(--liebe-fg)',
    })
  })

  it.each([
    ['rgb(255, 255, 255)'],
    ['rgb(255, 170, 80)'],
    ['var(--gold-9)'],
    ['color-mix(in srgb, red 50%, blue)'],
  ])('leaves no foreground role holding the live hue %s', (hue) => {
    // The rule this pins is an exclusion, and the exclusion is the whole of the
    // fix: a live hue may reach the surface and the solid roles and MUST reach
    // neither foreground one, because the tint is a 20% veil of that same hue
    // and a foreground taken from it sits on a wash of itself — 1.01:1 for a
    // bulb reporting white, measured (docs/changes/0035-light-appearance-contrast.md
    // PR 4). Asserted for arbitrary hues rather than one, so a mechanism that
    // special-cased white — or any single value — could not satisfy it.
    const style = anatomyPart('liebe-icon', { color: 'light', domain: 'light', hue }).style as
      | Record<string, string>
      | undefined
    const role = (name: string) => style?.[name]

    expect(role('--part-glyph')).not.toContain(hue)
    expect(role('--part-text')).not.toContain(hue)
    // And they take the neutral foreground rather than some third colour, which
    // is what keeps a nested light pane inside a dark root correct: the `var()`
    // is substituted at the part, so it resolves against the nearest root.
    expect(role('--part-glyph')).toBe('var(--liebe-fg)')
    expect(role('--part-text')).toBe('var(--liebe-fg)')
    // The surface and solid roles still carry it — a fix that dropped the hue
    // entirely would clear the floor and delete the information the exception
    // exists for.
    expect(role('--part-tint')).toContain(hue)
    expect(role('--part-color')).toBe(hue)
    expect(role('--liebe-part-color')).toBe(hue)
  })
})

describe('selector contract', () => {
  // Every contract part must be reachable by `[data-domain]` and `[data-color]`
  // — that is the whole of the promise `docs/specs/theming` makes, and a part
  // that renders without them fails silently: the theme rule simply never
  // matches, with nothing in the DOM to say why. Each part is rendered here
  // with nothing beyond its required props, so a part that only stamps the
  // attributes when a caller remembers to pass them is caught.
  it.each([
    ['liebe-icon', <IconCircle key="icon" domain="light" />],
    [
      'liebe-name',
      <CardName key="name" domain="light">
        Porch
      </CardName>,
    ],
    [
      'liebe-state',
      <CardState key="state" domain="light">
        Off
      </CardState>,
    ],
    [
      'liebe-slider',
      <Slider key="slider" label="Brightness" value={50} domain="light" onValueChange={() => {}} />,
    ],
    ['liebe-pill', <Pill key="pill" label="Heat" domain="climate" onClick={() => {}} />],
    ['liebe-chip', <Chip key="chip" label="Away" domain="person" />],
    ['liebe-value', <CardValue key="value" value="42" domain="sensor" />],
    ['liebe-spark', <Sparkline key="spark" domain="sensor" />],
  ])('reaches %s by both selector attributes', (partClass, element) => {
    const { container } = render(element)

    const part = container.querySelector(`.${partClass}`)
    expect(part).toHaveAttribute('data-domain')
    expect(part?.getAttribute('data-domain')).not.toBe('')
    // `default` is a real triplet, so the colour half always has a value even
    // when the caller leaves it to the helper.
    expect(part).toHaveAttribute('data-color', 'default')
  })
})

describe('IconCircle', () => {
  it('renders its glyph inside the contract class', () => {
    const { container } = render(
      <IconCircle color="light" domain="light" active>
        <svg data-testid="glyph" />
      </IconCircle>
    )

    const circle = container.querySelector('.liebe-icon')
    expect(circle).toHaveAttribute('data-domain', 'light')
    expect(circle).toHaveAttribute('data-color', 'light')
    expect(circle).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('glyph')).toBeInTheDocument()
  })

  it('renders inactive with no state attribute and no glyph', () => {
    const { container } = render(<IconCircle domain="light" />)

    const circle = container.querySelector('.liebe-icon')
    expect(circle).not.toHaveAttribute('data-active')
    expect(circle).toBeEmptyDOMElement()
  })
})

describe('meta block', () => {
  it('stacks an ellipsized name over a state line', () => {
    const { container } = render(
      <CardMeta>
        <CardName domain="light">Living Room Lamp</CardName>
        <CardState color="light" domain="light" active detail="· 80%">
          On
        </CardState>
      </CardMeta>
    )

    expect(container.querySelector('.liebe-meta')).toBeInTheDocument()
    const name = container.querySelector('.liebe-name')
    expect(name).toHaveTextContent('Living Room Lamp')
    // The name is reachable by theme selectors like every other part...
    expect(name).toHaveAttribute('data-domain', 'light')
    // ...but never renders state, whatever the line below it does.
    expect(name).not.toHaveAttribute('data-active')

    const state = container.querySelector('.liebe-state')
    expect(state).toHaveTextContent('On · 80%')
    expect(state).toHaveAttribute('data-active', 'true')
    // The supporting value is its own element, so it can stay muted while the
    // state itself takes the domain's text step.
    expect(container.querySelector('.liebe-state-detail')).toHaveTextContent('· 80%')
  })

  it('accepts extra classes on the stack and the name', () => {
    const { container } = render(
      <CardMeta className="stack">
        <CardName className="wide" domain="light">
          Porch
        </CardName>
        <CardState domain="light">Off</CardState>
      </CardMeta>
    )

    expect(container.querySelector('.liebe-meta')).toHaveClass('stack')
    expect(container.querySelector('.liebe-name')).toHaveClass('wide')
    expect(container.querySelector('.liebe-name')).not.toHaveAttribute('style')
    expect(container.querySelector('.liebe-state')).not.toHaveAttribute('data-active')
    expect(container.querySelector('.liebe-state-detail')).not.toBeInTheDocument()
  })

  it('drops rendered state a card forwards to the name', () => {
    // Cards pass one bundle of state props to every part they render. The name
    // must come out of that with no state on it, or `.liebe-name[data-active]`
    // starts matching something that never renders state.
    const rendered = { color: 'light', domain: 'light', active: true, hue: 'rgb(1, 2, 3)' } as const
    const { container } = render(
      <CardMeta>
        <CardName {...rendered}>Porch</CardName>
        <CardState {...rendered}>On</CardState>
      </CardMeta>
    )

    const name = container.querySelector('.liebe-name')
    expect(name).toHaveAttribute('data-domain', 'light')
    expect(name).not.toHaveAttribute('data-active')
    expect(name).not.toHaveAttribute('style')
    // The state line, given the same props, does render them.
    expect(container.querySelector('.liebe-state')).toHaveAttribute('data-active', 'true')
  })
})

describe('Pill', () => {
  it('names the group and reports which pill is selected', async () => {
    const onClick = vi.fn()
    render(
      <PillGroup label="HVAC mode">
        <Pill label="Heat" color="heat" domain="climate" active onClick={onClick} />
        <Pill label="Cool" color="cool" domain="climate" onClick={() => {}} />
      </PillGroup>
    )

    expect(screen.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    const heat = screen.getByRole('button', { name: 'Heat' })
    expect(heat).toHaveAttribute('aria-pressed', 'true')
    expect(heat).toHaveClass('liebe-pill')
    expect(screen.getByRole('button', { name: 'Cool' })).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(heat)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('carries its axis as an attribute, horizontal unless asked otherwise', () => {
    // The `tall` tier stacks a group that is a row everywhere else, and it does
    // so through the sheet rather than through a second component — the same
    // way the slider carries its orientation (docs/specs/design-system —
    // "Size-adaptive layouts").
    const { container, rerender } = render(
      <PillGroup label="Fan speed">
        <Pill label="Boost" domain="fan" onClick={() => {}} />
      </PillGroup>
    )

    expect(container.querySelector('.liebe-pill-group')).toHaveAttribute(
      'data-orientation',
      'horizontal'
    )

    rerender(
      <PillGroup label="Fan speed" orientation="vertical">
        <Pill label="Boost" domain="fan" onClick={() => {}} />
      </PillGroup>
    )

    expect(container.querySelector('.liebe-pill-group')).toHaveAttribute(
      'data-orientation',
      'vertical'
    )
  })

  it('keeps the label as the accessible name when it is hidden', () => {
    const { container } = render(
      <PillGroup label="Fan speed" className="row">
        <Pill
          label="Boost"
          hideLabel
          icon={<svg data-testid="boost-icon" />}
          domain="fan"
          onClick={() => {}}
        />
      </PillGroup>
    )

    expect(container.querySelector('.liebe-pill-group')).toHaveClass('row')
    // The name survives; only the visible text goes.
    expect(screen.getByRole('button', { name: 'Boost' })).toBeInTheDocument()
    expect(screen.queryByText('Boost')).not.toBeInTheDocument()
    expect(screen.getByTestId('boost-icon')).toBeInTheDocument()
  })

  it('does not dispatch while disabled', async () => {
    const onClick = vi.fn()
    render(<Pill label="Unlock" domain="lock" disabled onClick={onClick} />)

    const pill = screen.getByRole('button', { name: 'Unlock' })
    expect(pill).toBeDisabled()
    await userEvent.click(pill)
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('embedded controls', () => {
  // The card's whole tile is its primary action and its handler accepts any
  // descendant target, so a control that let its click bubble would fire the
  // tile as well — choosing a mode would toggle the device it configures.
  it.each([
    ['pill', <Pill key="pill" label="Cool" domain="climate" onClick={() => {}} />, 'button'],
    ['chip', <Chip key="chip" label="Away" domain="person" onClick={() => {}} />, 'button'],
    [
      'slider',
      <Slider key="slider" label="Brightness" value={50} domain="light" onValueChange={() => {}} />,
      'slider',
    ],
  ])('keeps a %s click from reaching the tile around it', async (_part, control, role) => {
    const onTileClick = vi.fn()
    // Stands in for the card shell, whose own handler accepts any descendant.
    render(<div onClick={onTileClick}>{control}</div>)

    await userEvent.click(screen.getByRole(role))
    expect(onTileClick).not.toHaveBeenCalled()
  })
})

describe('Slider', () => {
  it('names the thumb, which is the element carrying the slider role', async () => {
    // Issue #192: Radix puts `role="slider"` on the thumb, so a name on the
    // root leaves the control anonymous to assistive technology — axe's
    // `aria-input-field-name`, serious, 11 nodes across the cards. `getByRole`
    // with a name is the assertion: it resolves the accessible name of the
    // element that has the role, which is exactly what the audit measures.
    const { container } = render(
      <Slider label="Brightness" value={50} domain="light" onValueChange={() => {}} />
    )

    const thumb = await screen.findByRole('slider', { name: 'Brightness' })
    expect(thumb).toHaveClass('liebe-slider-thumb')
    // ...and the root is deliberately left unnamed, so no second, competing
    // name can drift out of step with the one that counts.
    expect(container.querySelector('.liebe-slider')).not.toHaveAttribute('aria-label')
  })

  it('will not compile without an accessible name', () => {
    // The guard is the type, not a default: a stand-in name would pass the
    // audit while telling a screen reader user nothing. This fails
    // `npm run typecheck` the moment `label` becomes optional.
    expect(() =>
      render(
        // @ts-expect-error — `label` is required.
        <Slider value={50} domain="light" onValueChange={() => {}} />
      )
    ).not.toThrow()
  })

  it('reports each step of a keyboard adjustment and commits it', async () => {
    const onValueChange = vi.fn()
    const onValueCommit = vi.fn()
    render(
      <Slider
        label="Brightness"
        value={50}
        step={5}
        color="light"
        domain="light"
        active
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      />
    )

    const thumb = screen.getByRole('slider', { name: 'Brightness' })
    thumb.focus()
    await userEvent.keyboard('{ArrowRight}')

    // Both halves matter to a card: the live value repaints it, the commit is
    // the one service call a whole drag should produce.
    expect(onValueChange).toHaveBeenCalledWith(55)
    expect(onValueCommit).toHaveBeenCalledWith(55)
  })

  it('adjusts without a commit handler', async () => {
    // `onValueCommit` is optional — a card that dispatches on every change (or
    // not at all) still has a working slider.
    const onValueChange = vi.fn()
    render(<Slider label="Volume" value={30} domain="media_player" onValueChange={onValueChange} />)

    screen.getByRole('slider', { name: 'Volume' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onValueChange).toHaveBeenCalledWith(31)
  })

  it('respects the range it is given', () => {
    render(
      <Slider
        label="Target temperature"
        value={21}
        min={7}
        max={35}
        step={0.5}
        color="heat"
        domain="climate"
        active
        onValueChange={() => {}}
      />
    )

    const thumb = screen.getByRole('slider', { name: 'Target temperature' })
    expect(thumb).toHaveAttribute('aria-valuemin', '7')
    expect(thumb).toHaveAttribute('aria-valuemax', '35')
    expect(thumb).toHaveAttribute('aria-valuenow', '21')
  })

  it('shows the readout in the track and announces it as the value', () => {
    const { container } = render(
      <Slider
        label="Brightness"
        value={80}
        readout="80%"
        color="light"
        domain="light"
        active
        onValueChange={() => {}}
      />
    )

    const readout = container.querySelector('.liebe-slider-readout')
    expect(readout).toHaveTextContent('80%')
    // The thumb already announces the same text, so the visible copy stays out
    // of the accessibility tree rather than being read twice.
    expect(readout).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveAttribute(
      'aria-valuetext',
      '80%'
    )
  })

  it('renders no readout when the card gives none', () => {
    const { container } = render(
      <Slider label="Position" value={40} domain="cover" onValueChange={() => {}} />
    )

    expect(container.querySelector('.liebe-slider-readout')).not.toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Position' })).not.toHaveAttribute('aria-valuetext')
  })

  it.each([
    ['horizontal' as const, undefined],
    ['vertical' as const, 'vertical' as const],
  ])('lays out %s, stamping the axis on every part', (expected, orientation) => {
    const { container } = render(
      <Slider
        label="Brightness"
        value={50}
        orientation={orientation}
        domain="light"
        onValueChange={() => {}}
      />
    )

    // One stylesheet covers both orientations by reading the attribute Radix
    // stamps, so the axis has to reach the parts, not just the root.
    for (const selector of [
      '.liebe-slider',
      '.liebe-slider-track',
      '.liebe-slider-fill',
      '.liebe-slider-thumb',
    ]) {
      expect(container.querySelector(selector)).toHaveAttribute('data-orientation', expected)
    }
  })

  it('does not adjust while disabled', async () => {
    const onValueChange = vi.fn()
    const { container } = render(
      <Slider label="Brightness" value={50} disabled domain="light" onValueChange={onValueChange} />
    )

    expect(container.querySelector('.liebe-slider')).toHaveAttribute('data-disabled')
    const thumb = screen.getByRole('slider', { name: 'Brightness' })
    thumb.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe('Chip', () => {
  it('is a read-only summary with a leading dot by default', () => {
    const { container } = render(<Chip label="3 lights on" color="light" domain="light" active />)

    const chip = container.querySelector('.liebe-chip')
    expect(chip?.tagName).toBe('SPAN')
    expect(chip).toHaveAttribute('data-active', 'true')
    expect(chip).toHaveTextContent('3 lights on')
    expect(container.querySelector('.liebe-chip-dot')).toBeInTheDocument()
    // Nothing tappable, so nothing in the tab order.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('becomes a real button when it does something', async () => {
    const onClick = vi.fn()
    const { container } = render(
      <Chip label="Away" domain="person" icon={<svg data-testid="chip-icon" />} onClick={onClick} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Away' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.liebe-chip-icon')).toBeInTheDocument()
    expect(container.querySelector('.liebe-chip-dot')).not.toBeInTheDocument()
  })
})

describe('CardValue', () => {
  it('renders the number with a unit beside it', () => {
    const { container } = render(
      <CardValue value="21.5" unit="°C" color="heat" domain="climate" active />
    )

    const value = container.querySelector('.liebe-value')
    expect(value).toHaveAttribute('data-color', 'heat')
    expect(value).toHaveAttribute('data-active', 'true')
    expect(container.querySelector('.liebe-value-number')).toHaveTextContent('21.5')
    expect(container.querySelector('.liebe-value-unit')).toHaveTextContent('°C')
  })

  it('renders without a unit', () => {
    const { container } = render(<CardValue value="42" domain="sensor" />)

    expect(container.querySelector('.liebe-value-unit')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-value')).not.toHaveAttribute('data-active')
  })
})

describe('Sparkline', () => {
  it('draws the series, closes the area and marks the last sample', () => {
    const { container } = render(
      <Sparkline values={[0, 5, 10]} color="water" domain="sensor" active label="Humidity, 6h" />
    )

    const spark = container.querySelector('.liebe-spark')
    expect(spark).toHaveAttribute('data-active', 'true')
    expect(spark).not.toHaveAttribute('data-empty')
    expect(screen.getByRole('img', { name: 'Humidity, 6h' })).toBe(spark)

    // Left to right across the box, bottom (lowest sample) to top (highest).
    expect(container.querySelector('.liebe-spark-line')).toHaveAttribute('d', 'M0,29 L50,16 L100,3')
    // The area is the same path closed against the baseline.
    expect(container.querySelector('.liebe-spark-area')).toHaveAttribute(
      'd',
      'M0,29 L50,16 L100,3 L100,32 L0,32 Z'
    )
    expect(container.querySelector<HTMLElement>('.liebe-spark-dot')?.style.left).toBe('100%')
  })

  it('scales a series that dips below its first sample', () => {
    // The extremes are found in one pass rather than by spreading the series
    // into `Math.min`, which throws past the engine's argument limit. Both ends
    // of that pass matter: here the running minimum moves at the second sample
    // and the maximum at the third.
    const { container } = render(<Sparkline values={[5, 0, 10]} domain="sensor" />)

    expect(container.querySelector('.liebe-spark-line')).toHaveAttribute('d', 'M0,16 L50,29 L100,3')
  })

  it('draws a flat series down the middle', () => {
    // No range to scale into — the naive mapping would divide by zero.
    const { container } = render(<Sparkline values={[7, 7, 7]} domain="sensor" />)

    expect(container.querySelector('.liebe-spark-line')).toHaveAttribute(
      'd',
      'M0,16 L50,16 L100,16'
    )
    expect(container.querySelector<HTMLElement>('.liebe-spark-dot')?.style.top).toBe('50%')
  })

  it('draws bars from a zero baseline', () => {
    const { container } = render(<Sparkline values={[0, 5, 10]} domain="sensor" mode="bar" />)

    const bars = Array.from(container.querySelectorAll('.liebe-spark-bar')).map((bar) => ({
      x: bar.getAttribute('x'),
      y: bar.getAttribute('y'),
      height: bar.getAttribute('height'),
      width: bar.getAttribute('width'),
    }))
    // Zero is forced into the domain rather than taken from the data: a bar's
    // length IS its value, so the first bucket draws nothing and the last
    // spans the box. Scaled between the smallest and largest bucket instead,
    // a window of 4, 5 and 6 kWh would read as "the first hour used none".
    expect(bars).toEqual([
      { x: '5', y: '29', height: '0', width: '23.33' },
      { x: '38.33', y: '16', height: '13', width: '23.33' },
      { x: '71.67', y: '3', height: '26', width: '23.33' },
    ])
    // The line's parts belong to the line: no area wash under columns, and the
    // endpoint dot marks "the latest sample" on a curve that is not drawn here.
    expect(container.querySelector('.liebe-spark-line')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-area')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-dot')).not.toBeInTheDocument()
  })

  it('keeps the baseline at zero for a series that never reaches it', () => {
    // The case the previous test cannot prove, because a series containing 0
    // has the same domain either way: 4, 5 and 6 kWh scaled between their OWN
    // extremes would draw the first hour as no consumption at all. Every bar
    // has height here, and they are in proportion to the values.
    const { container } = render(<Sparkline values={[4, 5, 6]} domain="sensor" mode="bar" />)

    const bars = Array.from(container.querySelectorAll('.liebe-spark-bar')).map((bar) => ({
      y: Number(bar.getAttribute('y')),
      height: Number(bar.getAttribute('height')),
    }))

    // Every bar has length — the first hour did use something — and the ratios
    // are the values' (4:5:6). Loosely compared: coordinates round to two
    // decimals on the way into the DOM.
    expect(bars.every(({ height }) => height > 0)).toBe(true)
    expect(bars[1].height / bars[0].height).toBeCloseTo(5 / 4, 2)
    expect(bars[2].height / bars[0].height).toBeCloseTo(6 / 4, 2)

    // And they FIT. The ratios alone cannot tell the two baselines apart —
    // height is affine in the value either way — but a baseline taken from the
    // data sits below the box (`y(0)` is off-canvas at 81 in a 32-unit
    // viewBox), so the columns run out of the bottom of the graph.
    for (const { y, height } of bars) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y + height).toBeLessThanOrEqual(32)
    }
  })

  it('hangs a negative bucket below the baseline', () => {
    // A `total` sensor can legitimately fall (net energy), so its bars are
    // signed and the baseline moves off the floor of the box.
    const { container } = render(<Sparkline values={[-5, 5]} domain="sensor" mode="bar" />)

    const bars = Array.from(container.querySelectorAll('.liebe-spark-bar'))
    expect(bars.map((bar) => bar.getAttribute('y'))).toEqual(['16', '3'])
    expect(bars.map((bar) => bar.getAttribute('height'))).toEqual(['13', '13'])
  })

  it('shows the placeholder for a window in which nothing moved', () => {
    // Every bar would have zero height, which is a graph of nothing drawn as
    // nothing — the placeholder at least says so.
    const { container } = render(<Sparkline values={[0, 0, 0]} domain="sensor" mode="bar" active />)

    const spark = container.querySelector('.liebe-spark')
    expect(spark).toHaveAttribute('data-empty', 'true')
    expect(spark).not.toHaveAttribute('data-active')
    expect(container.querySelector('.liebe-spark-bar')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-baseline')).toBeInTheDocument()
  })

  it.each([
    ['no series at all', undefined, false],
    ['a single sample', [3], false],
    // History can carry states that do not parse as numbers; one of them would
    // otherwise turn every coordinate into NaN and draw nothing at all.
    ['a non-finite sample', [1, Number.NaN, 3], false],
    // A card is routinely active while its history is still loading. The
    // placeholder must stay neutral there: a saturated baseline reads as a
    // graph of something, when it is the absence of one.
    ['an active card and no series', [], true],
  ])('shows the neutral placeholder baseline with %s', (_case, values, active) => {
    const { container } = render(<Sparkline values={values} domain="sensor" active={active} />)

    const spark = container.querySelector('.liebe-spark')
    expect(spark).toHaveAttribute('data-empty', 'true')
    // Nothing for a domain colour to describe, so nothing for a theme's
    // `[data-active]` rule to catch hold of either.
    expect(spark).not.toHaveAttribute('data-active')
    // Decorative without a label, so it stays out of the accessibility tree.
    expect(spark).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.liebe-spark-baseline')).toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-line')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-dot')).not.toBeInTheDocument()
  })
})
