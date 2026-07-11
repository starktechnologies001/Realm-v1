import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './Verification.css';

const REQUIREMENTS = [
    {
        key: 'email',
        label: 'Email Verified',
        desc: 'Your email address must be verified',
    },
    {
        key: 'photo',
        label: 'Profile Photo Added',
        desc: 'Upload a real profile photo',
    },
    {
        key: 'username',
        label: 'Username Set',
        desc: 'Choose a unique @username',
    },
    {
        key: 'profile',
        label: 'Profile Complete',
        desc: 'Add your name and bio',
    },
];

const BENEFITS = [
    { icon: '✅', text: 'Blue Verified Badge on your profile' },
    { icon: '🔒', text: 'Higher trust and credibility' },
    { icon: '🔍', text: 'Appear in Verified User Filters' },
    { icon: '🌟', text: 'More authentic Nearo account' },
    { icon: '👥', text: 'Discoverable by Diamond-tier filters' },
];

// Check if avatar is a default (not uploaded)
const isDefaultAvatar = (url) => {
    if (!url) return true;
    return (
        url.includes('avatar_male') ||
        url.includes('avatar_female') ||
        url.includes('avatar_generic') ||
        url.includes('ui-avatars.com') ||
        url.includes('default')
    );
};

export default function Verification() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState(null); // null | 'success'
    const [requirements, setRequirements] = useState({
        email: false,
        photo: false,
        username: false,
        profile: false,
    });
    const [profile, setProfile] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        checkRequirements();
    }, []);

    const checkRequirements = async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { navigate('/login'); return; }

            const authUser = session.user;

            // Fetch fresh profile from DB — never trust localStorage for verification
            const { data: prof, error } = await supabase
                .from('profiles')
                .select('id, username, full_name, bio, avatar_url, is_verified, verification_status, verified_at')
                .eq('id', authUser.id)
                .maybeSingle();

            if (error) throw error;
            setProfile(prof);

            const emailVerified = !!authUser.email_confirmed_at;
            const photoAdded = !!prof?.avatar_url && !isDefaultAvatar(prof.avatar_url);
            const usernameSet = !!(prof?.username && prof.username.trim().length > 0);
            const profileComplete = !!(
                prof?.full_name &&
                prof.full_name.trim().length > 0 &&
                prof?.bio &&
                prof.bio.trim().length > 0
            );

            setRequirements({
                email: emailVerified,
                photo: photoAdded,
                username: usernameSet,
                profile: profileComplete,
            });
        } catch (err) {
            console.error('Verification check error:', err);
            setErrorMsg('Could not load verification status. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const allMet = Object.values(requirements).every(Boolean);
    const alreadyVerified = profile?.is_verified === true;

    const handleGetVerified = async () => {
        setSubmitting(true);
        setErrorMsg(null);
        try {
            // Re-validate FRESH from DB (security double-check)
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const authUser = session.user;

            const { data: freshProfile, error: fetchErr } = await supabase
                .from('profiles')
                .select('id, username, full_name, bio, avatar_url')
                .eq('id', authUser.id)
                .maybeSingle();

            if (fetchErr) throw fetchErr;

            const emailOk = !!authUser.email_confirmed_at;
            const photoOk = !!freshProfile?.avatar_url && !isDefaultAvatar(freshProfile.avatar_url);
            const usernameOk = !!(freshProfile?.username && freshProfile.username.trim().length > 0);
            const profileOk = !!(
                freshProfile?.full_name && freshProfile.full_name.trim().length > 0 &&
                freshProfile?.bio && freshProfile.bio.trim().length > 0
            );

            if (!emailOk || !photoOk || !usernameOk || !profileOk) {
                setErrorMsg('Some requirements are not met. Please complete your profile and try again.');
                setSubmitting(false);
                return;
            }

            // Write verification to DB
            const now = new Date().toISOString();
            const { error: updateErr } = await supabase
                .from('profiles')
                .update({
                    is_verified: true,
                    verification_status: 'approved',
                    verification_type: 'blue',
                    verified_at: now,
                })
                .eq('id', authUser.id);

            if (updateErr) throw updateErr;

            // Update localStorage cache so badge shows immediately on profile
            try {
                const cached = JSON.parse(localStorage.getItem('currentUser') || '{}');
                const updated = {
                    ...cached,
                    is_verified: true,
                    verification_status: 'approved',
                    verification_type: 'blue',
                    verified_at: now,
                };
                localStorage.setItem('currentUser', JSON.stringify(updated));
                window.dispatchEvent(new Event('local-user-update'));
            } catch (_) {}

            setStatus('success');
        } catch (err) {
            console.error('Verification error:', err);
            setErrorMsg('Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="verification-page">
                <div className="verif-loading">
                    <div className="verif-spinner" />
                    <span>Checking requirements…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="verification-page">
            {/* Header */}
            <div className="verif-header">
                <button className="verif-back-btn" onClick={() => navigate('/profile')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                </button>
                <h1 className="verif-title">Verification</h1>
            </div>

            <div className="verif-content">
                {/* Already Verified */}
                {alreadyVerified && status !== 'success' && (
                    <div className="verif-already-verified">
                        <div className="verif-success-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#1877F2" />
                                <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h2>You're Verified!</h2>
                        <p>Your account has the Blue Verified Badge.</p>
                        {profile?.verified_at && (
                            <span className="verif-date">
                                Verified on {new Date(profile.verified_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        )}
                    </div>
                )}

                {/* Success Screen */}
                {status === 'success' && (
                    <div className="verif-success-screen">
                        <div className="verif-confetti-icon">🎉</div>
                        <div className="verif-success-badge">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                                <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#1877F2" />
                                <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h2>Congratulations! 🎉</h2>
                        <p>Your account is now verified.</p>
                        <p className="verif-success-sub">Your Blue Verified Badge is now visible everywhere on Nearo.</p>
                        <button
                            className="verif-btn-primary"
                            onClick={() => navigate('/profile')}
                        >
                            Back to Profile
                        </button>
                    </div>
                )}

                {/* Main flow — not yet verified and not success */}
                {!alreadyVerified && status !== 'success' && (
                    <>
                        {/* Hero */}
                        <div className="verif-hero">
                            <div className="verif-hero-badge">
                                <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
                                    <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="#1877F2" />
                                    <path d="m9 12 2 2 4-4" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <h2 className="verif-hero-title">Become a Verified User</h2>
                            <p className="verif-hero-sub">
                                Complete the requirements below to get your Blue Verified Badge on Nearo.
                            </p>
                        </div>

                        {/* Benefits */}
                        <div className="verif-section">
                            <div className="verif-section-label">Benefits</div>
                            <div className="verif-benefits-card">
                                {BENEFITS.map((b, i) => (
                                    <div key={i} className="verif-benefit-row">
                                        <span className="verif-benefit-icon">{b.icon}</span>
                                        <span className="verif-benefit-text">{b.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Requirements */}
                        <div className="verif-section">
                            <div className="verif-section-label">Your Progress</div>
                            <div className="verif-requirements-card">
                                {REQUIREMENTS.map((req) => {
                                    const met = requirements[req.key];
                                    return (
                                        <div key={req.key} className={`verif-req-row ${met ? 'met' : 'unmet'}`}>
                                            <span className="verif-req-icon">
                                                {met ? (
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                        <circle cx="12" cy="12" r="12" fill="#22c55e" />
                                                        <path d="M7 12.5L10.5 16L17 9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                ) : (
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                        <circle cx="12" cy="12" r="12" fill="#e5e7eb" />
                                                        <path d="M12 7v5M12 16.5v.5" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </span>
                                            <div className="verif-req-content">
                                                <span className="verif-req-label">{req.label}</span>
                                                {!met && <span className="verif-req-desc">{req.desc}</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Progress indicator */}
                        <div className="verif-progress-bar-wrap">
                            <div
                                className="verif-progress-bar-fill"
                                style={{
                                    width: `${(Object.values(requirements).filter(Boolean).length / 4) * 100}%`,
                                }}
                            />
                        </div>
                        <div className="verif-progress-text">
                            {Object.values(requirements).filter(Boolean).length} of 4 requirements completed
                        </div>

                        {/* Error */}
                        {errorMsg && (
                            <div className="verif-error">{errorMsg}</div>
                        )}

                        {/* CTA */}
                        <button
                            className={`verif-btn-primary ${!allMet ? 'disabled' : ''}`}
                            disabled={!allMet || submitting}
                            onClick={handleGetVerified}
                        >
                            {submitting ? (
                                <span className="verif-btn-spinner" />
                            ) : allMet ? (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                        <path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" fill="white" />
                                        <path d="m9 12 2 2 4-4" stroke="#1877F2" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Get Verified
                                </>
                            ) : (
                                'Complete All Requirements First'
                            )}
                        </button>

                        {!allMet && (
                            <p className="verif-help-text">
                                Complete your profile to unlock verification.{' '}
                                <span
                                    className="verif-link"
                                    onClick={() => navigate('/profile')}
                                >
                                    Go to Profile →
                                </span>
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
