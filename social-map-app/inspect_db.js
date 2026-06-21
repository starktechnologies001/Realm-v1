import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envConfig = dotenv.parse(fs.readFileSync('/Users/anonymous/Desktop/realmm/social-map-app/.env'));
const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('thought_reactions').select('*').limit(1);
  console.log('thought_reactions select:', error, data);
}
check();
