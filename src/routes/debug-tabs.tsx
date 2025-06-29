import { createFileRoute } from '@tanstack/react-router';
import { ViewTabsDebug } from '~/components/ViewTabs.debug';

export const Route = createFileRoute('/debug-tabs')({
  component: ViewTabsDebug,
});