// @ts-nocheck
// Follow this guide to deploy: https://supabase.com/docs/guides/functions
// You need to install the Deno CLI and Supabase CLI.

// 1. Generate VAPID Keys:
// npx web-push generate-vapid-keys

// 2. Set Env Vars:
// supabase secrets set VAPID_PUBLIC_KEY="<your_public_key>"
// supabase secrets set VAPID_PRIVATE_KEY="<your_private_key>"
// supabase secrets set SUPABASE_URL="<your_project_url>"
// supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<your_service_role_key>"

// 3. Deploy:
// supabase functions deploy push-notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.5.0";

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(
  'mailto:admin@example.com',
  vapidPublicKey,
  vapidPrivateKey
);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const { record } = await req.json(); // Payload from Database Webhook or manual invoke

  // Expecting 'record' to be a 'messages' row or 'calls' row
  // Logic: 
  // 1. Identify Receiver
  // 2. Check Mute Settings
  // 3. Fetch Subscription
  // 4. Send Push

  const receiverId = record.receiver_id || record.receiver_id; // Adjust based on table
  if (!receiverId) return new Response("No receiver_id", { status: 200 });

  // 1. Check Global Mute of Receiver
  const { data: profile } = await supabase.from('profiles').select('mute_settings').eq('id', receiverId).single();
  
  if (profile?.mute_settings?.mute_all) {
      const expiry = profile.mute_settings.muted_until;
      if (!expiry || new Date(expiry) > new Date()) {
          console.log(`User ${receiverId} is globally muted.`);
          return new Response("Muted", { status: 200 });
      }
  }

  // 2. Initial Setup: Just fetch all subscriptions for user
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', receiverId);
  
  if (!subs || subs.length === 0) return new Response("No subscriptions", { status: 200 });

  const notificationPayload = JSON.stringify({
    title: 'New Notification',
    body: record.content || 'You have a new message',
    url: '/chat',
    muted: false 
  });

  const promises = subs.map(sub => 
    webpush.sendNotification(sub.subscription, notificationPayload)
      .catch(err => {
        if (err.statusCode === 410) {
            // Subscription expired, delete from DB
             console.log("Subscription expired, deleting...");
             // logic to delete this specific sub...
        }
        console.error("Error sending push:", err);
      })
  );

  await Promise.all(promises);

  return new Response("Notifications sent", { status: 200 });
});
