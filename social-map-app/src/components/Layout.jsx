import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { supabase } from '../supabaseClient';

export default function Layout() {
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [friendRequestCount, setFriendRequestCount] = useState(0);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);

    // Initial Auth Check & Session Recovery
    useEffect(() => {
        let mounted = true;

        const syncProfile = async (session) => {
            if (!session?.user) return;
            
            // Check if we already have the user in local storage to avoid extra fetch
            const userStr = localStorage.getItem('currentUser');
            // But for OAuth, the local storage might be empty on first login
            if (!userStr) {
                console.log("Recovering session from Supabase...");
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                 
                if (profile) {
                    const recoveredUser = {
                        id: profile.id,
                        name: profile.username || profile.full_name,
                        username: profile.username,
                        full_name: profile.full_name,
                        gender: profile.gender,
                        avatar_url: profile.avatar_url,
                        status: profile.status || 'Online',
                        interests: profile.interests
                    };
                    localStorage.setItem('currentUser', JSON.stringify(recoveredUser));
                }
            }
        };

        const initAuth = async () => {
             // 1. Get initial session
             const { data: { session } } = await supabase.auth.getSession();
             if (mounted) {
                 if (session) {
                     await syncProfile(session);
                     setCheckingAuth(false);
                 } else if (!window.location.hash.includes('access_token') && !window.location.hash.includes('type=recovery')) {
                     // Only stop checking if we are NOT expecting a hash-based login (OAuth or Recovery)
                     setCheckingAuth(false);
                 }
             }
        };

        initAuth();

        // 2. Listen for auth changes (Handles OAuth Redirects)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
             if (mounted) {
                 if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                     if (session) {
                         await syncProfile(session);
                         setCheckingAuth(false);
                     }
                 } else if (event === 'SIGNED_OUT') {
                     // Optional: clear local storage
                     // localStorage.removeItem('currentUser'); // Let MapHome handle redirect logic
                     setCheckingAuth(false);
                 }
             }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    // Heartbeat to update last_active and fetch notification counts
    useEffect(() => {
        let mounted = true;

        if (checkingAuth) return; // Wait for auth check

        const updatePresence = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await supabase.from('profiles')
                    .update({ last_active: new Date() })
                    .eq('id', session.user.id);
            }
        };

        const fetchNotificationCounts = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            // Fetch friend request count
            const { count: friendCount } = await supabase
                .from('friendships')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', session.user.id)
                .eq('status', 'pending');
            
            if (mounted) setFriendRequestCount(friendCount || 0);

            // Fetch unread messages to count unique conversations (senders)
            const { data: unreadMsgs } = await supabase
                .from('messages')
                .select('sender_id, deleted_for')
                .eq('receiver_id', session.user.id)
                .eq('is_read', false)
                .neq('message_type', 'system');
            
            if (mounted && unreadMsgs) {
                // 1. Filter out deleted messages
                const activeUnread = unreadMsgs.filter(msg => 
                    !msg.deleted_for || !msg.deleted_for.includes(session.user.id)
                );
                
                // 2. Count unique senders (Conversations)
                const uniqueSenders = new Set(activeUnread.map(m => m.sender_id));
                setUnreadMessageCount(uniqueSenders.size);
            }
        };

        // Initial updates
        updatePresence();
        fetchNotificationCounts();

        // Realtime Subscription for Badges
        const channel = supabase.channel('layout_notifications')
            // Listen for new messages
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
                 fetchNotificationCounts(); // Refresh counts
            })
            // Listen for read status updates
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
                 fetchNotificationCounts();
            })
            // Listen for friend requests (Any change to friendships involving me)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
                 fetchNotificationCounts();
            })
            .subscribe();

        // Update presence every 1 minute
        const interval = setInterval(updatePresence, 60000);

        return () => {
            mounted = false;
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [checkingAuth]);

    if (checkingAuth) {
        return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121212', color: '#fff'}}>Loading...</div>;
    }

    return (
        <div style={{ paddingBottom: 60 }}> {/* Pad content to not be hidden by nav */}
            <Outlet />
            <BottomNav 
                friendRequestCount={friendRequestCount}
                unreadMessageCount={unreadMessageCount}
            />
        </div>
    );
}
