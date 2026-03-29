// generate_embeddings.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// 1. CONFIGURATION
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// TODO: for production, prefer a Service Role key with RLS policies configured.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in ../.env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Get interactions for a user from the interactions table
 * @param {string} userId - The user's ID
 * @param {number} interaction_window - Number of recent interactions to fetch (default: 50)
 * @returns {Promise<Array>} - Array of interactions with derived weights
 */
async function getUserInteractions(userId, interactionWindow = 50) {
    console.log("Getting interactions for userId:", userId);

    const { data: interactions, error } = await supabase
        .from('interactions')
        .select('interaction_id, user_id, item_id, item_type, type')
        .eq('user_id', userId)
        .eq('item_type', 'PRODUCT')
        .order('created_at', { ascending: false })
        .limit(interactionWindow);

    if (error) {
        console.error("Error fetching interactions:", error);
        return [];
    }

    console.log(`Found ${interactions.length} interactions for user id: ${userId}`);
    return interactions.map((interaction) => ({
        ...interaction,
        weight: getInteractionWeight(interaction.type),
    }));
}

function getInteractionWeight(type) {
    switch (type) {
        case 'LIKE':
            return 1.0;
        case 'VIEW':
            return 0.2;
        default:
            return 0.1;
    }
}

/**
 * Fetch embeddings for a list of item IDs from the products table
 * @param {Array<string>} itemIds - Array of item IDs
 * @returns {Promise<Array>} - Array of items with valid embeddings (as arrays)
 */
async function getItemEmbeddings(itemIds) {
    if (!itemIds || itemIds.length === 0) {
        return [];
    }

    const { data: items, error } = await supabase
        .from('products')
        .select('id, product_embedding')
        .in('id', itemIds);

    if (error) {
        console.error("Error fetching item embeddings:", error);
        return [];
    }

    if (!items || items.length === 0) {
        return [];
    }

    // Parse string embeddings into arrays and filter valid ones
    const validItems = [];
    for (const item of items) {
        let embedding = item.product_embedding;
        
        // Handle string format (JSON string from DB)
        if (typeof embedding === 'string') {
            try {
                embedding = JSON.parse(embedding);
            } catch (e) {
                console.log(`Failed to parse embedding for item ${item.id}`);
                continue;
            }
        }

        // Validate: must be array with values
        if (Array.isArray(embedding) && embedding.length > 0) {
            // Filter out null values
            const cleanEmbedding = embedding.filter(v => v !== null);
            if (cleanEmbedding.length > 0) {
                validItems.push({
                    id: item.id,
                    embedding: cleanEmbedding
                });
            }
        }
    }

    console.log(`Fetched embeddings: ${items.length} items, ${validItems.length} have valid embeddings`);
    return validItems;
}

/**
 * Generate a user profile vector by aggregating item embeddings with interaction weights
 * Uses weighted average: sum(embedding * weight) / sum(weights)
 * @param {Array} interactions - User's interactions with item_ids and weights
 * @param {Array} items - Items with their embeddings
 * @returns {Array<number>|null} - Aggregated profile vector
 */
function generateProfileVector(interactions, items) {
    if (!interactions || interactions.length === 0 || !items || items.length === 0) {
        console.log("No interactions or items to generate profile vector");
        return null;
    }

    // Create a map of item_id -> embedding for quick lookup (only valid embeddings)
    const embeddingMap = new Map();
    items.forEach(item => {
        if (item.embedding && Array.isArray(item.embedding)) {
            // Filter out null values from embedding
            const cleanEmbedding = item.embedding.filter(v => v !== null);
            if (cleanEmbedding.length > 0) {
                embeddingMap.set(item.id, cleanEmbedding);
            }
        }
    });

    if (embeddingMap.size === 0) {
        console.log("No valid embeddings found in items");
        return null;
    }

    // Create a map of item_id -> weight (sum up weights if multiple interactions with same item)
    const weightMap = new Map();
    interactions.forEach(interaction => {
        const existing = weightMap.get(interaction.item_id) || 0;
        weightMap.set(interaction.item_id, existing + (interaction.weight || 0));
    });

    // Get the embedding dimension from the first embedding
    const firstEmbedding = embeddingMap.values().next().value;
    const embeddingDim = firstEmbedding.length;

    // Initialize weighted sum and total weight
    const weightedSum = new Array(embeddingDim).fill(0);
    let totalWeight = 0;

    // Aggregate embeddings with weights
    let usedItems = 0;
    weightMap.forEach((weight, itemId) => {
        const embedding = embeddingMap.get(itemId);
        if (embedding && weight > 0) {
            for (let i = 0; i < embeddingDim; i++) {
                weightedSum[i] += embedding[i] * weight;
            }
            totalWeight += weight;
            usedItems++;
        }
    });

    // Normalize by total weight
    if (totalWeight > 0 && usedItems > 0) {
        const profileVector = weightedSum.map(w => w / totalWeight);
        console.log(`Generated profile vector with dimension ${embeddingDim}, total weight: ${totalWeight}, items used: ${usedItems}`);
        return profileVector;
    }

    console.log("Total weight is zero, cannot generate profile vector");
    return null;
}

/**
 * Update a user's profile vector in the database
 * @param {string} userId - The user's ID
 * @param {Array<number>} profileVector - The computed profile vector
 */
async function updateUserProfileVector(userId, profileVector) {
    if (!profileVector) {
        console.log("No profile vector to update");
        return;
    }

    // Ensure all values are numbers (not null/undefined)
    const cleanVector = profileVector.map(v => v === null ? 0 : v);

    const { error } = await supabase
        .from('users')
        .update({ profile_vector: cleanVector })
        .eq('user_id', userId);

    if (error) {
        console.error("Error updating user profile vector:", error.message);
        return;
    }

    console.log(`Successfully updated profile vector for user id: ${userId}`);
}

/**
 * Main function to update user embeddings based on their interactions
 * @param {string} username - The username to update
 */
async function updateUserEmbedding(username) {
    console.log(`\n=== Processing user: ${username} ===`);

    // 1. Fetch the user details from the users table (including existing profile_vector)
    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, username, profile_vector')
        .eq('username', username)
        .limit(1);

    if (error || !users || users.length === 0) {
        console.error(`User "${username}" not found`);
        return;
    }

    const user = users[0];
    console.log(`Found user: ${user.username} (id: ${user.user_id})`);

    // Parse existing profile_vector (handle vector type from DB)
    let existingVector = null;
    if (user.profile_vector) {
        if (typeof user.profile_vector === 'string') {
            // If stored as stringified array, parse it
            existingVector = JSON.parse(user.profile_vector);
        } else if (Array.isArray(user.profile_vector)) {
            existingVector = user.profile_vector;
        }
        console.log("Existing profile vector found");
    } else {
        console.log("No existing profile vector");
    }

    // 2. Get user's interactions
    const interactions = await getUserInteractions(user.user_id);
    if (interactions.length === 0) {
        console.log("No interactions found for this user");
        return;
    }

    // 3. Extract unique item IDs from interactions
    const itemIds = [...new Set(interactions.map(i => i.item_id))];
    console.log(`Unique items interacted: ${itemIds.length}`);

    // 4. Fetch embeddings for those items
    const items = await getItemEmbeddings(itemIds);
    if (items.length === 0) {
        console.log("No item embeddings found");
        return;
    }

    // 5. Generate new profile vector from current interactions (weighted sum)
    const newProfileVector = generateProfileVector(interactions, items);
    if (!newProfileVector) {
        console.log("Failed to generate profile vector from interactions");
        return;
    }

    // 6. Combine with existing profile_vector or use new one
    let finalVector;
    
    if (!existingVector) {
        // If no existing profile, use the new one
        finalVector = newProfileVector;
    } else {
        // If exists, average: (old + new) / 2
        console.log("Averaging with existing profile vector");
        finalVector = newProfileVector.map((v, i) => (existingVector[i] + v) / 2);
    }

    // 7. Update user's profile in database
    await updateUserProfileVector(user.user_id, finalVector);

    console.log(`=== Completed processing ${username} ===\n`);
}

/**
 * Update embeddings for all users
 */
async function updateAllUserEmbeddings() {
    // Get all users
    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, username');

    if (error || !users) {
        console.error("Error fetching users:", error);
        return;
    }

    console.log(`Found ${users.length} users to process\n`);

    for (const user of users) {
        await updateUserEmbedding(user.username);
    }
}

// Run for a specific user or all users
const args = process.argv.slice(2);
if (args.length > 0) {
    updateUserEmbedding(args[0]);
} else {
    updateAllUserEmbeddings();
}
