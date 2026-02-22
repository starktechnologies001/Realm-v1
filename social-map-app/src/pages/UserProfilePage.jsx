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

            setUser({ ...profile, name: profile.full_name || profile.username, friendshipStatus, requesterId });

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
                username: profile.username || profile.full_name,
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
            {/* Back Button */}
            <button style={styles.backBtnTop} onClick={() => navigate(-1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                </svg>
            </button>

            {/* Header / Hero */}
            <div style={styles.hero}>
                <div style={styles.avatarRing}>
                    <img src={displayAvatar} alt={user.name} style={styles.avatarImg} />
                    <div style={{ ...styles.onlineDot, background: user.is_location_on ? '#30d158' : '#555' }} />
                </div>
                <h1 style={styles.name}>{user.name}</h1>
                <span style={styles.handle}>@{details.username}</span>
                <div style={styles.badgeRow}>
                    {details.relationship_status && <span style={styles.statusPill}>{details.relationship_status}</span>}
                    {isFriend && <span style={styles.friendBadge}>🤝 Friend</span>}
                    {!isFriend && isPublic && <span style={styles.publicBadge}>🌍 Public</span>}
                    {!isFriend && !isPublic && <span style={styles.privateBadge}>🔒 Private Profile</span>}
                </div>
            </div>

            {/* Stats */}
            {canSeeFullProfile && (
                <div style={styles.statsRow}>
                    <div style={styles.statItem}>
                        <span style={styles.statVal}>{details.mutuals}</span>
                        <span style={styles.statLabel}>MUTUALS</span>
                    </div>
                    <div style={{ ...styles.statItem, borderLeft: '1px solid rgba(255,255,255,0.07)', borderRight: birthday ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                        <span style={styles.statVal}>{joinedDate}</span>
                        <span style={styles.statLabel}>JOINED</span>
                    </div>
                    {birthday && (
                        <div style={styles.statItem}>
                            <span style={styles.statVal}>🎂 {birthday}</span>
                            <span style={styles.statLabel}>BIRTHDAY</span>
                        </div>
                    )}
                </div>
            )}

            {/* Bio */}
            {canSeeFullProfile && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>ABOUT</h4>
                    <p style={styles.bioText}>{details.bio}</p>
                </div>
            )}

            {/* Interests */}
            {canSeeFullProfile && details.interests.length > 0 && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>INTERESTS</h4>
                    <div style={styles.tagsRow}>
                        {details.interests.map((tag, i) => (
                            <span key={i} style={styles.tag}>{tag}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Shared Media */}
            {isFriend && sharedMedia.length > 0 && (
                <div style={styles.section}>
                    <h4 style={styles.sectionTitle}>SHARED MEDIA</h4>
                    <div style={styles.mediaGrid}>
                        {sharedMedia.slice(0, 4).map((m, i) => (
                            <div key={i} style={styles.mediaItem} onClick={() => setPreviewImage(m.image_url)}>
                                <img src={m.image_url} alt="Shared" style={styles.mediaImg} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div style={styles.actionsWrap}>
                {isFriend ? (
                    <div style={styles.actionRow}>
                        <button style={{ ...styles.iconBtn, background: 'linear-gradient(135deg,#00C6FF,#0072FF)', boxShadow: '0 8px 20px rgba(0,114,255,0.3)' }} onClick={() => handleAction('message')}>
                            <span style={{ fontSize: '1.4rem' }}>💬</span>
                        </button>
                        <button style={styles.secondaryIconBtn} onClick={() => handleAction('call-audio')}>
                            <span style={{ fontSize: '1.4rem' }}>📞</span>
                        </button>
                        <button style={styles.secondaryIconBtn} onClick={() => handleAction('call-video')}>
                            <span style={{ fontSize: '1.4rem' }}>📹</span>
                        </button>
                    </div>
                ) : (
                    <button style={styles.pokeBtn} onClick={() => handleAction('poke')}>
                        {user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id ? '⏳ Requested' : '👋 Poke'}
                    </button>
                )}
            </div>

            {/* Footer */}
            <div style={styles.footer}>
                <button style={styles.dangerLink} onClick={() => handleAction('block')}>Block User</button>
                <span style={{ color: '#444' }}>•</span>
                <button style={styles.dangerLink} onClick={() => handleAction('report')}>Report User</button>
            </div>

            {/* Image Lightbox */}
            {previewImage && (
                <div style={styles.lightbox} onClick={() => setPreviewImage(null)}>
                    <img src={previewImage} alt="Preview" style={styles.lightboxImg} />
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: 'radial-gradient(circle at top right, #2a2a2e 0%, #1c1c1e 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0 20px 100px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflowX: 'hidden',
    },
    loadingWrap: {
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#1c1c1e', color: 'white', gap: '16px',
    },
    spinner: {
        width: '36px', height: '36px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#6c47ff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
    loadingText: { color: 'rgba(255,255,255,0.5)', fontSize: '15px', margin: 0 },
    backBtnTop: {
        alignSelf: 'flex-start',
        marginTop: 'max(16px, env(safe-area-inset-top))',
        marginLeft: '-4px',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'white',
        width: '38px', height: '38px',
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
    },
    backBtn: {
        background: 'rgba(255,255,255,0.08)', border: 'none', color: 'white',
        padding: '10px 20px', borderRadius: '12px', cursor: 'pointer', fontSize: '14px',
    },
    hero: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '32px', paddingBottom: '8px', width: '100%',
    },
    avatarRing: {
        position: 'relative', width: '110px', height: '110px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02))',
        padding: '4px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
        marginBottom: '16px',
    },
    avatarImg: {
        width: '100%', height: '100%', borderRadius: '50%',
        objectFit: 'cover', border: '3px solid #1c1c1e',
    },
    onlineDot: {
        position: 'absolute', bottom: '8px', right: '8px',
        width: '20px', height: '20px', borderRadius: '50%',
        border: '3px solid #1c1c1e',
    },
    name: {
        margin: '0 0 4px', fontSize: '1.75rem', fontWeight: 800,
        letterSpacing: '-0.5px',
        background: 'linear-gradient(180deg, #fff 0%, #ccc 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    },
    handle: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', fontWeight: 500, marginBottom: '12px' },
    badgeRow: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
    statusPill: {
        background: 'rgba(255,255,255,0.06)', padding: '5px 14px',
        borderRadius: '20px', fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500,
    },
    friendBadge: {
        background: 'linear-gradient(90deg,#00d4ff,#0084ff)',
        color: 'white', padding: '5px 16px', borderRadius: '100px',
        fontSize: '0.82rem', fontWeight: 700,
        boxShadow: '0 4px 12px rgba(0,132,255,0.3)',
    },
    publicBadge: {
        background: 'rgba(48,209,88,0.1)',
        color: '#30d158', padding: '5px 16px', borderRadius: '100px',
        fontSize: '0.82rem', fontWeight: 700,
        border: '1px solid rgba(48,209,88,0.2)',
    },
    privateBadge: {
        background: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.4)', padding: '5px 16px', borderRadius: '100px',
        fontSize: '0.82rem', fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.1)',
    },
    statsRow: {
        display: 'flex', width: '100%', maxWidth: '400px',
        padding: '20px 0',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        margin: '24px 0',
    },
    statItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', overflow: 'hidden', minWidth: 0 },
    statVal: { display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '100%' },
    statLabel: { display: 'block', fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '100%' },
    section: { width: '100%', maxWidth: '400px', marginBottom: '24px', textAlign: 'left' },
    sectionTitle: {
        fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)',
        letterSpacing: '1.5px', marginBottom: '12px', fontWeight: 700,
        textTransform: 'uppercase', paddingLeft: '2px',
    },
    bioText: {
        color: 'rgba(255,255,255,0.88)', fontSize: '0.95rem',
        lineHeight: 1.6, margin: 0,
        background: 'rgba(255,255,255,0.04)', padding: '16px', borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.05)',
    },
    tagsRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
    tag: {
        background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.85)',
        padding: '7px 14px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.07)',
    },
    mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' },
    mediaItem: { aspectRatio: '1', borderRadius: '14px', overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,0.05)' },
    mediaImg: { width: '100%', height: '100%', objectFit: 'cover' },
    actionsWrap: { width: '100%', maxWidth: '400px', marginBottom: '20px' },
    actionRow: { display: 'flex', gap: '12px', justifyContent: 'center' },
    iconBtn: {
        width: '60px', height: '60px', borderRadius: '20px', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'transform 0.2s',
    },
    secondaryIconBtn: {
        width: '60px', height: '60px', borderRadius: '20px', 
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.08)',
        color: 'white',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'transform 0.2s',
    },
    pokeBtn: {
        width: '100%', padding: '16px', borderRadius: '18px', border: 'none',
        background: 'linear-gradient(135deg,#6c47ff,#9b59ff)',
        color: 'white', fontWeight: 700, fontSize: '1rem',
        cursor: 'pointer', boxShadow: '0 8px 20px rgba(108,71,255,0.35)',
    },
    footer: {
        display: 'flex', gap: '16px', fontSize: '0.85rem',
        marginTop: '8px', justifyContent: 'center', alignItems: 'center',
    },
    dangerLink: {
        background: 'none', border: 'none', color: 'rgba(255,59,48,0.7)',
        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, padding: '8px',
    },
    lightbox: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.92)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
    },
    lightboxImg: { maxWidth: '90%', maxHeight: '90%', borderRadius: '12px' },
};
