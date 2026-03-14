import { useEffect, useState } from 'react';

// Interval to check for new versions (every 5 minutes)
const POLLING_INTERVAL = 5 * 60 * 1000; 

export function useVersionCheck() {
  const [currentVersion, setCurrentVersion] = useState(null);

  useEffect(() => {
    let checkInterval;

    const fetchVersion = async () => {
      try {
        // Appending timestamp to strictly bypass browser cache
        const response = await fetch(`/version.json?t=${new Date().getTime()}`, {
          cache: 'no-store'
        });
        
        if (!response.ok) return;

        const data = await response.json();
        const serverVersion = data.version;

        if (!serverVersion) return;

        if (currentVersion === null) {
          // Initial load: just set the current running version
          setCurrentVersion(serverVersion);
        } else if (currentVersion !== serverVersion) {
            console.log(`Update detected: ${currentVersion} -> ${serverVersion}. Triggering app refresh...`);
            // Set flag to prevent intercept loops, then hard reload
            sessionStorage.setItem('vite-preload-error-hard-reload', 'true');
            window.location.reload(true);
        }
      } catch (error) {
        // Ignore network errors (offline mode or general fetch failures)
        console.debug('Failed to check app version:', error);
      }
    };

    // Initial check
    fetchVersion();

    // Set polling interval
    checkInterval = setInterval(fetchVersion, POLLING_INTERVAL);

    // Also check when window regains focus (user switches back to the app)
    const handleFocus = () => fetchVersion();
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(checkInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentVersion]);
}
