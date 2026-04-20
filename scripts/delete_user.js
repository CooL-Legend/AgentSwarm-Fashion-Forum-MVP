// delete_user.js
// Delete a user from Clerk + public.users (Supabase) by email.
// Usage: node scripts/delete_user.js <email>
// CASCADE on public.users FKs will take down tryon_generations + user_input_images automatically.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const email = process.argv[2];
if (!email) {
    console.error("Usage: node scripts/delete_user.js <email>");
    process.exit(1);
}

const clerkSecret = process.env.CLERK_SECRET_KEY;
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
    console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) / SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

async function lookupClerkUserId() {
    if (!clerkSecret) return null;
    const url = `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`;
    const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${clerkSecret}` },
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`Clerk lookup ${resp.status}: ${body}`);
    const users = body ? JSON.parse(body) : [];
    if (!users.length) return null;
    return users[0].id;
}

async function lookupSupabaseUserId() {
    const url = `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id`;
    const resp = await fetch(url, {
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
        },
    });
    const body = await resp.text();
    if (!resp.ok) throw new Error(`Supabase lookup ${resp.status}: ${body}`);
    const rows = body ? JSON.parse(body) : [];
    return rows.length ? rows[0].id : null;
}

async function deleteFromSupabase(userId) {
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

async function deleteFromClerk(userId) {
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
    console.log(`Deleting user: ${email}`);

    let clerkUserId = null;
    try {
        clerkUserId = await lookupClerkUserId();
        if (clerkUserId) console.log(`  → Clerk id: ${clerkUserId}`);
        else console.log("  → Clerk: no user found for that email");
    } catch (err) {
        console.error("✗ Clerk lookup failed:", err.message);
    }

    let supabaseUserId = clerkUserId;
    if (!supabaseUserId) {
        try {
            supabaseUserId = await lookupSupabaseUserId();
            if (supabaseUserId) console.log(`  → Supabase id: ${supabaseUserId}`);
        } catch (err) {
            console.error("✗ Supabase lookup failed:", err.message);
        }
    }

    if (supabaseUserId) {
        try {
            await deleteFromSupabase(supabaseUserId);
        } catch (err) {
            console.error("✗ Supabase delete failed:", err.message);
        }
    } else {
        console.log("… Supabase: skipped (no matching user id)");
    }

    if (clerkUserId) {
        try {
            await deleteFromClerk(clerkUserId);
        } catch (err) {
            console.error("✗ Clerk delete failed:", err.message);
        }
    }
})();
