import random
import re
import sys
import time

import requests
import torch
from transformers import pipeline
from supabase import create_client, Client

# Force unbuffered output for immediate feedback
sys.stdout.reconfigure(line_buffering=True)

# Supabase configuration
SUPABASE_URL = "https://tndgscjywjmmllkbyexj.supabase.co"
SUPABASE_KEY = "sb_publishable_d7ST6jgUBqL3tWqGp-ze3g_4bXcPXdk"  # anon key

# Local API base (no tunnel required when notebook runs on this machine)
API_BASE = "http://localhost:3000/api"

ENDPOINTS = {
    "register": f"{API_BASE}/auth/register",
    "create_post": f"{API_BASE}/posts",
    "get_feed": f"{API_BASE}/posts",
    "create_comment": f"{API_BASE}/comments",
    "interact": f"{API_BASE}/interact",
}

CATEGORIES = ["Streetwear", "Luxury", "Vintage", "Minimalist", "Avant-Garde"]

SESSION = requests.Session()
SESSION.headers.update(
    {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
)

print(f"🌐 Using API base: {API_BASE}", flush=True)

# Test API connection first
print("🔗 Testing API connection...", flush=True)
try:
    resp = SESSION.get(f"{API_BASE}/posts", timeout=10)
    if resp.status_code == 200:
        posts = resp.json()
        print(f"✅ API connected! Current posts: {len(posts)}", flush=True)
    else:
        print(f"⚠️ API returned status {resp.status_code}", flush=True)
except Exception as e:
    print(f"❌ API connection failed: {e}", flush=True)
    print("   Make sure Go backend is on :8080 and Next.js is on :3000", flush=True)
    sys.exit(1)

print("\n⏳ Loading AI model Qwen3-0.6B... (may take 1-3 mins first time)\n", flush=True)
MODEL_ID = "Qwen/Qwen3-0.6B"
device = 0 if torch.cuda.is_available() else -1
print(f"   Using device: {'GPU' if device >= 0 else 'CPU'}", flush=True)
pipe = pipeline("text-generation", model=MODEL_ID, device=device)

# Silence known generate warning around max_length/max_new_tokens conflict.
if getattr(pipe.model, "generation_config", None):
    pipe.model.generation_config.max_length = None
print("✅ Model Loaded!\n", flush=True)


def safe_json(resp, label):
    """Parse JSON with clear diagnostics for tunnel/HTML responses."""
    try:
        return resp.json()
    except ValueError as e:
        snippet = resp.text[:220].replace("\n", " ").strip()
        raise RuntimeError(
            f"{label} returned non-JSON (status={resp.status_code}). "
            f"Body starts with: {snippet!r}"
        ) from e

def _extract_generated_text(outputs):
    """Handle both plain text and chat-shaped pipeline outputs."""
    generated = outputs[0].get("generated_text", "")

    if isinstance(generated, list):
        for item in reversed(generated):
            if isinstance(item, dict) and item.get("content"):
                text = item["content"]
                break
        else:
            text = str(generated)
    else:
        text = str(generated)

    # Drop reasoning traces if the model emits them.
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    return text.strip()

class FashionAgent:
    def __init__(self, name, persona_style, bio):
        self.name = name
        self.persona_style = persona_style
        self.bio = bio
        self.user_id = None

    def register(self):
        try:
            payload = {
                "username": self.name,
                "bio": self.bio,
                "persona_style": self.persona_style,
            }
            resp = SESSION.post(ENDPOINTS["register"], json=payload, timeout=30)
            data = safe_json(resp, f"register({self.name})")

            if resp.status_code not in (200, 201):
                print(f"❌ Register failed for {self.name}: {data}")
                return

            self.user_id = data.get("id")
            status = "registered" if resp.status_code == 201 else "found"
            print(f"✅ {self.name} {status} (id={self.user_id})")
        except Exception as e:
            print(f"❌ Register failed for {self.name}: {e}")

    def generate_content(self, task, context="", max_tokens=150):
        prompt = f"""You are {self.name}, a {self.persona_style}.
            Your bio: {self.bio}

            Task: {task}
            Context: {context}

            Return only the requested final answer text. No analysis, no tags, no quotes.
            Keep it engaging and in 2-4 sentences unless a short title is requested.
        """

        outputs = pipe(
            prompt,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.6,
            top_p=0.95,
            return_full_text=False,
        )

        return _extract_generated_text(outputs)

    def create_post(self):
        if not self.user_id:
            return None

        topics = [
            "upcoming summer trends",
            "thoughts on Balenciaga",
            "thrift flipping",
            "sustainable fabrics",
            "sneaker drops",
        ]
        topic = random.choice(topics)
        category = random.choice(CATEGORIES)

        title = self.generate_content(
            f"Write a catchy forum post title about {topic}. Return only the title text.",
            max_tokens=5000
        )
        body = self.generate_content(
            f"Write the body of a forum post about {topic}. Title: '{title}'.",
            max_tokens=5000
        )

        resp = SESSION.post(
            ENDPOINTS["create_post"],
            json={
                "userId": self.user_id,
                "title": title,
                "content": body,
                "category": category,
            },
            timeout=30,
        )
        data = safe_json(resp, f"create_post({self.name})")
        print(f"📝 {self.name} posted: {title[:60]}")
        return data

    def comment_on_post(self, post):
        if not self.user_id:
            return

        text = self.generate_content(
            task="Write a short in-character comment on this forum post.",
            context=f"Post Title: {post['title']}\nPost Content: {post['content']}",
            max_tokens=100
        )

        resp = SESSION.post(
            ENDPOINTS["create_comment"],
            json={
                "postId": post["id"],
                "userId": self.user_id,
                "content": text,
            },
            timeout=30,
        )
        safe_json(resp, f"create_comment({self.name})")
        print(f"💬 {self.name} commented on '{post['title'][:40]}...'")

    def like_post(self, post):
        if not self.user_id:
            return

        resp = SESSION.post(
            ENDPOINTS["interact"],
            json={
                "userId": self.user_id,
                "postId": post["id"],
                "type": "like",
            },
            timeout=30,
        )
        safe_json(resp, f"like_post({self.name})")
        print(f"❤️  {self.name} liked '{post['title'][:50]}'")

def get_feed():
    try:
        resp = SESSION.get(ENDPOINTS["get_feed"], timeout=30)
        data = safe_json(resp, "get_feed")
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"⚠️ feed fetch failed: {e}")
        return []

personas = [
    ("Sophie", "Haute Couture Critic",
     "Loves vintage Chanel, hates fast fashion, uses french words occasionally."),

    ("Jax", "Streetwear Hypebeast",
     "Obsessed with Supreme, Jordans, and oversized hoodies. Uses slang like 'mid', 'cop', 'drip'."),

    ("Elena", "Eco-Conscious Designer",
     "Focuses on sustainability, upcycling, and ethical labor. Very kind but firm."),

    ("Marcus", "Menswear Classicist",
     "Loves suits, watches, and leather boots. Dislikes trends."),

    ("Rina", "Avant-Garde Runway Archivist",
     "Lives for Comme des Garçons, Rick Owens, Yohji. Talks in references (collections/years), loves deconstruction, hates 'safe' styling."),

    ("Noah", "Minimalist Techwear Analyst",
     "Arc'teryx Veilance, Acronym, Salomon. Obsessed with seam taping, pockets, waterproof ratings. Calls things 'functional' or 'performative utility'."),

    ("Priya", "South Asian Bridal Stylist",
     "Expert in lehengas, drapes, zardozi, heirloom jewelry. Balances tradition + modern silhouettes. Firm about fit, comfort, and fabric authenticity."),

    ("Dante", "Luxury Sneaker Historian",
     "Knows every Jordan era, Nike SB lore, collab timelines. Speaks in colorways and drop dates. Hates fake 'grails' talk and bad lace swaps."),

    ("Mina", "Quiet Luxury Gatekeeper",
     "Loro Piana, The Row, Khaite, Bottega. Champions impeccable fabric and tailoring, minimal logos. Calls loud branding 'nouveau riche energy'."),

    ("Tessa", "Vintage Denim Purist",
     "Selvedge, raw fades, Japanese mills, chain-stitch hems. Talks oz weights and loom origins. Dislikes stretch denim and pre-ripped distressing."),

    ("Hugo", "Parisian Editorial Stylist",
     "Saint Laurent, Celine-era references, monochrome, sharp shoulders. Uses fashion-mag language ('silhouette', 'storytelling'). Hates 'fit pics with no concept'."),

    ("Camila", "Latin Nightlife Glam Curator",
     "Bodycon, metallics, mesh, high-slit drama. Prioritizes movement + lighting impact. Calls outfits 'camera-ready' and hates uncomfortable shoes."),

    ("Zoe", "Cottagecore Romantic",
     "Prairie dresses, smocking, lace, soft knits, Mary Janes. Loves earthy palettes and texture. Thinks harsh branding ruins the mood."),

    ("Ibrahim", "Heritage Menswear Collector",
     "Barbour, tweed, Alden, knit ties, waxed jackets. Talks provenance and repair culture. Dislikes synthetic blends and flimsy construction."),

    ("Skye", "Festival Futurist",
     "Holographic, cutouts, harnesses, layered accessories. Loves bold silhouettes and DIY customization. Hates boring basics at a 'maximal' event."),

    ("Jun", "K-Fashion Trend Scout",
     "Tracks Seoul street style, layered proportions, clean sneakers, wide trousers. Uses terms like 'tone-on-tone' and 'fit balance'. Hates outdated skinny jeans."),

    ("Valentina", "Old-Hollywood Wardrobe Director",
     "Bias cuts, gloves, satin, red lips, sculpted tailoring. Speaks in 'screen siren' vibes. Dislikes visible bra straps and cheap shine."),

    ("Omar", "Street Goth Curator",
     "Black-on-black layering, combat boots, silver hardware. Loves texture contrasts (leather/wool/mesh). Hates lazy all-black with no silhouette intention."),

    ("Harper", "Preppy Ivy League Traditionalist",
     "Blazers, loafers, rugby shirts, cable knits. Loves classic rules with tiny twists. Dislikes flashy streetwear logos and poorly fitted chinos."),

    ("Nadia", "Modest Fashion Innovator",
     "Layering genius: longline blazers, elevated hijab styling, fluid silhouettes. Cares about drape and coverage without sacrificing style. Kind, precise, and detail-obsessed."),

    ("Elliot", "Tailoring Fit Doctor",
     "Lives for clean shoulder lines, sleeve pitch, trouser break. Speaks like a fitter: 'raise the armhole', 'take in the waist'. Hates off-the-rack complacency."),

    ("Keiko", "Japanese Street Style Curator",
     "Harajuku to minimalist Tokyo—mixes playful shapes with clean lines. Loves proportion experiments and niche brands. Dislikes obvious trend-chasing."),

    ("Brooke", "Athleisure Performance Stylist",
     "Lululemon, Alo, Nike, match sets, sleek sneakers. Prioritizes flattering compression + real performance. Hates see-through leggings and sloppy fits."),

    ("Serge", "Perfume-and-Fit Aesthete",
     "Treats outfit like a full 'signature': scent, grooming, accessories. Loves harmony (watch, shoes, belt, fabric). Hates mismatched metals and loud clashing textures."),
]

agents = [FashionAgent(name, style, bio) for name, style, bio in personas]


def run_simulation(steps=150, target_posts=100):
    print("🚀 Starting Fashion Community Simulation...\n")
    print(f"Target: ~{target_posts} posts\n")
    
    # Register all agents first
    for agent in agents:
        agent.register()
    print()
    
    post_count = 0
    max_posts = target_posts + 20  # Allow some overshoot
    
    for step in range(steps):
        agent = random.choice(agents)
        feed = get_feed()
        
        # Higher probability of posting to reach target faster
        # With 24 agents and ~70% post rate, we should get ~100 posts in ~150 steps
        if post_count < max_posts:
            roll = random.random()
            if not feed or roll < 0.7:  # 70% chance to post
                agent.create_post()
                post_count += 1
            elif roll < 0.8:  # 20% chance to comment
                if feed:
                    agent.comment_on_post(random.choice(feed))
            else:  # 10% chance to like
                if feed:
                    agent.like_post(random.choice(feed))
        else:
            # Once we have enough posts, do more interactions
            roll = random.random()
            if roll < 0.5 and feed:
                agent.comment_on_post(random.choice(feed))
            elif feed:
                agent.like_post(random.choice(feed))
        
        if step % 20 == 0:
            print(f"📊 Progress: {post_count} posts created...")
        
        time.sleep(1)  # Reduced sleep for faster execution
    
    print(f"\n✅ Simulation complete! Created ~{post_count} posts.")
    print("Check your Fashion Forum UI.")


def seed_garment_items(max_items=50):
    """Fetch garment items from Supabase and create posts with images."""
    print("\n🛍️ Fetching garment items from Supabase...", flush=True)
    
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Fetch items with images from Supabase
        response = supabase.table("items").select("*").execute()
        
        if response.error:
            print(f"❌ Error fetching items: {response.error}", flush=True)
            return 0
            
        items = response.data
        items_with_images = [i for i in items if i.get('media_url')]
        
        print(f"📦 Found {len(items)} total items, {len(items_with_images)} with images", flush=True)
        
        if not items_with_images:
            print("⚠️ No items with images found in Supabase", flush=True)
            return 0
        
        # Get random items up to max_items
        selected = random.sample(items_with_images, min(max_items, len(items_with_images)))
        
        # Get or create system user
        users = SESSION.get(f"{API_BASE}/auth/users", timeout=10).json()
        if not users:
            # Register a system user
            SESSION.post(f"{API_BASE}/auth/register", json={
                "username": "FashionBot",
                "bio": "I curate the best fashion items for you!",
                "persona_style": "Curator"
            })
            users = SESSION.get(f"{API_BASE}/auth/users", timeout=10).json()
        
        system_user_id = users[0]['id'] if users else 1
        
        created = 0
        for item in selected:
            try:
                title = item.get('title', 'Fashion Item')
                body = item.get('body_text', '')
                image_url = item.get('media_url', '')
                tags = item.get('tags', [])
                category = tags[0] if tags else 'General'
                
                resp = SESSION.post(
                    ENDPOINTS["create_post"],
                    json={
                        "userId": system_user_id,
                        "title": title,
                        "content": body,
                        "category": category,
                        "imageUrl": image_url
                    },
                    timeout=30
                )
                
                if resp.status_code in (200, 201):
                    created += 1
                    if created % 10 == 0:
                        print(f"   Created {created}/{len(selected)} posts...", flush=True)
                else:
                    print(f"⚠️ Failed to create post: {resp.status_code}", flush=True)
                    
            except Exception as e:
                print(f"❌ Error creating post: {e}", flush=True)
        
        print(f"✅ Created {created} garment posts with images!", flush=True)
        return created
        
    except Exception as e:
        print(f"❌ Supabase error: {e}", flush=True)
        return 0


if __name__ == "__main__":
    run_simulation(steps=150, target_posts=100)
    seed_garment_items(max_items=50)