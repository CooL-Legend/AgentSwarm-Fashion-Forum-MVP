const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tndgscjywjmmllkbyexj.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_d7ST6jgUBqL3tWqGp-ze3g_4bXcPXdk';

const supabase = createClient(supabaseUrl, supabaseKey);

const hmCsvPath = path.join(__dirname, '../backend/data/data/Garment/HMData.csv');
const westsideCsvPath = path.join(__dirname, '../backend/data/data/Garment/westside.csv');
const wrognCsvPath = path.join(__dirname, '../backend/data/data/Garment/wrogn_data.csv');

async function processCSV(filePath, mapRowCallback) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                const item = mapRowCallback(data);
                if (item) {
                    results.push(item);
                }
            })
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

function extractWrognTitle(description) {
    const match = description.match(/Title:\s*(.*?);/);
    if (match) {
        return match[1].trim();
    }
    return description.substring(0, 50); // fallback
}

async function main() {
    // Ensure user 1 exists
    const { error: userError } = await supabase
        .from('users')
        .upsert([{ id: 1, username: 'system_user' }]);
    if (userError) {
        console.error("Error ensuring user 1 exists:", userError.message);
        return;
    }

    console.log("Parsing HMData.csv...");
    const hmItems = await processCSV(hmCsvPath, (row) => ({
        author_id: 1, // Default user
        item_type: 'PRODUCT',
        title: row['b8e2ea'] || 'H&M Product',
        body_text: `Price: ${row['c166ec'] || 'Unknown'}`,
        tags: ['HM', 'Garment'],
        media_url: row['ecac7b src'] || null,
    }));

    console.log("Parsing westside.csv...");
    const westsideItems = await processCSV(westsideCsvPath, (row) => ({
        author_id: 1,
        item_type: 'PRODUCT',
        title: row['product-item-title'] || 'Westside Product',
        body_text: `Price: ${row['wizzy-product-item-price'] || 'Unknown'}`,
        tags: ['Westside', 'Garment'],
        media_url: row['product-item-image src'] || null,
    }));

    console.log("Parsing wrogn_data.csv...");
    const wrognItems = await processCSV(wrognCsvPath, (row) => {
        const imageUrls = row['image_urls'] ? row['image_urls'].split(';') : [];
        const mediaUrl = imageUrls.length > 0 ? imageUrls[0] : null;
        return {
            author_id: 1,
            item_type: 'PRODUCT',
            title: extractWrognTitle(row['description'] || 'Wrogn Product'),
            body_text: row['description'] || '',
            tags: ['Wrogn', 'Garment'],
            media_url: mediaUrl,
        };
    });

    const allItems = [...hmItems, ...westsideItems, ...wrognItems].filter(i => i.media_url);
    console.log(`Total parsed and filtered items to insert: ${allItems.length}`);

    if (allItems.length === 0) {
        console.log("No valid items to insert.");
        return;
    }

    // Insert in batches of 100 to avoid request size limits if needed
    const batchSize = 100;
    for (let i = 0; i < allItems.length; i += batchSize) {
        const batch = allItems.slice(i, i + batchSize);
        console.log(`Inserting batch ${i / batchSize + 1}... (${batch.length} items)`);

        const { data: insertedData, error } = await supabase
            .from('items')
            .insert(batch)
            .select();

        if (error) {
            console.error("Error inserting items batch:", error.message, error.details);
        } else {
            console.log(`Successfully inserted ${insertedData.length} items in this batch.`);
        }
    }

    console.log("Finished seeding garments!");
}

main().catch(console.error);
