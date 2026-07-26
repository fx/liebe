import { useMemo, useState } from 'react'
import { Callout, Code, Link, Modal, Text, TextArea } from '~/components/ui'
import { ExclamationTriangleIcon, InfoCircledIcon } from '@radix-ui/react-icons'
import { sanitizeCustomCss } from '~/theme/customCss'
import './CustomCssDialog.css'
import { dashboardActions, useDashboardStore } from '~/store/dashboardStore'

export interface CustomCssDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The custom-CSS editor.
 *
 * Mounted only while open, which is what seeds the draft: the editor starts
 * from the saved CSS every time it is opened, so a cancelled edit is discarded
 * and a configuration imported meanwhile is what gets edited — without an
 * effect that writes state back on every render of the menu around it.
 */
export function CustomCssDialog({ open, onOpenChange }: CustomCssDialogProps) {
  const customCss = useDashboardStore((state) => state.theme.customCss)

  return open ? <CustomCssEditor savedCss={customCss} onOpenChange={onOpenChange} /> : null
}

/**
 * A plain textarea is the specified baseline (docs/specs/theming —
 * "Configuration & selection"); what it owes beyond that is honesty. The
 * sanitizer runs on every keystroke against exactly the text that would be
 * injected, so what the notices say was removed is what the panel will actually
 * drop — the editor never reports on a different string than the engine
 * applies. It is a preview of a decision already made elsewhere, not a
 * gatekeeper: nothing here can let unclean CSS through, because the injection
 * point sanitizes again.
 *
 * Saving is explicit. Custom CSS is a portable field and every keystroke would
 * otherwise be a dirty configuration mid-thought, auto-saved to localStorage
 * and re-injected on each character.
 */
function CustomCssEditor({
  savedCss,
  onOpenChange,
}: {
  savedCss: string
  onOpenChange: (open: boolean) => void
}) {
  const [draft, setDraft] = useState(savedCss)

  const { notices, rejected } = useMemo(() => sanitizeCustomCss(draft), [draft])

  const save = () => {
    dashboardActions.setTheme({ customCss: draft })
    onOpenChange(false)
  }

  return (
    <Modal
      open
      onOpenChange={onOpenChange}
      title="Custom CSS"
      description="Applied last, after the active theme, so it wins on any token it sets."
      size="large"
      actions={{
        primary: { label: 'Save', onClick: save },
        showCancel: true,
      }}
    >
      <TextArea
        aria-label="Custom CSS"
        placeholder={'.liebe-root {\n  --liebe-card-radius: 4px;\n}'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={14}
        className="liebe-css-editor"
      />

      <Callout.Root color="gray" mt="3">
        <Callout.Icon>
          <InfoCircledIcon />
        </Callout.Icon>
        <Callout.Text>
          Target <Code>.liebe-root</Code> for tokens and the anatomy classes (
          <Code>.liebe-card</Code>, <Code>.liebe-icon</Code>, …) for parts. Everything the panel
          loads has to come from this dashboard: remote stylesheets, remote images and fonts are
          removed, as is anything whose value would come from outside — <Code>inherit</Code>,{' '}
          <Code>all</Code>, and <Code>var()</Code> references other than <Code>--liebe-*</Code>{' '}
          tokens and properties you define here. See the{' '}
          <Link href="https://github.com/fx/liebe/blob/main/docs/specs/theming/index.md">
            theming spec
          </Link>{' '}
          for the token contract.
        </Callout.Text>
      </Callout.Root>

      {notices.length > 0 && (
        <Callout.Root color={rejected ? 'red' : 'orange'} mt="3">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            <Text as="p" size="2" weight="medium" mb="1">
              {rejected ? 'This CSS cannot be applied' : 'Some of this CSS will not be applied'}
            </Text>
            {notices.map((notice) => (
              <Text as="p" key={notice} size="2">
                {notice}
              </Text>
            ))}
          </Callout.Text>
        </Callout.Root>
      )}
    </Modal>
  )
}
