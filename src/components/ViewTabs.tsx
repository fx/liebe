import { Tabs, Button, Flex, IconButton, ScrollArea, DropdownMenu } from '@radix-ui/themes';
import { Cross2Icon, PlusIcon, HamburgerMenuIcon } from '@radix-ui/react-icons';
import { useDashboardStore, dashboardActions } from '../store';
import type { ScreenConfig } from '../store/types';
import { useEffect, useState } from 'react';

interface ViewTabsProps {
  onAddView?: () => void;
}

export function ViewTabs({ onAddView }: ViewTabsProps) {
  const screens = useDashboardStore((state) => state.screens);
  const currentScreenId = useDashboardStore((state) => state.currentScreenId);
  const mode = useDashboardStore((state) => state.mode);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleTabChange = (value: string) => {
    dashboardActions.setCurrentScreen(value);
  };

  const handleRemoveView = (screenId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    dashboardActions.removeScreen(screenId);
  };

  const renderScreenTabs = (screenList: ScreenConfig[], level = 0): React.ReactNode => {
    return screenList.map((screen) => [
      <Tabs.Trigger key={screen.id} value={screen.id} style={{ paddingLeft: `${level * 20}px` }}>
        <Flex align="center" gap="2">
          <span>{screen.name}</span>
          {mode === 'edit' && screens.length > 1 && (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={(e) => handleRemoveView(screen.id, e)}
            >
              <Cross2Icon />
            </IconButton>
          )}
        </Flex>
      </Tabs.Trigger>,
      ...(screen.children ? renderScreenTabs(screen.children, level + 1) : [])
    ]).flat();
  };

  if (screens.length === 0) {
    return (
      <Flex align="center" justify="center" p="4">
        <Button onClick={onAddView} variant="soft">
          <PlusIcon />
          Add First View
        </Button>
      </Flex>
    );
  }

  const renderDropdownItems = (screenList: ScreenConfig[], level = 0): React.ReactNode => {
    return screenList.map((screen) => (
      <DropdownMenu.Sub key={screen.id}>
        <DropdownMenu.Item
          onSelect={() => handleTabChange(screen.id)}
          style={{ paddingLeft: `${20 + level * 20}px` }}
        >
          {screen.name}
          {currentScreenId === screen.id && ' ✓'}
        </DropdownMenu.Item>
        {screen.children && screen.children.length > 0 && renderDropdownItems(screen.children, level + 1)}
      </DropdownMenu.Sub>
    ));
  };

  const currentScreenName = screens.find(s => s.id === currentScreenId)?.name || 'Select View';

  if (isMobile) {
    return (
      <Flex align="center" gap="2" p="2" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button variant="soft" size="2">
              <HamburgerMenuIcon />
              {currentScreenName}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {renderDropdownItems(screens)}
            {mode === 'edit' && (
              <>
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={() => onAddView?.()}>
                  <PlusIcon />
                  Add New View
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    );
  }

  return (
    <Tabs.Root
      value={currentScreenId || undefined}
      onValueChange={handleTabChange}
    >
      <Flex align="center" gap="2" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
        <ScrollArea type="hover" scrollbars="horizontal" style={{ flex: 1 }}>
          <Tabs.List>
            {renderScreenTabs(screens)}
          </Tabs.List>
        </ScrollArea>
        {mode === 'edit' && (
          <IconButton
            size="2"
            variant="soft"
            onClick={onAddView}
            style={{ marginRight: '8px' }}
          >
            <PlusIcon />
          </IconButton>
        )}
      </Flex>
    </Tabs.Root>
  );
}