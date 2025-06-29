import { useState } from 'react';
import { Box, Flex, Card, Text, Button, Badge } from '@radix-ui/themes';
import { ViewTabs } from './ViewTabs';
import { AddViewDialog } from './AddViewDialog';
import { useDashboardStore, dashboardActions, useDashboardPersistence } from '../store';

export function Dashboard() {
  const [addViewOpen, setAddViewOpen] = useState(false);
  
  // Enable persistence
  useDashboardPersistence();
  
  const mode = useDashboardStore((state) => state.mode);
  const currentScreenId = useDashboardStore((state) => state.currentScreenId);
  const screens = useDashboardStore((state) => state.screens);
  
  // Helper function to find screen in tree structure
  const findScreenById = (screenList: typeof screens, id: string): typeof screens[0] | undefined => {
    for (const screen of screenList) {
      if (screen.id === id) return screen;
      if (screen.children) {
        const found = findScreenById(screen.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };
  
  const currentScreen = currentScreenId ? findScreenById(screens, currentScreenId) : undefined;

  const handleToggleMode = () => {
    dashboardActions.setMode(mode === 'view' ? 'edit' : 'view');
  };

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Flex
        p="3"
        align="center"
        justify="between"
        style={{ borderBottom: '1px solid var(--gray-a5)' }}
      >
        <Flex align="center" gap="3">
          <Text size="5" weight="bold">Liebe Dashboard</Text>
          <Badge color={mode === 'edit' ? 'orange' : 'blue'} size="2">
            {mode} mode
          </Badge>
        </Flex>
        <Button
          variant="soft"
          onClick={handleToggleMode}
        >
          {mode === 'view' ? 'Edit' : 'Done'}
        </Button>
      </Flex>

      {/* View Tabs */}
      <ViewTabs onAddView={() => setAddViewOpen(true)} />

      {/* Main Content Area */}
      <Box style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {currentScreen ? (
          <Card>
            <Flex direction="column" gap="3">
              <Text size="4" weight="bold">{currentScreen.name}</Text>
              <Text color="gray">
                Grid: {currentScreen.grid?.resolution.columns} × {currentScreen.grid?.resolution.rows}
              </Text>
              {currentScreen.grid?.items.length === 0 && (
                <Text color="gray" size="2">
                  No entities added yet. {mode === 'edit' && 'Add entities to start building your dashboard.'}
                </Text>
              )}
            </Flex>
          </Card>
        ) : (
          <Flex align="center" justify="center" style={{ height: '100%' }}>
            <Card>
              <Flex direction="column" align="center" gap="3" p="4">
                <Text size="3" color="gray">No views created yet</Text>
                <Button onClick={() => setAddViewOpen(true)}>
                  Create Your First View
                </Button>
              </Flex>
            </Card>
          </Flex>
        )}
      </Box>

      {/* Add View Dialog */}
      <AddViewDialog
        open={addViewOpen}
        onOpenChange={setAddViewOpen}
      />
    </Box>
  );
}