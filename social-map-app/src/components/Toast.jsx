import React, { useEffect } from 'react';

export default function Toast({ message, onClose, duration = 3000 }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [duration, onClose]);

    return (
        <>
            <div className="toast-notification" onClick={onClose}>
                {message}
            </div>
            <style>{`
        .toast-notification {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30,30,30, 0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 30px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            z-index: 3000;
            font-size: 0.9rem;
            animation: slideDown 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1px solid rgba(255,255,255,0.1);
            cursor: pointer;
        }

        @keyframes slideDown {
            from { transform: translate(-50%, -100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>
        </>
    );
}
