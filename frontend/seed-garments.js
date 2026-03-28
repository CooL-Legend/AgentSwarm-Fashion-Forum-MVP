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

function parsePrice(value) {
    if (!value) return null;

    const numericValue = Number(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : null;
}

async function main() {
    console.log("Parsing HMData.csv...");
    const hmProducts = await processCSV(hmCsvPath, (row) => ({
        title: row['b8e2ea'] || 'H&M Product',
        brand: 'H&M',
        price: parsePrice(row['c166ec']),
        category: 'Garment',
        product_type: 'PRODUCT',
        image_url: row['ecac7b src'] || null,
    }));

    console.log("Parsing westside.csv...");
    const westsideProducts = await processCSV(westsideCsvPath, (row) => ({
        title: row['product-item-title'] || 'Westside Product',
        brand: 'Westside',
        price: parsePrice(row['wizzy-product-item-price']),
        category: 'Garment',
        product_type: 'PRODUCT',
        image_url: row['product-item-image src'] || null,
    }));

    console.log("Parsing wrogn_data.csv...");
    const wrognProducts = await processCSV(wrognCsvPath, (row) => {
        const imageUrls = row['image_urls'] ? row['image_urls'].split(';') : [];
        const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
        return {
            title: extractWrognTitle(row['description'] || 'Wrogn Product'),
            brand: 'WROGN',
            category: 'Garment',
            product_type: 'PRODUCT',
            image_url: imageUrl,
        };
    });

    const allProducts = [...hmProducts, ...westsideProducts, ...wrognProducts].filter((product) => product.image_url);
    console.log(`Total parsed and filtered products to insert: ${allProducts.length}`);

    if (allProducts.length === 0) {
        console.log("No valid products to insert.");
        return;
    }

    // Insert in batches of 100 to avoid request size limits if needed
    const batchSize = 100;
    for (let i = 0; i < allProducts.length; i += batchSize) {
        const batch = allProducts.slice(i, i + batchSize);
        console.log(`Inserting batch ${i / batchSize + 1}... (${batch.length} products)`);

        const { data: insertedData, error } = await supabase
            .from('products')
            .insert(batch)
            .select();

        if (error) {
            console.error("Error inserting products batch:", error.message, error.details);
        } else {
            console.log(`Successfully inserted ${insertedData.length} products in this batch.`);
        }
    }

    console.log("Finished seeding garments!");
}

main().catch(console.error);
