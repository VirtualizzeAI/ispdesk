const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;

async function run() {
  const res = await fetch(`${URL}/rest/v1/messages?select=*&order=created_at.desc&limit=5`, {
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`
    }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
