import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

const ACTION_CONFIG = {
    warn:      { label: 'Issue Warning',    color: '#d97706', dangerClass: 'btn-action', newStatus: null },
    suspend:   { label: 'Suspend (7 Days)', color: '#f59e0b', dangerClass: 'btn-action', newStatus: 'suspended' },
    ban_temp:  { label: 'Temp Ban (30d)',   color: '#ef4444', dangerClass: 'btn-action btn-danger', newStatus: 'suspended' },
    ban_perm:  { label: 'Permanent Ban',    color: '#991b1b', dangerClass: 'btn-action btn-danger', newStatus: 'banned' },
    unban:     { label: 'Unban User',       color: '#059669', dangerClass: 'btn-action', newStatus: 'active' },
};

function ConfirmModal({ action, targetUser, onConfirm, onCancel }) {
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const cfg = ACTION_CONFIG[action];

    const handleConfirm = async () => {
        if (!reason.trim()) { alert('Please provide a reason.'); return; }
        setLoading(true);
        await onConfirm(action, reason);
        setLoading(false);
    };

    return (
        <div className="admin-modal-overlay" onClick={onCancel}>
            <div className="admin-modal" onClick={e => e.stopPropagation()}>
                <div className="admin-modal-header">
                    <h3>{cfg.label}</h3>
                    <button className="btn-close-modal" onClick={onCancel}>×</button>
                </div>
                <div className="admin-modal-body">
                    <p style={{ marginBottom: '16px' }}>
                        You are about to <strong>{cfg.label.toLowerCase()}</strong> user{' '}
                        <strong style={{ color: '#dc2626' }}>@{targetUser.username}</strong>.
                        This action will be recorded in the audit log.
                    </p>
                    <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '8px' }}>
                        Reason <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Enter a clear reason for this action..."
                        rows={4}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', resize: 'vertical' }}
                    />
                </div>
                <div className="admin-modal-footer">
                    <button className="btn-action" onClick={onCancel}>Cancel</button>
                    <button
                        className={cfg.dangerClass}
                        onClick={handleConfirm}
                        disabled={loading}
                        style={{ background: loading ? '#e5e7eb' : cfg.color === '#d97706' ? '#fef3c7' : '#fee2e2', color: cfg.color, border: `1px solid ${cfg.color}40` }}
                    >
                        {loading ? 'Processing...' : `Confirm ${cfg.label}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

function UserDetailModal({ user, onClose, onAction }) {
    const [auditLogs, setAuditLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(true);

    useEffect(() => {
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('moderation_audit_logs')
                .select('*, admin:admin_id(username)')
                .eq('target_user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(10);
            setAuditLogs(data || []);
            setLoadingLogs(false);
        };
        fetchLogs();
    }, [user.id]);

    const statusClass = user.account_status === 'banned' ? 'banned' : user.account_status === 'suspended' ? 'suspended' : 'active';

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="admin-modal-header">
                    <h3>User Profile: @{user.username}</h3>
                    <button className="btn-close-modal" onClick={onClose}>×</button>
                </div>
                <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Profile Info */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Username</span><strong>@{user.username}</strong></div>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Email</span><strong>{user.email}</strong></div>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Account Status</span><span className={`admin-badge badge-${statusClass}`}>{(user.account_status || 'active').toUpperCase()}</span></div>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Premium</span>{user.is_premium ? <span className="admin-badge badge-premium">PREMIUM</span> : <span style={{ color: '#6b7280' }}>No</span>}</div>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Warnings</span><strong>{user.warning_count || 0}</strong></div>
                        <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Joined</span><strong>{new Date(user.created_at).toLocaleDateString()}</strong></div>
                        {user.ban_expires_at && <div><span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block' }}>Ban Expires</span><strong>{new Date(user.ban_expires_at).toLocaleDateString()}</strong></div>}
                    </div>

                    {/* Actions */}
                    <div>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '12px' }}>Moderation Actions</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <button className="btn-action" onClick={() => onAction('warn', user)}>⚠️ Issue Warning</button>
                            <button className="btn-action" onClick={() => onAction('suspend', user)}>⏸ Suspend (7d)</button>
                            <button className="btn-action btn-danger" onClick={() => onAction('ban_temp', user)}>🚫 Temp Ban (30d)</button>
                            <button className="btn-action btn-danger" onClick={() => onAction('ban_perm', user)}>☠️ Permanent Ban</button>
                            {(user.account_status === 'banned' || user.account_status === 'suspended') && (
                                <button className="btn-action" style={{ background: '#d1fae5', color: '#059669', border: '1px solid #a7f3d0' }} onClick={() => onAction('unban', user)}>✅ Unban</button>
                            )}
                        </div>
                    </div>

                    {/* Audit Log */}
                    <div>
                        <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '12px' }}>Moderation History</p>
                        {loadingLogs ? <p style={{ color: '#9ca3af' }}>Loading...</p> : auditLogs.length === 0 ? (
                            <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>No moderation actions recorded.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                {auditLogs.map(log => (
                                    <div key={log.id} style={{ padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', fontSize: '0.85rem' }}>
                                        <strong>{log.action.replace(/_/g, ' ').toUpperCase()}</strong> by @{log.admin?.username || 'admin'} — {log.reason}
                                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '2px' }}>{new Date(log.created_at).toLocaleString()}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [selectedUser, setSelectedUser] = useState(null);   // for detail modal
    const [actionTarget, setActionTarget] = useState(null);   // { action, user }
    const [toast, setToast] = useState(null);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('profiles')
                .select('id, username, email, is_premium, is_admin, account_status, ban_expires_at, warning_count, created_at')
                .order('created_at', { ascending: false })
                .limit(100);

            if (search.trim()) {
                query = query.or(`username.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
            }
            if (filterStatus !== 'all') {
                query = query.eq('account_status', filterStatus);
            }

            const { data, error } = await query;
            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    }, [search, filterStatus]);

    useEffect(() => {
        const debounce = setTimeout(fetchUsers, 300);
        return () => clearTimeout(debounce);
    }, [fetchUsers]);

    const handleAction = (action, user) => {
        // Close detail modal and open confirm modal
        setSelectedUser(null);
        setActionTarget({ action, user });
    };

    const handleConfirmAction = async (action, reason) => {
        const { user } = actionTarget;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const adminId = session.user.id;
            const cfg = ACTION_CONFIG[action];

            // Determine ban expiry date
            let banExpiresAt = null;
            if (action === 'suspend') banExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
            if (action === 'ban_temp') banExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            // Build profile update
            const profileUpdate = {};
            if (cfg.newStatus) profileUpdate.account_status = cfg.newStatus;
            if (action === 'warn') profileUpdate.warning_count = (user.warning_count || 0) + 1;
            if (banExpiresAt) profileUpdate.ban_expires_at = banExpiresAt;
            if (action === 'unban') { profileUpdate.account_status = 'active'; profileUpdate.ban_expires_at = null; }

            if (Object.keys(profileUpdate).length > 0) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update(profileUpdate)
                    .eq('id', user.id);
                if (updateError) throw updateError;
            }

            // Append-only audit log
            const { error: logError } = await supabase.from('moderation_audit_logs').insert({
                admin_id: adminId,
                target_user_id: user.id,
                action,
                reason
            });
            if (logError) throw logError;

            showToast(`✅ Action "${cfg.label}" applied to @${user.username}`);
            setActionTarget(null);
            fetchUsers(); // Refresh list
        } catch (err) {
            console.error('Moderation action failed:', err);
            alert('Error: ' + err.message);
        }
    };

    const statusClass = (s) => s === 'banned' ? 'banned' : s === 'suspended' ? 'suspended' : 'active';

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
                <h2 style={{ margin: 0 }}>User Moderation</h2>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                        className="admin-search-bar"
                        placeholder="Search username or email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="banned">Banned</option>
                    </select>
                </div>
            </div>

            <div className="admin-table-container">
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>Loading users...</div>
                ) : users.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No users found.</div>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Premium</th>
                                <th>Warnings</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id}>
                                    <td>
                                        <strong>@{user.username}</strong>
                                        {user.is_admin && <span className="admin-badge" style={{ marginLeft: '6px', background: '#ede9fe', color: '#7c3aed' }}>ADMIN</span>}
                                    </td>
                                    <td style={{ color: '#6b7280' }}>{user.email}</td>
                                    <td>
                                        <span className={`admin-badge badge-${statusClass(user.account_status || 'active')}`}>
                                            {(user.account_status || 'active').toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {user.is_premium
                                            ? <span className="admin-badge badge-premium">PREMIUM</span>
                                            : <span style={{ color: '#9ca3af' }}>—</span>}
                                    </td>
                                    <td style={{ textAlign: 'center', color: (user.warning_count || 0) > 0 ? '#d97706' : '#6b7280', fontWeight: (user.warning_count || 0) > 0 ? 700 : 400 }}>
                                        {user.warning_count || 0}
                                    </td>
                                    <td style={{ color: '#6b7280' }}>
                                        {new Date(user.created_at).toLocaleDateString()}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button className="btn-action" onClick={() => setSelectedUser(user)}>View</button>
                                            <button className="btn-action" onClick={() => handleAction('warn', user)}>⚠️ Warn</button>
                                            {(!user.account_status || user.account_status === 'active') && (
                                                <button className="btn-action btn-danger" onClick={() => handleAction('suspend', user)}>Suspend</button>
                                            )}
                                            {(user.account_status === 'banned' || user.account_status === 'suspended') && (
                                                <button className="btn-action" style={{ background: '#d1fae5', color: '#059669', border: '1px solid #a7f3d0' }} onClick={() => handleAction('unban', user)}>Unban</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Detail Modal */}
            {selectedUser && !actionTarget && (
                <UserDetailModal
                    user={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    onAction={handleAction}
                />
            )}

            {/* Confirm Action Modal */}
            {actionTarget && (
                <ConfirmModal
                    action={actionTarget.action}
                    targetUser={actionTarget.user}
                    onConfirm={handleConfirmAction}
                    onCancel={() => setActionTarget(null)}
                />
            )}

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '24px', right: '24px',
                    background: '#111827', color: '#fff',
                    padding: '12px 20px', borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    fontWeight: 600, fontSize: '0.9rem', zIndex: 20000
                }}>
                    {toast}
                </div>
            )}
        </div>
    );
}
