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
    expect(anatomyPart('liebe-icon', {})).toEqual({
      className: 'liebe-icon',
      'data-color': 'default',
      'data-domain': undefined,
      'data-active': undefined,
      style: undefined,
    })
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
    expect(anatomyPart('liebe-chip', { className: 'extra' }).className).toBe('liebe-chip extra')
  })

  it('overrides the triplet inline for a data-driven colour', () => {
    // A bulb's real RGB is the one documented exception to token-only colour;
    // the tint is mixed at the same 20% the token layer derives it at.
    expect(anatomyPart('liebe-icon', { color: 'light', hue: 'rgb(255, 170, 80)' }).style).toEqual({
      '--part-color': 'rgb(255, 170, 80)',
      '--part-tint': 'color-mix(in srgb, rgb(255, 170, 80) 20%, transparent)',
      '--part-text': 'rgb(255, 170, 80)',
    })
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
    const { container } = render(<IconCircle />)

    const circle = container.querySelector('.liebe-icon')
    expect(circle).not.toHaveAttribute('data-active')
    expect(circle).toBeEmptyDOMElement()
  })
})

describe('meta block', () => {
  it('stacks an ellipsized name over a state line', () => {
    const { container } = render(
      <CardMeta>
        <CardName>Living Room Lamp</CardName>
        <CardState color="light" domain="light" active>
          On · 80%
        </CardState>
      </CardMeta>
    )

    expect(container.querySelector('.liebe-meta')).toBeInTheDocument()
    expect(container.querySelector('.liebe-name')).toHaveTextContent('Living Room Lamp')
    const state = container.querySelector('.liebe-state')
    expect(state).toHaveTextContent('On · 80%')
    expect(state).toHaveAttribute('data-active', 'true')
  })

  it('accepts extra classes on the stack and the name', () => {
    const { container } = render(
      <CardMeta className="stack">
        <CardName className="wide">Porch</CardName>
        <CardState>Off</CardState>
      </CardMeta>
    )

    expect(container.querySelector('.liebe-meta')).toHaveClass('stack')
    expect(container.querySelector('.liebe-name')).toHaveClass('wide')
    expect(container.querySelector('.liebe-state')).not.toHaveAttribute('data-active')
  })
})

describe('Pill', () => {
  it('names the group and reports which pill is selected', async () => {
    const onClick = vi.fn()
    render(
      <PillGroup label="HVAC mode">
        <Pill label="Heat" color="heat" domain="climate" active onClick={onClick} />
        <Pill label="Cool" color="cool" domain="climate" />
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

  it('keeps the label as the accessible name when it is hidden', () => {
    const { container } = render(
      <PillGroup label="Fan speed" className="row">
        <Pill label="Boost" hideLabel icon={<svg data-testid="boost-icon" />} />
      </PillGroup>
    )

    expect(container.querySelector('.liebe-pill-group')).toHaveClass('row')
    // The name survives; only the visible text goes.
    expect(screen.getByRole('button', { name: 'Boost' })).toBeInTheDocument()
    expect(screen.queryByText('Boost')).not.toBeInTheDocument()
    expect(screen.getByTestId('boost-icon')).toBeInTheDocument()
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
      <Chip label="Away" icon={<svg data-testid="chip-icon" />} onClick={onClick} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Away' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.liebe-chip-icon')).toBeInTheDocument()
    expect(container.querySelector('.liebe-chip-dot')).not.toBeInTheDocument()
  })
})

describe('CardValue', () => {
  it('renders the number with a unit beside it', () => {
    const { container } = render(<CardValue value="21.5" unit="°C" color="heat" active />)

    const value = container.querySelector('.liebe-value')
    expect(value).toHaveAttribute('data-color', 'heat')
    expect(value).toHaveAttribute('data-active', 'true')
    expect(container.querySelector('.liebe-value-number')).toHaveTextContent('21.5')
    expect(container.querySelector('.liebe-value-unit')).toHaveTextContent('°C')
  })

  it('renders without a unit', () => {
    const { container } = render(<CardValue value="42" />)

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

  it('draws a flat series down the middle', () => {
    // No range to scale into — the naive mapping would divide by zero.
    const { container } = render(<Sparkline values={[7, 7, 7]} />)

    expect(container.querySelector('.liebe-spark-line')).toHaveAttribute(
      'd',
      'M0,16 L50,16 L100,16'
    )
    expect(container.querySelector<HTMLElement>('.liebe-spark-dot')?.style.top).toBe('50%')
  })

  it.each([
    ['no series at all', undefined],
    ['a single sample', [3]],
  ])('shows the placeholder baseline with %s', (_case, values) => {
    const { container } = render(<Sparkline values={values} />)

    const spark = container.querySelector('.liebe-spark')
    expect(spark).toHaveAttribute('data-empty', 'true')
    // Decorative without a label, so it stays out of the accessibility tree.
    expect(spark).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.liebe-spark-baseline')).toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-line')).not.toBeInTheDocument()
    expect(container.querySelector('.liebe-spark-dot')).not.toBeInTheDocument()
  })
})
