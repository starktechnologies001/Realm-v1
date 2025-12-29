import React, { useState, useEffect } from 'react'; // v1.0
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';

export default function UpdatePassword() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Ensure user is authenticated (link should handle this)
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                // If no session, redirect to login (link might be invalid or expired)
                alert("Invalid or expired reset link. Please try again.");
                navigate('/login');
            }
        };
        checkSession();
    }, [navigate]);

    const handleUpdate = async (e) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            setToastMsg("Passwords do not match! ❌");
            return;
        }
        if (password.length < 6) {
            setToastMsg("Password must be at least 6 characters ⚠️");
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: password });
            if (error) throw error;
            
            setToastMsg("Password updated successfully! Redirecting... ✅");
            setTimeout(() => {
                navigate('/map'); // Or login, but map is better UX since they are logged in
            }, 2000);
        } catch (error) {
            console.error(error);
            setToastMsg(error.message || "Failed to update password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            {/* Ambient Background */}
            <div style={styles.ambientGlow}></div>

            <div style={styles.card}>
                <div style={styles.header}>
                    <div style={styles.iconWrapper}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h2 style={styles.title}>Reset Password</h2>
                    <p style={styles.subtitle}>Enter your new password below.</p>
                </div>

                <form onSubmit={handleUpdate} style={styles.form}>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>New Password</label>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Min. 6 characters"
                            style={styles.input}
                            required
                        />
                    </div>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Confirm Password</label>
                        <input 
                            type="password" 
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter password"
                            style={styles.input}
                            required
                        />
                    </div>

                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Updating...' : 'Set New Password'}
                    </button>
                    
                    <button type="button" onClick={() => navigate('/login')} style={styles.backLink}>
                        Back to Login
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a',
        position: 'relative', overflow: 'hidden',
        fontFamily: "'Inter', sans-serif"
    },
    ambientGlow: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'radial-gradient(circle at 50% 30%, rgba(0, 198, 255, 0.15), transparent 70%)',
        zIndex: 0
    },
    card: {
        background: 'rgba(30, 30, 30, 0.8)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        padding: '40px',
        width: '100%', maxWidth: '400px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        zIndex: 1,
        animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
    },
    header: { textAlign: 'center', marginBottom: '30px' },
    iconWrapper: {
        width: '64px', height: '64px', borderRadius: '20px',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px auto', color: '#00d4ff',
        boxShadow: '0 8px 32px rgba(0, 212, 255, 0.2)'
    },
    title: { color: 'white', margin: '0 0 10px 0', fontSize: '1.8rem', fontWeight: 700 },
    subtitle: { color: '#888', margin: 0, fontSize: '0.95rem' },
    form: { display: 'flex', flexDirection: 'column', gap: '20px' },
    inputGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { color: '#aaa', fontSize: '0.9rem', fontWeight: 500, marginLeft: '4px' },
    input: {
        width: '100%', padding: '14px 16px',
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        color: 'white', fontSize: '1rem',
        outline: 'none', transition: 'all 0.2s',
        boxSizing: 'border-box'
    },
    button: {
        background: 'linear-gradient(135deg, #00C6FF, #0072FF)',
        color: 'white', border: 'none',
        padding: '16px', borderRadius: '14px',
        fontWeight: 600, fontSize: '1rem',
        cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
        marginTop: '10px',
        boxShadow: '0 4px 20px rgba(0, 114, 255, 0.3)'
    },
    backLink: {
        background: 'transparent', border: 'none',
        color: '#666', fontSize: '0.9rem',
        cursor: 'pointer', marginTop: '10px',
        padding: '10px',
        transition: 'color 0.2s'
    }
};
