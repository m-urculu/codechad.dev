// import-roadmaps.js
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_URL,
  process.env.NEXT_PUBLIC_PROJECT_COURSESSUPABASE_ANON_KEY
);

const dir = path.join(__dirname, '../data/roadmap-content');

async function importRoadmaps() {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const key = file.replace('.json', '');
    const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    // Optionally extract title/description from content
    const title = content.title || key;
    const description = content.description || '';
    const { error } = await supabase
      .from('roadmaps')
      .upsert({ key, title, description, content });
    if (error) {
      console.error(`Error importing ${key}:`, error.message);
    } else {
      console.log(`Imported ${key}`);
    }
  }
}

importRoadmaps();
