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

  // 2. Fetch items that DON'T have a vector yet
  const { data: items, error } = await supabase
    .from('items')
    .select('*')
    .is('embedding', null) // Only get rows with NULL embeddings
    
  if (error) {
    console.error("Error fetching data:", error);
    return;
  }

  console.log(`Found ${items.length} items to process.`);


//   3. Loop through each item
  for (const item of items) {
    let vector = null;
    console.log(`Processing Item ID ${item.id} (${item.item_type})...`);

    try {
      // SCENARIO A: It's an Image (Pinterest style)
      if (item.item_type === 'PRODUCT') {
        if (!item.media_url) {
          console.warn(`Skipping Item ${item.id}: No image URL found.`);
          continue;
        }
        
        // Call your Hugging Face /embed-image endpoint
        const response = await axios.post(`${HF_API_URL}/embed-image`, {
          image_url: item.media_url
        });
        vector = response.data.vector;
      } 
      
      // SCENARIO B: It's a Text Post (Reddit style)
      else if (item.item_type === 'POST') {
        if (!item.body_text) {
          console.warn(`Skipping Item ${item.id}: No text content found.`);
          continue;
        }

        // Call your Hugging Face /embed-text endpoint
        const response = await axios.post(`${HF_API_URL}/embed-text`, {
          text: item.body_text
        });
        vector = response.data.vector;
      }

      // 4. Update Supabase with the new Vector
      if (vector) {
        const { error: updateError } = await supabase
          .from('items')
          .update({ embedding: vector })
          .eq('id', item.id);

        if (updateError) console.error(`Failed to update Item ${item.id}:`, updateError);
        else console.log(`✅ Updated Item ${item.id}`);
      }

    } catch (err) {
      console.error(`❌ Error processing Item ${item.id}:`);
      // Log simple error message (e.g., "500 Internal Server Error" or timeout)
      console.error(err.message);
    }

    // 5. Sleep for 1 second to be nice to the free server
    await sleep(1000); 
  }

  console.log("🎉 Batch complete! Run the script again if you have more items.");
}

generateVectors();