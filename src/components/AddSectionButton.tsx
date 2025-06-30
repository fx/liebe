import { useState } from 'react'
import { Button, Dialog, TextField, Flex, Text, Select } from '@radix-ui/themes'
import { PlusIcon } from '@radix-ui/react-icons'
import { dashboardActions } from '../store'
import type { SectionConfig } from '../store/types'

interface AddSectionButtonProps {
  screenId: string
  existingSectionsCount: number
}

export function AddSectionButton({ screenId, existingSectionsCount }: AddSectionButtonProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState<SectionConfig['width']>('full')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) return

    const newSection: SectionConfig = {
      id: `section-${Date.now()}`,
      title: title.trim(),
      order: existingSectionsCount,
      width,
      collapsed: false,
      items: [],
    }

    dashboardActions.addSection(screenId, newSection)

    setTitle('')
    setWidth('full')
    setOpen(false)
  }

  return (
    <>
      <Button size="3" onClick={() => setOpen(true)}>
        <PlusIcon />
        Add Section
      </Button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content style={{ maxWidth: 450 }}>
          <Dialog.Title>Add New Section</Dialog.Title>
          <Dialog.Description size="2" mb="4">
            Create a section to organize your entities
          </Dialog.Description>

          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="3">
              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  Section Title
                </Text>
                <TextField.Root
                  placeholder="Living Room Lights"
                  value={title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                  autoFocus
                />
              </label>

              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  Section Width
                </Text>
                <Select.Root
                  value={width}
                  onValueChange={(value) => setWidth(value as SectionConfig['width'])}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="full">Full Width</Select.Item>
                    <Select.Item value="half">Half Width</Select.Item>
                    <Select.Item value="third">One Third</Select.Item>
                    <Select.Item value="quarter">One Quarter</Select.Item>
                  </Select.Content>
                </Select.Root>
              </label>
            </Flex>

            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={!title.trim()}>
                Add Section
              </Button>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
