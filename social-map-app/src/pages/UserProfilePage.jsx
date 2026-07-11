import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCall } from '../context/CallContext';
import { supabase } from '../supabaseClient';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { checkUnlockedAchievements, ACHIEVEMENTS, calculateSmartMatchScore } from '../utils/premiumUtils';
import { parseThought } from '../utils/locationPrivacy';
import { getPremiumCustomizations, AvatarAccessories, getUsernameEffectClass } from '../utils/premiumCustomizations.jsx';
import { generateSmartIcebreakers } from '../utils/smartIcebreakers';
import { VerifiedBadgeInline } from '../utils/verifiedBadge.jsx';

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
    const [showPokeSelector, setShowPokeSelector] = useState(false);
    const [unlockedAchievements, setUnlockedAchievements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const [audioMuted, setAudioMuted] = useState(false);
    const audioRef = React.useRef(null);

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
                .select('id, latitude, longitude, subscription_tier, super_poke_count_today, last_super_poke_at, diamond_poke_count_today, last_diamond_poke_at, interests, birth_date, relationship_status')
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

            // Record view
            if (userId !== meId) {
                import('../utils/premiumUtils').then(({ recordProfileView }) => {
                    recordProfileView(userId, meId);
                }).catch(err => console.warn(err));
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

            const targetUnlocked = checkUnlockedAchievements(profile, theirFriendIds.length);
            setUnlockedAchievements(targetUnlocked);

            setDetails({
                bio: profile.bio || 'No bio set.',
                interests: profile.interests || [],
                birthDate: profile.birth_date,
                joinedAt: profile.created_at,
                mutuals: mutualCount,
                username: profile.username,
                relationship_status: profile.relationship_status,
                is_public: profile.is_public !== false,
                institute: profile.institute
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

        const profileChannel = supabase
            .channel(`user_profile_changes_${userId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${userId}`
            }, (payload) => {
                const { new: newRec } = payload;
                if (newRec) {
                    setUser(u => {
                        if (!u) return null;
                        return {
                            ...u,
                            ...newRec
                        };
                    });
                    setDetails(d => {
                        if (!d) return null;
                        return {
                            ...d,
                            bio: newRec.bio !== undefined ? (newRec.bio || 'No bio set.') : d.bio,
                            interests: newRec.interests !== undefined ? (newRec.interests || []) : d.interests,
                            birthDate: newRec.birth_date !== undefined ? newRec.birth_date : d.birthDate,
                            relationship_status: newRec.relationship_status !== undefined ? newRec.relationship_status : d.relationship_status
                        };
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(profileChannel);
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
                const isPremium = currentUser?.subscription_tier === 'gold' || currentUser?.subscription_tier === 'diamond';
                if (isPremium) {
                    setShowPokeSelector(true);
                } else {
                    executePoke('normal');
                }
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

    const executePoke = async (pokeType) => {
        try {
            const tier = currentUser?.subscription_tier || 'free';
            const maxSuperPokes = tier === 'diamond' ? 10 : (tier === 'gold' ? 5 : 0);
            
            if (pokeType === 'super') {
                if (tier !== 'gold' && tier !== 'diamond') {
                    alert("⚠️ Super Pokes are a Gold & Diamond Elite feature. Please upgrade your plan!");
                    return;
                }
                
                const lastPokeTime = currentUser.last_super_poke_at ? new Date(currentUser.last_super_poke_at).getTime() : 0;
                const isDayElapsed = Date.now() - lastPokeTime >= 24 * 60 * 60 * 1000;
                const currentSuperPokeCount = isDayElapsed ? 0 : (currentUser.super_poke_count_today || 0);

                if (currentSuperPokeCount >= maxSuperPokes) {
                    const resetTimeRemainingMs = lastPokeTime ? (lastPokeTime + 24 * 60 * 60 * 1000) - Date.now() : 0;
                    const resetHours = Math.max(1, Math.ceil(resetTimeRemainingMs / (1000 * 60 * 60)));
                    alert(`⚠️ You've used all of today's Super Pokes. Your limit will reset in ${resetHours} hours.`);
                    return;
                }

                // Enforce 30-second cooldown
                if (lastPokeTime && Date.now() - lastPokeTime < 30 * 1000) {
                    alert("⚠️ Cooldown active. Please wait 30 seconds before sending another Super Poke.");
                    return;
                }
            } else if (pokeType === 'diamond') {
                const lastPokeDay = currentUser.last_diamond_poke_at ? new Date(currentUser.last_diamond_poke_at).toDateString() : '';
                const currentDay = new Date().toDateString();
                const newCount = (lastPokeDay === currentDay) ? (currentUser.diamond_poke_count_today || 0) + 1 : 1;
                
                if (newCount > 5) {
                    alert("⚠️ You've reached your daily limit of 5 Diamond Pokes!");
                    return;
                }
            }

            const { error: insertError } = await supabase.from('friendships').insert({ 
                requester_id: currentUser.id, 
                receiver_id: user.id, 
                status: 'pending',
                is_super_poke: pokeType === 'super',
                is_diamond_poke: pokeType === 'diamond'
            });

            if (insertError) {
                alert(`⚠️ Error: ${insertError.message}`);
                return;
            }
            
            // Sync counts from server
            const { data: updatedProfile, error: profileError } = await supabase
                .from('profiles')
                .select('super_poke_count_today, last_super_poke_at, diamond_poke_count_today, last_diamond_poke_at')
                .eq('id', currentUser.id)
                .single();

            if (!profileError && updatedProfile) {
                const updated = {
                    ...currentUser,
                    ...updatedProfile
                };
                setCurrentUser(updated);
                localStorage.setItem('currentUser', JSON.stringify(updated));
            }
            
            setUser(u => ({ ...u, friendshipStatus: 'pending', requesterId: currentUser.id }));
            alert("✨ Poke sent successfully!");
        } catch (err) {
            console.error("Error executing poke:", err);
            alert("⚠️ Something went wrong executing the poke request.");
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
    const birthday = details.birthDate && !user.hide_birthday ? formatDate(details.birthDate) : null;
    const institute = details.institute && !user.hide_institute ? details.institute : null;
    const joinedDate = formatJoinDate(details.joinedAt);
    const isFriend = user.friendshipStatus === 'accepted';
    const isPublic = details.is_public;
    let canSeeFullProfile = isFriend || isPublic;
    if (user.profile_view_policy === 'nobody') {
        canSeeFullProfile = false;
    } else if (user.profile_view_policy === 'friends') {
        canSeeFullProfile = isFriend;
    }

    const rawThoughtText = user.thought || user.status_message;
    const parsedThought = parseThought(rawThoughtText);
    const thoughtText = parsedThought ? parsedThought.text : null;
    const thoughtTime = user.thoughtTime || user.status_updated_at || user.statusUpdatedAt;
    const isThoughtExpired = !thoughtText || !thoughtTime || (new Date(thoughtTime).getTime() < Date.now() - 3 * 60 * 60 * 1000);
    const displayThought = isThoughtExpired ? null : thoughtText;

    const customizations = getPremiumCustomizations(user);

    // Resolve dynamic background style for Diamond/Gold members
    const getBgStyle = (styleKey) => {
        if (['galaxy', 'ocean', 'fire', 'snow', 'neon'].includes(styleKey)) {
            return { color: '#ffffff' };
        }
        switch (styleKey) {
            case 'diamond_crystal': return { background: 'radial-gradient(circle at top left, #0e203c, #050a14)', color: '#e0f2fe' };
            case 'space_black': return { background: '#020202', color: '#ffffff' };
            case 'platinum': return { background: 'radial-gradient(circle at top right, #25252b, #0f0f12)', color: '#f3f4f6' };
            case 'aurora_elite': return { background: 'linear-gradient(180deg, #020612, #040914)', color: '#ecfdf5' };
            case 'royal_diamond': return { background: 'radial-gradient(circle at 50% 0%, #20043c, #050209)', color: '#fae8ff' };
            case 'sunset_gold': return { background: 'linear-gradient(135deg, #451a03, #1c0c02)', color: '#fffbeb' };
            case 'cyberpunk': return { background: 'linear-gradient(135deg, #18001e, #05000a)', color: '#fdf2ff' };
            default: return {};
        }
    };

    const isAnimatedBg = ['galaxy', 'ocean', 'fire', 'snow', 'neon'].includes(customizations.profileBackgroundStyle);
    const pageStyle = { ...styles.page, ...getBgStyle(customizations.profileBackgroundStyle) };
    const pageBgClass = isAnimatedBg ? `bg-animated-${customizations.profileBackgroundStyle}` : '';
    const hasMoment = customizations.nearbyMoment && customizations.nearbyMomentExpiresAt && (new Date(customizations.nearbyMomentExpiresAt).getTime() > Date.now());

    return (
        <div style={pageStyle} className={pageBgClass}>
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
                {canSeeFullProfile && displayThought && (
                    <div style={{
                        position: 'absolute',
                        bottom: 135,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(30, 30, 30, 0.85)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.78rem',
                        fontWeight: '600',
                        color: '#ffffff',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                        whiteSpace: 'nowrap',
                        zIndex: 10,
                    }}>
                        💭 {displayThought}
                    </div>
                )}
                <div 
                    className={`${
                        user.subscription_tier === 'silver' ? 'avatar-ring-silver' :
                        user.subscription_tier === 'gold' ? 'avatar-ring-gold' :
                        user.subscription_tier === 'diamond' ? `avatar-ring-diamond effect-${user.avatar_effect || 'none'}` : ''
                    }`}
                    style={{
                        ...styles.avatarRing,
                        boxShadow: user.subscription_tier ? undefined : (user.is_location_on
                            ? '0 0 0 3px #30d158, 0 0 20px rgba(48,209,88,0.4), 0 12px 40px rgba(0,0,0,0.6)'
                            : '0 0 0 3px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.6)')
                    }}
                >
                    <img src={displayAvatar} alt={user.username || user.name} style={styles.avatarImg} fetchpriority="high" />
                    {/* Render Premium Accessories */}
                    <AvatarAccessories accessory={customizations.avatarAccessory} />
                </div>
                {/* Online badge */}
                <div style={{
                    ...styles.onlineDot,
                    background: (user.is_location_on && !user.hide_online_status && !user.hide_active_status) ? '#30d158' : '#555',
                    boxShadow: (user.is_location_on && !user.hide_online_status && !user.hide_active_status) ? '0 0 0 2px #1c1c1e, 0 0 10px rgba(48,209,88,0.6)' : '0 0 0 2px #1c1c1e'
                }} />
            </div>

            {/* Identity */}
            <div style={styles.identity}>
                <h1 style={{ ...styles.name, display: 'inline-flex', alignItems: 'center', gap: 6 }} className={getUsernameEffectClass(customizations.usernameEffect)}>
                    {user.username || user.name}
                    <VerifiedBadgeInline user={user} size={18} />
                </h1>
                <div style={styles.badgeRow}>
                    {details.relationship_status && !user.hide_relationship_status && (
                        <span style={styles.statusPill}>
                            💕 {details.relationship_status}
                        </span>
                    )}
                    {user.subscription_tier === 'silver' && <span className="premium-badge silver" style={{ marginLeft: 8 }}>🥈 Silver Member</span>}
                    {user.subscription_tier === 'gold' && <span className="premium-badge gold" style={{ marginLeft: 8 }}>🥇 Gold Elite</span>}
                    {user.subscription_tier === 'diamond' && (
                        <span className="premium-badge diamond" style={{ marginLeft: 8 }}>💎 Diamond Elite</span>
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
                    <div 
                        className={`stat-card ${
                            (user.subscription_tier === 'gold' || user.subscription_tier === 'diamond') ? 'gold-streak-pulsate' : ''
                        }`} 
                        style={{
                            ...styles.statCard,
                            border: (user.subscription_tier === 'gold' || user.subscription_tier === 'diamond') ? '1px solid #facc15' : '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <span style={{
                            ...styles.statVal,
                            color: (user.subscription_tier === 'gold' || user.subscription_tier === 'diamond') ? '#facc15' : '#f4f4f5'
                        }}>
                            🔥 {user.streak_count || 0}
                        </span>
                        <span style={styles.statLabel}>Streak</span>
                    </div>
                    {birthday && (
                        <div className="stat-card" style={styles.statCard}>
                            <span style={styles.statVal}>🎂 {birthday}</span>
                            <span style={styles.statLabel}>Birthday</span>
                        </div>
                    )}
                </div>
            )}

            {/* Profile Background Music widget */}
            {customizations.profileMusic && (
                <div style={{
                    margin: '12px 16px',
                    background: 'rgba(0, 212, 255, 0.08)',
                    border: '1.5px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 15px rgba(0,212,255,0.1)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.3rem', animation: audioPlaying ? 'spin 3s linear infinite' : 'none' }}>🎵</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{customizations.profileMusicTitle || 'Background Loop'}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Premium Profile Track</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => {
                                if (!audioRef.current) return;
                                const nextMuted = !audioMuted;
                                audioRef.current.muted = nextMuted;
                                setAudioMuted(nextMuted);
                            }}
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '0.85rem'
                            }}
                        >
                            {audioMuted ? '🔇' : '🔊'}
                        </button>
                        <button 
                            onClick={() => {
                                if (!audioRef.current) return;
                                if (audioPlaying) {
                                    audioRef.current.pause();
                                    setAudioPlaying(false);
                                } else {
                                    audioRef.current.play().catch(err => console.log('Audio play error:', err));
                                    setAudioPlaying(true);
                                }
                            }}
                            style={{
                                background: '#00d4ff',
                                color: '#000',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                            }}
                        >
                            {audioPlaying ? '⏸' : '▶'}
                        </button>
                    </div>
                    <audio 
                        ref={audioRef} 
                        src={customizations.profileMusic.startsWith('http') ? customizations.profileMusic : {
                            chill_beats: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                            ambient_waves: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
                            lofi_dream: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
                            cyber_lounge: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
                        }[customizations.profileMusic] || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'}
                        loop
                    />
                </div>
            )}

            {/* Content Cards — ABOVE action buttons */}
            <div style={styles.contentArea}>

                {/* Nearby Moment Box */}
                {hasMoment && (
                    <div className="card" style={{
                        ...styles.card,
                        border: '1.5px solid #00d4ff',
                        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 0, 0, 0.2))',
                        boxShadow: '0 8px 24px rgba(0, 212, 255, 0.15)',
                        display: 'flex', flexDirection: 'column', gap: 4
                    }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: '0.8px' }}>📍 Active Nearby Moment</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <span style={{ fontSize: '1.4rem' }}>{customizations.nearbyMoment.split(' ')[0]}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{customizations.nearbyMoment}</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                            Expires in {Math.round((new Date(customizations.nearbyMomentExpiresAt).getTime() - Date.now()) / 60000)} minutes
                        </span>
                    </div>
                )}

                {/* Smart Icebreakers (Diamond Elite gating) */}
                {currentUser?.subscription_tier === 'diamond' && currentUser?.id !== user?.id && (
                    <div className="card" style={{
                        ...styles.card,
                        border: '1.5px solid #d946ef',
                        background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.12), rgba(0, 0, 0, 0.2))',
                        boxShadow: '0 8px 24px rgba(217, 70, 239, 0.12)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: '1.2rem' }}>🔮</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d946ef', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Smart Icebreakers</span>
                            <span style={{ fontSize: '0.62rem', background: '#d946ef', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>DIAMOND</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {generateSmartIcebreakers(currentUser, user, details?.mutuals || 0).map((ice, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                                    <span>{ice}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

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

                {/* Achievements Shelf */}
                {canSeeFullProfile && (user.subscription_tier === 'gold' || user.subscription_tier === 'diamond') && (
                    <div className="achievements-section" style={{
                        ...styles.card,
                        display: 'flex', flexDirection: 'column', gap: 12
                    }}>
                        <div className="achievements-header" style={{ borderBottom: 'none', padding: 0 }}>
                            <h4 style={{ margin: 0, fontSize: '0.75rem', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                                🏆 Achievements ({unlockedAchievements.length}/6)
                            </h4>
                            <button className="achievements-viewall" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Public</button>
                        </div>
                        <div className="achievements-list" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
                            {ACHIEVEMENTS.map(ach => {
                                const isUnlocked = unlockedAchievements.includes(ach.id);
                                return (
                                    <div key={ach.id} className="achievement-item" title={ach.desc} style={{ minWidth: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                        <div className={`achievement-badge-container ${isUnlocked ? 'unlocked' : ''}`} style={{
                                            width: 44, height: 44, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', fontSize: '1.25rem',
                                            background: isUnlocked ? 'linear-gradient(135deg, #facc15, #eab308)' : 'rgba(255,255,255,0.05)',
                                            border: isUnlocked ? '1px solid #facc15' : '1px solid rgba(255,255,255,0.1)',
                                            boxShadow: isUnlocked ? '0 0 10px rgba(250,204,21,0.3)' : 'none',
                                            transition: 'transform 0.2s'
                                        }}>
                                            {ach.icon}
                                        </div>
                                        <span className="achievement-title" style={{ fontSize: '0.65rem', color: isUnlocked ? '#f4f4f5' : '#71717a', textAlign: 'center', fontWeight: 500 }}>
                                            {ach.title}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {!canSeeFullProfile && (
                <div style={{
                    backgroundColor: 'rgba(24, 24, 27, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    textAlign: 'center',
                    padding: '30px 20px',
                    margin: '0 16px 20px 16px'
                }}>
                    <span style={{ fontSize: '2.2rem', filter: 'drop-shadow(0 4px 8px rgba(139, 92, 246, 0.3))' }}>🔒</span>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', fontWeight: 800 }}>Private Profile</h3>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#a1a1aa', lineHeight: 1.5, maxWidth: '280px' }}>
                        This user's privacy policy restricts profile access. Send a Poke request to connect and view details!
                    </p>
                </div>
            )}

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
                    <img src={previewImage} alt="Preview" style={styles.lightboxImg} loading="lazy" decoding="async" />
                </div>
            )}

            {/* Super & Diamond Poke Selector */}
            {showPokeSelector && (() => {
                const tier = currentUser?.subscription_tier || 'free';
                const isGold = tier === 'gold';
                const isDiamond = tier === 'diamond';
                const maxSuperPokes = isDiamond ? 10 : (isGold ? 5 : 0);
                
                const lastPokeTime = currentUser?.last_super_poke_at ? new Date(currentUser.last_super_poke_at).getTime() : 0;
                const isDayElapsed = Date.now() - lastPokeTime >= 24 * 60 * 60 * 1000;
                const currentSuperPokeCount = isDayElapsed ? 0 : (currentUser?.super_poke_count_today || 0);
                const remainingSuperPokes = Math.max(0, maxSuperPokes - currentSuperPokeCount);
                
                const resetTimeRemainingMs = lastPokeTime ? (lastPokeTime + 24 * 60 * 60 * 1000) - Date.now() : 0;
                const resetHours = Math.max(1, Math.ceil(resetTimeRemainingMs / (1000 * 60 * 60)));
                
                const isSuperPokeDisabled = remainingSuperPokes <= 0 || (tier !== 'gold' && tier !== 'diamond');

                const superPokeButtonStyle = isDiamond
                    ? {
                        ...styles.pokeOptionBtnDiamond,
                        boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
                        opacity: isSuperPokeDisabled ? 0.5 : 1
                      }
                    : {
                        ...styles.pokeOptionBtnSuper,
                        opacity: isSuperPokeDisabled ? 0.5 : 1
                      };

                return (
                    <div style={styles.pokeSelectorOverlay} onClick={() => setShowPokeSelector(false)}>
                        <div style={styles.pokeSelectorModal} onClick={e => e.stopPropagation()}>
                            <h3 style={styles.pokeSelectorTitle}>Select Poke Type</h3>
                            <p style={styles.pokeSelectorSubtitle}>
                                {maxSuperPokes > 0 ? (
                                    remainingSuperPokes <= 0 ? (
                                        <span style={{ color: '#f87171', fontWeight: 600 }}>
                                            You've used all of today's Super Pokes. Your limit will reset in {resetHours} hours.
                                        </span>
                                    ) : (
                                        <span>
                                            Super Pokes Remaining: <strong>{remainingSuperPokes} / {maxSuperPokes}</strong>
                                        </span>
                                    )
                                ) : (
                                    <span style={{ color: '#a1a1aa' }}>
                                        Super Pokes are a Gold & Diamond Elite feature.
                                    </span>
                                )}
                            </p>
                            <div style={styles.pokeOptions}>
                                <button 
                                    style={styles.pokeOptionBtnNormal}
                                    onClick={() => {
                                        setShowPokeSelector(false);
                                        executePoke('normal');
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem' }}>👋</span>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>Normal Poke</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Send a friendly nudge</div>
                                    </div>
                                </button>
                                
                                <button 
                                    style={superPokeButtonStyle}
                                    disabled={isSuperPokeDisabled}
                                    onClick={() => {
                                        setShowPokeSelector(false);
                                        executePoke('super');
                                    }}
                                >
                                    <span style={{ fontSize: '1.5rem' }}>⚡</span>
                                    <div>
                                        <div style={{ fontWeight: 600, color: isDiamond ? '#00d4ff' : '#facc15' }}>
                                            ⚡ Super Poke {isDiamond ? '(Diamond Style)' : isGold ? '(Gold Style)' : ''}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8, color: '#fffbeb' }}>
                                            {isDiamond ? 'VIP Diamond notification & crystal glow' : 'Priority placement & gold highlight'}
                                        </div>
                                    </div>
                                </button>

                                {currentUser?.subscription_tier === 'diamond' && (
                                    <button 
                                        style={{
                                            ...styles.pokeOptionBtnDiamond,
                                            opacity: (currentUser?.diamond_poke_count_today || 0) >= 5 ? 0.5 : 1
                                        }}
                                        disabled={(currentUser?.diamond_poke_count_today || 0) >= 5}
                                        onClick={() => {
                                            setShowPokeSelector(false);
                                            executePoke('diamond');
                                        }}
                                    >
                                        <span style={{ fontSize: '1.5rem' }}>💎</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#00d4ff' }}>Diamond Poke</div>
                                            <div style={{ fontSize: '0.75rem', opacity: 0.8, color: '#e0f7fa' }}>
                                                VIP notification & cyan glow
                                            </div>
                                        </div>
                                    </button>
                                )}
                            </div>
                            <button style={styles.pokeSelectorCancel} onClick={() => setShowPokeSelector(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                );
            })()}

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
        background: 'var(--bg-color)',
        color: 'var(--text-primary)',
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
        background: 'linear-gradient(to bottom, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.7) 60%, var(--bg-color) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
    },
    backBtnTop: {
        position: 'absolute', top: 'max(16px, env(safe-area-inset-top))', left: 16,
        width: 40, height: 40, borderRadius: '50%',
        background: 'var(--btn-secondary-bg)',
        backdropFilter: 'blur(10px)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)', cursor: 'pointer', zIndex: 10,
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
        border: '4px solid var(--bg-color)',
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
        color: 'var(--text-primary)',
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
        background: 'var(--btn-secondary-bg)', color: 'var(--text-secondary)',
        padding: '6px 16px', borderRadius: 100, fontSize: '0.75rem', fontWeight: 600,
        border: '1px solid var(--glass-border)',
    },

    /* ── Stats ── */
    statsRow: {
        display: 'flex', flexWrap: 'wrap', gap: 12,
        width: '92%', maxWidth: 440, marginBottom: 24,
        animation: 'fadeUp 0.45s ease',
    },
    statCard: {
        flex: '1 1 calc(50% - 6px)', minWidth: 95,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '14px 10px',
        background: 'var(--card-bg)',
        borderRadius: 20,
        border: '1px solid var(--card-border)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
    },
    statVal: {
        fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
    },
    statLabel: {
        fontSize: '0.65rem', color: 'var(--text-secondary)',
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
        background: 'var(--btn-secondary-bg)', border: '1px solid var(--glass-border)',
        color: 'var(--btn-secondary-text)', fontWeight: 600, fontSize: '0.8rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, transition: 'background 0.2s',
    },
    actionBtnCall: {
        flex: 1, padding: '12px 0', borderRadius: 16,
        background: 'var(--btn-secondary-bg)', border: '1px solid var(--glass-border)',
        color: 'var(--btn-secondary-text)', fontWeight: 600, fontSize: '0.8rem',
        cursor: 'pointer', display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6, transition: 'background 0.2s',
    },
    actionBtnVideo: {
        flex: 1, padding: '12px 0', borderRadius: 16,
        background: 'var(--btn-secondary-bg)', border: '1px solid var(--glass-border)',
        color: 'var(--btn-secondary-text)', fontWeight: 600, fontSize: '0.8rem',
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
        background: 'var(--glass-bg)',
        borderRadius: 24,
        border: '1px solid var(--glass-border)',
        padding: '24px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.05)',
    },
    cardLabel: {
        display: 'block',
        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '1px',
        textTransform: 'uppercase', color: 'var(--text-secondary)',
        marginBottom: 14,
    },
    bioText: {
        color: 'var(--text-primary)', fontSize: '0.95rem',
        lineHeight: 1.6, margin: 0, fontWeight: 400,
    },
    tagsRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
    tag: {
        background: 'var(--bg-secondary)', color: 'var(--text-primary)',
        padding: '8px 16px', borderRadius: 100, fontSize: '0.8rem', fontWeight: 500,
        border: '1px solid var(--glass-border)',
    },
    mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 },
    mediaItem: {
        aspectRatio: '1', borderRadius: 16, overflow: 'hidden',
        cursor: 'pointer', background: 'var(--bg-secondary)',
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
        background: 'var(--bg-color)', color: 'var(--text-primary)', gap: 16,
    },
    spinner: {
        width: 40, height: 40,
        border: '3px solid var(--glass-border)',
        borderTopColor: 'var(--brand-primary)',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    },
    loadingText: { color: 'var(--text-secondary)', fontSize: 15, margin: 0 },
    backBtn: {
        background: 'var(--btn-secondary-bg)', border: 'none', color: 'var(--btn-secondary-text)',
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
    pokeSelectorOverlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(10px)',
    },
    pokeSelectorModal: {
        width: '90%', maxWidth: 360,
        background: 'var(--modal-bg)',
        borderRadius: 24, border: '1px solid var(--modal-border)',
        padding: '24px', display: 'flex', flexDirection: 'column', gap: 16,
        alignItems: 'center',
    },
    pokeSelectorTitle: { margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' },
    pokeSelectorSubtitle: { margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' },
    pokeOptions: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%' },
    pokeOptionBtnNormal: {
        width: '100%', padding: '14px', borderRadius: 16,
        background: 'var(--btn-secondary-bg)', border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', transition: 'background 0.2s',
    },
    pokeOptionBtnSuper: {
        width: '100%', padding: '14px', borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(250, 204, 21, 0.15), rgba(234, 179, 8, 0.15))',
        border: '1.5px solid #facc15',
        color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', transition: 'background 0.2s',
    },
    pokeOptionBtnDiamond: {
        width: '100%', padding: '14px', borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(139, 92, 246, 0.15))',
        border: '1.5px solid #06b6d4',
        color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
        textAlign: 'left', transition: 'background 0.2s',
    },
    pokeSelectorCancel: {
        background: 'none', border: 'none', color: '#a1a1aa', fontSize: '0.9rem',
        cursor: 'pointer', marginTop: 8, fontWeight: 500,
    },
};

