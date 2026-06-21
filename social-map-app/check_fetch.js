import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
  const { data, error } = await supabase
    .from('thought_reactions')
    .select(`
        id,
        thought_id,
        user_id,
        reaction_type,
        created_at,
        user:profiles!user_id(id, username, full_name, avatar_url, gender)
    `)
    .limit(1);
  console.log("Data:", data, "Error:", error);
}
testFetch();
