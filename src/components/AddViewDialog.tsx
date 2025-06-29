import { useState } from 'react';
import { Dialog, Button, TextField, Flex, Text, Select } from '@radix-ui/themes';
import { dashboardActions, useDashboardStore } from '../store';
import type { ScreenConfig } from '../store/types';
import { useNavigate } from '@tanstack/react-router';

interface AddViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddViewDialog({ open, onOpenChange }: AddViewDialogProps) {
  const screens = useDashboardStore((state) => state.screens);
  const [viewName, setViewName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!viewName.trim()) return;

    const newScreen: ScreenConfig = {
      id: `screen-${Date.now()}`,
      name: viewName.trim(),
      type: 'grid',
      grid: {
        resolution: { columns: 12, rows: 8 },
        sections: [],
      },
    };

    dashboardActions.addScreen(newScreen, parentId && parentId !== 'none' ? parentId : undefined);
    
    // Navigate to the new screen
    navigate({ to: '/screen/$screenId', params: { screenId: newScreen.id } });
    
    setViewName('');
    setParentId('');
    onOpenChange(false);
  };

  const getScreenOptions = (screenList: ScreenConfig[], prefix = ''): React.ReactElement[] => {
    const options: React.ReactElement[] = [];
    
    screenList.forEach((screen) => {
      options.push(
        <Select.Item key={screen.id} value={screen.id}>
          {prefix}{screen.name}
        </Select.Item>
      );
      
      if (screen.children) {
        options.push(...getScreenOptions(screen.children, `${prefix}  `));
      }
    });
    
    return options;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: 450 }}>
        <Dialog.Title>Add New View</Dialog.Title>
        <Dialog.Description size="2" mb="4">
          Create a new view to organize your dashboard
        </Dialog.Description>

        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <label>
              <Text as="div" size="2" mb="1" weight="bold">
                View Name
              </Text>
              <TextField.Root
                placeholder="Living Room"
                value={viewName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setViewName(e.target.value)}
                autoFocus
              />
            </label>

            {screens.length > 0 && (
              <label>
                <Text as="div" size="2" mb="1" weight="bold">
                  Parent View (Optional)
                </Text>
                <Select.Root value={parentId} onValueChange={setParentId}>
                  <Select.Trigger placeholder="Select parent view..." />
                  <Select.Content>
                    <Select.Item value="none">
                      <em>None (Top Level)</em>
                    </Select.Item>
                    {getScreenOptions(screens)}
                  </Select.Content>
                </Select.Root>
              </label>
            )}
          </Flex>

          <Flex gap="3" mt="4" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={!viewName.trim()}>
              Add View
            </Button>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}