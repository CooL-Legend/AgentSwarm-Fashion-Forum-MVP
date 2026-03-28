"""
FastAPI Product Image Scraper v3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Multi-strategy scraper with:
  - Strategy 0: Product-specific API probe (filtered by SKU)
  - Strategy 1: curl_cffi with SPA shell detection
  - Strategy 2: Playwright + stealth + network capture
  - Strategy 3: CDN URL construction + HEAD verify
  - 5-layer extraction → Score → Dedup → Return
"""

import re
import json
import time
import random
import asyncio
from urllib.parse import urljoin, urlparse
from dataclasses import dataclass, field
from collections import OrderedDict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup

HAS_CFFI = False
try:
    from curl_cffi import requests as cffi_req
    HAS_CFFI = True
except ImportError:
    pass
import requests as std_req

HAS_PLAYWRIGHT = False
try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    pass

# ── FastAPI app ──

app = FastAPI(title="Product Image Scraper v3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ──

@dataclass
class Img:
    src: str
    alt: str = ""
    w: int = 0
    h: int = 0
    layer: str = ""
    score: float = 0.0

    @property
    def key(self):
        p = urlparse(self.src)
        path = p.path
        # Strip CDN transform params (dimensions, quality, format)
        path = re.sub(r'/w_\d+', '', path)
        path = re.sub(r'/h_\d+', '', path)
        path = re.sub(r',w_\d+', '', path)
        path = re.sub(r',h_\d+', '', path)
        path = re.sub(r',f_[a-z]+', '', path)
        path = re.sub(r',q_[a-z0-9]+', '', path)
        path = re.sub(r',b_[a-z0-9:]+', '', path)
        path = re.sub(r'[_-]\d+x\d+', '', path)
        path = re.sub(r'/w/\d+/', '/', path)
        # Strip hash directories (e.g., /742643f5a43b41d084b946e72aa248fd_9366/)
        path = re.sub(r'/[a-f0-9]{20,}_[a-f0-9]+/', '/', path)
        # For Puma-style paths like /global/687093/49/mod01/fnd/IND/fmt/png
        # keep the meaningful segment (mod01, sv01, bv etc.)
        puma_match = re.search(r'(/global/\d+/\d+/\w+)', path)
        if puma_match:
            return p.netloc + puma_match.group(1)
        # For other CDNs, use filename as identity
        filename = path.rsplit('/', 1)[-1] if '/' in path else path
        return p.netloc + '/' + filename


@dataclass
class Result:
    url: str
    site: str
    product_name: str = ""
    images: list = field(default_factory=list)
    timing_ms: float = 0
    method: str = ""
    layers: list = field(default_factory=list)


# ── Constants ──

JUNK = re.compile(
    r"(logo|icon[-_.]|sprite|favicon|badge|pixel[-_.]|tracking|analytics"
    r"|spacer|placeholder|spinner|loader|arrow|chevron|close[-_.]"
    r"|/cart[-_.]|[-_]cart[-_.]|wishlist|heart[-_.]|star[-_.]|rating|social[-_]"
    r"|facebook|twitter|instagram|youtube|pinterest|tiktok"
    r"|play[-_.]store|app[-_.]store|google[-_.]play|payment[-_.]|visa|mastercard|paypal"
    r"|1x1|transparent|blank\.gif|pixel\.gif|beacon|avatar|profile[-_.]"
    r"|newsletter|subscribe|popup[-_.]|overlay|flag[-_.]icon|country[-_.]"
    r"|nav[-_.]|menu[-_.]|footer[-_.]|header[-_.]logo|\.svg(?:\?|$)"
    r"|delivery|shipping|ecom[-_.]express|dtdc|xpressbees|delhivery|courier)", re.I)

CDN = re.compile(
    r"(assets\.adidas\.com|static\.nike\.com|static\.zara\.net"
    r"|myntassets|media-amazon|rukminim|ajio\.com|shopify"
    r"|cloudinary|scene7|cloudfront|imgix|bewakoof|lp\d?\.hm\.com"
    r"|images\.puma\.com|levi\.com|st\.mngbcn\.com"
    r"|asos-media|images\.asos|img\.ltwebstatic\.com"
    r"|prod-img\.thesouledstore\.com)", re.I)

TRACKING_DOMAINS = re.compile(
    r"(google\.com|google\.\w+/|doubleclick|googlesyndication|googleads"
    r"|facebook\.com/tr|facebook\.net|fbcdn"
    r"|clarity\.ms|bing\.com|microsoft\.com"
    r"|quora\.com/_/ad|pinterest\.com/ct|tiktok\.com"
    r"|criteo\.|taboola\.|outbrain\."
    r"|analytics|pagead|adservice|ads\.|ad\."
    r"|pixel\.|pix\.gif|beacon|metrics|telemetry"
    r"|brsrvr\.com|demdex\.net|omtrdc\.net"
    r"|hotjar\.com|mouseflow\.com"
    r"|bat\.bing|tr\.snapchat|sc-static)", re.I)

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
]

SPA_SITES = {"zara", "nike", "hm", "ajio", "bewakoof", "meesho", "souledstore"}
MIN_REAL_HTML = 10000

STEALTH = """
Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
delete navigator.__proto__.webdriver;
Object.defineProperty(navigator,'plugins',{get:()=>[{name:'Chrome PDF Plugin'},{name:'Chrome PDF Viewer'},{name:'Native Client'}]});
Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
window.chrome={runtime:{onMessage:{addListener:()=>{},removeListener:()=>{}},sendMessage:()=>{},connect:()=>{}},loadTimes:()=>({}),csi:()=>({})};
const oq=navigator.permissions.query;navigator.permissions.query=(p)=>p.name==='notifications'?Promise.resolve({state:Notification.permission}):oq.call(navigator.permissions,p);
const gp=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(p){if(p===37445)return'Intel Inc.';if(p===37446)return'Intel Iris OpenGL Engine';return gp.call(this,p)};
Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
Object.defineProperty(navigator,'platform',{get:()=>'Win32'});
Object.defineProperty(navigator,'connection',{get:()=>({effectiveType:'4g',rtt:50,downlink:10,saveData:false})});
"""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELPERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _h(ua=None):
    return {
        "User-Agent": ua or random.choice(UAS),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
    }


def _is_bot(html):
    if not html or len(html) < 1500:
        return True
    if len(html) > 50000:
        return False
    lo = html.lower()
    return any(s in lo for s in [
        "access denied", "captcha", "challenge-platform",
        "just a moment", "checking your browser",
        "cf-browser-verification", "error 1020",
    ])


def _safe_int(val):
    if not val:
        return 0
    try:
        return int(re.sub(r'[^\d]', '', str(val)) or 0)
    except Exception:
        return 0


def _is_product(src, alt="", w=0, h=0):
    if not src or src.startswith("data:") or len(src) < 10:
        return False
    if JUNK.search(src):
        return False
    if TRACKING_DOMAINS.search(src):
        return False
    if w > 0 and h > 0 and (w < 80 or h < 80):
        return False
    # Must have an image extension or be from a known CDN
    has_img_ext = bool(re.search(r'\.(jpe?g|png|webp|avif|gif)', src, re.I))
    from_cdn = bool(CDN.search(src))
    if not has_img_ext and not from_cdn:
        return False
    # Skip tracking/analytics URLs disguised as images
    if "&action=" in src or "uid=" in src or "visitor" in src.lower():
        return False
    # Skip template URLs with unresolved placeholders
    if "{@" in src or "{width}" in src or "%7B" in src:
        return False
    # Skip promo/banner paths on Flipkart
    if "flixcart.com/www/" in src and "/promos/" in src:
        return False
    return True


def _is_real_image_url(url):
    if not url:
        return False
    if TRACKING_DOMAINS.search(url):
        return False
    has_ext = bool(re.search(r'\.(jpe?g|png|webp|avif)', url, re.I))
    from_cdn = bool(CDN.search(url))
    return has_ext or from_cdn


def _clean(url, base=""):
    if not url:
        return ""
    url = url.replace("\\u002F", "/").replace("\\/", "/")
    url = re.sub(r'\\(?=[^\\])', '', url).strip().rstrip("\\,)\"'")
    if url.startswith("//"):
        url = "https:" + url
    if not url.startswith("http") and base:
        url = urljoin(base, url)
    if "assets.adidas.com" in url:
        url = re.sub(r'/w_\d+', '/w_840', url)
        url = re.sub(r'/h_\d+', '/h_840', url)
    if "media-amazon" in url and "_AC_" in url:
        url = re.sub(r'\._[A-Z]{2}_[A-Z0-9_]+_\.', '.', url)
    if "static.zara.net" in url:
        url = url.replace("{width}", "1920")
        url = re.sub(r'/w/\d+/', '/w/1920/', url)
    if "myntassets" in url:
        url = re.sub(r'/h_\d+,q_\d+,w_\d+', '/h_960,q_90,w_720', url)
    if "images.puma.com" in url:
        url = re.sub(r',w_\d+,h_\d+/', ',w_750,h_750/', url)
    return url.split(" ")[0]


def _best_ss(ss):
    if not ss:
        return ""
    c = []
    for p in ss.split(","):
        t = p.strip().rsplit(None, 1)
        if len(t) == 2:
            u, d = t
            w = int(re.sub(r"\D", "", d) or 1) if d.endswith("w") else int(float(d.replace("x", "") or 1) * 1000)
            c.append((u.strip(), w))
        elif len(t) == 1:
            c.append((t[0].strip(), 1))
    return max(c, key=lambda x: x[1])[0] if c else ""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SITE DETECTION + PRODUCT ID
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _site(url):
    d = urlparse(url).netloc.lower()
    for n, ps in {
        "adidas": ["adidas."], "nike": ["nike.com"], "zara": ["zara.com"],
        "myntra": ["myntra.com"], "amazon": ["amazon."], "flipkart": ["flipkart."],
        "hm": ["hm.com"], "ajio": ["ajio.com"], "bewakoof": ["bewakoof.com"],
        "shopify": ["myshopify.com"], "meesho": ["meesho.com"],
        "nykaa": ["nykaa.com", "nykaafashion"], "uniqlo": ["uniqlo.com"],
        "puma": ["puma.com"], "levis": ["levi.com", "levis."], "mango": ["mango.com"],
        "gap": ["gap.com"], "asos": ["asos.com"], "shein": ["shein."],
        "souledstore": ["thesouledstore.com"],
    }.items():
        if any(p in d for p in ps):
            return n
    return "generic"


def _pid(url, site):
    path = urlparse(url).path
    patterns = {
        "adidas": r'/([A-Z]{2}\d{4,6})\.html',
        "zara": r'-p(\d{8,})\.html',
        "amazon": r'/dp/([A-Z0-9]{10})',
        "myntra": r'/(\d{6,15})/',
        "nike": r'/([A-Z0-9]{6,10})',
        "hm": r'(\d{7,10})\.html',
        "flipkart": r'/p/(itm[a-z0-9]+)',
        "ajio": r'/p/(\d+_)',
        "puma": r'/(\d{6,7})',
    }
    pat = patterns.get(site)
    if pat:
        m = re.search(pat, path, re.I)
        if m:
            return m.group(1).rstrip("_")
    m = re.search(r'/(\d{5,12})(?:[/?.]|$)', path)
    return m.group(1) if m else None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STRATEGY 0: PRODUCT-SPECIFIC API PROBE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _api_fetch(url, referer):
    h = _h()
    h["Accept"] = "application/json, text/plain, */*"
    h["Referer"] = referer
    try:
        if HAS_CFFI:
            r = cffi_req.get(url, headers=h, impersonate="chrome124", timeout=15, allow_redirects=True)
        else:
            r = std_req.get(url, headers=h, timeout=15, allow_redirects=True)
        if r.status_code == 200 and len(r.text) > 50:
            return json.loads(r.text)
    except Exception:
        pass
    return None


def api_probe(url, site, pid):
    if not pid:
        return [], ""

    base = urlparse(url).scheme + "://" + urlparse(url).netloc
    images = []
    product_name = ""

    endpoints = []
    if site == "adidas":
        endpoints = [f"{base}/api/products/{pid}"]
    elif site == "myntra":
        endpoints = [f"https://www.myntra.com/gateway/v2/product/{pid}"]
    elif site == "hm":
        endpoints = [
            f"{base}/en_in/productpage.{pid}.json",
            f"{base}/hmwebservices/service/products/detail/{pid}",
        ]

    for ep in endpoints:
        data = _api_fetch(ep, url)
        if data:
            if isinstance(data, dict):
                product_name = (data.get("name", "") or data.get("product_name", "")
                                or data.get("title", "") or "")
            raw = []
            _json_imgs(data, raw, base=url)
            for img in raw:
                if pid.lower() in img.src.lower() or "/products/" in ep.lower():
                    img.layer = "api"
                    images.append(img)
            if not images and raw:
                for img in raw[:10]:
                    if CDN.search(img.src):
                        img.layer = "api"
                        images.append(img)
            if images:
                return images, product_name

    return images, product_name


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STRATEGY 1: curl_cffi WITH SPA DETECTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def fetch_cffi(url, site):
    if not HAS_CFFI:
        return None

    for browser in ["chrome124", "chrome120", "safari17_0"]:
        try:
            r = cffi_req.get(url, headers=_h(), impersonate=browser,
                             timeout=20, allow_redirects=True)
            if r.status_code == 200:
                html = r.text
                min_size = MIN_REAL_HTML if site in SPA_SITES else 3000
                if len(html) > min_size and not _is_bot(html):
                    return html
        except Exception:
            pass
    return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STRATEGY 2: PLAYWRIGHT + STEALTH + NETWORK CAPTURE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class NetCap:
    def __init__(self, base, pid=None):
        self.base = base
        self.pid = pid
        self.images = []
        self._seen = set()

    def _is_relevant(self, src):
        """Filter out non-product images from network captures."""
        src_lower = src.lower()
        # Skip store/misc/banner/static images
        junk_paths = ["/miscelleneous/", "/miscellaneous/", "/banner/", "/homepage/",
                      "/store-locator/", "/cms-media/", "/static/img/", "/favicon",
                      "/mobile-cms-media/", "/static/icons/", "/images/icons/"]
        if any(p in src_lower for p in junk_paths):
            return False
        # If we have a product ID, prefer images containing it
        if self.pid and self.pid.lower() in src_lower:
            return True
        # Accept images from product-related paths
        product_paths = ["/catalog/product/", "/uploads/catalog/", "/media/catalog/"]
        if any(p in src_lower for p in product_paths):
            return True
        # Accept CDN images
        if CDN.search(src):
            return True
        return not self.pid  # If no pid, accept all non-junk

    async def on_resp(self, resp):
        try:
            ct = resp.headers.get("content-type", "")
            if "json" in ct and resp.status == 200:
                body = await resp.text()
                if len(body) > 100:
                    try:
                        data = json.loads(body)
                        imgs = []
                        _json_imgs(data, imgs, base=self.base)
                        for img in imgs:
                            if self._is_relevant(img.src) and img.src not in self._seen:
                                self._seen.add(img.src)
                                img.layer = "net-json"
                                self.images.append(img)
                    except Exception:
                        pass
            elif "image/" in ct and resp.status == 200:
                u = resp.url
                if _is_real_image_url(u) and _is_product(u) and u not in self._seen:
                    if self._is_relevant(u):
                        self._seen.add(u)
                        self.images.append(Img(src=_clean(u, self.base), layer="net-img"))
        except Exception:
            pass


async def fetch_pw(url, site, pid, timeout=30000, scrolls=3):
    if not HAS_PLAYWRIGHT:
        return None, []

    html = None
    net_imgs = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=[
            "--disable-blink-features=AutomationControlled", "--no-sandbox",
            "--disable-setuid-sandbox", "--disable-dev-shm-usage",
            "--window-size=1920,1080",
        ])
        ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=random.choice(UAS),
            locale="en-US",
            timezone_id="Asia/Kolkata",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Ch-Ua": '"Chromium";v="124","Google Chrome";v="124"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
            },
        )
        page = await ctx.new_page()
        await page.add_init_script(STEALTH)

        cap = NetCap(url, pid)
        page.on("response", cap.on_resp)

        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=timeout)
            st = resp.status if resp else "?"

            if resp and resp.status == 403:
                await asyncio.sleep(5)
                h = await page.content()
                if len(h) > 5000 and not _is_bot(h):
                    html = h

            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                await asyncio.sleep(3)

            if not html:
                html = await page.content()

            for _ in range(scrolls):
                await page.evaluate("window.scrollBy(0,window.innerHeight)")
                await asyncio.sleep(0.7)
            await page.evaluate("window.scrollTo(0,0)")
            await asyncio.sleep(1)

            final = await page.content()
            if len(final) > len(html or ""):
                html = final
            net_imgs = cap.images
        except Exception:
            pass
        finally:
            await browser.close()

    if html and len(html) > 3000 and not _is_bot(html):
        return html, net_imgs
    return None, net_imgs


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STRATEGY 3: CDN URL CONSTRUCTION
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def construct_and_verify(site, pid, url=""):
    if not pid:
        return []

    urls_to_check = []

    if site == "puma":
        # Puma CDN pattern: images.puma.com/image/upload/.../global/{pid}/{swatch}/mod0N/...
        # Extract swatch from URL query param
        swatch = ""
        if "swatch=" in url:
            m = re.search(r'swatch=(\d+)', url)
            if m:
                swatch = m.group(1)
        if swatch:
            for mod in ["mod01", "mod02", "mod03", "mod04", "mod05", "mod06", "sv01", "bv"]:
                for fmt in ["png", "jpg"]:
                    urls_to_check.append(
                        f"https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:fafafa,w_750,h_750/global/{pid}/{swatch}/{mod}/fnd/IND/fmt/{fmt}"
                    )

    verified = []
    for u in urls_to_check:
        try:
            h = _h()
            if HAS_CFFI:
                r = cffi_req.head(u, headers=h, impersonate="chrome124", timeout=5)
            else:
                r = std_req.head(u, headers=h, timeout=5)
            if r.status_code == 200:
                ct = r.headers.get("content-type", "")
                if "image" in ct:
                    verified.append(Img(src=u, layer="cdn-built"))
        except Exception:
            pass
    return verified


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# EXTRACTION LAYERS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _json_imgs(data, imgs, depth=0, base=""):
    if depth > 15:
        return
    if isinstance(data, str):
        if re.search(r'\.(jpe?g|png|webp|avif)', data, re.I) and (data.startswith("http") or data.startswith("//")):
            imgs.append(Img(src=_clean(data, base), layer="json"))
        return
    if isinstance(data, list):
        for i in data:
            _json_imgs(i, imgs, depth + 1, base)
        return
    if isinstance(data, dict):
        for k in ["image", "images", "imageUrl", "image_url", "src", "url", "hiRes", "large",
                   "medium", "pictureUrl", "gallery", "galleryImages", "media", "view_list",
                   "gridImages", "carouselImages", "detailImages", "photo", "photos",
                   "standardImage", "modelImage", "hero", "thumbnail", "source",
                   "xmedia", "path", "fullUrl"]:
            if k in data:
                _json_imgs(data[k], imgs, depth + 1, base)
        for v in data.values():
            if isinstance(v, (dict, list)):
                _json_imgs(v, imgs, depth + 1, base)


def extract_dom(html, base):
    imgs = []
    soup = BeautifulSoup(html, "html.parser")
    for img in soup.find_all("img"):
        alt = img.get("alt", "")
        for a in ["src", "data-src", "data-original", "data-lazy-src", "data-srcset",
                   "data-old-hires", "data-zoom-image", "data-large-image", "data-image",
                   "data-bg", "data-full-size-image-url"]:
            v = img.get(a, "").strip()
            if v and (v.startswith("http") or v.startswith("/") or v.startswith("//")):
                imgs.append(Img(src=_clean(v, base), alt=alt,
                                w=_safe_int(img.get("width")), h=_safe_int(img.get("height")),
                                layer="dom"))
        ss = img.get("srcset", "") or img.get("data-srcset", "")
        if ss:
            b = _best_ss(ss)
            if b:
                imgs.append(Img(src=_clean(b, base), alt=alt, layer="dom-ss"))
        dyn = img.get("data-a-dynamic-image", "")
        if dyn:
            try:
                for u in json.loads(dyn):
                    imgs.append(Img(src=_clean(u, base), layer="dom-amz"))
            except Exception:
                pass
    for s in soup.select("picture source"):
        ss = s.get("srcset", "")
        if ss:
            b = _best_ss(ss)
            if b:
                imgs.append(Img(src=_clean(b, base), layer="dom-pic"))
    # Background images
    for el in soup.find_all(style=re.compile(r'background.*url')):
        for m in re.findall(r'url\(["\']?(https?://[^"\')\s]+)["\']?\)', el.get("style", "")):
            if re.search(r'\.(jpe?g|png|webp)', m, re.I):
                imgs.append(Img(src=_clean(m, base), layer="dom-bg"))
    return imgs


def extract_structured(html, base):
    imgs = []
    name = ""
    soup = BeautifulSoup(html, "html.parser")
    for sc in soup.find_all("script", type="application/ld+json"):
        try:
            d = json.loads(sc.string or "")
            _jld(d, imgs, base)
            n = _jn(d)
            if n and not name:
                name = n
        except Exception:
            pass
    for m in soup.find_all("meta", attrs={"property": re.compile(r"og:image")}):
        c = m.get("content", "")
        if c:
            imgs.append(Img(src=_clean(c, base), alt="og:image", layer="og"))
    for m in soup.find_all("meta", attrs={"name": "twitter:image"}):
        c = m.get("content", "")
        if c:
            imgs.append(Img(src=_clean(c, base), layer="twitter"))
    if not name:
        og = soup.find("meta", attrs={"property": "og:title"})
        if og:
            name = og.get("content", "")
    if not name:
        t = soup.find("title")
        if t:
            name = t.get_text(strip=True)
    return imgs, name


def _jld(d, imgs, base):
    if isinstance(d, list):
        for i in d:
            _jld(i, imgs, base)
        return
    if not isinstance(d, dict):
        return
    for k in ("image", "images", "photo", "thumbnail"):
        v = d.get(k)
        if v:
            if isinstance(v, str):
                imgs.append(Img(src=_clean(v, base), layer="jld"))
            elif isinstance(v, list):
                for i in v:
                    if isinstance(i, str):
                        imgs.append(Img(src=_clean(i, base), layer="jld"))
                    elif isinstance(i, dict) and i.get("url"):
                        imgs.append(Img(src=_clean(i["url"], base), layer="jld"))
            elif isinstance(v, dict) and v.get("url"):
                imgs.append(Img(src=_clean(v["url"], base), layer="jld"))
    for k in ("offers", "mainEntity", "@graph", "itemListElement", "hasVariant"):
        if d.get(k):
            _jld(d[k], imgs, base)


def _jn(d):
    if isinstance(d, list):
        for i in d:
            n = _jn(i)
            if n:
                return n
        return ""
    if isinstance(d, dict):
        if d.get("@type") in ("Product", "IndividualProduct"):
            return d.get("name", "")
        for k in ("@graph", "mainEntity"):
            if d.get(k):
                n = _jn(d[k])
                if n:
                    return n
    return ""


def extract_scripts(html, base, site, pid=None):
    imgs = []
    soup = BeautifulSoup(html, "html.parser")

    # __NEXT_DATA__ — extract but filter aggressively by product ID
    nd = soup.find("script", id="__NEXT_DATA__")
    if nd and nd.string:
        try:
            data = json.loads(nd.string)
            raw_nd = []
            _json_imgs(data, raw_nd, base=base)
            for i in raw_nd:
                i.layer = "nextdata"
                # If we have a product ID, only keep images that reference it
                # or come from a known product CDN for this site
                if pid:
                    src_lower = i.src.lower()
                    pid_lower = pid.lower()
                    is_product_cdn = CDN.search(i.src) and pid_lower in src_lower
                    # Also accept images from the site's own product CDN
                    # (e.g., images.puma.com/.../{pid}/...)
                    is_site_cdn = bool(re.search(
                        r'images\.' + re.escape(site) + r'|' + re.escape(site) + r'.*' + re.escape(pid_lower),
                        src_lower
                    ))
                    if is_product_cdn or is_site_cdn or pid_lower in src_lower:
                        imgs.append(i)
                else:
                    # No product ID — keep CDN images, skip generic ones
                    if CDN.search(i.src):
                        imgs.append(i)
        except Exception:
            pass

    # State objects
    for sc in soup.find_all("script"):
        text = sc.string or ""
        if len(text) < 200 or len(text) > 1_500_000:
            continue
        for pat in [
            r'window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*;',
            r'window\.pdpData\s*=\s*(\{.+?\})\s*;',
            r'window\.__PRELOADED_STATE__\s*=\s*(\{.+?\})\s*;',
        ]:
            m = re.search(pat, text, re.DOTALL)
            if m:
                try:
                    d = json.loads(m.group(1))
                    b = len(imgs)
                    _json_imgs(d, imgs, base=base)
                    for i in imgs[b:]:
                        i.layer = "state"
                except Exception:
                    pass

    # CDN regex per site
    cdns = {
        "adidas": r'(https?://assets\.adidas\.com/images/[^\s"\'<>\\,\]\}]+?\.(?:jpe?g|png|webp|avif)[^\s"\'<>\\,\]\}]*)',
        "nike": r'(https?://static\.nike\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp|avif)[^\s"\'<>\\]*)',
        "zara": r'(https?://static\.zara\.net/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp|avif)[^\s"\'<>\\]*)',
        "myntra": r'(https?://assets\.myntassets\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "amazon": r'(https?://[^\s"\'<>\\]*media-amazon\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "hm": r'(https?://[^\s"\'<>\\]*lp\d?\.hm\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "bewakoof": r'(https?://[^\s"\'<>\\]*images\.bewakoof\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "ajio": r'(https?://[^\s"\'<>\\]*assets\.ajio\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "puma": r'(https?://images\.puma\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "souledstore": r'(https?://prod-img\.thesouledstore\.com/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
        "flipkart": r'(https?://rukminim\d?\.flixcart\.com/image/[^\s"\'<>\\]+?\.(?:jpe?g|png|webp)[^\s"\'<>\\]*)',
    }
    pat = cdns.get(site, r'(https?://[^\s"\'<>\\]+?\.(?:jpe?g|png|webp|avif)(?:\?[^\s"\'<>\\]*)?)')
    for sc in soup.find_all("script"):
        text = sc.string or ""
        if len(text) < 200 or len(text) > 1_500_000:
            continue
        for m in re.findall(pat, text, re.I):
            cleaned = _clean(m, base)
            if pid and pid.lower() not in cleaned.lower():
                continue
            imgs.append(Img(src=cleaned, layer="script"))

    # Amazon hi-res
    if site == "amazon":
        ci = re.search(r"['\"]colorImages['\"]\s*:\s*\{(.+?)\}\s*[,;]", html, re.DOTALL)
        if ci:
            for u in re.findall(r'"hiRes"\s*:\s*"(https?://[^"]+)"', ci.group(1)):
                imgs.append(Img(src=_clean(u, base), layer="amz-hi"))

    return imgs


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SCORING & DEDUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _score(img, site):
    s = 0.0
    src = img.src.lower()
    if CDN.search(src):
        s += 15
    ls = {
        "api": 25, "jld": 18, "nextdata": 17, "net-json": 20, "dom-amz": 14,
        "amz-hi": 18, "dom-ss": 12, "dom-pic": 12, "dom": 10, "og": 8,
        "net-img": 12, "script": 5, "cdn-built": 12, "state": 16,
        "dom-bg": 3, "twitter": 6,
    }
    s += ls.get(img.layer, 0)
    if img.w > 500 or img.h > 500:
        s += 5
    if img.w > 800 or img.h > 800:
        s += 5
    alt = img.alt.lower()
    if any(k in alt for k in ["product", "front", "back", "detail", "model"]):
        s += 3
    if "thumb" in src or "_s." in src:
        s -= 5
    if any(k in src for k in ["standard", "large", "zoom", "_00_", "_01_"]):
        s += 3
    dim_match = re.search(r'[/,_]w[_=](\d+)', src)
    if dim_match:
        w_val = int(dim_match.group(1))
        if w_val >= 500:
            s += 5
        elif w_val <= 150:
            s -= 8
    if any(k in src for k in ["/swatch/", "/color-swatch", "/icon/"]):
        s -= 10
    img.score = s
    return s


def _dedup(imgs):
    # Pass 1: exact key dedup — keep highest score per key
    seen = OrderedDict()
    for i in imgs:
        k = i.key
        if k not in seen or i.score > seen[k].score:
            seen[k] = i
    unique = list(seen.values())

    # Pass 2: fuzzy dedup — normalize to a canonical shot identifier
    final = OrderedDict()
    for img in unique:
        src = img.src

        # Puma-style: use the mod/sv/bv segment as identity
        puma_match = re.search(r'/global/\d+/\d+/(\w+)/', src)
        if puma_match:
            base = puma_match.group(0)  # e.g., /global/687093/49/mod01/
            if base not in final or img.score > final[base].score:
                final[base] = img
            continue

        fname = src.rsplit('/', 1)[-1].split('?')[0]
        # Strip all extensions including .tiff.jpg
        base = re.sub(r'(\.\w+)+$', '', fname)
        # Remove db prefix variants (db01 → 01, db21 → 21)
        base = re.sub(r'_db(\d+)', r'_\1', base)
        # Normalize model/mdl, detail/dtl
        base = re.sub(r'_mdl\b', '_model', base)
        base = re.sub(r'_dtl\b', '_detail', base)
        # Remove size/variant suffixes
        base = re.sub(r'_(standard|large|small|thumb|zoom|preview|full|hover)$', '', base, flags=re.I)
        # Strip trailing _hover from compound names like _detail_hover
        base = re.sub(r'_hover\b', '', base)
        # Remove trailing size indicators like _840, _600x600
        base = re.sub(r'_\d{2,4}(x\d{2,4})?$', '', base)
        # Extract the shot identifier: everything from the product ID onward
        # e.g., KE8163_01_laydown, KE8163_21_model, KE8163_23_hover_model
        shot_match = re.search(r'([A-Z]{2}\d{4,6}_\d+.*)', base)
        if shot_match:
            base = shot_match.group(1)
        if base not in final or img.score > final[base].score:
            final[base] = img
    return list(final.values())


def _pipe(imgs, site, n=20, swatch=None):
    f = [i for i in imgs if _is_product(i.src, i.alt, i.w, i.h)]

    # Swatch filtering: for sites like Puma where color variants are in the URL
    if swatch and site == "puma":
        swatch_filtered = [
            i for i in f
            if f"/global/" not in i.src or f"/{swatch}/" in i.src
        ]
        if swatch_filtered:
            f = swatch_filtered

    # Flipkart: product images share a common image ID prefix (e.g., imahdxy2*)
    # while "similar products" have different prefixes
    if site == "flipkart":
        from collections import Counter
        # Extract Flipkart image IDs (ima* pattern in filenames)
        fk_ids = []
        for img in f:
            m = re.search(r'original-(ima[a-z0-9]+)', img.src)
            if m:
                # Use first 8 chars as group key (e.g., imahdxy2)
                fk_ids.append((m.group(1)[:8], img))
        if fk_ids:
            # Find the most common image ID prefix (= the main product)
            prefix_counts = Counter(fid for fid, _ in fk_ids)
            main_prefix = prefix_counts.most_common(1)[0][0]
            f = [img for img in f if
                 f"original-{main_prefix}" in img.src
                 or "original-ima" not in img.src]

    # Souled Store: group by timestamp prefix, keep only the most common group
    # Product images share a prefix like 1742034685_*, similar products have different prefixes
    if site == "souledstore":
        from collections import Counter
        prefix_map = {}
        for i in f:
            m = re.search(r'/catalog/product/(\d{10,})', i.src)
            if m:
                prefix = m.group(1)
                prefix_map.setdefault(prefix, []).append(i)
        if prefix_map:
            # The product's own images are the group found in structured/DOM layers (jld, dom)
            # or the most common prefix among high-scoring images
            best_prefix = None
            for img in f:
                if img.layer in ("jld", "dom", "dom-ss"):
                    m = re.search(r'/catalog/product/(\d{10,})', img.src)
                    if m:
                        best_prefix = m.group(1)
                        break
            if not best_prefix:
                best_prefix = Counter(
                    re.search(r'/catalog/product/(\d{10,})', i.src).group(1)
                    for i in f if re.search(r'/catalog/product/(\d{10,})', i.src)
                ).most_common(1)[0][0]
            # Keep only images from this product + non-catalog images
            f = [i for i in f if
                 f"/catalog/product/{best_prefix}" in i.src
                 or "/catalog/product/" not in i.src]

    for i in f:
        _score(i, site)
    u = _dedup(f)
    u.sort(key=lambda x: x.score, reverse=True)
    return u[:n]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN SCRAPE ORCHESTRATOR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async def scrape(url, max_images=20, timeout=30000, scrolls=3):
    t0 = time.time()
    site = _site(url)
    pid = _pid(url, site)
    res = Result(url=url, site=site)
    all_imgs = []
    html = None

    # S0: API Probe
    api_imgs, api_name = api_probe(url, site, pid)
    if api_imgs:
        all_imgs.extend(api_imgs)
        res.method = "api"
        res.layers.append("api")
        if api_name:
            res.product_name = api_name

    # S1: curl_cffi
    if not html:
        html = fetch_cffi(url, site)
        if html:
            res.method = res.method or "cffi"

    # S2: Playwright (always for SPA sites, or if no HTML yet)
    net_imgs = []
    needs_pw = (not html) or (site in SPA_SITES)
    if needs_pw:
        pw_html, net_imgs = await fetch_pw(url, site, pid, timeout, scrolls)
        if pw_html and len(pw_html) > len(html or ""):
            html = pw_html
            res.method = res.method or "playwright"
        if net_imgs:
            all_imgs.extend(net_imgs)
            res.layers.append("network")

    # S3: CDN construction (always try for sites with known patterns)
    cdn_sites = {"puma"}
    if (not all_imgs and not html) or site in cdn_sites:
        cdn = construct_and_verify(site, pid, url)
        if cdn:
            all_imgs.extend(cdn)
            res.method = res.method or "cdn"
            res.layers.append("cdn")

    # Extraction on HTML
    if html:
        dom = extract_dom(html, url)
        all_imgs.extend(dom)
        if dom:
            res.layers.append("dom")

        struct, name = extract_structured(html, url)
        all_imgs.extend(struct)
        if name and not res.product_name:
            res.product_name = name
        if struct:
            res.layers.append("structured")

        scr = extract_scripts(html, url, site, pid)
        all_imgs.extend(scr)
        if scr:
            res.layers.append("scripts")

    # Pipeline
    # Extract swatch/color param from URL
    swatch = None
    swatch_match = re.search(r'[?&]swatch=(\d+)', url)
    if swatch_match:
        swatch = swatch_match.group(1)

    res.images = _pipe(all_imgs, site, max_images, swatch=swatch)
    res.timing_ms = (time.time() - t0) * 1000
    return res


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# API ENDPOINTS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ScrapeRequest(BaseModel):
    url: str
    max_images: int = 20


class ScrapedImage(BaseModel):
    src: str
    alt: str
    tag: str
    score: float = 0.0


class ScrapeResponse(BaseModel):
    site: str
    product_name: str = ""
    method: str = ""
    layers: list[str] = []
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

    result = await scrape(url, max_images=req.max_images)

    if not result.images:
        raise HTTPException(502, "Could not extract product images — site may be blocking requests")

    return ScrapeResponse(
        site=result.site,
        product_name=result.product_name,
        method=result.method,
        layers=result.layers,
        images=[
            ScrapedImage(src=img.src, alt=img.alt, tag=img.layer, score=img.score)
            for img in result.images
        ],
        count=len(result.images),
        timing_ms=round(result.timing_ms, 1),
    )


@app.get("/health")
async def health():
    return {"status": "ok", "cffi": HAS_CFFI, "playwright": HAS_PLAYWRIGHT}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
