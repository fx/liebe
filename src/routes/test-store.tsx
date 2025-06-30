import { createFileRoute } from '@tanstack/react-router';
import { Button, Flex, Card, Text, Badge, Separator } from '@radix-ui/themes';
import { useDashboardStore, dashboardActions, useDashboardPersistence } from '../store';

export const Route = createFileRoute('/test-store')({
  component: StoreTestPage,
});

function StoreTestPage() {
  // Enable persistence
  useDashboardPersistence();

  // Subscribe to specific parts of the store
  const mode = useDashboardStore((state) => state.mode);
  const screens = useDashboardStore((state) => state.screens);
  const currentScreenId = useDashboardStore((state) => state.currentScreenId);
  const theme = useDashboardStore((state) => state.theme);
  const isDirty = useDashboardStore((state) => state.isDirty);

  const handleAddScreen = () => {
    const newScreen = {
      id: `screen-${Date.now()}`,
      name: `Screen ${screens.length + 1}`,
      slug: `screen-${screens.length + 1}`,
      type: 'grid' as const,
      grid: {
        resolution: { columns: 12, rows: 8 },
        sections: [],
      },
    };
    dashboardActions.addScreen(newScreen);
    dashboardActions.setCurrentScreen(newScreen.id);
  };

  const handleAddGridItem = () => {
    if (!currentScreenId) return;
    
    const newItem = {
      id: `item-${Date.now()}`,
      entityId: 'light.living_room',
      x: Math.floor(Math.random() * 10),
      y: Math.floor(Math.random() * 6),
      width: 2,
      height: 2,
    };
    // TODO: Update to use sections
    // dashboardActions.addGridItem(currentScreenId, 'section-id', newItem);
  };

  const handleExport = () => {
    const config = dashboardActions.exportConfiguration();
    console.log('Exported configuration:', config);
    alert('Configuration exported to console!');
  };

  const handleReset = () => {
    if (confirm('Reset all state?')) {
      dashboardActions.resetState();
    }
  };

  return (
    <Flex direction="column" gap="4" p="4">
      <Card>
        <Flex direction="column" gap="3">
          <Text size="5" weight="bold">Dashboard State Management Test</Text>
          
          <Flex gap="2" align="center">
            <Text>Mode:</Text>
            <Badge color={mode === 'edit' ? 'orange' : 'blue'}>{mode}</Badge>
            <Button 
              size="1" 
              onClick={() => dashboardActions.setMode(mode === 'view' ? 'edit' : 'view')}
            >
              Toggle Mode
            </Button>
          </Flex>

          <Flex gap="2" align="center">
            <Text>Theme:</Text>
            <Badge>{theme}</Badge>
            <Button size="1" onClick={() => {
              const themes = ['light', 'dark', 'auto'] as const;
              const current = themes.indexOf(theme);
              dashboardActions.setTheme(themes[(current + 1) % 3]);
            }}>
              Cycle Theme
            </Button>
          </Flex>

          <Flex gap="2" align="center">
            <Text>Dirty:</Text>
            <Badge color={isDirty ? 'red' : 'green'}>{isDirty ? 'Yes' : 'No'}</Badge>
          </Flex>

          <Separator size="4" />

          <Flex direction="column" gap="2">
            <Text weight="bold">Screens ({screens.length})</Text>
            {screens.map(screen => (
              <Flex key={screen.id} gap="2" align="center">
                <Text>{screen.name}</Text>
                {currentScreenId === screen.id && <Badge>Current</Badge>}
                <Button 
                  size="1" 
                  variant="ghost"
                  onClick={() => dashboardActions.setCurrentScreen(screen.id)}
                >
                  Select
                </Button>
                <Button 
                  size="1" 
                  variant="ghost" 
                  color="red"
                  onClick={() => dashboardActions.removeScreen(screen.id)}
                >
                  Remove
                </Button>
              </Flex>
            ))}
          </Flex>

          <Separator size="4" />

          <Flex gap="2" wrap="wrap">
            <Button onClick={handleAddScreen}>Add Screen</Button>
            <Button onClick={handleAddGridItem} disabled={!currentScreenId}>
              Add Grid Item
            </Button>
            <Button onClick={handleExport}>Export Config</Button>
            <Button onClick={handleReset} color="red">Reset State</Button>
          </Flex>

          {currentScreenId && (
            <>
              <Separator size="4" />
              <Text weight="bold">Current Screen Grid Items</Text>
              <Card>
                <pre style={{ fontSize: '12px', margin: 0 }}>
                  {JSON.stringify(
                    screens.find(s => s.id === currentScreenId)?.grid?.sections || [],
                    null,
                    2
                  )}
                </pre>
              </Card>
            </>
          )}
        </Flex>
      </Card>
    </Flex>
  );
}