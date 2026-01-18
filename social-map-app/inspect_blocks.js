
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eavzfjwmrlpamsqssyxc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhdnpmandtcmxwYW1zcXNzeXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMTU2NDksImV4cCI6MjA4MTY5MTY0OX0.XRorruHGigrgvPQKnNssZisyE3FsDmpxSLU0mfyjv6Q';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('Fetching blocks...');
    const { data, error } = await supabase
        .from('blocks')
        .select(`
            id,
            created_at,
            blocker_id,
            blocked_id,
            blocker:profiles!blocker_id(username, full_name),
            blocked:profiles!blocked_id(username, full_name)
        `);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No blocks found.');
        return;
    }

    console.log('Found blocks:');
    data.forEach(b => {
        console.log('------------------------------------------------');
        console.log(`Block ID: ${b.id}`);
        console.log(`Blocker (Who blocked): ${b.blocker?.username} (${b.blocker_id})`);
        console.log(`Blocked (Target):     ${b.blocked?.username} (${b.blocked_id})`);
        console.log('------------------------------------------------');
    });
}

inspect();
