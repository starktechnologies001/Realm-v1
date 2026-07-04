// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLAN_PRICING = {
  silver: 9900,
  gold: 14900,
  diamond: 19900,
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { plan } = await req.json()

    if (!plan || !PLAN_PRICING[plan as keyof typeof PLAN_PRICING]) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amount = PLAN_PRICING[plan as keyof typeof PLAN_PRICING]

    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error('Razorpay credentials missing in environment variables')
      return new Response(
        JSON.stringify({ error: 'Payment gateway configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call Razorpay to create order
    const authHeader = `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`
    
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        amount: amount,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
        notes: {
          plan: plan
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Razorpay order creation failed:', errorData)
      throw new Error(`Failed to create Razorpay order: ${JSON.stringify(errorData)}`)
    }

    const orderData = await response.json()

    return new Response(
      JSON.stringify({ 
        order_id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency,
        plan: plan
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
