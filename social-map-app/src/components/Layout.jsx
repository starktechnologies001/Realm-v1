import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { supabase } from '../supabaseClient';

export default function Layout() {
    const [friendRequestCount, setFriendRequestCount] = useState(0);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);

    // Heartbeat to update last_active and fetch notification counts
    useEffect(() => {
        let mounted = true;

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

            // Fetch unread message count
            const { count: msgCount } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', session.user.id)
                .eq('is_read', false);
            
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
    }, []);

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
