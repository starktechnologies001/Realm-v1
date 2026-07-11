import React, { useState } from 'react';

/**
 * VerifiedBadge — Instagram-style Blue Verified Badge.
 * Wavy scalloped badge with a bold white checkmark inside.
 * Tapping shows an info tooltip with the verified date.
 */

/* Instagram-accurate verified badge SVG — scalloped rosette + bold white tick */
function BadgeSVG({ size }) {
    return (
        <svg
            className="verified-badge-icon"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, cursor: 'pointer', display: 'block' }}
            aria-hidden="true"
        >
            {/* Scalloped rosette background */}
            <path
                d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
                fill="#1877F2"
            />

            {/* Bold white checkmark inside */}
            <path
                d="m9 12 2 2 4-4"
                stroke="white"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function VerifiedBadge({ verifiedAt = null, size = 16, style = {} }) {
    const [showTooltip, setShowTooltip] = useState(false);

    const formattedDate = verifiedAt
        ? new Date(verifiedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : null;

    return (
        <span
            className="verified-badge-wrapper"
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', ...style }}
            onClick={(e) => {
                e.stopPropagation();
                setShowTooltip((v) => !v);
            }}
            title="Verified"
            aria-label="Verified User"
        >
            <BadgeSVG size={size} />

            {/* Tooltip */}
            {showTooltip && (
                <>
                    {/* Transparent backdrop to close */}
                    <span
                        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowTooltip(false);
                        }}
                    />
                    <span className="verified-badge-tooltip" role="tooltip">
                        <span className="vbt-header">
                            <BadgeSVG size={18} />
                            Verified
                        </span>
                        <span className="vbt-body">
                            This account has completed Nearo's verification requirements.
                        </span>
                        {formattedDate && (
                            <span className="vbt-date">Verified on {formattedDate}</span>
                        )}
                    </span>
                </>
            )}
        </span>
    );
}

/**
 * Inline helper — only renders when user.is_verified is true.
 */
export function VerifiedBadgeInline({ user, size = 15 }) {
    if (!user?.is_verified) return null;
    return (
        <VerifiedBadge
            verifiedAt={user.verified_at}
            size={size}
            style={{ marginLeft: 3, verticalAlign: 'middle' }}
        />
    );
}

export default VerifiedBadge;
