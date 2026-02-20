require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkAnuVisibleToStark() {
  const { data: users } = await supabase.from("profiles").select("*").in("username", ["anu", "stark"]);
  const anu = users.find(u => u.username === 'anu');
  const stark = users.find(u => u.username === 'stark');
  
  // Simulated query stark executes:
  const { data: profilesResult } = await supabase
    .from('profiles')
    .select('id, username, latitude, longitude, is_ghost_mode, is_location_on')
    .neq('id', stark.id)
    .or('is_ghost_mode.eq.false,is_ghost_mode.is.null')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);

  console.log("Stark fetched users count:", profilesResult.length);
  const fetchedAnu = profilesResult.find(u => u.username === 'anu');
  if (fetchedAnu) {
    console.log("Anu is IN the query result for Stark:", fetchedAnu);
  } else {
    console.log("Anu is MISSING from the query result. Why?");
  }
}
checkAnuVisibleToStark();
