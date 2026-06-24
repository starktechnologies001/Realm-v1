import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function check() {
  const visitors = await supabase.from('profile_visitors').select('*').limit(1);
  console.log('profile_visitors query error:', visitors.error);
  
  const profiles = await supabase.from('profiles').select('*').limit(1);
  if (profiles.data && profiles.data.length > 0) {
    const keys = Object.keys(profiles.data[0]);
    console.log('subscription_tier exists:', keys.includes('subscription_tier'));
    console.log('premium_theme exists:', keys.includes('premium_theme'));
    console.log('thought_bubble_color exists:', keys.includes('thought_bubble_color'));
    console.log('thought_bubble_style exists:', keys.includes('thought_bubble_style'));
    console.log('streak_count exists:', keys.includes('streak_count'));
    console.log('badges_list exists:', keys.includes('badges_list'));
  }
}
check();
