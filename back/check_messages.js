import fs from 'fs';
import path from 'path';

// Read .env file
const envFilePath = path.resolve('.env');
let envs = {};
if (fs.existsSync(envFilePath)) {
  const fileContent = fs.readFileSync(envFilePath, 'utf-8');
  fileContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      envs[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envs.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || envs.VITE_SUPABASE_ANON_KEY;

async function check() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/messages?select=*&order=created_at.desc&limit=5`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err)
  }
}

check();
