// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify Authentication to get the User ID
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing Authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { 
        razorpay_order_id, 
        razorpay_payment_id, 
        razorpay_signature,
        plan,
        amount
    } = await req.json()

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // 2. Verify Razorpay Signature
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
    if (!razorpayKeySecret) {
      throw new Error('Server configuration error')
    }

    const payload = razorpay_order_id + '|' + razorpay_payment_id;
    
    // Create HMAC SHA256 using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(razorpayKeySecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSignature !== razorpay_signature) {
      return new Response(
        JSON.stringify({ error: 'Invalid payment signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Signature is valid. Create the subscription in the database.
    // Use the service role key to bypass RLS for this insertion if necessary,
    // but the authenticated client might work since users can view their own.
    // Inserting their own subscription is usually blocked by default unless there's an INSERT policy.
    // It's safer to use the service role key to forcefully insert the validated payment.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days subscription

    const { data: subData, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
            user_id: user.id,
            plan: plan,
            status: 'active',
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            amount_paid: amount,
            started_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString()
        })
        .select()
        .single()

    if (subError) {
        console.error('Failed to insert subscription:', subError)
        throw new Error('Payment verified, but failed to activate subscription. Please contact support.')
    }

    return new Response(
      JSON.stringify({ success: true, subscription: subData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
