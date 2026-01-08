/**
 * Network connectivity detection utilities
 */

/**
 * Check if browser is online
 */
export const isOnline = () => {
  return navigator.onLine;
};

/**
 * Setup network event listeners
 * @param {Function} onOnline - Callback when network comes online
 * @param {Function} onOffline - Callback when network goes offline
 * @returns {Function} Cleanup function
 */
export const setupNetworkListeners = (onOnline, onOffline) => {
  const handleOnline = () => {
    console.log('🟢 Network: ONLINE');
    if (onOnline) onOnline();
  };

  const handleOffline = () => {
    console.log('🔴 Network: OFFLINE');
    if (onOffline) onOffline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

/**
 * Test actual internet connectivity (not just network interface)
 * @returns {Promise<boolean>} True if connected to internet
 */
export const testConnectivity = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch('https://www.google.com/favicon.ico', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return true;
  } catch (error) {
    console.warn('Connectivity test failed:', error.message);
    return false;
  }
};

/**
 * Get network information if available
 */
export const getNetworkInfo = () => {
  if ('connection' in navigator) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData
    };
  }
  return null;
};
