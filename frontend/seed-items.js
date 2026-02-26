const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tndgscjywjmmllkbyexj.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_d7ST6jgUBqL3tWqGp-ze3g_4bXcPXdk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const dataPath = path.join(__dirname, '../backend/data/dev-data.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(rawData);

    // 1. Insert minimal Users
    if (data.users && data.users.length > 0) {
        const minimalUsers = data.users.map(u => ({ id: u.id, username: u.username }));
        const { data: insertedUsers, error: userError } = await supabase
            .from('users')
            .upsert(minimalUsers)
            .select();

        if (userError) {
            console.error("Error inserting users:", userError.message, userError.details, userError.hint);
            return;
        } else {
            console.log(`Successfully upserted ${insertedUsers.length} users`);
        }
    }

    // 2. Insert Items (Posts)
    const items = data.posts.map(post => ({
        author_id: post.userId,
        item_type: 'PRODUCT',
        title: post.title,
        body_text: post.content,
        tags: [post.category],
        created_at: post.timestamp
    }));

    if (items.length === 0) {
        console.log("No items to insert.");
        return;
    }

    const { data: insertedData, error } = await supabase
        .from('items')
        .insert(items)
        .select();

    if (error) {
        console.error("Error inserting items:", error.message, error.details, error.hint);
    } else {
        console.log(`Successfully inserted ${insertedData.length} items`);
    }
}

main().catch(console.error);
