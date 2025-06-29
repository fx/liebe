import { ViewTabs } from './ViewTabs';
import { dashboardStore, dashboardActions } from '../store';
import { useEffect } from 'react';
import { useNavigate, useRouter, useLocation } from '@tanstack/react-router';

export function ViewTabsDebug() {
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();

  useEffect(() => {
    // Add test screens
    const screens = [
      {
        id: 'debug-1',
        name: 'Debug Screen 1',
        type: 'grid' as const,
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
      {
        id: 'debug-2',
        name: 'Debug Screen 2',
        type: 'grid' as const,
        grid: { resolution: { columns: 12, rows: 8 }, sections: [] },
      },
    ];
    
    dashboardActions.resetState();
    screens.forEach(screen => dashboardActions.addScreen(screen));
    dashboardActions.setCurrentScreen('debug-1');
  }, []);

  const handleManualNavigate = (screenId: string) => {
    console.log('Manual navigate to:', screenId);
    navigate({ to: '/screen/$screenId', params: { screenId } });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>ViewTabs Debug</h2>
      <div style={{ marginBottom: '20px' }}>
        <p>Current location: {location.pathname}</p>
        <p>Current screen ID: {dashboardStore.state.currentScreenId}</p>
        <p>Number of screens: {dashboardStore.state.screens.length}</p>
      </div>
      
      <div style={{ marginBottom: '20px' }}>
        <h3>Manual Navigation Buttons:</h3>
        <button onClick={() => handleManualNavigate('debug-1')}>Go to Debug 1</button>
        <button onClick={() => handleManualNavigate('debug-2')}>Go to Debug 2</button>
      </div>
      
      <div style={{ border: '1px solid #ccc', padding: '10px' }}>
        <h3>ViewTabs Component:</h3>
        <ViewTabs />
      </div>
    </div>
  );
}