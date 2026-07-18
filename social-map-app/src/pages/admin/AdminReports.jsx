import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AdminReports() {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all'); // all, pending, resolved

    useEffect(() => {
        fetchReports();
    }, [filterStatus]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('reports')
                .select(`
                    id,
                    reason,
                    created_at,
                    status,
                    resolution,
                    reporter:reporter_id (id, username, email),
                    reported:reported_id (id, username, email)
                `)
                .order('created_at', { ascending: false });
                
            if (filterStatus !== 'all') {
                // If column doesn't exist, this might fail, but assuming user ran migration
                query = query.eq('status', filterStatus);
            }

            const { data, error } = await query;
            if (error) throw error;
            setReports(data || []);
        } catch (err) {
            console.error('Failed to fetch reports', err);
            // Fallback for missing status column (pre-migration)
            if (err.message?.includes('status')) {
                const { data } = await supabase
                    .from('reports')
                    .select(`
                        id,
                        reason,
                        created_at,
                        reporter:reporter_id (id, username, email),
                        reported:reported_id (id, username, email)
                    `)
                    .order('created_at', { ascending: false });
                setReports(data || []);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (reportId, newStatus, targetUserId) => {
        if (!window.confirm(`Mark report as ${newStatus}?`)) return;
        
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const adminId = session.user.id;

            // Update report
            const { error: updateError } = await supabase
                .from('reports')
                .update({ 
                    status: newStatus,
                    reviewed_by: adminId,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', reportId);

            if (updateError) throw updateError;

            // Log action
            await supabase.from('moderation_audit_logs').insert({
                admin_id: adminId,
                target_user_id: targetUserId,
                action: 'resolve_report',
                reason: `Report marked as ${newStatus}`
            });

            // Optimistic update
            setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
        } catch (err) {
            console.error('Failed to update report status:', err);
            alert('Error: ' + err.message);
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0 }}>Report Management</h2>
                <select 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                    <option value="all">All Reports</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                </select>
            </div>

            <div className="admin-table-container">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>Loading reports...</div>
                ) : reports.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No reports found.</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Reporter</th>
                                <th>Reported User</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map(report => (
                                <tr key={report.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        {new Date(report.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{report.reporter?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{report.reporter?.email}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 600, color: '#dc2626' }}>{report.reported?.username || 'Unknown'}</div>
                                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{report.reported?.email}</div>
                                    </td>
                                    <td style={{ maxWidth: '300px' }}>
                                        {report.reason}
                                    </td>
                                    <td>
                                        <span className={`admin-badge badge-${report.status || 'pending'}`}>
                                            {(report.status || 'pending').toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(report.status || 'pending') === 'pending' && (
                                                <>
                                                    <button 
                                                        className="btn-action"
                                                        onClick={() => handleUpdateStatus(report.id, 'resolved', report.reported_id)}
                                                    >
                                                        Resolve
                                                    </button>
                                                    <button 
                                                        className="btn-action"
                                                        onClick={() => handleUpdateStatus(report.id, 'dismissed', report.reported_id)}
                                                    >
                                                        Dismiss
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
