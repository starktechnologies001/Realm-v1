import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { loadRazorpayScript } from '../utils/razorpayUtils';
import Toast from '../components/Toast';
import './Subscription.css';

export default function Subscription() {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);
    const navigate = useNavigate();

    const currentTier = user?.subscription_tier || 'free';

    useEffect(() => {
        // Pre-load Razorpay script
        loadRazorpayScript();
    }, []);

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const handleSelectPlan = async (tierName) => {
        if (!user) {
            showToast("Please log in first 🔒");
            return;
        }

        if (currentTier === tierName) {
            showToast(`You are already subscribed to the ${tierName.toUpperCase()} tier!`);
            return;
        }

        if (tierName === 'free') {
            // Cancellation logic could be handled differently if it was a real recurring sub,
            // but we'll leave the UI for cancellation out of this direct flow or let them cancel via profile settings
            return;
        }

        setLoading(true);

        try {
            // 1. Create order on the server
            const { data: orderData, error: orderError } = await supabase.functions.invoke('create-payment-order', {
                body: { plan: tierName }
            });

            if (orderError || !orderData) {
                console.error("Order creation failed:", orderError || orderData);
                throw new Error("Could not initialize payment. Please try again.");
            }

            // 2. Load Razorpay options
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID || '', // Needs to be public or injected
                amount: orderData.amount,
                currency: orderData.currency,
                name: "Nearo Premium",
                description: `${tierName.charAt(0).toUpperCase() + tierName.slice(1)} Membership`,
                order_id: orderData.order_id,
                handler: async function (response) {
                    try {
                        setLoading(true);
                        // 3. Verify Payment
                        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-payment', {
                            body: {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                plan: tierName,
                                amount: orderData.amount
                            }
                        });

                        if (verifyError || !verifyData?.success) {
                            console.error("Verification failed:", verifyError || verifyData);
                            throw new Error("Payment verification failed. If money was deducted, contact support.");
                        }

                        // Success! Update local UI
                        const updatedUser = { ...user, subscription_tier: tierName };
                        setUser(updatedUser);
                        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
                        window.dispatchEvent(new Event('local-user-update'));

                        showToast(`Welcome to ${tierName.toUpperCase()}! 🎉`);
                    } catch (err) {
                        showToast(err.message || "Payment verification failed.");
                    } finally {
                        setLoading(false);
                    }
                },
                prefill: {
                    name: user.full_name || user.username || "",
                    email: user.email || ""
                },
                theme: {
                    color: tierName === 'silver' ? '#c0c0c0' : (tierName === 'gold' ? '#ffd700' : '#b9f2ff')
                }
            };

            const rzp = new window.Razorpay(options);
            
            rzp.on('payment.failed', function (response){
                console.error(response.error);
                showToast("Payment failed or was cancelled.");
                setLoading(false);
            });

            rzp.open();

        } catch (err) {
            console.error("Checkout failed:", err);
            showToast(err.message || "Failed to start checkout. Check network.");
            setLoading(false);
        }
    };

    return (
        <div className="subscription-page">
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            <header className="subscription-header">
                <button className="sub-back-btn" onClick={() => navigate('/profile')}>&larr;</button>
                <h2>Nearo Premium</h2>
                <div className="header-subtitle">Elevate your map social experience</div>
            </header>

            <div className="sub-container">
                {/* Plans Grid */}
                <div className="plans-grid">
                    {/* Silver Plan */}
                    <div className={`plan-card ${currentTier === 'silver' ? 'active' : ''}`}>
                        <div className="plan-badge silver-badge">🥈 Silver Member</div>
                        <div className="plan-price">₹99<span className="price-period">/month</span></div>
                        <div className="plan-desc">Essential enhancements for visual customisation and visitor tracking.</div>
                        <ul className="plan-features">
                            <li><span className="feature-icon">👁️</span> Who Viewed My Profile</li>
                            <li><span className="feature-icon">❤️</span> See Reactors</li>
                            <li><span className="feature-icon">🥈</span> Silver Badge & Ring</li>
                            <li><span className="feature-icon">🎟️</span> Silver Map Profile Card</li>
                            <li><span className="feature-icon">💭</span> Premium Thought Styles</li>
                            <li><span className="feature-icon">🎨</span> Premium Themes</li>
                            <li><span className="feature-icon">💬</span> Default Chat Style & Reset</li>
                        </ul>
                        <button 
                            className={`plan-action-btn silver-btn ${currentTier === 'silver' ? 'subscribed' : ''}`}
                            disabled={loading || currentTier === 'silver'}
                            onClick={() => handleSelectPlan('silver')}
                        >
                            {currentTier === 'silver' ? 'Current Plan' : 'Subscribe'}
                        </button>
                    </div>

                    {/* Gold Plan */}
                    <div className={`plan-card gold-card ${currentTier === 'gold' ? 'active' : ''}`}>
                        <div className="popular-ribbon">MOST POPULAR</div>
                        <div className="plan-badge gold-badge">🥇 Gold Elite</div>
                        <div className="plan-price">₹149<span className="price-period">/month</span></div>
                        <div className="plan-desc">Advanced analytics, privacy tools, and premium gold aesthetics.</div>
                        <ul className="plan-features">
                            <li className="feature-highlight"><strong>Everything in Silver, plus:</strong></li>
                            <li><span className="feature-icon">📊</span> Advanced Profile Analytics</li>
                            <li><span className="feature-icon">🖼️</span> Custom Profile Backgrounds</li>
                            <li><span className="feature-icon">🎵</span> Profile Background Music</li>
                            <li><span className="feature-icon">👑</span> Premium Avatar Accessories</li>
                            <li><span className="feature-icon">✨</span> Animated Username Styles</li>
                            <li><span className="feature-icon">📱</span> App Custom Icons</li>
                            <li><span className="feature-icon">⚡</span> 5 Daily Super Pokes</li>
                            <li><span className="feature-icon">🥇</span> Gold Badge & Ring</li>
                            <li><span className="feature-icon">🎟️</span> Golden Map Profile Card</li>
                        </ul>
                        <button 
                            className={`plan-action-btn gold-btn ${currentTier === 'gold' ? 'subscribed' : ''}`}
                            disabled={loading || currentTier === 'gold'}
                            onClick={() => handleSelectPlan('gold')}
                        >
                            {currentTier === 'gold' ? 'Current Plan' : 'Subscribe'}
                        </button>
                    </div>

                    {/* Diamond Plan */}
                    <div className={`plan-card diamond-card ${currentTier === 'diamond' ? 'active' : ''}`}>
                        <div className="plan-badge diamond-badge">💎 Diamond Elite</div>
                        <div className="plan-price">₹199<span className="price-period">/month</span></div>
                        <div className="plan-desc">The ultimate VIP experience with invisible browsing and custom effects.</div>
                        <ul className="plan-features">
                            <li className="feature-highlight"><strong>Everything in Gold, plus:</strong></li>
                            <li><span className="feature-icon">⚡</span> 10 Daily Super Pokes</li>
                            <li><span className="feature-icon">📍</span> Nearby Map Moments (Broadcast)</li>
                            <li><span className="feature-icon">💎</span> Diamond Exclusive Themes</li>
                            <li><span className="feature-icon">👻</span> Invisible Browsing</li>
                            <li><span className="feature-icon">🔍</span> Discovery Filters</li>
                            <li><span className="feature-icon">✨</span> Avatar Glow Effects</li>
                            <li><span className="feature-icon">🎟️</span> VIP Profile Card</li>
                            <li><span className="feature-icon">💫</span> Animated Diamond Ring & Badge</li>
                        </ul>
                        <button 
                            className={`plan-action-btn diamond-btn ${currentTier === 'diamond' ? 'subscribed' : ''}`}
                            disabled={loading || currentTier === 'diamond'}
                            onClick={() => handleSelectPlan('diamond')}
                        >
                            {currentTier === 'diamond' ? 'Current Plan' : 'Subscribe'}
                        </button>
                    </div>
                </div>

                <div className="payment-history-link" style={{ textAlign: 'center', marginTop: '32px' }}>
                    <button onClick={() => navigate('/profile/payments')} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '12px 24px', borderRadius: '100px', cursor: 'pointer', fontWeight: 600 }}>
                        View Payment History
                    </button>
                </div>
            </div>
        </div>
    );
}
