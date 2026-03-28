// generate_vectors.js
require('dotenv').config({ path: '../frontend/.env.local' });

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// 1. CONFIGURATION
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// TODO: for production, prefer a Service Role key with RLS policies configured.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const HF_API_URL = 'https://CooLLegend-fashion-recommendation-api.hf.space' // Your running Hugging Face App URL

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper function to pause (prevents overwhelming your free API)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateVectors() {
  console.log("🚀 Starting Vector Generation...");

  // 2. Fetch products that DON'T have a vector yet
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .is('product_embedding', null)
    
  if (error) {
    console.error("Error fetching data:", error);
    return;
  }

  console.log(`Found ${products.length} products to process.`);


//   3. Loop through each product
  for (const product of products) {
    let vector = null;
    console.log(`Processing Product ID ${product.id} (${product.product_type || 'PRODUCT'})...`);

    try {
      if (!product.image_url) {
        console.warn(`Skipping Product ${product.id}: No image URL found.`);
        continue;
      }

      const response = await axios.post(`${HF_API_URL}/embed-image`, {
        image_url: product.image_url
      });
      vector = response.data.vector;

      // 4. Update Supabase with the new Vector
      if (vector) {
        const { error: updateError } = await supabase
          .from('products')
          .update({ product_embedding: vector })
          .eq('id', product.id);

        if (updateError) console.error(`Failed to update Product ${product.id}:`, updateError);
        else console.log(`✅ Updated Product ${product.id}`);
      }

    } catch (err) {
      console.error(`❌ Error processing Product ${product.id}:`);
      // Log simple error message (e.g., "500 Internal Server Error" or timeout)
      console.error(err.message);
    }

    // 5. Sleep for 1 second to be nice to the free server
    await sleep(1000); 
  }

  console.log("🎉 Batch complete! Run the script again if you have more products.");
}

generateVectors();
