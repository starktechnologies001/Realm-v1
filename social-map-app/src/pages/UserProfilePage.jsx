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
                .select('id, status, requester_id')
                .or(`and(requester_id.eq.${meId},receiver_id.eq.${userId}),and(requester_id.eq.${userId},receiver_id.eq.${meId})`)
                .maybeSingle();

            const friendshipStatus = friendship?.status || 'none';
            const requesterId = friendship?.requester_id || null;

            setUser({ ...profile, name: profile.username || profile.full_name, friendshipStatus, requesterId, friendshipId: friendship?.id || null });

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

    useEffect(() => {
        if (!currentUser?.id || !userId) return;

        const channel = supabase
            .channel(`user_profile_friendship_${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friendships'
            }, (payload) => {
                const { eventType, new: newRec, old: oldRec } = payload;
                
                const isMyFriendship = (rec) => 
                    rec && (
                        (rec.requester_id === currentUser.id && rec.receiver_id === userId) ||
                        (rec.requester_id === userId && rec.receiver_id === currentUser.id)
                    );

                if (eventType === 'DELETE') {
                    const deletedId = oldRec.id;
                    setUser(u => {
                        if (u && (u.friendshipId === deletedId || u.friendshipStatus !== 'none')) {
                            return { ...u, friendshipStatus: 'none', requesterId: null, friendshipId: null };
                        }
                        return u;
                    });
                    setSharedMedia([]);
                } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    if (isMyFriendship(newRec)) {
                        setUser(u => ({
                            ...u,
                            friendshipStatus: newRec.status,
                            requesterId: newRec.requester_id,
                            friendshipId: newRec.id
                        }));
                        if (newRec.status !== 'accepted') {
                            setSharedMedia([]);
                        }
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.id, userId]);

    const handleAction = async (action) => {
        if (!user || !currentUser) return;
        if (action === 'message') {
            navigate('/chat', { state: { targetUser: user } });
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
        } else if (action === 'unfriend') {
            if (window.confirm(`Are you sure you want to unfriend ${user.username || user.name}?`)) {
                try {
                    await supabase.from('friendships')
                        .delete()
                        .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(requester_id.eq.${user.id},receiver_id.eq.${currentUser.id})`);

                    await supabase.from('message_requests')
                        .delete()
                        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`);

                    setUser(u => ({ ...u, friendshipStatus: 'none', requesterId: null, friendshipId: null }));
                    setSharedMedia([]);
                } catch (err) {
                    console.error("Error unfriending user:", err);
                    alert("Failed to unfriend user.");
                }
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
                <button className="back-btn-top" style={styles.backBtnTop} onClick={() => navigate(-1)}>
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
                    <div className="stat-card" style={styles.statCard}>
                        <span style={styles.statVal}>{details.mutuals}</span>
                        <span style={styles.statLabel}>Mutuals</span>
                    </div>
                    <div className="stat-card" style={styles.statCard}>
                        <span style={styles.statVal}>{joinedDate}</span>
                        <span style={styles.statLabel}>Joined</span>
                    </div>
                    {birthday && (
                        <div className="stat-card" style={styles.statCard}>
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
                    <div className="card" style={styles.card}>
                        <span style={styles.cardLabel}>About</span>
                        <p style={styles.bioText}>{details.bio}</p>
                    </div>
                )}

                {/* Interests */}
                {canSeeFullProfile && details.interests.length > 0 && (
                    <div className="card" style={styles.card}>
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
            {currentUser?.id !== user?.id && (
                <div style={styles.actionsWrap}>
                    {isFriend ? (
                        <div style={styles.actionRow}>
                            {/* Message — blue gradient */}
                            <button className="profile-action-btn" style={styles.actionBtnMessage} onClick={() => handleAction('message')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                                </svg>
                                <span style={styles.actionLabel}>Message</span>
                            </button>
                            {/* Call — green */}
                            <button className="profile-action-btn" style={styles.actionBtnCall} onClick={() => handleAction('call-audio')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                                </svg>
                                <span style={styles.actionLabel}>Call</span>
                            </button>
                            {/* Video — purple */}
                            <button className="profile-action-btn" style={styles.actionBtnVideo} onClick={() => handleAction('call-video')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                                </svg>
                                <span style={styles.actionLabel}>Video</span>
                            </button>
                        </div>
                    ) : (
                        <button className="poke-btn" style={styles.pokeBtn} onClick={() => handleAction('poke')}>
                            {user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id
                                ? <><span>⏳</span> Request Sent</>
                                : <><span>👋</span> Add Friend</>}
                        </button>
                    )}
                </div>
            )}
            {/* Post-action content */}
            <div style={styles.contentArea}>
                {/* Shared Media */}
                {isFriend && sharedMedia.length > 0 && (
                    <div className="card" style={styles.card}>
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
                {currentUser?.id !== user?.id && (
                    <div style={styles.footer}>
                        {isFriend && (
                            <>
                                <button className="danger-link" style={styles.dangerLink} onClick={() => handleAction('unfriend')}>
                                    <span style={{ marginRight: 5 }}>💔</span>
                                    Unfriend
                                </button>
                                <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 18 }}>|</span>
                            </>
                        )}
                        <button className="danger-link" style={styles.dangerLink} onClick={() => handleAction('block')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            Block User
                        </button>
                        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 18 }}>|</span>
                        <button className="danger-link" style={styles.dangerLink} onClick={() => handleAction('report')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                            Report User
                        </button>
                    </div>
                )}
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
                
                /* Premium iOS-style transitions and hover animations */
                .profile-action-btn {
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .profile-action-btn:hover {
                    background: rgba(255, 255, 255, 0.12) !important;
                    border-color: rgba(255, 255, 255, 0.2) !important;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
                }
                .profile-action-btn:active {
                    transform: translateY(0) scale(0.96);
                }

                .back-btn-top {
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .back-btn-top:hover {
                    background: rgba(255, 255, 255, 0.15) !important;
                    border-color: rgba(255, 255, 255, 0.25) !important;
                    transform: scale(1.08);
                }
                .back-btn-top:active {
                    transform: scale(0.95);
                }

                .stat-card {
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .stat-card:hover {
                    transform: translateY(-3px);
                    background: rgba(255, 255, 255, 0.06) !important;
                    border-color: rgba(255, 255, 255, 0.1) !important;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
                }

                .card {
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .card:hover {
                    transform: translateY(-2px);
                    background: rgba(255, 255, 255, 0.05) !important;
                    border-color: rgba(255, 255, 255, 0.08) !important;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
                }

                .poke-btn {
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
                }
                .poke-btn:hover {
                    transform: translateY(-2px);
                    filter: brightness(1.1);
                    box-shadow: 0 10px 25px rgba(59, 130, 246, 0.45);
                }
                .poke-btn:active {
                    transform: translateY(0) scale(0.97);
                }

                .danger-link {
                    transition: all 0.2s ease !important;
                }
                .danger-link:hover {
                    opacity: 1 !important;
                    transform: translateY(-1px);
                    filter: brightness(1.2);
                }
                .danger-link:active {
                    transform: scale(0.96);
                }
            `}</style>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: '#09090b',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflowX: 'hidden',
        paddingBottom: 100,
    },

    /* ── Hero Banner ── */
    heroBanner: {
        width: '100%',
        height: 220,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        position: 'relative',
        flexShrink: 0,
    },
    heroBannerOverlay: {
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.7) 60%, rgba(9,9,11,1) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
    },
    backBtnTop: {
        position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16,
        width: 40, height: 40, borderRadius: '50%',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'white', cursor: 'pointer', zIndex: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.2s',
    },

    /* ── Avatar ── */
    avatarWrap: {
        position: 'relative',
        marginTop: -70,
        zIndex: 5,
        marginBottom: 16,
    },
    avatarRing: {
        width: 124, height: 124,
        borderRadius: '50%',
        padding: 4,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02))',
    },
    avatarImg: {
        width: '100%', height: '100%',
        borderRadius: '50%',
        objectFit: 'cover',
        border: '4px solid #09090b',
        display: 'block',
    },
    onlineDot: {
        position: 'absolute', bottom: 8, right: 8,
        width: 20, height: 20, borderRadius: '50%',
    },

    /* ── Identity ── */
    identity: {
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 12, paddingBottom: 24, animation: 'fadeUp 0.4s ease',
    },
    name: {
        margin: 0, fontSize: '1.8rem', fontWeight: 700,
        letterSpacing: '-0.5px',
        color: '#ffffff',
    },
    badgeRow: {
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center',
    },
    statusPill: {
        background: 'rgba(244, 63, 94, 0.1)',
        padding: '6px 14px', borderRadius: 20,
        fontSize: '0.75rem', color: '#fb7185', fontWeight: 600,
        border: '1px solid rgba(244, 63, 94, 0.2)',
        letterSpacing: '0.2px',
    },
    friendBadge: {
        background: 'rgba(56, 189, 248, 0.1)',
        color: '#38bdf8', padding: '6px 16px', borderRadius: 100,
        fontSize: '0.75rem', fontWeight: 600,
        border: '1px solid rgba(56, 189, 248, 0.2)',
    },
    publicBadge: {
        background: 'rgba(16, 185, 129, 0.1)', color: '#34d399',
        padding: '6px 16px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
        border: '1px solid rgba(16, 185, 129, 0.2)',
    },
    privateBadge: {
        background: 'rgba(255,255,255,0.05)', color: '#a1a1aa',
        padding: '6px 16px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
        border: '1px solid rgba(255,255,255,0.1)',
    },

    /* ── Stats ── */
    statsRow: {
        display: 'flex', gap: 12,
        width: '92%', maxWidth: 440, marginBottom: 24,
        animation: 'fadeUp 0.45s ease',
    },
    statCard: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '16px 10px',
        background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    },
    statVal: {
        fontSize: '1.1rem', fontWeight: 700, color: '#f4f4f5',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
    },
    statLabel: {
        fontSize: '0.65rem', color: '#a1a1aa',
        fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase',
    },

    /* ── Action Buttons ── */
    actionsWrap: {
        width: '92%', maxWidth: 440, marginBottom: 28,
        animation: 'fadeUp 0.5s ease',
        display: 'flex', justifyContent: 'center',
    },
    actionRow: {
        display: 'flex', gap: 12, justifyContent: 'center', width: '100%',
    },
    actionBtnMessage: {
        flex: 1, padding: '12px 0', borderRadius: 16,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#f4f4f5', fontWeight: 600, fontSize: '0.8rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, transition: 'background 0.2s',
    },
    actionBtnCall: {
        flex: 1, padding: '12px 0', borderRadius: 16,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#f4f4f5', fontWeight: 600, fontSize: '0.8rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, transition: 'background 0.2s',
    },
    actionBtnVideo: {
        flex: 1, padding: '12px 0', borderRadius: 16,
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#f4f4f5', fontWeight: 600, fontSize: '0.8rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, transition: 'background 0.2s',
    },
    actionLabel: { fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.3px' },
    pokeBtn: {
        width: '100%', padding: '16px', borderRadius: 100, border: 'none',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        color: 'white', fontWeight: 600, fontSize: '1rem', letterSpacing: '0.2px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        boxShadow: '0 8px 24px rgba(37, 99, 235, 0.25)',
        transition: 'transform 0.2s',
    },

    /* ── Content Area ── */
    contentArea: {
        width: '92%', maxWidth: 440,
        display: 'flex', flexDirection: 'column', gap: 16,
        animation: 'fadeUp 0.55s ease',
        marginBottom: 24,
    },
    card: {
        background: 'linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.05)',
        padding: '24px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
    },
    cardLabel: {
        display: 'block',
        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', color: '#a1a1aa',
        marginBottom: 14,
    },
    bioText: {
        color: '#d4d4d8', fontSize: '0.95rem',
        lineHeight: 1.6, margin: 0, fontWeight: 400,
    },
    tagsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    tag: {
        background: 'rgba(255,255,255,0.05)', color: '#d4d4d8',
        padding: '8px 16px', borderRadius: 100, fontSize: '0.8rem', fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.08)',
    },
    mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
    mediaItem: {
        aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
        cursor: 'pointer', background: 'rgba(255,255,255,0.03)',
        transition: 'transform 0.2s',
    },
    mediaImg: { width: '100%', height: '100%', objectFit: 'cover' },

    /* ── Footer ── */
    footer: {
        display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'center',
        marginTop: 12, paddingTop: 12,
    },
    dangerLink: {
        background: 'none', border: 'none',
        color: '#f87171', opacity: 0.9, cursor: 'pointer',
        fontSize: '0.85rem', fontWeight: 500, padding: '8px 6px',
        display: 'flex', alignItems: 'center',
        transition: 'opacity 0.2s',
    },

    /* ── Misc ── */
    loadingWrap: {
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#09090b', color: 'white', gap: 16,
    },
    spinner: {
        width: 40, height: 40,
        border: '3px solid rgba(255,255,255,0.05)',
        borderTopColor: '#3b82f6',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    },
    loadingText: { color: '#a1a1aa', fontSize: 15, margin: 0 },
    backBtn: {
        background: 'rgba(255,255,255,0.08)', border: 'none', color: '#f4f4f5',
        padding: '10px 24px', borderRadius: 100, cursor: 'pointer', fontSize: 14, fontWeight: 500,
    },
    lightbox: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.95)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        backdropFilter: 'blur(10px)',
    },
    lightboxImg: { maxWidth: '92%', maxHeight: '90%', borderRadius: 16 },
};

