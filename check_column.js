
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual env parsing
const envPath = path.resolve(process.cwd(), 'social-map-app', '.env');
let supabaseUrl, supabaseKey;

try {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
        const [key, value] = line.split('=');
        if (key === 'VITE_SUPABASE_URL') supabaseUrl = value?.trim();
        if (key === 'VITE_SUPABASE_ANON_KEY') supabaseKey = value?.trim();
    }
} catch (e) {
    console.log("No .env found, checking process.env");
}

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Checking profiles table...");
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    
    if (error) {
        console.error("Error fetching profiles:", error);
        return;
    }

    if (data && data.length > 0) {
        const profile = data[0];
        console.log("Keys in profile:", Object.keys(profile));
        if ('is_location_on' in profile) {
            console.log("✅ is_location_on EXISTS. Value:", profile.is_location_on);
        } else {
            console.log("❌ is_location_on MISSING");
        }
    } else {
        console.log("No profiles found to check.");
    }
}

check();
