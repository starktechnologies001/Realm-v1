import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import { supabase } from '../supabaseClient';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';

const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        if (typeof dateStr === 'string' && dateStr.length >= 10 && dateStr.includes('-')) {
            const [y, m, d] = dateStr.substring(0, 10).split('-');
            const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            if (!isNaN(dateObj.getTime())) {
                return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            }
        }
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return 'N/A';
        return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch (e) {
        return 'N/A';
    }
};

const formatJoinDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' });
};

export default function UserProfilePage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { startCall } = useCall();

    const [currentUser, setCurrentUser] = useState(null);
    const [user, setUser] = useState(null);
    const [details, setDetails] = useState(null);
    const [sharedMedia, setSharedMedia] = useState([]);
    const [previewImage, setPreviewImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Single combined fetch — gets session + target profile in one go
    useEffect(() => {
        if (!userId) return;

        const fetchAll = async () => {
            setLoading(true);
            setError(null);

            // 1. Get current session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) { navigate('/login'); return; }

            // 2. Get current user's profile (for mutuals + friendship queries)
            const { data: me } = await supabase
                .from('profiles')
                .select('id, latitude, longitude')
                .eq('id', session.user.id)
                .maybeSingle();

            const meId = session.user.id;
            setCurrentUser(me || { id: meId });

            // 3. Fetch the target profile
            const { data: profile, error: profileErr } = await supabase
                .from('profiles')
                .select('*, is_public')
                .eq('id', userId)
                .maybeSingle();

            if (profileErr) {
                console.error('❌ [UserProfilePage] Profile fetch error:', profileErr);
                setError(profileErr.message);
                setLoading(false);
                return;
            }

            if (!profile) {
                console.warn('⚠️ [UserProfilePage] No profile found for userId:', userId);
                setLoading(false);
                return;
            }

            // 4. Friendship status
            const { data: friendship } = await supabase
                .from('friendships')
                .select('status, requester_id')
                .or(`and(requester_id.eq.${meId},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${meId})`)
                .maybeSingle();

            const friendshipStatus = friendship?.status || 'none';
            const requesterId = friendship?.requester_id || null;

            setUser({ ...profile, name: profile.username || profile.full_name, friendshipStatus, requesterId });

            // 5. Mutuals
            const { data: myFriends } = await supabase.from('friendships')
                .select('receiver_id, requester_id')
                .or(`requester_id.eq.${meId},receiver_id.eq.${meId}`)
                .eq('status', 'accepted');
            const myFriendIds = new Set(myFriends?.map(f => f.requester_id === meId ? f.receiver_id : f.requester_id) || []);

            const { data: theirFriends } = await supabase.from('friendships')
                .select('receiver_id, requester_id')
                .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
                .eq('status', 'accepted');
            const theirFriendIds = theirFriends?.map(f => f.requester_id === userId ? f.receiver_id : f.requester_id) || [];
            const mutualCount = theirFriendIds.filter(id => myFriendIds.has(id)).length;

            setDetails({
                bio: profile.bio || 'No bio set.',
                interests: profile.interests || [],
                birthDate: profile.birth_date,
                joinedAt: profile.created_at,
                mutuals: mutualCount,
                username: profile.username,
                relationship_status: profile.relationship_status,
                is_public: profile.is_public !== false
            });

            // 6. Shared media (friends only)
            if (friendshipStatus === 'accepted') {
                const { data: media, error: mediaErr } = await supabase
                    .from('messages')
                    .select('content, image_url, created_at')
                    .or(`and(sender_id.eq.${meId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${meId})`)
                    .eq('message_type', 'image')
                    .not('image_url', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (mediaErr) console.error('❌ [UserProfilePage] Media fetch error:', mediaErr);
                if (media) setSharedMedia(media);
            }

            setLoading(false);
        };

        fetchAll();
    }, [userId, navigate]);

    const handleAction = async (action) => {
        if (!user || !currentUser) return;
        if (action === 'message') {
            navigate('/chat', { state: { openChatWith: user } });
        } else if (action === 'call-audio') {
            startCall(user, 'audio');
        } else if (action === 'call-video') {
            startCall(user, 'video');
        } else if (action === 'poke') {
            if (user.friendshipStatus === 'pending' && user.requesterId === currentUser.id) {
                // Cancel Poke
                await supabase.from('friendships').delete().match({ requester_id: currentUser.id, receiver_id: user.id, status: 'pending' });
                setUser(u => ({ ...u, friendshipStatus: 'none', requesterId: null }));
            } else {
                // Send Poke
                await supabase.from('friendships').insert({ requester_id: currentUser.id, receiver_id: user.id, status: 'pending' });
                setUser(u => ({ ...u, friendshipStatus: 'pending', requesterId: currentUser.id }));
            }
        } else if (action === 'block') {
            await supabase.from('blocked_users').insert({ blocker_id: currentUser.id, blocked_id: user.id });
            navigate(-1);
        } else if (action === 'report') {
            // Could open a report modal — for now just go back
            navigate(-1);
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingWrap}>
                <div style={styles.spinner} />
                <p style={styles.loadingText}>Loading profile…</p>
            </div>
        );
    }

    if (!user || !details) {
        return (
            <div style={styles.loadingWrap}>
                <p style={{ ...styles.loadingText, fontSize: '2rem', marginBottom: '4px' }}>😕</p>
                <p style={styles.loadingText}>{error ? `Error: ${error}` : 'User not found.'}</p>
                <button style={styles.backBtn} onClick={() => navigate(-1)}>← Go Back</button>
            </div>
        );
    }

    const avatarUrl = user.avatar_url || (user.gender === 'Male' ? DEFAULT_MALE_AVATAR : user.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR);
    const displayAvatar = getAvatar2D(avatarUrl);
    const birthday = details.birthDate ? formatDate(details.birthDate) : null;
    const joinedDate = formatJoinDate(details.joinedAt);
    const isFriend = user.friendshipStatus === 'accepted';
    const isPublic = details.is_public;
    const canSeeFullProfile = isFriend || isPublic;

    return (
        <div style={styles.page}>
            {/* Hero Banner — blurred avatar as bg */}
            <div style={{ ...styles.heroBanner, backgroundImage: `url(${displayAvatar})` }}>
                <div style={styles.heroBannerOverlay} />
                {/* Back Button float */}
                <button style={styles.backBtnTop} onClick={() => navigate(-1)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                    </svg>
                </button>
            </div>

            {/* Avatar — overlaps the hero banner */}
            <div style={styles.avatarWrap}>
                <div style={{
                    ...styles.avatarRing,
                    boxShadow: user.is_location_on
                        ? '0 0 0 3px #30d158, 0 0 20px rgba(48,209,88,0.4), 0 12px 40px rgba(0,0,0,0.6)'
                        : '0 0 0 3px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.6)'
                }}>
                    <img src={displayAvatar} alt={user.username || user.name} style={styles.avatarImg} fetchpriority="high" />
                </div>
                {/* Online badge */}
                <div style={{
                    ...styles.onlineDot,
                    background: user.is_location_on ? '#30d158' : '#555',
                    boxShadow: user.is_location_on ? '0 0 0 2px #1c1c1e, 0 0 10px rgba(48,209,88,0.6)' : '0 0 0 2px #1c1c1e'
                }} />
            </div>

            {/* Identity */}
            <div style={styles.identity}>
                <h1 style={styles.name}>{user.username || user.name}</h1>
                <div style={styles.badgeRow}>
                    {details.relationship_status && (
                        <span style={styles.statusPill}>
                            💕 {details.relationship_status}
                        </span>
                    )}
                    {isFriend && <span style={styles.friendBadge}>🤝 Friend</span>}
                    {!isFriend && isPublic && <span style={styles.publicBadge}>🌍 Public</span>}
                    {!isFriend && !isPublic && <span style={styles.privateBadge}>🔒 Private</span>}
                </div>
            </div>

            {/* Stats */}
            {canSeeFullProfile && (
                <div style={styles.statsRow}>
                    <div style={styles.statCard}>
                        <span style={styles.statVal}>{details.mutuals}</span>
                        <span style={styles.statLabel}>Mutuals</span>
                    </div>
                    <div style={styles.statCard}>
                        <span style={styles.statVal}>{joinedDate}</span>
                        <span style={styles.statLabel}>Joined</span>
                    </div>
                    {birthday && (
                        <div style={styles.statCard}>
                            <span style={styles.statVal}>🎂 {birthday}</span>
                            <span style={styles.statLabel}>Birthday</span>
                        </div>
                    )}
                </div>
            )}

            {/* Content Cards — ABOVE action buttons */}
            <div style={styles.contentArea}>

                {/* Bio */}
                {canSeeFullProfile && (
                    <div style={styles.card}>
                        <span style={styles.cardLabel}>About</span>
                        <p style={styles.bioText}>{details.bio}</p>
                    </div>
                )}

                {/* Interests */}
                {canSeeFullProfile && details.interests.length > 0 && (
                    <div style={styles.card}>
                        <span style={styles.cardLabel}>Interests</span>
                        <div style={styles.tagsRow}>
                            {details.interests.map((tag, i) => (
                                <span key={i} style={styles.tag}>{tag}</span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons — BELOW bio */}
            <div style={styles.actionsWrap}>
                {isFriend ? (
                    <div style={styles.actionRow}>
                        {/* Message — blue gradient */}
                        <button style={styles.actionBtnMessage} onClick={() => handleAction('message')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                            </svg>
                            <span style={styles.actionLabel}>Message</span>
                        </button>
                        {/* Call — green */}
                        <button style={styles.actionBtnCall} onClick={() => handleAction('call-audio')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                            </svg>
                            <span style={styles.actionLabel}>Call</span>
                        </button>
                        {/* Video — purple */}
                        <button style={styles.actionBtnVideo} onClick={() => handleAction('call-video')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                            </svg>
                            <span style={styles.actionLabel}>Video</span>
                        </button>
                    </div>
                ) : (
                    <button style={styles.pokeBtn} onClick={() => handleAction('poke')}>
                        {user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id
                            ? <><span>⏳</span> Request Sent</>
                            : <><span>👋</span> Add Friend</>}
                    </button>
                )}
            </div>
            {/* Post-action content */}
            <div style={styles.contentArea}>
                {/* Shared Media */}
                {isFriend && sharedMedia.length > 0 && (
                    <div style={styles.card}>
                        <span style={styles.cardLabel}>Shared Media</span>
                        <div style={styles.mediaGrid}>
                            {sharedMedia.slice(0, 6).map((m, i) => (
                                <div key={i} style={styles.mediaItem} onClick={() => setPreviewImage(m.image_url)}>
                                    <img src={m.image_url} alt="Shared" style={styles.mediaImg} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div style={styles.footer}>
                    <button style={styles.dangerLink} onClick={() => handleAction('block')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                        Block User
                    </button>
                    <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 18 }}>|</span>
                    <button style={styles.dangerLink} onClick={() => handleAction('report')}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                        Report User
                    </button>
                </div>
            </div>

            {/* Lightbox */}
            {previewImage && (
                <div style={styles.lightbox} onClick={() => setPreviewImage(null)}>
                    <img src={previewImage} alt="Preview" style={styles.lightboxImg} />
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
            `}</style>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: '#111113',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflowX: 'hidden',
        paddingBottom: 100,
    },

    /* ── Hero Banner ── */
    heroBanner: {
        width: '100%',
        height: 190,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        position: 'relative',
        flexShrink: 0,
    },
    heroBannerOverlay: {
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(17,17,19,0.15) 0%, rgba(17,17,19,0.7) 70%, rgba(17,17,19,1) 100%)',
        backdropFilter: 'blur(28px) saturate(160%)',
        WebkitBackdropFilter: 'blur(28px) saturate(160%)',
    },
    backBtnTop: {
        position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16,
        width: 38, height: 38, borderRadius: '50%',
        background: 'rgba(0,0,0,0.35)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.15)',
        color: 'white', cursor: 'pointer', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },

    /* ── Avatar ── */
    avatarWrap: {
        position: 'relative',
        marginTop: -62,
        zIndex: 5,
        marginBottom: 16,
    },
    avatarRing: {
        width: 116, height: 116,
        borderRadius: '50%',
        padding: 3,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))',
    },
    avatarImg: {
        width: '100%', height: '100%',
        borderRadius: '50%',
        objectFit: 'cover',
        border: '3px solid #111113',
        display: 'block',
    },
    onlineDot: {
        position: 'absolute', bottom: 7, right: 7,
        width: 18, height: 18, borderRadius: '50%',
    },

    /* ── Identity ── */
    identity: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 10, paddingBottom: 20, animation: 'fadeUp 0.4s ease',
    },
    name: {
        margin: 0, fontSize: '1.65rem', fontWeight: 800,
        letterSpacing: '-0.5px',
        background: 'linear-gradient(135deg, #fff 20%, #a0a0b0 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    },
    badgeRow: {
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center',
    },
    statusPill: {
        background: 'linear-gradient(135deg, rgba(255,100,130,0.15), rgba(255,60,100,0.1))',
        padding: '5px 14px', borderRadius: 20,
        fontSize: '0.8rem', color: '#ff6482', fontWeight: 700,
        border: '1px solid rgba(255,100,130,0.35)',
        boxShadow: '0 0 12px rgba(255,100,130,0.2)',
        letterSpacing: '0.2px',
    },
    friendBadge: {
        background: 'linear-gradient(90deg,#00d4ff,#0084ff)',
        color: 'white', padding: '5px 16px', borderRadius: 100,
        fontSize: '0.8rem', fontWeight: 700,
        boxShadow: '0 4px 14px rgba(0,132,255,0.35)',
    },
    publicBadge: {
        background: 'rgba(48,209,88,0.1)', color: '#30d158',
        padding: '5px 16px', borderRadius: 100, fontSize: '0.8rem', fontWeight: 700,
        border: '1px solid rgba(48,209,88,0.25)',
    },
    privateBadge: {
        background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
        padding: '5px 16px', borderRadius: 100, fontSize: '0.8rem', fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.1)',
    },

    /* ── Stats ── */
    statsRow: {
        display: 'flex', gap: 10,
        width: '92%', maxWidth: 420, marginBottom: 20,
        animation: 'fadeUp 0.45s ease',
    },
    statCard: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '16px 8px',
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.07)',
    },
    statVal: {
        fontSize: '0.95rem', fontWeight: 700, color: 'white',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
    },
    statLabel: {
        fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)',
        fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase',
    },

    /* ── Action Buttons ── */
    actionsWrap: {
        width: '92%', maxWidth: 420, marginBottom: 24,
        animation: 'fadeUp 0.5s ease',
        display: 'flex', justifyContent: 'center',
    },
    actionRow: {
        display: 'flex', gap: 10, justifyContent: 'center',
    },
    /* Message */
    actionBtnMessage: {
        width: 88, padding: '9px 0', borderRadius: 14,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontWeight: 700, fontSize: '0.72rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4,
    },
    /* Call */
    actionBtnCall: {
        width: 72, padding: '9px 0', borderRadius: 14,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontWeight: 700, fontSize: '0.72rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4,
    },
    /* Video */
    actionBtnVideo: {
        width: 72, padding: '9px 0', borderRadius: 14,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', fontWeight: 700, fontSize: '0.72rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 4,
    },
    actionLabel: { fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2px' },
    pokeBtn: {
        width: '100%', padding: '16px', borderRadius: 20, border: 'none',
        background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
        color: 'white', fontWeight: 700, fontSize: '1rem',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        boxShadow: '0 8px 24px rgba(124,58,237,0.35)',
    },

    /* ── Content Area ── */
    contentArea: {
        width: '92%', maxWidth: 420,
        display: 'flex', flexDirection: 'column', gap: 14,
        animation: 'fadeUp 0.55s ease',
        marginBottom: 20,
    },
    card: {
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.07)',
        padding: '18px 20px',
    },
    cardLabel: {
        display: 'block',
        fontSize: '0.65rem', fontWeight: 800, letterSpacing: '1.2px',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
        marginBottom: 12,
    },
    bioText: {
        color: 'rgba(255,255,255,0.75)', fontSize: '0.95rem',
        lineHeight: 1.65, margin: 0, fontStyle: 'italic',
    },
    tagsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    tag: {
        background: 'rgba(0,132,255,0.12)', color: '#60b4ff',
        padding: '7px 14px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 500,
        border: '1px solid rgba(0,132,255,0.2)',
    },
    mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 },
    mediaItem: {
        aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
        cursor: 'pointer', background: 'rgba(255,255,255,0.05)',
        transition: 'transform 0.18s',
    },
    mediaImg: { width: '100%', height: '100%', objectFit: 'cover' },

    /* ── Footer ── */
    footer: {
        display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center',
        marginTop: 8, paddingTop: 8,
    },
    dangerLink: {
        background: 'none', border: 'none',
        color: 'rgba(255,59,48,0.6)', cursor: 'pointer',
        fontSize: '0.82rem', fontWeight: 600, padding: '8px 4px',
        display: 'flex', alignItems: 'center',
        transition: 'color 0.2s',
    },

    /* ── Misc ── */
    loadingWrap: {
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#111113', color: 'white', gap: 16,
    },
    spinner: {
        width: 36, height: 36,
        border: '3px solid rgba(255,255,255,0.08)',
        borderTopColor: '#7c3aed',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    },
    loadingText: { color: 'rgba(255,255,255,0.45)', fontSize: 15, margin: 0 },
    backBtn: {
        background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white',
        padding: '10px 20px', borderRadius: 12, cursor: 'pointer', fontSize: 14,
    },
    lightbox: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.94)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
    },
    lightboxImg: { maxWidth: '92%', maxHeight: '90%', borderRadius: 14 },
};

