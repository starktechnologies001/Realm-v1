// Dedicated lightweight BroadcastChannel utility for cross-component map events.
// Decouples Chat, Profile, and other pages from importing MapHome directly.

export const mapEventChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('map_events')
    : null;
