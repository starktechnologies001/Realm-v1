import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export function useSubscription() {
    const [tier, setTier] = useState('free');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSubscription = async () => {
            try {
                // First try to get it from localStorage for instant load
                const cachedUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
                if (cachedUser && cachedUser.subscription_tier) {
                    setTier(cachedUser.subscription_tier);
                }

                // Then verify against the database
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) {
                    setLoading(false);
                    return;
                }

                // Run the background subscription expiry cleanup first
                await supabase.rpc('check_and_expire_subscriptions');

                // Actually fetch from profiles to get the latest synced tier
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('subscription_tier')
                    .eq('id', session.user.id)
                    .single();

                if (!error && profile?.subscription_tier) {
                    setTier(profile.subscription_tier);
                    
                    // Update local storage
                    if (cachedUser) {
                        cachedUser.subscription_tier = profile.subscription_tier;
                        localStorage.setItem('currentUser', JSON.stringify(cachedUser));
                    }
                }
            } catch (err) {
                console.error("Error fetching subscription:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchSubscription();

        // Optional: Setup a realtime listener on the user's profile to instantly update UI upon payment
        const channel = supabase.channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    const sessionUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
                    if (sessionUser && payload.new.id === sessionUser.id) {
                        if (payload.new.subscription_tier && payload.new.subscription_tier !== tier) {
                            setTier(payload.new.subscription_tier);
                            sessionUser.subscription_tier = payload.new.subscription_tier;
                            localStorage.setItem('currentUser', JSON.stringify(sessionUser));
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [tier]);

    const isSilver = tier === 'silver' || tier === 'gold' || tier === 'diamond';
    const isGold = tier === 'gold' || tier === 'diamond';
    const isDiamond = tier === 'diamond';

    return {
        tier,
        loading,
        isSilver,
        isGold,
        isDiamond
    };
}
