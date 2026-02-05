import React from 'react';

export default function MessageStatusTick({ status, isSender }) {
    // Only show ticks for sender's messages
    if (!isSender) return null;
    
    if (status === 'sent') {
        return (
            <span className="message-status-tick single" title="Sent">
                ✓
            </span>
        );
    }
    
    if (status === 'delivered') {
        return (
            <span className="message-status-tick double" title="Delivered">
                ✓✓
            </span>
        );
    }
    
    if (status === 'seen') {
        return (
            <span className="message-status-tick double seen" title="Seen">
                ✓✓
            </span>
        );
    }
    
    return null;
}

// Add inline styles
const style = document.createElement('style');
style.textContent = `
    .message-status-tick {
        font-size: 11px;
        margin-left: 4px;
        display: inline-block;
        line-height: 1;
        vertical-align: middle;
    }
    
    .message-status-tick.single,
    .message-status-tick.double {
        color: #8e8e93;
    }
    
    .message-status-tick.double.seen {
        color: #ffd60a;
    }
`;
if (!document.getElementById('message-status-tick-styles')) {
    style.id = 'message-status-tick-styles';
    document.head.appendChild(style);
}
