import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useLocationContext } from '../context/LocationContext';
import {
    getActiveSharesForUser,
    getActiveShareBetweenUsers,
    getShareById,
    publishExactLocation,
    deleteExactLocation,
    getPartnerExactLocation,
    subscribeToPartnerLocation,
    subscribeToShareUpdates
} from '../services/liveLocationService';

/**
 * Custom hook to manage Live Location Sharing state, publishing, and partner tracking.
 *
 * Requirements & Behavior:
 * - Uses raw `userLocation` from LocationContext in-memory only (does NOT create duplicate GPS watcher).
 * - Multi-share awareness:
 *   - No active authorized share → NEVER publish exact coords.
 *   - First active authorized share starts → begin publishing loop.
 *   - Last active share ends → stop publishing → delete own live_locations row.
 *   - Multiple active shares → keep publishing single live_locations row.
 *   - One share ends but another remains → keep publishing.
 *   - Ghost Mode or location disabled → stop publishing → delete row regardless of share count.
 *   - Ghost Mode/location re-enabled AND active share exists → resume publishing.
 */
export function useLiveLocation({ currentUserId, partnerId, shareId = null }) {
    const { userLocation, locationEnabled } = useLocationContext();

    const [activeShare, setActiveShare] = useState(null);
    const [partnerLocation, setPartnerLocation] = useState(null);
    const [isGhostMode, setIsGhostMode] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState(0);
    const [activeSharesCount, setActiveSharesCount] = useState(0);

    const publishIntervalRef = useRef(null);
    const timerIntervalRef = useRef(null);

    // 1. Fetch user's Ghost Mode status
    useEffect(() => {
        if (!currentUserId) return;
        let isMounted = true;

        const checkGhostMode = async () => {
            const { data } = await supabase
                .from('profiles')
                .select('visibility_mode')
                .eq('id', currentUserId)
                .maybeSingle();

            if (isMounted) {
                setIsGhostMode(data?.visibility_mode === 'ghost');
            }
        };

        checkGhostMode();

        // Subscribe to profile changes for ghost mode toggles
        const sub = supabase
            .channel(`profile_ghost_check_${currentUserId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${currentUserId}`
                },
                (payload) => {
                    if (isMounted && payload.new) {
                        setIsGhostMode(payload.new.visibility_mode === 'ghost');
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(sub);
        };
    }, [currentUserId]);

    // 2. Fetch Active Shares and current specific share
    const refreshShares = useCallback(async () => {
        if (!currentUserId) return;

        // Fetch all active shares for current user
        const allActive = await getActiveSharesForUser(currentUserId);
        setActiveSharesCount(allActive.length);

        // Fetch target share (by shareId or between currentUserId & partnerId)
        let target = null;
        if (shareId) {
            target = await getShareById(shareId);
        } else if (partnerId) {
            target = await getActiveShareBetweenUsers(currentUserId, partnerId);
        }

        if (target && target.status === 'accepted' && new Date(target.expires_at) > new Date() && !target.revoked_at) {
            setActiveShare(target);
        } else {
            setActiveShare(null);
        }
    }, [currentUserId, partnerId, shareId]);

    useEffect(() => {
        refreshShares();
    }, [refreshShares]);

    // 3. Countdown Timer for active share
    useEffect(() => {
        if (!activeShare?.expires_at) {
            setRemainingSeconds(0);
            return;
        }

        const updateCountdown = () => {
            const expires = new Date(activeShare.expires_at).getTime();
            const now = Date.now();
            const diff = Math.max(0, Math.floor((expires - now) / 1000));
            setRemainingSeconds(diff);

            if (diff === 0) {
                // Share expired
                refreshShares();
            }
        };

        updateCountdown();
        timerIntervalRef.current = setInterval(updateCountdown, 1000);

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [activeShare?.expires_at, refreshShares]);

    // 4. Publishing Loop & Multi-Share Cleanup Logic
    useEffect(() => {
        const canPublish = Boolean(
            currentUserId &&
            locationEnabled &&
            !isGhostMode &&
            activeSharesCount > 0 &&
            userLocation?.latitude != null &&
            userLocation?.longitude != null
        );

        if (canPublish) {
            // Publish immediately
            publishExactLocation(
                currentUserId,
                userLocation.latitude,
                userLocation.longitude,
                userLocation.accuracy || null
            );

            // Repeat every 10 seconds
            publishIntervalRef.current = setInterval(() => {
                if (userLocation?.latitude != null && userLocation?.longitude != null) {
                    publishExactLocation(
                        currentUserId,
                        userLocation.latitude,
                        userLocation.longitude,
                        userLocation.accuracy || null
                    );
                }
            }, 10000);
        } else {
            // Cannot publish (location disabled, ghost mode ON, or 0 active shares)
            if (publishIntervalRef.current) {
                clearInterval(publishIntervalRef.current);
                publishIntervalRef.current = null;
            }

            // Cleanup exact location row if location is disabled, ghost mode ON, or 0 active shares remain
            if (currentUserId && (!locationEnabled || isGhostMode || activeSharesCount === 0)) {
                deleteExactLocation(currentUserId);
            }
        }

        return () => {
            if (publishIntervalRef.current) {
                clearInterval(publishIntervalRef.current);
                publishIntervalRef.current = null;
            }
        };
    }, [currentUserId, locationEnabled, isGhostMode, activeSharesCount, userLocation]);

    // 5. Subscribe to Partner Location & Share Updates
    useEffect(() => {
        if (!partnerId) return;

        let unsubLocation = () => {};
        let unsubShare = () => {};

        // Fetch initial partner location
        getPartnerExactLocation(partnerId).then(loc => {
            setPartnerLocation(loc);
        });

        // Realtime subscription to partner location
        unsubLocation = subscribeToPartnerLocation(partnerId, (newLoc) => {
            setPartnerLocation(newLoc);
        });

        // Realtime subscription to share status updates
        if (activeShare?.id) {
            unsubShare = subscribeToShareUpdates(activeShare.id, (updatedShare) => {
                if (!updatedShare || updatedShare.status !== 'accepted' || updatedShare.revoked_at || new Date(updatedShare.expires_at) <= new Date()) {
                    setActiveShare(null);
                    setPartnerLocation(null);
                } else {
                    setActiveShare(updatedShare);
                }
                refreshShares();
            });
        }

        return () => {
            unsubLocation();
            unsubShare();
        };
    }, [partnerId, activeShare?.id, refreshShares]);

    // Derived states
    const isSharingActive = Boolean(
        activeShare &&
        activeShare.status === 'accepted' &&
        !activeShare.revoked_at &&
        remainingSeconds > 0
    );

    const isPartnerLocationStale = Boolean(
        partnerLocation?.updated_at &&
        (Date.now() - new Date(partnerLocation.updated_at).getTime()) > 60000
    );

    const isPartnerUnavailable = Boolean(
        !partnerLocation || isPartnerLocationStale
    );

    return {
        activeShare,
        isSharingActive,
        partnerLocation,
        isPartnerUnavailable,
        isPartnerLocationStale,
        remainingSeconds,
        activeSharesCount,
        isGhostMode,
        locationEnabled,
        refreshShares
    };
}
