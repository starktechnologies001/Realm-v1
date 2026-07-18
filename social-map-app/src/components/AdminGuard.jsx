import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function AdminGuard() {
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkAdminStatus = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                
                if (!session) {
                    setIsAdmin(false);
                    setLoading(false);
                    return;
                }

                // Check profile for is_admin flag
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching admin status:', error);
                    setIsAdmin(false);
                } else {
                    const adminStatus = profile?.is_admin === true;
                    setIsAdmin(adminStatus);
                    if (!adminStatus && session?.user) {
                        console.warn(`[SECURITY] Unauthorized admin access attempt by user: ${session.user.id}`);
                        // Optionally log to backend if an RPC is available, e.g.:
                        // supabase.rpc('log_security_event', { user_id: session.user.id, event: 'unauthorized_admin_access' })
                    }
                }
            } catch (err) {
                console.error('Admin check failed:', err);
                setIsAdmin(false);
            } finally {
                setLoading(false);
            }
        };

        checkAdminStatus();
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-color, #fff)' }}>
                <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(0,0,0,0.1)', borderTop: '3px solid var(--brand-blue, #0084ff)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
            </div>
        );
    }

    if (!isAdmin) {
        // Redirect unauthorized users to map or login
        return <Navigate to="/map" replace />;
    }

    return <Outlet />;
}
