import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkRelationships() {
    console.log('Checking profiles for relationship_status...');
    const { data, error } = await supabase
        .from('profiles')
        .select('id, username, relationship_status, status')
        .limit(20);

    if (error) {
        console.error('Error fetching profiles:', error);
    } else {
        console.log('Found profiles:');
        data.forEach(p => {
            console.log(`- User: ${p.username}, RelStatus: "${p.relationship_status}", Status: "${p.status}"`);
        });
        
        const withStatus = data.filter(p => p.relationship_status);
        console.log(`\nSummary: ${withStatus.length} out of ${data.length} profiles have a relationship_status.`);
    }
}

checkRelationships();
