import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        premiumUsers: 0,
        pendingReports: 0,
        resolvedReports: 0,
        bannedUsers: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Efficiently fetch counts using head requests
                const queries = [
                    supabase.from('profiles').select('id', { count: 'exact', head: true }),
                    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_premium', true),
                    // We handle missing columns gracefully by doing normal queries for reports and catching errors
                ];

                const [usersRes, premiumRes] = await Promise.all(queries);

                // For reports and bans, we use normal queries since the schema might not be fully migrated yet
                let pendingReports = 0, resolvedReports = 0, bannedUsers = 0;

                try {
                    const { count: bCount } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('account_status', 'banned');
                    bannedUsers = bCount || 0;
                } catch (e) { /* ignore if column doesn't exist */ }

                try {
                    const { count: pCount } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending');
                    pendingReports = pCount || 0;
                } catch (e) { /* ignore */ }

                try {
                    const { count: rCount } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved');
                    resolvedReports = rCount || 0;
                } catch (e) { /* ignore */ }

                setStats({
                    totalUsers: usersRes.count || 0,
                    premiumUsers: premiumRes.count || 0,
                    pendingReports,
                    resolvedReports,
                    bannedUsers
                });
            } catch (err) {
                console.error("Failed to fetch dashboard stats", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) return <div>Loading dashboard...</div>;

    return (
        <div>
            <h2 style={{ marginBottom: '24px' }}>Overview</h2>
            <div className="admin-stats-grid">
                <div className="stat-card">
                    <span className="stat-title">Total Users</span>
                    <span className="stat-value">{stats.totalUsers}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-title">Premium Users</span>
                    <span className="stat-value">{stats.premiumUsers}</span>
                </div>
                <div className="stat-card" style={{ borderColor: stats.pendingReports > 0 ? '#fecaca' : '#f3f4f6' }}>
                    <span className="stat-title" style={{ color: stats.pendingReports > 0 ? '#ef4444' : '#6b7280' }}>
                        Pending Reports
                    </span>
                    <span className="stat-value" style={{ color: stats.pendingReports > 0 ? '#dc2626' : '#111827' }}>
                        {stats.pendingReports}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="stat-title">Resolved Reports</span>
                    <span className="stat-value">{stats.resolvedReports}</span>
                </div>
                <div className="stat-card">
                    <span className="stat-title">Banned Users</span>
                    <span className="stat-value">{stats.bannedUsers}</span>
                </div>
            </div>
            
            <div className="admin-table-container" style={{ padding: '24px', color: '#6b7280' }}>
                <p>Welcome to the Nearo Moderation Dashboard.</p>
                <p style={{ marginTop: '8px' }}>Use the sidebar to manage reports, moderate users, and review the audit logs.</p>
            </div>
        </div>
    );
}
