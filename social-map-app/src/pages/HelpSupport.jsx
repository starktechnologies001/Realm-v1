import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import './HelpSupport.css';

const APP_VERSION = '1.0.0';
const BUILD_VERSION = '2026.07';
const SUPPORT_EMAIL = 'nearoprivacy@gmail.com';
const RESPONSE_TIME = '24–48 hours';

/* ── Icons ── */
const ChevronDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
);
const ChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
);
const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
);

/* ── Accordion Item ── */
function AccordionItem({ question, answer }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="hs-accordion-item">
            <button className="hs-accordion-header" onClick={() => setOpen(o => !o)}>
                <span className="hs-accordion-question">{question}</span>
                <span className={`hs-accordion-chevron ${open ? 'open' : ''}`}><ChevronDown /></span>
            </button>
            {open && <div className="hs-accordion-body">{answer}</div>}
        </div>
    );
}

/* ── Section Hero ── */
function SectionHero({ icon, title, desc, bgColor }) {
    return (
        <div className="hs-section-hero">
            <div className="hs-section-hero-icon" style={{ background: bgColor }}>{icon}</div>
            <div className="hs-section-hero-text">
                <h3>{title}</h3>
                <p>{desc}</p>
            </div>
        </div>
    );
}

/* ── Success Box ── */
function SuccessBox({ emoji, title, subtitle, onReset }) {
    return (
        <div className="hs-success-box">
            <div className="hs-s-icon">{emoji}</div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
            <button className="hs-submit-btn" style={{ marginTop: 4 }} onClick={onReset}>Submit Another</button>
        </div>
    );
}

/* ============================================================
   SECTION: Home Grid
   ============================================================ */
const TILES = [
    { id: 'help-center',       label: 'Help Center',       icon: '📖', color: 'hs-tile-blue'   },
    { id: 'faq',               label: 'FAQ',               icon: '💬', color: 'hs-tile-sky'    },
    { id: 'report-bug',        label: 'Report a Bug',      icon: '🐛', color: 'hs-tile-orange' },
    { id: 'contact',           label: 'Contact Support',   icon: '📩', color: 'hs-tile-green'  },
    { id: 'report-user',       label: 'Report a User',     icon: '🚩', color: 'hs-tile-red'    },
    { id: 'blocked',           label: 'Blocked Users',     icon: '🚫', color: 'hs-tile-gray'   },
    { id: 'privacy-safety',    label: 'Privacy & Safety',  icon: '🔒', color: 'hs-tile-purple' },
    { id: 'billing',           label: 'Billing & Premium', icon: '💎', color: 'hs-tile-indigo' },
    { id: 'feature-requests',  label: 'Feature Requests',  icon: '💡', color: 'hs-tile-amber'  },
    { id: 'whats-new',         label: "What's New",        icon: '🚀', color: 'hs-tile-teal'   },
    { id: 'legal',             label: 'Legal',             icon: '⚖️', color: 'hs-tile-pink'   },
    { id: 'about',             label: 'About Nearo',       icon: 'ℹ️', color: 'hs-tile-rose'   },
];

function HomeGrid({ onNav }) {
    const [query, setQuery] = React.useState('');
    const filtered = query.trim()
        ? TILES.filter(t => t.label.toLowerCase().includes(query.toLowerCase()))
        : TILES;

    return (
        <>
            <div className="hs-home-hero">
                <div className="hs-home-hero-icon">🛟</div>
                <h2>Help & Support</h2>
                <p>Find answers, report issues, and get in touch with the Nearo team.</p>
            </div>

            {/* Quick search */}
            <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', opacity: 0.4, pointerEvents: 'none' }}>🔍</span>
                <input
                    type="text"
                    className="hs-form-input"
                    placeholder="Search help topics…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    style={{ paddingLeft: 42, borderRadius: 16 }}
                />
            </div>

            <div>
                <div className="hs-section-label" style={{ marginBottom: 12 }}>Browse Topics</div>
                {filtered.length > 0 ? (
                    <div className="hs-grid">
                        {filtered.map(t => (
                            <div key={t.id} className="hs-tile" onClick={() => onNav(t.id)}>
                                <div className={`hs-tile-icon ${t.color}`}>{t.icon}</div>
                                <div className="hs-tile-label">{t.label}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary, #8a8a9e)', fontSize: '0.9rem' }}>
                        No topics found for <strong style={{ color: 'var(--text-primary)' }}>"{query}"</strong>
                    </div>
                )}
            </div>

            {/* Quick access strip */}
            <div className="hs-card" style={{ marginTop: -4 }}>
                <div className="hs-card-row" onClick={() => onNav('contact')}>
                    <div className="hs-card-icon" style={{ background: 'rgba(255,126,95,0.15)' }}>📩</div>
                    <div className="hs-card-row-text">
                        <div className="hs-card-row-title">Contact Support</div>
                        <div className="hs-card-row-sub">Response within 24–48 hours</div>
                    </div>
                    <span className="hs-card-chevron"><ChevronRight /></span>
                </div>
                <div className="hs-card-row" onClick={() => onNav('report-bug')}>
                    <div className="hs-card-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>🐛</div>
                    <div className="hs-card-row-text">
                        <div className="hs-card-row-title">Report a Bug</div>
                        <div className="hs-card-row-sub">Help us improve Nearo</div>
                    </div>
                    <span className="hs-card-chevron"><ChevronRight /></span>
                </div>
                <div className="hs-card-row" onClick={() => onNav('faq')}>
                    <div className="hs-card-icon" style={{ background: 'rgba(14,165,233,0.15)' }}>💬</div>
                    <div className="hs-card-row-text">
                        <div className="hs-card-row-title">FAQ</div>
                        <div className="hs-card-row-sub">Most common questions answered</div>
                    </div>
                    <span className="hs-card-chevron"><ChevronRight /></span>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Help Center
   ============================================================ */
const HELP_TOPICS = [
    {
        q: 'How does Nearo work?',
        a: 'Nearo is a location-based social app that lets you discover and connect with real people near you. When you share your location, you appear on a local map where others can see your avatar, mood, and thought bubble. You can send poke requests, chat, and build a local social circle.'
    },
    {
        q: 'How do Nearby Users work?',
        a: 'When your location is enabled, you appear on the map alongside other Nearo users in your area. The map refreshes in real time. You can tap any avatar to see their profile card. Distance is shown as an approximate value and can be hidden from your Privacy Settings. Ghost Mode lets you browse without appearing on the map.'
    },
    {
        q: 'How does Chat work?',
        a: 'Once two users are connected (after a poke is accepted), they can chat in real time. You can send text messages, images, voice notes, stickers (Premium), and files. Messages can be deleted for yourself or both sides. Chat supports custom themes and wallpapers.'
    },
    {
        q: 'How do Thought Bubbles work?',
        a: 'Thought Bubbles appear above your avatar on the map — like a speech bubble showing what\'s on your mind. Set a thought from your Profile page. Premium users can unlock special bubble styles and colours. Thoughts automatically expire after 24 hours.'
    },
    {
        q: 'How does Premium work?',
        a: 'Nearo Premium has three tiers — Silver, Gold, and Diamond. Each tier unlocks extra features: avatar effects, custom chat themes, profile badges, super pokes, priority discovery, and more. You can upgrade from Profile → Premium Plans. Subscriptions renew monthly unless cancelled.'
    },
    {
        q: 'How do I manage Privacy Settings?',
        a: 'Go to Profile → Privacy. You can control who sees your location, hide your online status, enable Ghost Mode (invisible on map), restrict chat to friends only, hide your distance, and manage your visibility radius.'
    },
    {
        q: 'How do I manage Account Settings?',
        a: 'Visit your Profile to update your name, username, bio, profile picture, and interests. Go to Profile → Privacy to change your password. To delete your account, contact support at ' + SUPPORT_EMAIL + '.'
    },
];

function HelpCenter() {
    return (
        <>
            <SectionHero icon="📖" title="Help Center" desc="Learn how Nearo works." bgColor="rgba(29,155,240,0.12)" />
            <div className="hs-accordion">
                {HELP_TOPICS.map((t, i) => <AccordionItem key={i} question={t.q} answer={t.a} />)}
            </div>
        </>
    );
}

/* ============================================================
   SECTION: FAQ
   ============================================================ */
const FAQ_CATEGORIES = [
    {
        title: "Account",
        items: [
            { q: 'How do I create an account?', a: 'Open Nearo and tap "Sign Up". Enter your name, email, and a password. Verify your email via the link sent to your inbox, then set up your profile.' },
            { q: 'How do I change my username?', a: 'Go to your Profile, tap the Edit icon, and select your username to change it. Usernames must be unique and can only be changed once every 30 days.' },
            { q: 'How do I delete my account?', a: 'Go to Settings > Privacy > Delete Account. Account deletion is permanent and removes all your data, including friends and chat history.' }
        ]
    },
    {
        title: "Map & Location",
        items: [
            { q: 'How does Nearby work?', a: 'Nearby uses your device\'s location to show you other Nearo users on an interactive map. You can control who sees you in your privacy settings.' },
            { q: "Why can't I see nearby users?", a: 'Ensure you have granted location permissions in your device settings. Also check if you have toggled "Share Location" on. Some users may be in Ghost Mode.' },
            { q: 'How do I hide my location?', a: 'You can instantly hide your location from everyone by enabling "Ghost Mode" in the quick settings menu or in Profile > Privacy.' }
        ]
    },
    {
        title: "Chat & Interactions",
        items: [
            { q: 'How do I block someone?', a: 'Open their profile or map card, tap the "⋮" menu, and select Block. They will not be notified, and they will no longer see your location or be able to message you.' },
            { q: 'How do I report someone?', a: 'Use the "⋮" menu on their profile or chat and select Report. Choose a reason, and our safety team will review it within 24 hours.' },
            { q: 'How do I delete chats?', a: 'Swipe left on a chat in your inbox to delete the conversation locally. Note that this does not delete the messages from the other person\'s device.' }
        ]
    },
    {
        title: "Voice & Video Calls",
        items: [
            { q: "Why isn't my microphone working?", a: 'Make sure you have granted Nearo microphone permissions in your iOS or Android system settings. Also check that you aren\'t muted in the call interface.' },
            { q: "Why isn't my camera working?", a: 'Ensure Nearo has camera permissions in your device settings. If another app is using the camera, you may need to close it first.' }
        ]
    },
    {
        title: "Premium Subscription",
        items: [
            { q: 'How do I subscribe?', a: 'Go to Profile > Premium to view the available plans (Silver, Gold, Diamond). Tap a plan to securely purchase it via your App Store account.' },
            { q: 'How do I cancel?', a: 'Because billing is handled by your App Store, you must cancel through your Apple ID or Google Play subscriptions page. Benefits continue until the end of the billing cycle.' },
            { q: 'Why wasn\'t my payment successful?', a: 'Ensure your App Store payment method is valid and has sufficient funds. If the issue persists, contact Apple or Google support, as they handle transaction processing.' }
        ]
    },
    {
        title: "Privacy & Safety",
        items: [
            { q: 'Who can see my location?', a: 'By default, your approximate location is visible to nearby users, and your exact location is visible to friends. You can change this to "Friends Only" or "Ghost Mode" at any time.' },
            { q: 'What is Ghost Mode?', a: 'Ghost Mode makes you completely invisible on the map to all users (including friends), while still allowing you to browse the app normally.' },
            { q: 'How is my information protected?', a: 'We use industry-standard encryption and strict database security rules. We do not sell your personal data. Read our Privacy Policy in the Legal section for full details.' }
        ]
    }
];

function FAQ() {
    return (
        <>
            <SectionHero icon="💬" title="Frequently Asked Questions" desc="Quick answers to the most common questions." bgColor="rgba(14,165,233,0.12)" />
            <div className="hs-faq-categories">
                {FAQ_CATEGORIES.map((category, idx) => (
                    <div key={idx} className="hs-faq-category" style={{ marginBottom: 24 }}>
                        <h3 style={{ marginBottom: 12, fontSize: '1.1rem', color: 'var(--text-color)' }}>{category.title}</h3>
                        <div className="hs-accordion">
                            {category.items.map((f, i) => <AccordionItem key={i} question={f.q} answer={f.a} />)}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Report a Bug
   ============================================================ */
function ReportBug({ userId }) {
    const [form, setForm] = useState({ subject: '', description: '' });
    const [screenshot, setScreenshot] = useState(null);
    const [screenshotPreview, setScreenshotPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const fileRef = useRef();

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setError('Screenshot must be under 5 MB.'); return; }
        setScreenshot(file);
        const reader = new FileReader();
        reader.onload = (ev) => setScreenshotPreview(ev.target.result);
        reader.readAsDataURL(file);
        setError(null);
    };

    const handleSubmit = async () => {
        if (!form.subject.trim() || !form.description.trim()) { setError('Please fill in all required fields.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            let screenshot_url = null;
            if (screenshot) {
                const ext = screenshot.name.split('.').pop();
                const path = `bug-reports/${userId}/${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('chat-images').upload(path, screenshot, { upsert: true });
                if (!upErr) {
                    const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(path);
                    screenshot_url = urlData.publicUrl;
                }
            }
            const { error: dbErr } = await supabase.from('bug_reports').insert({
                user_id: userId,
                subject: form.subject.trim(),
                description: form.description.trim(),
                screenshot_url,
            });
            if (dbErr) throw dbErr;
            setSuccess(true);
        } catch (err) {
            console.error(err);
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) return (
        <>
            <SectionHero icon="🐛" title="Report a Bug" desc="Help us improve Nearo." bgColor="rgba(245,158,11,0.12)" />
            <SuccessBox emoji="✅" title="Bug Reported!" subtitle="Thank you — our team will investigate and fix it as soon as possible." onReset={() => { setSuccess(false); setForm({ subject: '', description: '' }); setScreenshot(null); setScreenshotPreview(null); }} />
        </>
    );

    return (
        <>
            <SectionHero icon="🐛" title="Report a Bug" desc="Found something broken? Tell us about it." bgColor="rgba(245,158,11,0.12)" />
            <div className="hs-card" style={{ padding: 16 }}>
                <div className="hs-form">
                    <div className="hs-form-field">
                        <label className="hs-form-label">Subject *</label>
                        <input className="hs-form-input" placeholder="e.g. App crashes on map load" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} maxLength={120} />
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Description *</label>
                        <textarea className="hs-form-textarea" placeholder="Describe what happened, what you expected, and steps to reproduce..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={2000} />
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Screenshot (Optional)</label>
                        <label className="hs-upload-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            {screenshot ? screenshot.name : 'Attach Screenshot'}
                            <input type="file" accept="image/*" onChange={handleFile} ref={fileRef} />
                        </label>
                        {screenshotPreview && <img src={screenshotPreview} alt="preview" className="hs-screenshot-preview" />}
                    </div>
                    {error && <div className="hs-error-box">{error}</div>}
                    <button className="hs-submit-btn" disabled={submitting} onClick={handleSubmit}>
                        {submitting ? <span className="hs-btn-spinner" /> : '🐛 Submit Bug Report'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Contact Support
   ============================================================ */
function ContactSupport({ userId }) {
    const [form, setForm] = useState({ subject: '', message: '' });
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        if (!form.subject.trim() || !form.message.trim()) { setError('Please fill in all fields.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const { error: dbErr } = await supabase.from('support_tickets').insert({
                user_id: userId,
                subject: form.subject.trim(),
                message: form.message.trim(),
            });
            if (dbErr) throw dbErr;
            setSuccess(true);
        } catch (err) {
            console.error(err);
            setError('Failed to send. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) return (
        <>
            <SectionHero icon="📩" title="Contact Support" desc="Get help from the Nearo team." bgColor="rgba(34,197,94,0.12)" />
            <SuccessBox emoji="📨" title="Message Sent!" subtitle={"We'll get back to you at " + SUPPORT_EMAIL + " within " + RESPONSE_TIME + "."} onReset={() => { setSuccess(false); setForm({ subject: '', message: '' }); }} />
        </>
    );

    return (
        <>
            <SectionHero icon="📩" title="Contact Support" desc="Send us a message — we respond within 24–48 hours." bgColor="rgba(34,197,94,0.12)" />

            <div className="hs-contact-box">
                <div className="hs-contact-box-title">Support Info</div>
                <div className="hs-contact-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></span>
                </div>
                <div className="hs-contact-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>Response time: <strong>{RESPONSE_TIME}</strong></span>
                </div>
            </div>

            <div className="hs-card" style={{ padding: 16 }}>
                <div className="hs-form">
                    <div className="hs-form-field">
                        <label className="hs-form-label">Subject *</label>
                        <input className="hs-form-input" placeholder="e.g. Issue with my subscription" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} maxLength={120} />
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Message *</label>
                        <textarea className="hs-form-textarea" placeholder="Describe your issue or question in detail..." value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} maxLength={2000} />
                    </div>
                    {error && <div className="hs-error-box">{error}</div>}
                    <button className="hs-submit-btn" disabled={submitting} onClick={handleSubmit}>
                        {submitting ? <span className="hs-btn-spinner" /> : '📩 Send Message'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Report a User
   ============================================================ */
const REPORT_REASONS = ['Fake Account', 'Spam', 'Harassment', 'Inappropriate Content', 'Scammer', 'Other'];

function ReportUser({ userId }) {
    const [form, setForm] = useState({ username: '', reason: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        if (!form.username.trim() || !form.reason) { setError('Please enter a username and select a reason.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const { error: dbErr } = await supabase.from('user_reports').insert({
                reporter_id: userId,
                reported_username: form.username.trim().replace('@', ''),
                reason: form.reason,
                description: form.description.trim() || null,
            });
            if (dbErr) throw dbErr;
            setSuccess(true);
        } catch (err) {
            console.error(err);
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) return (
        <>
            <SectionHero icon="🚩" title="Report a User" desc="Help keep Nearo safe." bgColor="rgba(239,68,68,0.12)" />
            <SuccessBox emoji="🔍" title="Report Submitted" subtitle="Our safety team will review this report within 24 hours. Thank you for helping keep Nearo safe." onReset={() => { setSuccess(false); setForm({ username: '', reason: '', description: '' }); }} />
        </>
    );

    return (
        <>
            <SectionHero icon="🚩" title="Report a User" desc="All reports are reviewed by our safety team." bgColor="rgba(239,68,68,0.12)" />
            <div className="hs-card" style={{ padding: 16 }}>
                <div className="hs-form">
                    <div className="hs-form-field">
                        <label className="hs-form-label">Username to Report *</label>
                        <input className="hs-form-input" placeholder="@username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} maxLength={60} />
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Reason *</label>
                        <div className="hs-reason-grid">
                            {REPORT_REASONS.map(r => (
                                <span key={r} className={`hs-reason-chip ${form.reason === r ? 'selected' : ''}`} onClick={() => setForm(f => ({ ...f, reason: r }))}>
                                    {r}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Additional Details (Optional)</label>
                        <textarea className="hs-form-textarea" placeholder="Provide any extra context..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={1000} style={{ minHeight: 80 }} />
                    </div>
                    {error && <div className="hs-error-box">{error}</div>}
                    <button className="hs-submit-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 6px 20px rgba(239,68,68,0.28)' }} disabled={submitting} onClick={handleSubmit}>
                        {submitting ? <span className="hs-btn-spinner" /> : '🚩 Submit Report'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Privacy & Safety
   ============================================================ */
const PRIVACY_TOPICS = [
    { icon: '📍', title: 'Location Privacy', body: 'Your location is only shared when you enable "Share Location" in Privacy Settings. You can set a visibility radius, hide your exact distance from others, and enable Friends Only visibility.' },
    { icon: '👻', title: 'Ghost Mode', body: 'When Ghost Mode is active, you disappear from the map. You can still browse and chat with existing connections. Enable Ghost Mode from Profile → Privacy.' },
    { icon: '👥', title: 'Friends Only Mode', body: 'Restrict who can poke and message you to your accepted friends only. This prevents unwanted contact from strangers. Enable from Profile → Privacy → Who can message me.' },
    { icon: '🛡️', title: 'Data Protection', body: 'Your data is stored securely using Supabase with Row Level Security. We never sell your data to third parties. You can request full data export or account deletion by contacting support.' },
    { icon: '🔐', title: 'Account Safety', body: 'Use a strong password and keep your email verified. We use secure session tokens. If you suspect unauthorised access, change your password immediately from Profile → Privacy → Change Password.' },
    { icon: '💡', title: 'Community Safety Tips', body: 'Never share personal information (phone number, home address) with strangers. Use the Block feature to stop unwanted contact. Report suspicious accounts immediately.' },
];

function PrivacySafety() {
    return (
        <>
            <SectionHero icon="🔒" title="Privacy & Safety" desc="Your safety is our top priority." bgColor="rgba(139,92,246,0.12)" />
            <div className="hs-info-card">
                {PRIVACY_TOPICS.map((t, i) => (
                    <div key={i} className="hs-info-row">
                        <div className="hs-info-icon">{t.icon}</div>
                        <div className="hs-info-label">
                            <strong>{t.title}</strong>
                            <span>{t.body}</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Billing & Premium
   ============================================================ */
const TIER_LABELS = { free: 'Free', silver: 'Silver', gold: 'Gold Elite', diamond: 'Diamond Elite' };
const TIER_EMOJI  = { free: '🆓', silver: '🥈', gold: '🥇', diamond: '💎' };

function Billing({ navigate, userId }) {
    const [sub, setSub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        const load = async () => {
            const [{ data: prof }, { data: subData }] = await Promise.all([
                supabase.from('profiles').select('subscription_tier, subscription_expires_at').eq('id', userId).maybeSingle(),
                supabase.from('subscriptions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
            ]);
            setProfile(prof);
            setSub(subData);
            setLoading(false);
        };
        load();
    }, [userId]);

    if (loading) return <div className="hs-loading"><div className="hs-spinner" /><span>Loading…</span></div>;

    const tier = profile?.subscription_tier || 'free';
    const expiresAt = profile?.subscription_expires_at;

    return (
        <>
            <SectionHero icon="💎" title="Billing & Premium" desc="Manage your Nearo subscription." bgColor="rgba(99,102,241,0.12)" />

            {/* Current Plan Card */}
            <div>
                <div className="hs-section-label" style={{ marginBottom: 10 }}>Current Plan</div>
                <div className={`hs-sub-card ${tier}`}>
                    <div className="hs-sub-tier-label">{TIER_EMOJI[tier]} Nearo {TIER_LABELS[tier]}</div>
                    <div className="hs-sub-plan">{TIER_LABELS[tier]}</div>
                    <div className="hs-sub-meta">
                        {tier === 'free' ? 'Upgrade to unlock premium features' :
                            expiresAt ? `Renews: ${new Date(expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Active subscription'}
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="hs-card">
                <div className="hs-card-row" onClick={() => navigate('/subscription')}>
                    <div className="hs-card-icon" style={{ background: 'rgba(99,102,241,0.1)' }}>💎</div>
                    <div className="hs-card-row-text">
                        <div className="hs-card-row-title">{tier === 'free' ? 'Upgrade to Premium' : 'Manage Subscription'}</div>
                        <div className="hs-card-row-sub">View all premium plans</div>
                    </div>
                    <span className="hs-card-chevron"><ChevronRight /></span>
                </div>
                <div className="hs-card-row" onClick={() => navigate('/payment-history')}>
                    <div className="hs-card-icon" style={{ background: 'rgba(34,197,94,0.1)' }}>🧾</div>
                    <div className="hs-card-row-text">
                        <div className="hs-card-row-title">Payment History</div>
                        <div className="hs-card-row-sub">View past transactions</div>
                    </div>
                    <span className="hs-card-chevron"><ChevronRight /></span>
                </div>
            </div>

            {/* Premium Benefits */}
            <div>
                <div className="hs-section-label" style={{ marginBottom: 10 }}>Premium Benefits</div>
                <div className="hs-info-card">
                    {[
                        { icon: '🥈', t: 'Silver', b: 'Avatar effects, custom chat themes, Silver badge, profile analytics' },
                        { icon: '🥇', t: 'Gold', b: 'All Silver benefits + Super Pokes, priority discovery, Gold badge, premium stickers' },
                        { icon: '💎', t: 'Diamond', b: 'All Gold benefits + Diamond Super Pokes, Verified User filters, exclusive Diamond badge' },
                    ].map(({ icon, t, b }) => (
                        <div key={t} className="hs-info-row">
                            <div className="hs-info-icon">{icon}</div>
                            <div className="hs-info-label"><strong>{t}</strong><span>{b}</span></div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Refund Policy */}
            <div>
                <div className="hs-section-label" style={{ marginBottom: 10 }}>Refund Policy</div>
                <div className="hs-info-card" style={{ padding: 16 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #6e6e73)', lineHeight: 1.6 }}>
                        All subscriptions are non-refundable unless required by applicable law. If you experience a billing error, contact us at <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: '#1877F2', fontWeight: 600 }}>{SUPPORT_EMAIL}</a> within 7 days of the charge.
                    </p>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: Feature Requests
   ============================================================ */
function FeatureRequests({ userId }) {
    const [form, setForm] = useState({ title: '', description: '' });
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async () => {
        if (!form.title.trim() || !form.description.trim()) { setError('Please fill in all fields.'); return; }
        setSubmitting(true);
        setError(null);
        try {
            const { error: dbErr } = await supabase.from('feature_requests').insert({
                user_id: userId,
                title: form.title.trim(),
                description: form.description.trim(),
            });
            if (dbErr) throw dbErr;
            setSuccess(true);
        } catch (err) {
            console.error(err);
            setError('Failed to submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (success) return (
        <>
            <SectionHero icon="💡" title="Feature Requests" desc="Share your ideas with us." bgColor="rgba(217,119,6,0.12)" />
            <SuccessBox emoji="💡" title="Request Submitted!" subtitle="Thank you! We review every suggestion. Popular ideas get prioritised in our roadmap." onReset={() => { setSuccess(false); setForm({ title: '', description: '' }); }} />
        </>
    );

    return (
        <>
            <SectionHero icon="💡" title="Feature Requests" desc="Got a great idea? We'd love to hear it." bgColor="rgba(217,119,6,0.12)" />
            <div className="hs-card" style={{ padding: 16 }}>
                <div className="hs-form">
                    <div className="hs-form-field">
                        <label className="hs-form-label">Feature Title *</label>
                        <input className="hs-form-input" placeholder="e.g. Dark mode for map markers" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} maxLength={100} />
                    </div>
                    <div className="hs-form-field">
                        <label className="hs-form-label">Description *</label>
                        <textarea className="hs-form-textarea" placeholder="Describe the feature and why it would be useful..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={2000} />
                    </div>
                    {error && <div className="hs-error-box">{error}</div>}
                    <button className="hs-submit-btn" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 6px 20px rgba(245,158,11,0.28)' }} disabled={submitting} onClick={handleSubmit}>
                        {submitting ? <span className="hs-btn-spinner" /> : '💡 Submit Idea'}
                    </button>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   SECTION: What's New
   ============================================================ */
const CHANGELOG = [
    {
        version: 'v1.1.0',
        date: 'July 2026',
        features: [
            'Blue Verified Badge system for trusted accounts',
            'Help & Support hub with 12 sections',
            'Premium Map Profile Cards (Silver & Gold)',
            'Super Poke system for Gold & Diamond members',
        ],
        improvements: [
            'Faster map loading with optimised profile queries',
            'Improved dark mode across all pages',
            'Better avatar ring effects for premium tiers',
        ],
        fixes: [
            'Fixed chat header showing incorrect online status',
            'Fixed profile username display on mobile',
            'Resolved notification delivery on background mode',
        ],
    },
    {
        version: 'v1.0.0',
        date: 'June 2026',
        features: [
            'Real-time location map with avatar markers',
            'Thought Bubbles above map avatars',
            'Poke system to connect with nearby users',
            'Real-time chat with media sharing',
            'Premium tiers: Silver, Gold, Diamond',
            'Ghost Mode and Friends Only privacy controls',
            'Profile Visitors tracking (Premium)',
        ],
        improvements: [],
        fixes: ['Initial production release'],
    },
];

function WhatsNew() {
    return (
        <>
            <SectionHero icon="🚀" title="What's New" desc="Latest features, improvements, and fixes." bgColor="rgba(20,184,166,0.12)" />
            {CHANGELOG.map((log, i) => (
                <div key={i} className="hs-changelog-item">
                    <div className="hs-changelog-header">
                        <span className="hs-changelog-version">{log.version}</span>
                        <span className="hs-changelog-date">{log.date}</span>
                    </div>
                    {log.features.length > 0 && (
                        <div className="hs-changelog-category">
                            <div className="hs-changelog-cat-label">✨ New Features</div>
                            <div className="hs-changelog-list">
                                {log.features.map((f, j) => (
                                    <div key={j} className="hs-changelog-entry">
                                        <div className="hs-changelog-dot hs-dot-green" />
                                        {f}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {log.improvements.length > 0 && (
                        <div className="hs-changelog-category">
                            <div className="hs-changelog-cat-label">⚡ Improvements</div>
                            <div className="hs-changelog-list">
                                {log.improvements.map((im, j) => (
                                    <div key={j} className="hs-changelog-entry">
                                        <div className="hs-changelog-dot hs-dot-blue" />
                                        {im}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {log.fixes.length > 0 && (
                        <div className="hs-changelog-category">
                            <div className="hs-changelog-cat-label">🔧 Bug Fixes</div>
                            <div className="hs-changelog-list">
                                {log.fixes.map((fix, j) => (
                                    <div key={j} className="hs-changelog-entry">
                                        <div className="hs-changelog-dot hs-dot-orange" />
                                        {fix}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </>
    );
}

/* ============================================================
   SECTION: Legal
   ============================================================ */
function Legal({ navigate }) {
    const links = [
        { icon: '🔏', bg: 'rgba(99,102,241,0.1)', label: 'Privacy Policy',        path: '/legal/privacy' },
        { icon: '📋', bg: 'rgba(14,165,233,0.1)',  label: 'Terms & Conditions',    path: '/legal/terms'   },
        { icon: '🛡️', bg: 'rgba(34,197,94,0.1)',   label: 'Community Guidelines',  path: '/legal/guidelines'  },
        { icon: '⚖️', bg: 'rgba(245,158,11,0.1)',  label: 'Cookie Policy',         path: '/legal/cookies' },
        { icon: '💸', bg: 'rgba(239,68,68,0.1)',   label: 'Refund Policy',         path: '/legal/refunds' },
        { icon: '🔒', bg: 'rgba(14,165,233,0.1)',  label: 'Safety Center',         path: '/legal/safety'  },
        { icon: '💡', bg: 'rgba(234,179,8,0.1)',   label: 'Safety Tips',           path: '/legal/safety-tips' },
        { icon: '🧒', bg: 'rgba(239,68,68,0.12)',  label: 'Child Safety Policy',   path: '/legal/child-safety' },
    ];
    return (
        <>
            <SectionHero icon="⚖️" title="Legal" desc="Our policies and guidelines." bgColor="rgba(236,72,153,0.12)" />
            <div className="hs-card">
                {links.map((l, i) => (
                    <div key={i} className="hs-legal-link-row" onClick={() => navigate(l.path)}>
                        <div className="hs-legal-row-left">
                            <div className="hs-legal-icon" style={{ background: l.bg }}>{l.icon}</div>
                            <div className="hs-legal-row-title">{l.label}</div>
                        </div>
                        <ChevronRight />
                    </div>
                ))}
            </div>
        </>
    );
}

/* ============================================================
   SECTION: About
   ============================================================ */
function About() {
    const INFO = [
        { icon: '📱', label: 'App Version',    val: `v${APP_VERSION}` },
        { icon: '🔧', label: 'Build Version',  val: BUILD_VERSION },
        { icon: '🌐', label: 'Website',        val: 'nearo.co.in', link: 'https://nearo.co.in' },
        { icon: '📧', label: 'Contact',        val: SUPPORT_EMAIL, link: `mailto:${SUPPORT_EMAIL}` },
        { icon: '©️',  label: 'Copyright',      val: `© ${new Date().getFullYear()} Nearo. All rights reserved.` },
    ];
    return (
        <>
            <SectionHero icon="ℹ️" title="About Nearo" desc="Everything about this app." bgColor="rgba(244,63,94,0.12)" />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span className="hs-version-badge">🚀 Nearo v{APP_VERSION}</span>
            </div>
            <div className="hs-info-card">
                {INFO.map(({ icon, label, val, link }, i) => (
                    <div key={i} className="hs-info-row">
                        <div className="hs-info-icon">{icon}</div>
                        <div className="hs-info-label">
                            <strong>{label}</strong>
                            {link
                                ? <span><a href={link} target="_blank" rel="noopener noreferrer" style={{ color: '#1877F2', fontWeight: 600, textDecoration: 'none' }}>{val}</a></span>
                                : <span>{val}</span>
                            }
                        </div>
                    </div>
                ))}
            </div>

            <div>
                <div className="hs-section-label" style={{ marginBottom: 10 }}>Open Source</div>
                <div className="hs-info-card" style={{ padding: 16 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #6e6e73)', lineHeight: 1.6 }}>
                        Nearo is built with React, Supabase, Leaflet, Framer Motion, Agora RTC, and other open source libraries. We are grateful to the open source community.
                    </p>
                </div>
            </div>
        </>
    );
}

/* ============================================================
   MAIN PAGE
   ============================================================ */
const SECTION_TITLES = {
    home:             'Help & Support',
    'help-center':    'Help Center',
    faq:              'FAQ',
    'report-bug':     'Report a Bug',
    contact:          'Contact Support',
    'report-user':    'Report a User',
    blocked:          'Blocked Users',
    'privacy-safety': 'Privacy & Safety',
    billing:          'Billing & Premium',
    'feature-requests':'Feature Requests',
    'whats-new':      "What's New",
    legal:            'Legal',
    about:            'About Nearo',
};

export default function HelpSupport() {
    const navigate = useNavigate();
    const location = useLocation();
    const [section, setSection] = useState('home');
    const [userId, setUserId] = useState(null);
    const [loadingUser, setLoadingUser] = useState(true);

    // Get logged-in user ID
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session?.user) { navigate('/login'); return; }
            setUserId(session.user.id);
            setLoadingUser(false);
        });
    }, []);

    // Handle deep-link via query param e.g. /profile/help?section=faq
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const sec = params.get('section');
        if (sec && SECTION_TITLES[sec]) setSection(sec);
    }, [location.search]);

    const goBack = () => {
        if (section === 'home') navigate('/profile');
        else setSection('home');
    };

    const onNav = (id) => {
        if (id === 'blocked') { navigate('/blocked-users'); return; }
        setSection(id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const renderSection = () => {
        if (loadingUser) return <div className="hs-loading"><div className="hs-spinner" /><span>Loading…</span></div>;
        switch (section) {
            case 'home':              return <HomeGrid onNav={onNav} />;
            case 'help-center':       return <HelpCenter />;
            case 'faq':               return <FAQ />;
            case 'report-bug':        return <ReportBug userId={userId} />;
            case 'contact':           return <ContactSupport userId={userId} />;
            case 'report-user':       return <ReportUser userId={userId} />;
            case 'privacy-safety':    return <PrivacySafety />;
            case 'billing':           return <Billing navigate={navigate} userId={userId} />;
            case 'feature-requests':  return <FeatureRequests userId={userId} />;
            case 'whats-new':         return <WhatsNew />;
            case 'legal':             return <Legal navigate={navigate} />;
            case 'about':             return <About />;
            default:                  return <HomeGrid onNav={onNav} />;
        }
    };

    return (
        <div className="hs-page">
            <div className="hs-header">
                <button className="hs-back-btn" onClick={goBack} aria-label="Back">
                    <BackIcon />
                </button>
                <h1 className="hs-header-title">{SECTION_TITLES[section]}</h1>
            </div>
            <div className="hs-content">
                {renderSection()}
            </div>
        </div>
    );
}
