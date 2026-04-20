// delete_user.js
// Delete a user from Clerk + public.users (Supabase).
// Usage: node scripts/delete_user.js <clerk_user_id>
// CASCADE on public.users FKs will take down tryon_generations + user_input_images automatically.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const userId = process.argv[2];
if (!userId) {
    console.error("Usage: node scripts/delete_user.js <clerk_user_id>");
    process.exit(1);
}

const clerkSecret = process.env.CLERK_SECRET_KEY;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

async function deleteFromSupabase() {
    const url = `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`;
    const resp = await fetch(url, {
        method: "DELETE",
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "return=representation",
        },
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`Supabase DELETE ${resp.status}: ${body}`);
    const rows = body ? JSON.parse(body) : [];
    console.log(`✓ Supabase: removed ${rows.length} row(s) from public.users`);
}

async function deleteFromClerk() {
    if (!clerkSecret) {
        console.log("… Clerk: skipped (CLERK_SECRET_KEY not set)");
        return;
    }
    const resp = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    const body = await resp.text();
    if (resp.status === 404) {
        console.log("… Clerk: user not found (already gone)");
        return;
    }
    if (!resp.ok) throw new Error(`Clerk DELETE ${resp.status}: ${body}`);
    console.log("✓ Clerk: user deleted");
}

(async () => {
    console.log(`Deleting user: ${userId}`);
    try {
        await deleteFromSupabase();
    } catch (err) {
        console.error("✗ Supabase delete failed:", err.message);
    }
    try {
        await deleteFromClerk();
    } catch (err) {
        console.error("✗ Clerk delete failed:", err.message);
    }
})();
