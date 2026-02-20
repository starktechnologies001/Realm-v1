import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envConfig = dotenv.parse(fs.readFileSync('/Users/anonymous/Desktop/realmm/social-map-app/.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function check() {
  // Let's try to get a user profile to see columns
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  console.log('Profile columns:', data && data[0] ? Object.keys(data[0]) : error);
}
check();
