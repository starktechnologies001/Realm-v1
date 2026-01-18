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
        const recoverSession = async () => {
             const userStr = localStorage.getItem('currentUser');
             
             // If local storage is populated, we are good (optimistic)
             if (userStr) {
                 setCheckingAuth(false);
             }

             // Always verify against Supabase (handles OAuth redirect case)
             const { data: { session } } = await supabase.auth.getSession();
             
             if (session?.user) {
                 // Even if we have local storage, sync with real session occasionally?
                 // For OAuth specifically: if local storage is missing, we MUST fetch profile
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
                 setCheckingAuth(false);
             } else {
                 // No session, and maybe no local storage. 
                 // We don't force redirect here to allow public pages if any, 
                 // but since this is Layout for protected routes, we can let child components redirect
                 setCheckingAuth(false);
             }
        };

        recoverSession();
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

            // Fetch unread message count (excluding system messages)
            const { count: msgCount } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', session.user.id)
                .eq('is_read', false)
                .neq('message_type', 'system');
            
            if (mounted) setUnreadMessageCount(msgCount || 0);
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
