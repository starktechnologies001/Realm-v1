import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import './ReportModal.css';

const REPORT_REASONS = [
    { id: 'fake', label: 'Fake or Misleading Profile', emoji: '🎭' },
    { id: 'harassment', label: 'Harassment or Bullying', emoji: '😡' },
    { id: 'spam', label: 'Spam or Fraud', emoji: '🛑' },
    { id: 'inappropriate', label: 'Inappropriate Content / Nudity', emoji: '🔞' },
    { id: 'child_safety', label: 'Child Safety Concern', emoji: '🧒' },
    { id: 'location', label: 'Location Misuse', emoji: '📍' },
    { id: 'other', label: 'Other', emoji: '❓' }
];

export default function ReportModal({ targetUser, onClose, onSuccess, onError }) {
    const [selectedReason, setSelectedReason] = useState(null);
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async () => {
        if (!selectedReason) return;
        setLoading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            // 1. Prevent Duplicates (Check if already reported recently)
            const { data: existingReport } = await supabase
                .from('reports')
                .select('id, created_at')
                .eq('reporter_id', session.user.id)
                .eq('reported_id', targetUser.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingReport) {
                const hoursSinceLastReport = (new Date() - new Date(existingReport.created_at)) / (1000 * 60 * 60);
                if (hoursSinceLastReport < 24) {
                    throw new Error('You have already reported this user recently.');
                }
            }

            // 2. Submit Report
            // We append description to reason to avoid schema changes (admin-ready without breaking DB)
            const fullReason = description.trim() 
                ? `${selectedReason.label} - ${description.trim()}`
                : selectedReason.label;

            const { error } = await supabase.from('reports').insert({
                reporter_id: session.user.id,
                reported_id: targetUser.id,
                reason: fullReason
            });

            if (error) throw error;

            setSubmitted(true);
            if (onSuccess) onSuccess(targetUser.name || targetUser.username);
            
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err) {
            console.error('Report submission failed:', err);
            if (onError) onError(err.message || 'Failed to submit report.');
            setLoading(false);
        }
    };

    return (
        <div className="report-modal-overlay" onClick={onClose}>
            <div className="report-modal-card" onClick={e => e.stopPropagation()}>
                {submitted ? (
                    <div className="report-success-state">
                        <div className="report-success-icon">✅</div>
                        <h3>Report Submitted</h3>
                        <p>Thank you for helping keep Nearo safe. Our Trust & Safety team will review this report within 24 hours.</p>
                        <button className="btn-done" onClick={onClose}>Done</button>
                    </div>
                ) : (
                    <>
                        <div className="report-icon-header">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        </div>

                        <h3>Report {targetUser?.name || targetUser?.username}</h3>
                        <p>Select a primary reason for reporting this user.</p>

                        {!selectedReason ? (
                            <div className="report-reasons-grid">
                                {REPORT_REASONS.map(reason => (
                                    <button 
                                        key={reason.id} 
                                        className="report-reason-btn"
                                        onClick={() => setSelectedReason(reason)}
                                    >
                                        <span className="report-emoji">{reason.emoji}</span>
                                        <span>{reason.label}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="report-details-form">
                                <div className="selected-reason-chip" onClick={() => setSelectedReason(null)}>
                                    <span>{selectedReason.emoji} {selectedReason.label}</span>
                                    <span className="change-reason-text">Change</span>
                                </div>
                                
                                <label>Provide more details (Optional)</label>
                                <textarea
                                    placeholder="Help our moderation team understand what happened..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.slice(0, 300))}
                                    rows={4}
                                    disabled={loading}
                                ></textarea>
                                <div className="char-counter">
                                    {description.length}/300
                                </div>

                                <div className="report-actions">
                                    <button 
                                        className="cancel-report-btn" 
                                        onClick={onClose}
                                        disabled={loading}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        className="submit-report-btn" 
                                        onClick={handleSubmit}
                                        disabled={loading}
                                    >
                                        {loading ? 'Submitting...' : 'Submit Report'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
