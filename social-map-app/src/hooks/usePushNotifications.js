import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications(userId) {
    const [subscription, setSubscription] = useState(null);

    useEffect(() => {
        if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

        const registerPush = async () => {
            try {
                // 1. Check Permission
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.log('Push permission denied');
                    return;
                }

                // 2. Get SW Registration
                const registration = await navigator.serviceWorker.ready;

                // 3. Subscribe (or get existing scrupt)
                // Note: In real app, we check if already subscribed to avoid spamming subscribe calls
                let sub = await registration.pushManager.getSubscription();

                if (!sub) {
                    // Check if VAPID key is configured
                    if (VAPID_PUBLIC_KEY.includes('<')) {
                        console.warn("⚠️ VAPID Public Key not configured. Push subscription skipped.");
                        return;
                    }

                    sub = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                    });
                }

                setSubscription(sub);

                // 4. Send to Backend
                const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('p256dh'))));
                const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('auth'))));

                const { error } = await supabase
                    .from('push_subscriptions')
                    .upsert({
                        user_id: userId,
                        endpoint: sub.endpoint,
                        p256dh: p256dh,
                        auth_key: auth,
                        last_used_at: new Date().toISOString()
                    }, { onConflict: 'endpoint' });

                if (error) console.error("Error saving push subscription:", error);
                else console.log("✅ Push subscription saved!");

            } catch (err) {
                console.error("Error subscribing to push:", err);
            }
        };

        registerPush();
    }, [userId]);

    return subscription;
}
