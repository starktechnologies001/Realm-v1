// @ts-nocheck

// Import directly to avoid import map issues in some editors
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import webpush from "https://esm.sh/web-push@3.6.1?target=deno";

// Configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const ADMIN_EMAIL = "mailto:admin@example.com"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

try {
  webpush.setVapidDetails(ADMIN_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.error("Failed to set VAPID details:", err);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { record, table, type } = payload;

    if (type !== "INSERT") {
      return new Response("Not an INSERT event", { status: 200 });
    }

    let receiverId: string | null = null;
    let notificationData = { title: "", body: "", url: "/", tag: "" };
    let senderId: string | null = null;

    if (table === "messages") {
      receiverId = record.receiver_id;
      senderId = record.sender_id;
      const isImage = record.message_type === "image";
      notificationData = {
        title: "New Message",
        body: isImage ? "📷 Sent a photo" : record.content,
        url: "/chat",
        tag: `msg-${senderId}`,
      };
    } else if (table === "calls") {
      if (record.status !== "pending") return new Response("Call not pending", { status: 200 });
      receiverId = record.receiver_id;
      senderId = record.caller_id;
      notificationData = {
        title: "Incoming Call",
        body: record.type === "video" ? "📹 Incoming Video Call" : "📞 Incoming Audio Call",
        url: "/map",
        tag: `call-${record.channel_name}`,
      };
    } else {
      return new Response(`Ignoring table ${table}`, { status: 200 });
    }

    if (!receiverId || !senderId) return new Response("Missing IDs", { status: 200 });

    // Fetch Details & Check Mute
    const [receiverRes, senderRes] = await Promise.all([
      supabase.from("profiles").select("mute_settings").eq("id", receiverId).single(),
      supabase.from("profiles").select("username, full_name, avatar_url").eq("id", senderId).single(),
    ]);

    const receiverProfile = receiverRes.data;
    const senderProfile = senderRes.data;

    if (receiverProfile?.mute_settings?.mute_all) {
      const expiry = receiverProfile.mute_settings.muted_until;
      if (!expiry || new Date(expiry) > new Date()) {
        console.log(`User ${receiverId} is globally muted.`);
        return new Response("User Muted", { status: 200 });
      }
    }

    if (senderProfile) {
      notificationData.title = senderProfile.full_name || senderProfile.username || notificationData.title;
    }

    // Fetch Subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", receiverId);

    if (subError || !subscriptions || subscriptions.length === 0) {
      return new Response("No subscriptions found", { status: 200 });
    }

    // Send Push
    const pushPayload = JSON.stringify({
      title: notificationData.title,
      body: notificationData.body,
      url: notificationData.url,
      tag: notificationData.tag,
      icon: senderProfile?.avatar_url,
    });

    await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        }, pushPayload);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Subscription expired/invalid for ID ${sub.id}. Deleting...`);
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error(`Error sending push to ${sub.id}:`, err);
        }
      }
    }));

    return new Response("Notifications Sent", { status: 200 });

  } catch (error) {
    console.error("Function Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
