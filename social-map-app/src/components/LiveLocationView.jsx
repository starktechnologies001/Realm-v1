import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useLiveLocation } from '../hooks/useLiveLocation';
import { revokeLiveLocation } from '../services/liveLocationService';
import { getAvatar2D } from '../utils/avatarUtils';
import './LiveLocationView.css';

// Helper component to center map on coordinates dynamically
function MapRecenter({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center && center[0] != null && center[1] != null) {
            map.flyTo(center, 16, { animate: true, duration: 1.2 });
        }
    }, [center, map]);
    return null;
}

// Custom Leaflet icon builder for avatar
function createAvatarMarkerIcon(avatarUrl, isPartner = false) {
    const size = isPartner ? 48 : 38;
    const borderColor = isPartner ? '#3B82F6' : '#10B981';
    const finalAvatar = getAvatar2D(avatarUrl);

    const html = `
        <div class="live-marker-wrapper ${isPartner ? 'partner-pulse' : ''}">
            <div class="live-marker-frame" style="width: ${size}px; height: ${size}px; border-color: ${borderColor};">
                <img src="${finalAvatar}" alt="avatar" class="live-marker-img" />
            </div>
            <div class="live-marker-badge" style="background-color: ${borderColor};"></div>
        </div>
    `;

    return L.divIcon({
        html,
        className: 'custom-live-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

export default function LiveLocationView({ currentUser, partnerUser, shareId, onClose }) {
    const {
        activeShare,
        isSharingActive,
        partnerLocation,
        myLocation,
        isPartnerUnavailable,
        remainingSeconds,
        isGhostMode,
        locationEnabled
    } = useLiveLocation({
        currentUserId: currentUser?.id,
        partnerId: partnerUser?.id,
        shareId
    });

    const [mapCenter, setMapCenter] = useState(null);
    const [mapMode, setMapMode] = useState('street'); // 'street' or 'satellite'
    const [partnerAddress, setPartnerAddress] = useState(null);
    const [loadingAddress, setLoadingAddress] = useState(false);
    const [revoking, setRevoking] = useState(false);

    const partnerPos = partnerLocation?.latitude != null && partnerLocation?.longitude != null
        ? [partnerLocation.latitude, partnerLocation.longitude]
        : null;

    const myPos = myLocation?.latitude != null && myLocation?.longitude != null
        ? [myLocation.latitude, myLocation.longitude]
        : (currentUser?.latitude != null && currentUser?.longitude != null
            ? [currentUser.latitude, currentUser.longitude]
            : null);

    // Initial map center determination
    useEffect(() => {
        if (partnerLocation?.latitude != null && partnerLocation?.longitude != null) {
            setMapCenter([partnerLocation.latitude, partnerLocation.longitude]);
        } else if (myLocation?.latitude != null && myLocation?.longitude != null) {
            setMapCenter([myLocation.latitude, myLocation.longitude]);
        } else if (currentUser?.latitude != null && currentUser?.longitude != null) {
            setMapCenter([currentUser.latitude, currentUser.longitude]);
        } else {
            setMapCenter([20.5937, 78.9629]); // Default fallback
        }
    }, [partnerLocation, myLocation, currentUser]);

    // Reverse Geocode: Shop name, Street name & Area name for partner location
    useEffect(() => {
        if (!partnerPos) {
            setPartnerAddress(null);
            return;
        }

        let isMounted = true;
        setLoadingAddress(true);

        const fetchAddress = async () => {
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${partnerPos[0]}&lon=${partnerPos[1]}&zoom=18&addressdetails=1`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!data || !data.address) return;

                const addr = data.address;
                const placeName = addr.shop || addr.amenity || addr.building || addr.hospital || addr.office || addr.tourism || addr.commercial || null;
                const street = addr.road || addr.pedestrian || addr.footway || null;
                const area = addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || addr.city || null;

                const parts = [];
                if (placeName) parts.push(placeName);
                if (street) parts.push(street);
                if (area) parts.push(area);

                if (isMounted) {
                    if (parts.length > 0) {
                        setPartnerAddress(parts.join(' · '));
                    } else if (data.display_name) {
                        setPartnerAddress(data.display_name.split(',').slice(0, 3).join(','));
                    }
                }
            } catch (err) {
                console.warn('Address fetch error:', err);
            } finally {
                if (isMounted) setLoadingAddress(false);
            }
        };

        fetchAddress();

        return () => { isMounted = false; };
    }, [partnerPos?.[0], partnerPos?.[1]]);

    // Handle Stop Sharing
    const handleStopSharing = async () => {
        if (!activeShare?.id) return;
        setRevoking(true);
        try {
            await revokeLiveLocation(activeShare.id);
            if (onClose) onClose();
        } catch (err) {
            console.error('Failed to revoke live location share:', err);
        } finally {
            setRevoking(false);
        }
    };

    // Format remaining time (HH:MM:SS or MM:SS)
    const formatRemaining = (seconds) => {
        if (seconds <= 0) return 'Expired';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;

        if (hrs > 0) {
            return `${hrs}h ${remMins}m remaining`;
        }
        return `${remMins}m ${secs}s remaining`;
    };

    // Format last updated timestamp
    const formatLastUpdated = (ts) => {
        if (!ts) return 'Unavailable';
        const diffMs = Date.now() - new Date(ts).getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        if (diffSecs < 10) return 'Just now';
        if (diffSecs < 60) return `${diffSecs}s ago`;
        const diffMins = Math.floor(diffSecs / 60);
        return `${diffMins}m ago`;
    };

    return (
        <div className="live-location-fullscreen">
            {/* Header Toolbar */}
            <div className="live-location-header">
                <button className="live-back-btn" onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <div className="live-header-title">
                    <h2>Live Location</h2>
                    <span className={`live-status-pill ${isSharingActive && !isPartnerUnavailable ? 'active' : 'paused'}`}>
                        <span className="pill-dot"></span>
                        {isSharingActive ? (isPartnerUnavailable ? 'Partner Paused' : 'Live Sharing') : 'Sharing Ended'}
                    </span>
                </div>
                <div style={{ width: 40 }}></div> {/* Spacer */}
            </div>

            {/* Map Area */}
            <div className="live-map-container">
                {mapCenter && (
                    <MapContainer
                        center={mapCenter}
                        zoom={17}
                        zoomControl={false}
                        style={{ width: '100%', height: '100%' }}
                    >
                        {/* High Resolution Google Maps Tiles with POIs, Shop names, Street names, and Area names */}
                        <TileLayer
                            attribution='&copy; Google Maps'
                            url={mapMode === 'satellite'
                                ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                                : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"}
                            maxNativeZoom={20}
                            maxZoom={22}
                        />

                        {mapCenter && <MapRecenter center={mapCenter} />}

                        {/* Partner Marker */}
                        {partnerPos && partnerUser && (
                            <Marker
                                position={partnerPos}
                                icon={createAvatarMarkerIcon(partnerUser.avatar_url, true)}
                            >
                                <Popup>
                                    <div className="map-popup-card">
                                        <strong>{partnerUser.full_name || partnerUser.username}</strong>
                                        {partnerAddress && <p style={{ fontSize: '0.8rem', color: '#3B82F6', marginTop: 4 }}>📍 {partnerAddress}</p>}
                                        <p>{formatLastUpdated(partnerLocation?.updated_at)}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        )}

                        {/* Current User Marker */}
                        {myPos && currentUser && (
                            <Marker
                                position={myPos}
                                icon={createAvatarMarkerIcon(currentUser.avatar_url, false)}
                            />
                        )}
                    </MapContainer>
                )}

                {/* Map Mode Switcher Button (Street / Satellite) */}
                <button
                    className="live-map-mode-btn"
                    onClick={() => setMapMode(prev => prev === 'street' ? 'satellite' : 'street')}
                    title="Toggle Map Style"
                >
                    {mapMode === 'street' ? '🛰️ Satellite' : '🗺️ Map'}
                </button>

                {/* Recenter Button */}
                {partnerPos && (
                    <button
                        className="live-recenter-btn"
                        onClick={() => setMapCenter([partnerPos[0], partnerPos[1]])}
                        title="Recenter on partner"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
                    </button>
                )}
            </div>

            {/* Bottom Status Card */}
            <div className="live-bottom-card">
                <div className="live-user-row">
                    <img
                        src={getAvatar2D(partnerUser?.avatar_url)}
                        alt="partner"
                        className="live-card-avatar"
                    />
                    <div className="live-card-info">
                        <h3>{partnerUser?.full_name || partnerUser?.username || 'Friend'}</h3>
                        <p className="live-subtext">
                            {isPartnerUnavailable ? (
                                <span className="text-warning">⚠️ Live location unavailable</span>
                            ) : (
                                <span>Updated {formatLastUpdated(partnerLocation?.updated_at)}</span>
                            )}
                        </p>
                    </div>
                    <div className="live-timer-badge">
                        <span>⏳ {formatRemaining(remainingSeconds)}</span>
                    </div>
                </div>

                {/* Live Address Pill: Shop name, Street name, Area name */}
                {partnerAddress && !isPartnerUnavailable && (
                    <div className="live-address-pill">
                        <span className="address-icon">📍</span>
                        <span className="address-text">{partnerAddress}</span>
                    </div>
                )}

                {isGhostMode && (
                    <div className="live-banner warning">
                        👻 Ghost Mode is ON — Your exact location is currently paused.
                    </div>
                )}

                {!locationEnabled && (
                    <div className="live-banner warning">
                        📍 Location service is OFF on your device.
                    </div>
                )}

                <div className="live-card-actions">
                    {isSharingActive && (
                        <button
                            className="live-stop-btn"
                            onClick={handleStopSharing}
                            disabled={revoking}
                        >
                            {revoking ? 'Stopping...' : 'Stop Sharing Live Location'}
                        </button>
                    )}
                    {!isSharingActive && (
                        <button className="live-close-card-btn" onClick={onClose}>
                            Close View
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
