import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function LegalPage() {
    const { section } = useParams();
    const navigate = useNavigate();

    const contentMap = {
        'privacy': {
            title: 'Privacy Policy',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Your privacy is our top priority. Nearo is designed to help you connect with friends in the real world while keeping you in complete control of your data.</p>
                    
                    <h3>📍 Location Data & Control</h3>
                    <p>We collect your location data <strong>only</strong> to enable the core map-sharing feature. You are always in control:</p>
                    <ul>
                        <li><strong>Ghost Mode:</strong> Toggle this in settings to instantly stop sharing your live location with everyone.</li>
                        <li><strong>Friend-Only:</strong> Your location is only visible to people you explicitly accept as friends.</li>
                    </ul>

                    <h3>🔒 Data Security</h3>
                    <p>We use industry-standard encryption to protect your personal information locally and in the cloud. We do not sell your personal location history to third-party advertisers.</p>
                    
                    <h3>👁️ Visibility</h3>
                    <p>You decide who sees you. You can block users or remove friends at any time to revoke their access to your location.</p>

                    <p className="footer-note">Last Updated: February 2026</p>
                </div>
            )
        },
        'terms': {
            title: 'Terms of Service',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Welcome to Nearo. By using our app, you agree to the following terms designed to keep our community safe and trusted.</p>

                    <h3>1. Eligibility</h3>
                    <p>You must be at least 13 years old to create an account. You must provide accurate information about yourself.</p>

                    <h3>2. Acceptable Use</h3>
                    <p>Nearo is for personal connection. You agree not to use the app for:</p>
                    <ul>
                        <li>Stalking, harassment, or bullying.</li>
                        <li>Illegal activities or promoting harm.</li>
                        <li>Spamming or commercial solicitation without permission.</li>
                    </ul>

                    <h3>3. Account Security</h3>
                    <p>You are responsible for keeping your password secure. If you suspect unauthorized access, contact us immediately.</p>

                    <h3>4. Account Termination</h3>
                    <p>We reserve the right to suspend or ban accounts that violate these terms or compromise the safety of our community.</p>
                </div>
            )
        },
        'safety': {
            title: 'Safety Center',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Nearo connects you with friends, but your safety comes first. Here are the tools and tips to stay safe.</p>

                    <h3>🛡️ Safety Tools</h3>
                    <ul>
                        <li><strong>Ghost Mode:</strong> Feeling private? Go invisible instantly. No one will see your realtime location.</li>
                        <li><strong>Block & Report:</strong> Encountered someone toxic? Block them immediately. They won't know, but they will disappear from your map.</li>
                        <li><strong>Location Review:</strong> Regularly check your friends list and remove anyone you no longer trust with your location.</li>
                    </ul>

                    <h3>🌍 Real World Safety</h3>
                    <p>Meeting up with a friend?</p>
                    <ul>
                        <li><strong>Meet in Public:</strong> Always choose busy, well-lit public places for meetups.</li>
                        <li><strong>Trust Your Instincts:</strong> If something feels off, you can leave or stop sharing your location at any time.</li>
                        <li><strong>Tell Someone:</strong> Let a family member know where you are going.</li>
                    </ul>

                    <p><strong>Emergency:</strong> If you are in immediate danger, please contact local emergency services (911/112) immediately.</p>

                    <h3>📞 Contact Us</h3>
                    <p>Have a safety concern? Reach us at: <a href="mailto:nearoprivacy@gmail.com" style={{ color: 'var(--brand-blue, #007AFF)', textDecoration: 'none' }}>nearoprivacy@gmail.com</a></p>
                </div>
            )
        },
        'guidelines': {
            title: 'Community Guidelines',
            content: (
                <div className="legal-text-block">
                    <p className="intro">Our community is built on trust and respect. To remain a part of Nearo, please follow these simple rules.</p>

                    <h3>🤝 Be Respectful</h3>
                    <p>Treat others the way you want to be treated. We have <strong>zero tolerance</strong> for harassment, hate speech, or bullying. Being mean isn't cool.</p>

                    <h3>👤 Be Authentic</h3>
                    <p>Use your real name (or common nickname). Do not impersonate public figures or other individuals. Catfishing is strictly prohibited.</p>

                    <h3>🛑 No Harmful Content</h3>
                    <p>Do not share content that promotes violence, self-harm, or illegal acts. We want Nearo to be a positive space.</p>

                    <h3>📢 Report It</h3>
                    <p>If you see something that violates these guidelines, report it. Help us keep Nearo safe for everyone.</p>
                    
                    <p><em>Violating these guidelines may result in a permanent ban.</em></p>
                </div>
            )
        }
    };

    const data = contentMap[section] || { title: 'Legal', content: <p>Content not found.</p> };

    return (
        <div className="legal-page" style={{ 
            minHeight: '100vh', 
            background: 'var(--bg-color, #f5f5f7)', 
            color: 'var(--text-color, #000)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            {/* Header */}
            <div className="glass-header" style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'rgba(250, 248, 245, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '16px 20px',
                borderBottom: '0.5px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
            }}>
                <button 
                    onClick={() => navigate(-1)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'inherit' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{data.title}</h1>
            </div>

            {/* Content */}
            <div className="legal-content" style={{ padding: '24px', maxWidth: '800px', margin: '0 auto', lineHeight: '1.6' }}>
                <div style={{ background: 'var(--bg-card, #fff)', padding: '24px', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
                    {data.content}
                </div>
            </div>

            <style>{`
                h3 { margin-top: 24px; margin-bottom: 12px; font-size: 1.1rem; }
                p { margin-bottom: 16px; color: var(--text-secondary, #555); }
                ul { margin-bottom: 16px; padding-left: 20px; color: var(--text-secondary, #555); }
                li { margin-bottom: 8px; }

                /* Dark Mode Support */
                /* Dark Mode Support via data-theme attribute */
                html[data-theme="dark"] .legal-page {
                    background: #000 !important;
                    color: #fff !important;
                }
                html[data-theme="dark"] .glass-header {
                    background: rgba(20, 20, 25, 0.85) !important;
                    border-bottom-color: rgba(255,255,255,0.15) !important;
                }
                html[data-theme="dark"] .glass-header h1,
                html[data-theme="dark"] .glass-header button {
                    color: #fff !important;
                }
                html[data-theme="dark"] .legal-content > div {
                    background: #1c1c1e !important;
                    box-shadow: none !important;
                }
                html[data-theme="dark"] h3 { color: #fff !important; }
                html[data-theme="dark"] p, html[data-theme="dark"] ul { color: #ccc !important; }
            `}</style>
        </div>
    );
}
