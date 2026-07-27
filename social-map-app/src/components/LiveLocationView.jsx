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
    const [revoking, setRevoking] = useState(false);

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

    const partnerPos = partnerLocation?.latitude != null && partnerLocation?.longitude != null
        ? [partnerLocation.latitude, partnerLocation.longitude]
        : null;

    const myPos = myLocation?.latitude != null && myLocation?.longitude != null
        ? [myLocation.latitude, myLocation.longitude]
        : (currentUser?.latitude != null && currentUser?.longitude != null
            ? [currentUser.latitude, currentUser.longitude]
            : null);

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
                        zoom={16}
                        zoomControl={false}
                        style={{ width: '100%', height: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
