import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { supabase } from '../supabaseClient';

export default function Layout() {
    // Heartbeat to update last_active
    useEffect(() => {
        const updatePresence = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await supabase.from('profiles')
                    .update({ last_active: new Date() })
                    .eq('id', session.user.id);
            }
        };

        // Initial update
        updatePresence();

        // Update every 1 minute
        const interval = setInterval(updatePresence, 60000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ paddingBottom: 60 }}> {/* Pad content to not be hidden by nav */}
            <Outlet />
            <BottomNav />
        </div>
    );
}
