import { useEffect } from 'react';
import { useRouter } from '@tanstack/react-router';

/**
 * Hook to sync routing between the dashboard and Home Assistant parent window
 * This enables proper URL updates when navigating within the custom panel
 */
export function useHomeAssistantRouting() {
  const router = useRouter();

  useEffect(() => {
    // Check if we're running inside Home Assistant (either in iframe or custom panel)
    const isInHomeAssistant = window.location.pathname.includes('/liebe') || 
                              window.location.pathname.includes('/liebe-dev');
    
    if (!isInHomeAssistant) return;
    
    // Check if we need to sync initial route from parent URL
    if (window.parent !== window) {
      // We're in an iframe, check parent URL
      try {
        // Extract route from parent URL if available
        const parentPath = window.location.pathname;
        const match = parentPath.match(/\/liebe-dev(\/.*)?$/);
        if (match && match[1] && match[1] !== '/') {
          console.log('Syncing initial route from parent URL:', match[1]);
          router.navigate({ to: match[1] as any });
        }
      } catch (e) {
        console.debug('Could not read parent URL:', e);
      }
    }

    // Listen for route changes and notify parent window
    const unsubscribe = router.subscribe('onResolved', () => {
      const currentPath = router.state.location.pathname;
      
      // If we're in an iframe (development mode), send message to parent
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'route-change',
          path: currentPath,
        }, '*');
      }
      
      // Always dispatch event for custom panel integration
      window.dispatchEvent(new CustomEvent('liebe-route-change', {
        detail: { path: currentPath }
      }));
    });

    // Listen for navigation requests from parent window or custom panel
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'navigate-to') {
        router.navigate({ to: event.data.path });
      }
    };
    
    // Listen for navigation from custom panel element
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.path) {
        router.navigate({ to: customEvent.detail.path });
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('liebe-navigate', handleNavigate);

    return () => {
      unsubscribe();
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('liebe-navigate', handleNavigate);
    };
  }, [router]);
}

// Extend Window interface to include hassConnection
declare global {
  interface Window {
    hassConnection?: any;
  }
}