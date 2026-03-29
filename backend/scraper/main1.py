"""
Universal Product Image Scraper — ZERO site-specific code.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Professional-grade approach used by Firecrawl, ScrapingBee, etc:

1. Playwright renders the full page (handles ALL SPAs)
2. JavaScript runs IN the browser to:
   - Find the "product zone" (near price, add-to-cart, size selectors)
   - Score every image by size, position, visibility, context
   - Cluster images by URL similarity
3. Network interception captures API-loaded images
4. Semantic scoring picks product images without ANY site-specific code

Works on: Any e-commerce site. No regex patterns per site. No CDN lists.
"""

import re
import json
import time
import random
import asyncio
from urllib.parse import urlparse, urljoin
from dataclasses import dataclass, field
from collections import Counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

HAS_PLAYWRIGHT = False
try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    pass

HAS_CFFI = False
try:
    from curl_cffi import requests as cffi_req
    HAS_CFFI = True
except ImportError:
    pass

import requests as std_req
from bs4 import BeautifulSoup

app = FastAPI(title="Universal Product Image Scraper")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STEALTH CONFIG
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
]

STEALTH_JS = """
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
delete navigator.__proto__.webdriver;
Object.defineProperty(navigator,'plugins',{get:()=>[
  {name:'Chrome PDF Plugin'},{name:'Chrome PDF Viewer'},{name:'Native Client'}
]});
Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
window.chrome={runtime:{onMessage:{addListener:()=>{},removeListener:()=>{}},
  sendMessage:()=>{},connect:()=>{}},loadTimes:()=>({}),csi:()=>({})};
const oq=navigator.permissions.query;
navigator.permissions.query=(p)=>p.name==='notifications'
  ?Promise.resolve({state:Notification.permission}):oq.call(navigator.permissions,p);
const gp=WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter=function(p){
  if(p===37445)return'Intel Inc.';if(p===37446)return'Intel Iris OpenGL Engine';
  return gp.call(this,p)};
Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
Object.defineProperty(navigator,'platform',{get:()=>'Win32'});
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IN-BROWSER IMAGE EXTRACTION (runs inside Playwright)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# This is the core magic — JavaScript that runs IN the browser
# to semantically find product images using DOM analysis.

EXTRACT_IMAGES_JS = """
() => {
    const results = [];
    const seen = new Set();

    // ── Step 1: Find the "product zone" ──
    // Product zones contain: price, add-to-cart, size selectors
    const productSignals = [
        // Price indicators
        ...document.querySelectorAll('[class*="price" i], [id*="price" i], [data-testid*="price" i]'),
        ...document.querySelectorAll('[class*="offer" i], [class*="mrp" i], [class*="cost" i]'),
        // Add to cart / buy buttons
        ...document.querySelectorAll('[class*="add-to-cart" i], [class*="addtocart" i], [class*="add-to-bag" i]'),
        ...document.querySelectorAll('button[class*="cart" i], button[class*="buy" i]'),
        ...document.querySelectorAll('[id*="add-to-cart" i], [id*="addToCart" i]'),
        // Size selectors
        ...document.querySelectorAll('[class*="size-selector" i], [class*="sizeSelector" i]'),
        ...document.querySelectorAll('[class*="size-chart" i], [class*="sizeChart" i]'),
        // Product title
        ...document.querySelectorAll('h1, [class*="product-title" i], [class*="productTitle" i]'),
        ...document.querySelectorAll('[class*="product-name" i], [class*="productName" i]'),
    ];

    // Find the common ancestor that contains product signals
    let productZone = null;
    if (productSignals.length >= 2) {
        // Find smallest element containing at least 2 signals
        let candidates = new Map();
        for (const sig of productSignals) {
            let el = sig.parentElement;
            for (let depth = 0; el && depth < 15; depth++) {
                candidates.set(el, (candidates.get(el) || 0) + 1);
                el = el.parentElement;
            }
        }
        let best = null, bestCount = 0, bestSize = Infinity;
        for (const [el, count] of candidates) {
            if (count >= 2) {
                const rect = el.getBoundingClientRect();
                const size = rect.width * rect.height;
                if (count > bestCount || (count === bestCount && size < bestSize)) {
                    best = el;
                    bestCount = count;
                    bestSize = size;
                }
            }
        }
        productZone = best;
    }
    // Fallback: use main content area
    if (!productZone) {
        productZone = document.querySelector('main, [role="main"], #content, .content, #app, #__next, #root')
                      || document.body;
    }

    const productZoneRect = productZone.getBoundingClientRect();

    // ── Step 2: Collect ALL candidate images ──
    const allImages = document.querySelectorAll('img, picture source, [style*="background-image"]');
    const viewport = { w: window.innerWidth, h: window.innerHeight };

    for (const el of allImages) {
        let src = '';
        let alt = '';
        let naturalW = 0, naturalH = 0;

        if (el.tagName === 'IMG') {
            // Try multiple src attributes (handles lazy loading)
            src = el.currentSrc || el.src
                || el.getAttribute('data-src')
                || el.getAttribute('data-original')
                || el.getAttribute('data-lazy-src')
                || el.getAttribute('data-zoom-image')
                || el.getAttribute('data-large-image')
                || el.getAttribute('data-full-size-image-url')
                || '';
            // Also check srcset for highest resolution
            const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset') || '';
            if (srcset) {
                const best = srcset.split(',').map(s => {
                    const parts = s.trim().split(/\s+/);
                    const w = parts[1] ? parseInt(parts[1]) || 1 : 1;
                    return { url: parts[0], w };
                }).sort((a, b) => b.w - a.w)[0];
                if (best && best.w > 400) src = best.url;
            }
            alt = el.alt || '';
            naturalW = el.naturalWidth || 0;
            naturalH = el.naturalHeight || 0;
        } else if (el.tagName === 'SOURCE') {
            const srcset = el.getAttribute('srcset') || '';
            if (srcset) {
                const parts = srcset.split(',').map(s => {
                    const p = s.trim().split(/\s+/);
                    return { url: p[0], w: parseInt(p[1]) || 1 };
                }).sort((a, b) => b.w - a.w);
                if (parts.length) src = parts[0].url;
            }
        } else {
            // Background image
            const bg = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m) src = m[1];
        }

        if (!src || src.startsWith('data:') || src.length < 10) continue;
        // Make absolute
        if (src.startsWith('//')) src = 'https:' + src;
        else if (src.startsWith('/')) src = window.location.origin + src;

        if (seen.has(src)) continue;
        seen.add(src);

        // ── Step 3: Score each image ──
        const rect = el.getBoundingClientRect();
        const renderedW = rect.width;
        const renderedH = rect.height;
        const isVisible = renderedW > 0 && renderedH > 0
            && rect.top < viewport.h * 3  // within first 3 viewports
            && getComputedStyle(el).display !== 'none'
            && getComputedStyle(el).visibility !== 'hidden'
            && getComputedStyle(el).opacity !== '0';

        if (!isVisible) continue;

        let score = 0;

        // Size scoring — larger images score higher
        const area = renderedW * renderedH;
        if (area > 150000) score += 30;       // > ~390x390
        else if (area > 50000) score += 20;   // > ~224x224
        else if (area > 10000) score += 10;   // > ~100x100
        else if (area < 3000) score -= 20;    // tiny = icon/badge

        // Natural dimensions (actual image size, not rendered)
        if (naturalW > 500 || naturalH > 500) score += 10;
        if (naturalW > 800 || naturalH > 800) score += 10;

        // Position scoring — images in product zone score higher
        const inProductZone = productZone.contains(el);
        if (inProductZone) score += 25;

        // Above the fold bonus
        if (rect.top < viewport.h) score += 10;
        if (rect.top < viewport.h * 0.5) score += 5;

        // Left side bonus (product images are usually on the left)
        if (rect.left < viewport.w * 0.6) score += 5;

        // Alt text signals
        const altLower = alt.toLowerCase();
        if (/product|front|back|detail|model|worn|outfit/.test(altLower)) score += 10;
        if (/logo|icon|badge|arrow|close|social|payment|banner|promo|ad\b/.test(altLower)) score -= 30;

        // URL signals (generic, no site-specific patterns)
        const srcLower = src.toLowerCase();
        // Positive: product-related paths
        if (/\/product[s]?\/|\/catalog\/|\/media\/|\/image[s]?\//.test(srcLower)) score += 10;
        if (/original|large|zoom|full[_-]?size|hero|main/.test(srcLower)) score += 5;
        // Negative: clearly non-product
        if (/logo|favicon|icon|sprite|pixel|tracking|analytics|beacon/.test(srcLower)) score -= 40;
        if (/banner|promo|advert|campaign|newsletter|popup|overlay/.test(srcLower)) score -= 30;
        if (/payment|visa|master|paypal|upi|social|facebook|twitter|instagram/.test(srcLower)) score -= 30;
        if (/\.svg(\?|$)|\.gif(\?|$)/.test(srcLower)) score -= 20;
        if (/spinner|loader|placeholder|skeleton|blank|spacer/.test(srcLower)) score -= 30;
        if (/avatar|profile|user[-_]icon/.test(srcLower)) score -= 20;
        if (/delivery|shipping|courier|express|return/.test(srcLower)) score -= 20;
        // Template URLs
        if (/{[@{]/.test(src)) score -= 50;

        // Context scoring — check nearby elements
        const parent = el.closest('[class*="gallery" i], [class*="carousel" i], [class*="slider" i], [class*="swiper" i], [class*="product-image" i], [class*="productImage" i], [class*="media" i], [class*="pdp" i]');
        if (parent) score += 20;

        // Thumbnail container penalty (small containers)
        const thumbParent = el.closest('[class*="thumb" i], [class*="mini" i], [class*="similar" i], [class*="recommend" i], [class*="related" i], [class*="also-like" i], [class*="you-may" i]');
        if (thumbParent) score -= 15;

        // Image aspect ratio — product images are usually portrait or square
        if (renderedW > 0 && renderedH > 0) {
            const ratio = renderedW / renderedH;
            if (ratio > 0.4 && ratio < 1.5) score += 5;  // portrait/square
            if (ratio > 3 || ratio < 0.2) score -= 15;     // extreme = banner/strip
        }

        results.push({
            src,
            alt,
            score,
            renderedW: Math.round(renderedW),
            renderedH: Math.round(renderedH),
            naturalW,
            naturalH,
            inProductZone,
            top: Math.round(rect.top),
        });
    }

    // ── Step 4: Also extract from JSON-LD and og:image ──
    // JSON-LD product images
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const sc of ldScripts) {
        try {
            const extractImages = (data) => {
                if (!data) return;
                if (Array.isArray(data)) { data.forEach(extractImages); return; }
                if (typeof data !== 'object') return;
                if (data['@type'] === 'Product' || data['@type'] === 'IndividualProduct') {
                    const img = data.image;
                    if (img) {
                        const urls = Array.isArray(img) ? img : [img];
                        for (const u of urls) {
                            const url = typeof u === 'string' ? u : u?.url;
                            if (url && !seen.has(url)) {
                                seen.add(url);
                                results.push({ src: url, alt: 'json-ld', score: 40,
                                    renderedW: 0, renderedH: 0, naturalW: 0, naturalH: 0,
                                    inProductZone: true, top: 0 });
                            }
                        }
                    }
                }
                for (const k of ['@graph', 'mainEntity', 'hasVariant', 'offers']) {
                    if (data[k]) extractImages(data[k]);
                }
            };
            extractImages(JSON.parse(sc.textContent));
        } catch(e) {}
    }

    // og:image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
        const content = ogImage.getAttribute('content');
        if (content && content.startsWith('http') && /\.(jpe?g|png|webp)/i.test(content) && !seen.has(content)) {
            seen.add(content);
            results.push({ src: content, alt: 'og:image', score: 15,
                renderedW: 0, renderedH: 0, naturalW: 0, naturalH: 0,
                inProductZone: false, top: 0 });
        }
    }

    // ── Step 5: Upgrade thumbnail URLs to full-size ──
    // Many sites serve small thumbnails that link to larger versions
    for (const r of results) {
        let s = r.src;
        // Generic size upgrades (works across many CDNs)
        // /NNNxNNN/ → /800x1070/ or similar
        if (/\/\d{2,3}x\d{2,3}\//.test(s) || /\/\d{2,3}\/\d{2,3}\//.test(s)) {
            s = s.replace(/\/(\d{2,3})x(\d{2,3})\//, '/800x1070/');
            s = s.replace(/\/(\d{2,3})\/(\d{2,3})\//, '/800/1070/');
        }
        // w_NNN → w_750, h_NNN → h_750
        if (/[,/]w[_=]\d{1,3}[,/&]/.test(s)) {
            s = s.replace(/([,/]w[_=])\d+/, '$1750');
        }
        if (/[,/]h[_=]\d{1,3}[,/&]/.test(s)) {
            s = s.replace(/([,/]h[_=])\d+/, '$1750');
        }
        // ?w=NNN → ?w=750
        if (/[?&]w=\d{1,3}(&|$)/.test(s)) {
            s = s.replace(/([?&]w=)\d+/, '$1750');
        }
        r.src = s;
    }

    // ── Step 6: Get product name ──
    let productName = '';
    const h1 = document.querySelector('h1');
    if (h1) productName = h1.textContent.trim();
    if (!productName) {
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) productName = ogTitle.getAttribute('content') || '';
    }

    return { images: results, productName };
}
"""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NETWORK CAPTURE (captures API-loaded images)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JUNK_URL_RE = re.compile(
    r"(logo|favicon|sprite|pixel|tracking|analytics|beacon|adservice"
    r"|google\.com/|doubleclick|facebook\.com/tr|clarity\.ms"
    r"|hotjar|mouseflow|bat\.bing|criteo|taboola"
    r"|\.svg\?|\.gif\?|1x1|spacer|blank"
    r"|/miscelleneous/|/miscellaneous/|/store-locator/"
    r"|/mobile-cms-media/|/cms-media/|/static/icons?/"
    r"|delivery|shipping|courier|dtdc|xpressbees)", re.I
)


@dataclass
class NetworkImage:
    src: str
    content_type: str = ""
    size: int = 0


class NetworkCapture:
    def __init__(self):
        self.images: list[NetworkImage] = []
        self.json_images: list[str] = []
        self._seen: set[str] = set()

    async def on_response(self, response):
        try:
            url = response.url
            ct = response.headers.get("content-type", "")
            status = response.status

            if status != 200:
                return

            # Capture direct image responses
            if "image/" in ct and "svg" not in ct:
                if not JUNK_URL_RE.search(url) and url not in self._seen:
                    self._seen.add(url)
                    cl = int(response.headers.get("content-length", 0) or 0)
                    if cl > 5000:  # Skip tiny images (icons/pixels)
                        self.images.append(NetworkImage(src=url, content_type=ct, size=cl))

            # Capture JSON responses that might contain product data
            if "json" in ct:
                try:
                    body = await response.text()
                    if len(body) > 200:
                        data = json.loads(body)
                        self._extract_json_images(data, depth=0)
                except Exception:
                    pass
        except Exception:
            pass

    def _extract_json_images(self, data, depth=0):
        if depth > 12:
            return
        if isinstance(data, str):
            if len(data) > 20 and re.search(r'\.(jpe?g|png|webp|avif)', data, re.I):
                if (data.startswith("http") or data.startswith("//")) and data not in self._seen:
                    if not JUNK_URL_RE.search(data):
                        self._seen.add(data)
                        self.json_images.append(data)
            return
        if isinstance(data, list):
            for item in data:
                self._extract_json_images(item, depth + 1)
            return
        if isinstance(data, dict):
            # Prioritize known image keys
            for key in ["image", "images", "imageUrl", "image_url", "src", "url",
                        "hiRes", "large", "medium", "gallery", "galleryImages",
                        "media", "photos", "hero", "fullUrl", "xmedia"]:
                if key in data:
                    self._extract_json_images(data[key], depth + 1)
            for val in data.values():
                if isinstance(val, (dict, list)):
                    self._extract_json_images(val, depth + 1)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# UNIVERSAL IMAGE CLUSTERING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Groups images by URL similarity to find the "product image set"
# without knowing anything about the site's URL structure.

def cluster_images(images: list[dict]) -> list[dict]:
    """
    Cluster images by URL path similarity.
    The cluster with the most product-zone images = product images.
    """
    if len(images) <= 3:
        return images

    def url_sig(src: str) -> str:
        p = urlparse(src)
        path = p.path
        path = re.sub(r'/\d{2,4}x\d{2,4}/', '/', path)
        path = re.sub(r'/\d{2,4}/\d{2,4}/', '/', path)
        path = re.sub(r'[/,_](w|h|q|f|dpr|b)[_=]\w+', '', path)
        path = re.sub(r'\?.*$', '', path)
        # Get the last 2 meaningful directory segments
        parts = [p for p in path.split('/') if p and len(p) > 2]
        if len(parts) >= 3:
            return p.netloc + '/' + '/'.join(parts[:3])
        return p.netloc + '/' + '/'.join(parts)

    # Group by signature
    clusters: dict[str, list[dict]] = {}
    for img in images:
        sig = url_sig(img["src"])
        clusters.setdefault(sig, []).append(img)

    # Score clusters — heavily favor product zone presence and high individual scores
    cluster_scores = []
    for sig, members in clusters.items():
        zone_members = [m for m in members if m.get("inProductZone")]
        zone_ratio = len(zone_members) / len(members) if members else 0
        avg_score = sum(m["score"] for m in members) / len(members)
        # Product clusters: multiple images, in product zone, high scores
        cluster_score = (
            avg_score
            * (1 + len(members) * 0.5)
            * (1 + zone_ratio * 3)
        )
        cluster_scores.append((sig, cluster_score, members))

    cluster_scores.sort(key=lambda x: x[1], reverse=True)

    # Take images from top clusters, prioritizing product zone images
    result = []
    for sig, cs, members in cluster_scores:
        sorted_members = sorted(members, key=lambda x: (x.get("inProductZone", False), x["score"]), reverse=True)
        for m in sorted_members:
            if m not in result:
                result.append(m)
        if len(result) >= 30:
            break

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEDUPLICATION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def deduplicate(images: list[dict]) -> list[dict]:
    """Remove duplicate images based on URL similarity."""
    seen_keys = {}

    for img in images:
        src = img["src"]
        p = urlparse(src)
        # Normalize: strip size params, query string
        path = p.path
        path = re.sub(r'/\d{2,4}x\d{2,4}/', '/X/', path)
        path = re.sub(r'/\d{2,4}/\d{2,4}/', '/X/', path)
        path = re.sub(r'[/,_](w|h|q|f|dpr)[_=]\w+', '', path)
        # Get filename without extension
        fname = path.rsplit('/', 1)[-1]
        fname = re.sub(r'\.(jpe?g|png|webp|avif).*$', '', fname, flags=re.I)
        key = p.netloc + '/' + fname

        if key not in seen_keys or img["score"] > seen_keys[key]["score"]:
            seen_keys[key] = img

    return list(seen_keys.values())


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FALLBACK: curl_cffi + BeautifulSoup (no Playwright)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _headers():
    return {
        "User-Agent": random.choice(UAS),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
    }


def fallback_extract(url: str) -> tuple[list[dict], str]:
    """Extract images without Playwright using curl_cffi + BS4."""
    html = None
    try:
        if HAS_CFFI:
            r = cffi_req.get(url, headers=_headers(), impersonate="chrome124",
                             timeout=20, allow_redirects=True)
            if r.status_code == 200 and len(r.text) > 2000:
                html = r.text
        if not html:
            r = std_req.get(url, headers=_headers(), timeout=20, allow_redirects=True)
            if r.status_code == 200 and len(r.text) > 2000:
                html = r.text
    except Exception:
        pass

    if not html:
        return [], ""

    soup = BeautifulSoup(html, "html.parser")
    images = []
    product_name = ""

    # Product name
    h1 = soup.find("h1")
    if h1:
        product_name = h1.get_text(strip=True)
    if not product_name:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og:
            product_name = og.get("content", "")

    # JSON-LD images (highest quality source)
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(sc.string or "")
            _extract_ld_images(data, images, url)
        except Exception:
            pass

    # og:image
    og_img = soup.find("meta", attrs={"property": "og:image"})
    if og_img:
        content = og_img.get("content", "")
        if content and re.search(r'\.(jpe?g|png|webp)', content, re.I):
            images.append({
                "src": urljoin(url, content), "alt": "og:image", "score": 15,
                "renderedW": 0, "renderedH": 0, "naturalW": 0, "naturalH": 0,
                "inProductZone": False, "top": 0,
            })

    # DOM images
    for img in soup.find_all("img"):
        src = (img.get("src") or img.get("data-src") or img.get("data-original")
               or img.get("data-lazy-src") or "")
        if not src or src.startswith("data:"):
            continue
        if src.startswith("//"):
            src = "https:" + src
        elif not src.startswith("http"):
            src = urljoin(url, src)
        if JUNK_URL_RE.search(src):
            continue
        if not re.search(r'\.(jpe?g|png|webp|avif)', src, re.I):
            continue

        alt = img.get("alt", "")
        score = 10
        # Check context
        parent_class_parts = []
        for p in img.parents:
            if not hasattr(p, "get"):
                continue
            cls = p.get("class", [])
            if isinstance(cls, list):
                parent_class_parts.extend(cls)
            elif isinstance(cls, str):
                parent_class_parts.append(cls)
        parent_classes = " ".join(parent_class_parts).lower()
        if any(k in parent_classes for k in ["gallery", "carousel", "slider", "product-image", "media", "pdp"]):
            score += 20
        if any(k in parent_classes for k in ["thumb", "similar", "recommend", "related"]):
            score -= 15

        images.append({
            "src": src, "alt": alt, "score": score,
            "renderedW": 0, "renderedH": 0, "naturalW": 0, "naturalH": 0,
            "inProductZone": False, "top": 0,
        })

    return images, product_name


def _extract_ld_images(data, images, base_url):
    if isinstance(data, list):
        for item in data:
            _extract_ld_images(item, images, base_url)
        return
    if not isinstance(data, dict):
        return
    if data.get("@type") in ("Product", "IndividualProduct"):
        img = data.get("image")
        if img:
            urls = img if isinstance(img, list) else [img]
            for u in urls:
                url = u if isinstance(u, str) else (u.get("url", "") if isinstance(u, dict) else "")
                if url:
                    images.append({
                        "src": urljoin(base_url, url), "alt": "json-ld", "score": 40,
                        "renderedW": 0, "renderedH": 0, "naturalW": 0, "naturalH": 0,
                        "inProductZone": True, "top": 0,
                    })
    for k in ("@graph", "mainEntity", "hasVariant"):
        if data.get(k):
            _extract_ld_images(data[k], images, base_url)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN SCRAPE ORCHESTRATOR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def scrape_universal(url: str, max_images: int = 20) -> dict:
    t0 = time.time()
    all_images = []
    product_name = ""
    method = ""

    # ── Strategy 1: Playwright (preferred — handles everything) ──
    if HAS_PLAYWRIGHT:
        try:
            pw_images, pw_name, net_images = await _playwright_extract(url)
            if pw_images:
                all_images.extend(pw_images)
                method = "playwright"
            if pw_name:
                product_name = pw_name

            # Add network-captured images with a bonus
            for ni in net_images:
                all_images.append({
                    "src": ni, "alt": "", "score": 25,
                    "renderedW": 0, "renderedH": 0, "naturalW": 0, "naturalH": 0,
                    "inProductZone": False, "top": 0,
                })
        except Exception as e:
            print(f"Playwright error: {e}")

    # ── Strategy 2: Fallback to curl_cffi + BS4 ──
    if not all_images:
        fb_images, fb_name = fallback_extract(url)
        if fb_images:
            all_images.extend(fb_images)
            method = method or "cffi"
        if fb_name and not product_name:
            product_name = fb_name

    # ── Pipeline: filter → cluster → dedup → sort → limit ──
    # Filter out negative-score images
    filtered = [img for img in all_images if img["score"] > 0]

    # Cluster to find the product image set
    clustered = cluster_images(filtered)

    # Deduplicate
    unique = deduplicate(clustered)

    # Sort by score
    unique.sort(key=lambda x: x["score"], reverse=True)

    # Limit
    final = unique[:max_images]

    timing = (time.time() - t0) * 1000
    return {
        "images": final,
        "product_name": product_name,
        "method": method,
        "count": len(final),
        "timing_ms": round(timing, 1),
    }


async def _playwright_extract(url: str) -> tuple[list[dict], str, list[str]]:
    """Run Playwright, execute in-browser extraction JS, capture network."""
    images = []
    product_name = ""
    net_json_images = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
        ])
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent=random.choice(UAS),
            locale="en-US",
            timezone_id="America/New_York",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Ch-Ua": '"Chromium";v="125","Google Chrome";v="125"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
            },
        )
        page = await ctx.new_page()
        await page.add_init_script(STEALTH_JS)

        # Network capture
        capture = NetworkCapture()
        page.on("response", capture.on_response)

        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Handle challenge pages
            if resp and resp.status == 403:
                await asyncio.sleep(5)

            # Wait for content to load
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                await asyncio.sleep(3)

            # Dismiss cookie/consent banners
            for sel in [
                'button:has-text("Accept")', 'button:has-text("Accept All")',
                'button:has-text("I agree")', 'button:has-text("OK")',
                'button:has-text("Got it")',
                '[id*="onetrust"] button[id*="accept"]',
                '[class*="consent"] button',
                '[class*="cookie"] button',
            ]:
                try:
                    btn = await page.query_selector(sel)
                    if btn:
                        await btn.click()
                        await page.wait_for_timeout(300)
                        break
                except Exception:
                    pass

            # Scroll to trigger lazy loading
            for _ in range(random.randint(3, 5)):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await page.wait_for_timeout(random.randint(500, 1000))

            # Scroll back to top
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(1000)

            # Click on first product image thumbnail to trigger gallery load
            for sel in [
                '[class*="thumb"] img', '[class*="carousel"] img',
                '[class*="gallery"] img:first-child',
                '[class*="media"] img:first-child',
            ]:
                try:
                    thumb = await page.query_selector(sel)
                    if thumb:
                        await thumb.click()
                        await page.wait_for_timeout(500)
                except Exception:
                    pass

            # Run the in-browser extraction
            result = await page.evaluate(EXTRACT_IMAGES_JS)
            images = result.get("images", [])
            product_name = result.get("productName", "")

            # Collect network-captured JSON images
            net_json_images = capture.json_images

        except Exception as e:
            print(f"Playwright page error: {e}")
        finally:
            await browser.close()

    return images, product_name, net_json_images


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ScrapeRequest(BaseModel):
    url: str
    max_images: int = 20


class ScrapedImage(BaseModel):
    src: str
    alt: str = ""
    tag: str = ""
    score: float = 0.0
    width: int = 0
    height: int = 0
    in_product_zone: bool = False


class ScrapeResponse(BaseModel):
    site: str = ""
    product_name: str = ""
    method: str = ""
    images: list[ScrapedImage]
    count: int
    timing_ms: float = 0.0


@app.post("/api/scrape", response_model=ScrapeResponse)
async def scrape_images(req: ScrapeRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL is required")

    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError()
    except Exception:
        raise HTTPException(400, "Invalid URL")

    result = await scrape_universal(url, max_images=req.max_images)

    if not result["images"]:
        raise HTTPException(502, "Could not extract product images — site may require JavaScript or is blocking")

    site = urlparse(url).netloc.split(".")[-2] if "." in urlparse(url).netloc else ""

    return ScrapeResponse(
        site=site,
        product_name=result["product_name"],
        method=result["method"],
        images=[
            ScrapedImage(
                src=img["src"],
                alt=img.get("alt", ""),
                tag="product" if img.get("inProductZone") else "page",
                score=img["score"],
                width=img.get("renderedW", 0),
                height=img.get("renderedH", 0),
                in_product_zone=img.get("inProductZone", False),
            )
            for img in result["images"]
        ],
        count=result["count"],
        timing_ms=result["timing_ms"],
    )


@app.get("/health")
async def health():
    return {"status": "ok", "playwright": HAS_PLAYWRIGHT, "cffi": HAS_CFFI}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
