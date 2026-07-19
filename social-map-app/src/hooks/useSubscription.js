/**
 * useSubscription — DEPRECATED / STUB
 *
 * This hook had zero consumers in the codebase and was silently opening
 * a Supabase realtime channel ('schema-db-changes') that was never closed,
 * causing a persistent channel leak in production.
 *
 * Subscription tier data is now read directly from the profile row fetched
 * in the components that need it (e.g. Profile.jsx, PremiumSettings.jsx).
 *
 * This stub is retained so a stale import does not throw a runtime error.
 */
export function useSubscription() {
    return {
        tier: 'free',
        loading: false,
        isSilver: false,
        isGold: false,
        isDiamond: false,
    };
}

