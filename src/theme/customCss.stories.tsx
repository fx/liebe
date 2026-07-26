import { useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, Box, Callout, Code, Flex, Heading, Table, Text, TextArea } from '@radix-ui/themes'
import { LiebeThemeProvider } from '~/components/LiebeThemeProvider'
import { GridCard } from '~/components/GridCard'
import { sanitizeCustomCss } from './customCss'

/**
 * Custom CSS: the `liebe-user` layer, live.
 *
 * The workshop drives the same provider the panel does, so the CSS typed here
 * goes through exactly the sanitizer and the injection the dashboard uses —
 * this is the engine, not a demonstration of it.
 */
const meta: Meta = {
  title: 'Design System/Custom CSS',
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

/** The token whose value the override is about. */
const OVERRIDDEN_TOKEN = '--liebe-card-radius'

/** Reads a token off a live element, so the table shows the resolved cascade. */
function useResolvedToken(name: string) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState('')

  // No dependency list: the value changes when the injected user layer changes,
  // which is a DOM event this component never re-renders for. Bailing out when
  // nothing changed is what keeps that from looping.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const resolved = getComputedStyle(element).getPropertyValue(name).trim()
    setValue((current) => (current === resolved ? current : resolved))
  })

  return { ref, value }
}

function Sample({ label }: { label: string }) {
  const { ref, value } = useResolvedToken(OVERRIDDEN_TOKEN)

  return (
    <Box ref={ref} style={{ flex: 1, minWidth: 0 }}>
      <Flex align="center" gap="2" mb="2">
        <Text size="2" weight="medium">
          {label}
        </Text>
        <Badge variant="outline">
          <Code size="1">
            {OVERRIDDEN_TOKEN}: {value || '—'}
          </Code>
        </Badge>
      </Flex>
      <GridCard domain="light" size="medium">
        <Text size="2">A card wearing the resolved token.</Text>
      </GridCard>
    </Box>
  )
}

/**
 * A user token override winning over the active theme.
 *
 * Toggle `override` and watch the resolved value change: the theme declares
 * `--liebe-card-radius` on the very element the user rule targets, and the user
 * rule wins anyway. That is the whole reason the engine uses cascade layers
 * rather than source order — `liebe-user` comes last, whatever the theme's
 * selector was.
 *
 * One provider rather than two panes side by side, deliberately: the user layer
 * is one `<style>` per root, so two providers in this document would contend
 * for the same element and the "before" pane would silently wear the override
 * too. The panel gives each root its own layer because it *has* one root.
 */
export const UserOverrideBeatsTheme: Story = {
  args: { override: true },
  argTypes: {
    override: { name: 'user override', control: 'boolean' },
  },
  render: ({ override }: { override?: boolean }) => (
    <LiebeThemeProvider customCss={override ? `.liebe-root { ${OVERRIDDEN_TOKEN}: 0px; }` : ''}>
      <Sample label={override ? 'Theme + user CSS' : 'Theme only'} />
    </LiebeThemeProvider>
  ),
}

/** What the editor would say about a given sheet, rule by rule. */
function SanitizerReport({ css }: { css: string }) {
  const { notices, rejected } = sanitizeCustomCss(css)

  if (notices.length === 0) {
    return (
      <Callout.Root color="green" size="1">
        <Callout.Text>Applied whole.</Callout.Text>
      </Callout.Root>
    )
  }

  return (
    <Callout.Root color={rejected ? 'red' : 'orange'} size="1">
      <Callout.Text>
        {notices.map((notice) => (
          <Text as="p" key={notice} size="1">
            {notice}
          </Text>
        ))}
      </Callout.Text>
    </Callout.Root>
  )
}

const VECTORS: Array<[string, string]> = [
  ['A local token override', '.liebe-root { --liebe-card-radius: 0; }'],
  ['A remote stylesheet', '@import url(https://example.com/theme.css);'],
  ['A remote image', '.liebe-card { background-image: url(//example.com/bg.png); }'],
  ['An escaped remote image', '.liebe-card { background-image: url(\\/\\/example.com/bg.png); }'],
  ['Laundering through a token', '.liebe-root { --liebe-card-bg: var(--ha-card-background); }'],
  ['A value inherited from Home Assistant', '.liebe-card { background-image: inherit; }'],
]

/**
 * The sanitizer's verdicts, side by side.
 *
 * Everything stripped is named — the spec forbids dropping anything silently,
 * because a user who cannot see what happened to their CSS will assume the
 * engine is broken.
 */
export const SanitizerVerdicts: Story = {
  render: () => (
    <Table.Root size="1" variant="ghost">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>Input</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>CSS</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell>Verdict</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {VECTORS.map(([label, css]) => (
          <Table.Row key={label}>
            <Table.RowHeaderCell>{label}</Table.RowHeaderCell>
            <Table.Cell>
              <Code size="1">{css}</Code>
            </Table.Cell>
            <Table.Cell>
              <SanitizerReport css={css} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  ),
}

/** Type CSS and watch the panel take it — or say why it did not. */
export const Playground: Story = {
  render: function Playground() {
    const [css, setCss] = useState(`.liebe-root {\n  ${OVERRIDDEN_TOKEN}: 0px;\n}`)

    return (
      <Flex direction={{ initial: 'column', md: 'row' }} gap="5" align="start">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Heading as="h3" size="3" mb="2">
            Custom CSS
          </Heading>
          <TextArea
            aria-label="Custom CSS"
            rows={10}
            value={css}
            onChange={(event) => setCss(event.target.value)}
            style={{ fontFamily: 'var(--code-font-family)' }}
          />
          <Box mt="2">
            <SanitizerReport css={css} />
          </Box>
        </Box>
        <LiebeThemeProvider customCss={css}>
          <Sample label="Result" />
        </LiebeThemeProvider>
      </Flex>
    )
  },
}
