import * as React from 'react'
import { useLayoutEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActionEditor } from '../ActionEditor'
import { dashboardActions } from '~/store'

/**
 * The action editor's contract is narrow and load-bearing: it must only ever
 * emit a value the schema accepts. An invalid action written into a card would
 * survive locally (the render path falls back) and then be rejected when someone
 * else imports the exported YAML — a failure a long way from its cause.
 */
describe('ActionEditor', () => {
  const onChange = vi.fn()

  function renderEditor(props: Partial<React.ComponentProps<typeof ActionEditor>> = {}) {
    return render(
      <Theme>
        <ActionEditor
          label="Tap"
          value={undefined}
          defaultValue="default"
          onChange={onChange}
          {...props}
        />
      </Theme>
    )
  }

  async function pickKind(name: string) {
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Tap' }))
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    await user.click(within(screen.getByRole('listbox')).getByText(name))
  }

  beforeEach(() => {
    onChange.mockClear()
    dashboardActions.resetState()
  })

  afterEach(() => {
    dashboardActions.resetState()
  })

  it('shows the stored action and emits a parameterless one as a bare string', async () => {
    renderEditor({ value: 'toggle' })
    expect(screen.getByRole('combobox', { name: 'Tap' })).toHaveTextContent('Toggle')

    await pickKind('More info')
    expect(onChange).toHaveBeenCalledWith('more-info')
  })

  it('falls back to the default for a stored value that does not validate', () => {
    renderEditor({ value: { action: 'navigate' }, defaultValue: 'more-info' })
    expect(screen.getByRole('combobox', { name: 'Tap' })).toHaveTextContent('More info')
  })

  it('commits a complete navigate action by pre-selecting the first screen', async () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    renderEditor()

    await pickKind('Navigate to screen')

    // The target is required, so switching kind emits a finished action rather
    // than an empty one that would fail the import gate.
    expect(onChange).toHaveBeenCalledWith({ action: 'navigate', target: 'kitchen' })
  })

  it('offers nested screens and emits the one that is chosen', async () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Home', slug: 'home', type: 'grid' })
    dashboardActions.addScreen(
      { id: 'screen-2', name: 'Bedroom', slug: 'bedroom', type: 'grid' },
      'screen-1'
    )
    const user = userEvent.setup()
    renderEditor({ value: { action: 'navigate', target: 'home' } })

    await user.click(screen.getByRole('combobox', { name: 'Tap screen' }))
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    await user.click(within(screen.getByRole('listbox')).getByText('— Bedroom'))

    expect(onChange).toHaveBeenCalledWith({ action: 'navigate', target: 'bedroom' })
  })

  it.each([
    ['id', 'screen-1'],
    ['slug', 'kitchen'],
  ])('selects the screen a target names by %s', (_identifier, target) => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    renderEditor({ value: { action: 'navigate', target } })

    // Both identifiers resolve at runtime (`useCardActions`), so an action
    // stored either way is working configuration — the editor must show the
    // screen it actually navigates to, not report it missing.
    const trigger = screen.getByRole('combobox', { name: 'Tap screen' })
    expect(trigger).toHaveTextContent('Kitchen')
    expect(trigger).not.toHaveTextContent(/screen not found/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not offer a not-found entry for an id-targeted action', async () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    const user = userEvent.setup()
    renderEditor({ value: { action: 'navigate', target: 'screen-1' } })

    await user.click(screen.getByRole('combobox', { name: 'Tap screen' }))
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('Kitchen')).toBeInTheDocument()
    expect(within(listbox).queryByText(/screen not found/)).not.toBeInTheDocument()
  })

  it('keeps offering a stored target that no longer matches a screen', () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    renderEditor({ value: { action: 'navigate', target: 'renamed-away' } })

    // Shown rather than silently dropped: opening the form must not discard a
    // target the user can still fix.
    expect(screen.getByRole('combobox', { name: 'Tap screen' })).toHaveTextContent('renamed-away')
  })

  it('still reports, and preserves, a target that matches neither id nor slug', () => {
    dashboardActions.addScreen({ id: 'screen-1', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    renderEditor({ value: { action: 'navigate', target: 'screen-9' } })

    // Resolving by either identifier must not swallow the genuinely broken
    // case: an id-shaped target for a screen that is gone is still unknown, and
    // it is still kept so the user can fix it rather than lose it.
    const trigger = screen.getByRole('combobox', { name: 'Tap screen' })
    expect(trigger).toHaveTextContent('screen-9')
    expect(trigger).toHaveTextContent(/screen not found/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says so, and emits nothing, when there is no screen to navigate to', async () => {
    renderEditor()

    await pickKind('Navigate to screen')

    expect(screen.getByText(/Add a screen first/)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('withholds a call-service action until the service is well formed', async () => {
    renderEditor()

    await pickKind('Call service')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/Enter the service as domain.service/)).toBeInTheDocument()

    // Half-typed: a domain with no service is not a service call.
    fireEvent.change(screen.getByLabelText('Tap service'), { target: { value: 'light' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Tap service'), { target: { value: 'light.turn_on' } })
    expect(onChange).toHaveBeenCalledWith({ action: 'call-service', service: 'light.turn_on' })
    expect(screen.queryByText(/Enter the service as domain.service/)).not.toBeInTheDocument()
  })

  it('parses service data as YAML and includes it in the emitted action', () => {
    renderEditor({ value: { action: 'call-service', service: 'light.turn_on' } })

    fireEvent.change(screen.getByLabelText('Tap service data'), {
      target: { value: 'brightness: 180\ntransition: 2' },
    })

    expect(onChange).toHaveBeenCalledWith({
      action: 'call-service',
      service: 'light.turn_on',
      data: { brightness: 180, transition: 2 },
    })
  })

  it('round-trips existing service data back into the field', () => {
    renderEditor({
      value: { action: 'call-service', service: 'script.turn_on', data: { level: 3 } },
    })

    expect(screen.getByLabelText('Tap service data')).toHaveValue('level: 3')
  })

  it('reports unparseable service data instead of emitting it', () => {
    renderEditor({ value: { action: 'call-service', service: 'light.turn_on' } })

    fireEvent.change(screen.getByLabelText('Tap service data'), {
      target: { value: 'brightness: [1, 2\n' },
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Tap service data').parentElement?.parentElement).toBeTruthy()
    expect(screen.getByText(/flow sequence|unexpected end/i)).toBeInTheDocument()
  })

  it('rejects service data that is not a mapping', () => {
    renderEditor({ value: { action: 'call-service', service: 'light.turn_on' } })

    fireEvent.change(screen.getByLabelText('Tap service data'), {
      target: { value: '- one\n- two' },
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/must be a mapping/)).toBeInTheDocument()
  })

  it('clears an earlier data error once the YAML parses again', () => {
    renderEditor({ value: { action: 'call-service', service: 'light.turn_on' } })
    const field = screen.getByLabelText('Tap service data')

    fireEvent.change(field, { target: { value: '- one' } })
    expect(screen.getByText(/must be a mapping/)).toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'brightness: 10' } })
    expect(screen.queryByText(/must be a mapping/)).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith({
      action: 'call-service',
      service: 'light.turn_on',
      data: { brightness: 10 },
    })
  })

  it('drops emptied service data rather than sending an empty mapping', () => {
    renderEditor({
      value: { action: 'call-service', service: 'light.turn_on', data: { brightness: 1 } },
    })

    fireEvent.change(screen.getByLabelText('Tap service data'), { target: { value: '   ' } })

    expect(onChange).toHaveBeenCalledWith({ action: 'call-service', service: 'light.turn_on' })
  })

  it('follows the stored action when it changes underneath the form', async () => {
    const { rerender } = renderEditor({ value: 'toggle' })

    // Something else changed the value — the form is pointed at a different
    // card, or the config was reset. The picked kind must not stay behind.
    rerender(
      <Theme>
        <ActionEditor label="Tap" value="none" defaultValue="default" onChange={onChange} />
      </Theme>
    )

    expect(screen.getByRole('combobox', { name: 'Tap' })).toHaveTextContent('Nothing')
  })

  it('adopts the parameter fields when the stored action changes underneath', () => {
    // The config modal stays mounted while it is pointed at another card. If
    // only the kind resynced, the previous card's service would still be in the
    // field, and editing the data would write it onto the new one.
    const { rerender } = renderEditor({
      value: { action: 'call-service', service: 'light.turn_on', data: { brightness: 1 } },
    })
    expect(screen.getByLabelText('Tap service')).toHaveValue('light.turn_on')

    rerender(
      <Theme>
        <ActionEditor
          label="Tap"
          value={{ action: 'call-service', service: 'script.turn_on' }}
          defaultValue="default"
          onChange={onChange}
        />
      </Theme>
    )

    expect(screen.getByLabelText('Tap service')).toHaveValue('script.turn_on')
    expect(screen.getByLabelText('Tap service data')).toHaveValue('')
  })

  it('does not resync the field the user is still typing in', () => {
    // The control's own emission comes straight back as a new `value`. Treating
    // that as an external change would rewrite the field mid-keystroke.
    function Host() {
      const [value, setValue] = React.useState<unknown>({
        action: 'call-service',
        service: 'light.turn_on',
      })
      return (
        <Theme>
          <ActionEditor
            label="Tap"
            value={value}
            defaultValue="default"
            onChange={(next) => {
              setValue(next)
              onChange(next)
            }}
          />
        </Theme>
      )
    }

    render(<Host />)
    const field = screen.getByLabelText('Tap service data')

    fireEvent.change(field, { target: { value: 'brightness: 180' } })
    expect(field).toHaveValue('brightness: 180')
    expect(onChange).toHaveBeenLastCalledWith({
      action: 'call-service',
      service: 'light.turn_on',
      data: { brightness: 180 },
    })
  })

  it('keeps a half-typed service across an unrelated re-render', () => {
    const { rerender } = renderEditor({
      value: { action: 'call-service', service: 'light.turn_on' },
    })

    // Deliberately incomplete, so nothing was emitted and the stored action is
    // still the one the form was handed.
    fireEvent.change(screen.getByLabelText('Tap service'), { target: { value: 'light' } })
    expect(onChange).not.toHaveBeenCalled()

    // A re-render for some other reason — here a description arriving — hands
    // back an equal-but-new `value` object. Treating that as an external edit
    // would wipe the field the user is halfway through.
    rerender(
      <Theme>
        <ActionEditor
          label="Tap"
          description="What a tap on the card does."
          value={{ action: 'call-service', service: 'light.turn_on' }}
          defaultValue="default"
          onChange={onChange}
        />
      </Theme>
    )

    expect(screen.getByLabelText('Tap service')).toHaveValue('light')
  })

  it('replaces in-progress input when a genuinely new stored action arrives', () => {
    const { rerender } = renderEditor({
      value: { action: 'call-service', service: 'light.turn_on' },
    })

    fireEvent.change(screen.getByLabelText('Tap service'), { target: { value: 'light' } })
    expect(screen.getByLabelText('Tap service')).toHaveValue('light')

    // The other half of the rule: unsent local text must not outlive the action
    // it was being typed into. The form is now pointed somewhere else.
    rerender(
      <Theme>
        <ActionEditor
          label="Tap"
          value={{ action: 'call-service', service: 'script.turn_on' }}
          defaultValue="default"
          onChange={onChange}
        />
      </Theme>
    )

    expect(screen.getByLabelText('Tap service')).toHaveValue('script.turn_on')
  })

  it('shows the new action in the very commit it arrives in', () => {
    /*
     * The resync moved from an effect to the render phase
     * (docs/changes/0040-test-harness-reliability.md, PR 4), and this is the
     * only assertion here that can tell those apart: both settle on the same
     * fields, so everything asserted after an `act()` boundary — where passive
     * effects have flushed — agrees with either. The difference is the commit
     * in between, which the user sees: a service field still showing the
     * action the form was previously pointed at.
     *
     * Observed from a layout effect, which runs after that commit's DOM
     * mutations and before anything passive.
     */
    const seen: string[] = []

    function CommitProbe() {
      useLayoutEffect(() => {
        const field = screen.queryByLabelText('Tap service') as HTMLInputElement | null
        if (field) seen.push(field.value)
      })
      return null
    }

    const tree = (service: string) => (
      <Theme>
        <ActionEditor
          label="Tap"
          value={{ action: 'call-service', service }}
          defaultValue="default"
          onChange={onChange}
        />
        <CommitProbe />
      </Theme>
    )

    const { rerender } = render(tree('light.turn_on'))
    seen.length = 0

    rerender(tree('script.turn_on'))

    // The probe must have run, or this asserts nothing at all.
    expect(seen.length).toBeGreaterThan(0)
    expect(seen).not.toContain('light.turn_on')
    expect(seen).toContain('script.turn_on')
  })

  it('renders its description when given one', () => {
    renderEditor({ description: 'What a tap on the card does.' })
    expect(screen.getByText('What a tap on the card does.')).toBeInTheDocument()
  })
})
