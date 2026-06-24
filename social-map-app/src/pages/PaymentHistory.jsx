import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './Subscription.css';

export default function PaymentHistory() {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setPayments(data);
            }
            setLoading(false);
        };

        fetchHistory();
    }, []);

    const formatDate = (isoString) => {
        const d = new Date(isoString);
        return d.toLocaleDateString('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="subscription-page" style={{ paddingBottom: '80px' }}>
            <header className="subscription-header">
                <button className="sub-back-btn" onClick={() => navigate(-1)}>&larr;</button>
                <h2>Payment History</h2>
            </header>

            <div className="sub-container" style={{ marginTop: '24px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', color: 'white', padding: '40px' }}>Loading history...</div>
                ) : payments.length === 0 ? (
                    <div style={{ textAlign: 'center', background: 'var(--card-bg, #1e1e1e)', padding: '40px 20px', borderRadius: '16px', color: 'var(--text-secondary, #86868b)' }}>
                        You don't have any past payments.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {payments.map(payment => (
                            <div key={payment.id} style={{
                                background: 'var(--card-bg, #1c1c1e)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderRadius: '16px',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white', textTransform: 'capitalize' }}>
                                        {payment.plan} Plan
                                    </h3>
                                    <span style={{
                                        fontSize: '0.85rem', fontWeight: 700, padding: '4px 10px', borderRadius: '100px',
                                        background: payment.status === 'active' ? 'rgba(52, 199, 89, 0.2)' : 'rgba(255,255,255,0.1)',
                                        color: payment.status === 'active' ? '#34c759' : '#8e8e93',
                                        textTransform: 'uppercase'
                                    }}>
                                        {payment.status}
                                    </span>
                                </div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#e5e5ea' }}>
                                    ₹{(payment.amount_paid / 100).toFixed(2)}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#8e8e93', marginTop: '8px' }}>
                                    <span>Date: {formatDate(payment.created_at)}</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#636366', wordBreak: 'break-all' }}>
                                    ID: {payment.payment_id}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
