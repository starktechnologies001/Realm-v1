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

const RELATIONSHIP_VALUES = ['Single', 'Married', 'Committed', 'Open to Date', 'It\'s Complicated', 'Engaged', 'In a Relationship'];

async function migrateStatus() {
    console.log('🔄 Starting migration of relationship status...');

    // 1. Fetch all profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, status, relationship_status');

    if (error) {
        console.error('❌ Error fetching profiles:', error);
        return;
    }

    console.log(`Found ${profiles.length} profiles to check.`);

    let updatedCount = 0;

    for (const profile of profiles) {
        // Check if 'status' field contains a relationship value
        if (profile.status && RELATIONSHIP_VALUES.includes(profile.status)) {
            console.log(`\nFound mismatch for user: ${profile.username} (ID: ${profile.id})`);
            console.log(`- Current Status: "${profile.status}"`);
            console.log(`- Current Relationship Status: "${profile.relationship_status}"`);

            // Prepare update
            const updates = {
                relationship_status: profile.status, // Move value
                status: 'Available' // Reset status to default
            };
            
            // If relationship_status already has a value, maybe don't overwrite? 
            // The user request implies the current data in 'status' IS the relationship status they just set.
            // So overwriting is probably correct if they just set it.
            
            console.log(`- Action: Moving "${profile.status}" to relationship_status and resetting status to "Available"`);

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', profile.id);

            if (updateError) {
                console.error(`❌ Failed to update ${profile.username}:`, updateError);
            } else {
                console.log(`✅ Successfully migrated ${profile.username}`);
                updatedCount++;
            }
        }
    }

    console.log(`\n🎉 Migration complete. Updated ${updatedCount} profiles.`);
}

migrateStatus();
