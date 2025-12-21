import React from 'react';

export default function UserProfileCard({ user, onClose, onAction }) {
    if (!user) return null;

    return (
        <>
            <div className="backdrop" onClick={onClose} />
            <div className="popup-card">
                <button className="close-btn" onClick={onClose}>✕</button>

                <div className="popup-header">
                    <div className="avatar-wrapper">
                        <img src={user.avatar} alt={user.name} className="popup-avatar" />
                        <span className="online-indicator"></span>
                    </div>
                    <div className="header-info">
                        <div className="name-row">
                            <h3>{user.name}</h3>
                            {user.friendshipStatus === 'accepted' ? (
                                <span className="friend-badge" title="You are friends!">🤝 Friends</span>
                            ) : (
                                <button className="poke-icon-btn" onClick={() => onAction('poke', user)} title={`Poke ${user.name}`}>
                                    👉
                                </button>
                            )}
                        </div>
                        <span className="mood-badge">{user.mood || 'Just vibing'}</span>
                    </div>
                </div>

                <div className="popup-body">
                    <div className="info-item">
                        <span className="label">Status</span>
                        <span className="value">{user.status}</span>
                    </div>

                    <div className="info-item">
                        <span className="label">Location</span>
                        <span className="value">
                            {user.isLocationShared ? "📍 Live" : "🔒 Hidden"}
                        </span>
                    </div>
                </div>

                <div className="popup-actions">
                    <button className="primary-btn" onClick={() => onAction('message', user)}>
                        💬 Message
                    </button>
                    <div className="secondary-actions">
                        <button className="icon-btn danger" onClick={() => onAction('block', user)} title="Block">
                            🚫
                        </button>
                        <button className="icon-btn warning" onClick={() => onAction('report', user)} title="Report">
                            ⚠️
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
        .backdrop {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(5px);
            z-index: 2000;
            animation: fadeIn 0.2s ease-out;
        }

        .popup-card {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 85%;
            max-width: 300px;
            background: rgba(30,30,30, 0.95);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 20px;
            padding: 16px; /* Reduced from 20px */
            z-index: 2001;
            color: white;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            display: flex;
            flex-direction: column;
            gap: 12px; /* Reduced from 15px */
            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes popIn {
            from { opacity: 0; transform: translate(-50%, -40%) scale(0.9); }
            to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }

        .close-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(255,255,255,0.1);
            border: none;
            color: #aaa;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .close-btn:hover {
            color: white;
            background: rgba(255,255,255,0.2);
        }

        .popup-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .avatar-wrapper {
            position: relative;
        }

        .popup-avatar {
            width: 50px; /* Reduced from 60px */
            height: 50px;
            border-radius: 50%;
            border: 2px solid var(--brand-primary);
        }
        
        .online-indicator {
            position: absolute;
            bottom: 2px;
            right: 2px;
            width: 10px;
            height: 10px;
            background: #00ff00;
            border: 2px solid #1e1e1e;
            border-radius: 50%;
        }

        .header-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .name-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .popup-header h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 700;
        }
        
        .poke-icon-btn {
            background: linear-gradient(135deg, #FF69B4, #FF1493); /* Hot Pink / Deep Pink */
            border: none;
            color: #fff;
            border-radius: 20px;
            cursor: pointer;
            font-size: 1.2rem;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 15px rgba(255, 20, 147, 0.6);
            transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            animation: pulse 2s infinite;
        }

        .friend-badge {
            background: linear-gradient(135deg, #00f0ff, #00ff99);
            color: black;
            font-size: 0.75rem;
            font-weight: bold;
            padding: 4px 10px;
            border-radius: 12px;
            box-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
            cursor: default;
        }
        
        .poke-icon-btn:hover {
            transform: scale(1.15) rotate(-10deg);
            box-shadow: 0 0 25px rgba(255, 20, 147, 0.8);
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(255, 20, 147, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(255, 20, 147, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 20, 147, 0); }
        }

        .mood-badge {
            background: rgba(255,255,255,0.1);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
            color: #ddd;
            align-self: flex-start;
        }

        .popup-body {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 10px; /* Reduced */
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .info-item {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
        }

        .label {
            color: #888;
        }

        .value {
            font-weight: 500;
            color: white;
        }

        .popup-actions {
            display: flex;
            gap: 8px;
        }

        .primary-btn {
            flex: 2;
            background: var(--brand-gradient);
            border: none;
            padding: 10px;
            border-radius: 10px;
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: opacity 0.2s;
        }

        .primary-btn:active {
            opacity: 0.8;
        }
        
        .secondary-actions {
            flex: 1;
            display: flex;
            gap: 6px;
        }

        .icon-btn {
            flex: 1;
            border: none;
            border-radius: 10px;
            font-size: 1.1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .icon-btn.danger {
            background: rgba(255, 50, 50, 0.15);
            color: #ff5555;
        }

        .icon-btn.warning {
            background: rgba(255, 200, 0, 0.15);
            color: #ffcc00;
        }
      `}</style>
        </>
    );
}
