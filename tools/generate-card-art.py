#!/usr/bin/env python3
"""Generate local abstract SVG card art from representative images.

The output deliberately sits between Monocle, Financial Times, and Wallpaper:
warm paper, sober geometry, light grid systems, and image-derived palettes.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import random
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "site" / "card-art"


@dataclass(frozen=True)
class CardSource:
    slug: str
    title: str
    kind: str
    url: str


BLOG = [
    CardSource(
        "blog-planet-cloudflare",
        "This is Planet Cloudflare",
        "blog",
        "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiUhFH4s7iwqnzpxAV_a-SSWmpe5XFXmsOS8ZaeM1l363WDe19Idqg932-Dl1KCI9ISt5J-cqkpqNu07SAaMrkgTAhHRyGqOh3qNKOEvnl13rSAf90i8SR63a7EXfhMkp6qrGjpsN-lNpcuMR5YGi_EKqYty3y7CfCRTtIeAzG1CKZRea1bJYhsvA-7LVg/s800/CleanShot%202026-03-24%20at%2014.21.38@2x.png",
    ),
    CardSource(
        "blog-geistfabrik-aria",
        "GeistFabrik and AI-augmented software development at ARIA",
        "blog",
        "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjao6ZW9rg3IDSjhiIoY7YDeczSuTEhLQhdotUaMMGbI6heYziRVD6ns2QFj0uIyJOU-5r-XDBirOuXIYne0UU8UiJBpo_PgPiLyJvEyKlUeNinQjwjNrZ2j6pURH1Ko8JEfsTLzslv8EDIO4xs0dJxRwkYYJRXIgNTWiCF3Jcy5TIse4wXLpwEnXW-sv0/w800-h450/IMG_5413.HEIC",
    ),
    CardSource(
        "blog-better-keynote-export",
        "Exporting PDFs from Keynote with Better Keynote Export",
        "blog",
        "https://farm5.staticflickr.com/4596/38879461112_c48b496f63.jpg",
    ),
    CardSource(
        "blog-keynote-notes",
        "Why are the presenter notes ugly when I export them as PDFs from Keynote?",
        "blog",
        "https://farm5.staticflickr.com/4596/38879461112_c48b496f63.jpg",
    ),
]


REPOS = [
    "bobbin",
    "demoscene",
    "embed.oshineye.dev",
    "yaket",
    "cf-workers-design-system",
    "vaders",
    "atlas",
    "planet_cf",
    "slide-maker",
    "testing-best-practices",
    "tasche",
    "good-readme",
    "good-pr",
    "python-workers-skill",
    "audit-skill",
    "geist_fabrik",
    "web2kindle",
    "keyboardia",
    "guardrails-skill",
    "claude-history-explorer",
    "python-workers-issues",
    "rogue_planet",
    "garten",
    "skill_scanner",
    "cf-advisor-skill",
    "fibonacci_durable_object",
]

PROJECTS = [
    CardSource(
        f"project-{repo.replace('.', '-').replace('_', '-')}",
        repo,
        "project",
        f"https://opengraph.githubassets.com/oshineye-card/adewale/{repo}",
    )
    for repo in REPOS
]

TALKS = [
    CardSource(
        "talk-tools-for-thought",
        "Tools For Thought: from the Memex to index cards",
        "talk",
        "https://files.speakerdeck.com/presentations/1b9e91c591374614b23b00f5be641514/preview_slide_0.jpg?18287716",
    ),
    CardSource(
        "talk-geistfabrik",
        "GeistFabrik and AI-augmented software development",
        "talk",
        "https://files.speakerdeck.com/presentations/a6d1a4054b4a4c5fb13ebc0efbd2d26c/preview_slide_0.jpg?37429569",
    ),
    CardSource(
        "talk-devrel-leadership",
        "DevRel Leadership: all the pieces matter",
        "talk",
        "https://files.speakerdeck.com/presentations/9dd386863ff740fc8261ce3c4614a875/preview_slide_0.jpg?9131415",
    ),
]


SOURCES = BLOG + PROJECTS + TALKS
PAPER = (244, 227, 189)
INK = (47, 47, 42)
MAROON = (127, 0, 0)


def fetch_image(url: str) -> Image.Image:
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=30) as response:
        data = response.read()
    image = Image.open(BytesIO(data)).convert("RGB")
    image.thumbnail((420, 420))
    return image


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = [channel / 255 for channel in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def saturation(rgb: tuple[int, int, int]) -> float:
    r, g, b = [channel / 255 for channel in rgb]
    return max(r, g, b) - min(r, g, b)


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(a[i] * (1 - amount) + b[i] * amount) for i in range(3))


def hex_color(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


def palette(image: Image.Image, seed: int) -> list[tuple[int, int, int]]:
    quantized = image.quantize(colors=18, method=Image.Quantize.MEDIANCUT).convert("RGB")
    colors = [rgb for _, rgb in sorted(quantized.getcolors(maxcolors=100000), reverse=True)]
    useful = [
        rgb
        for rgb in colors
        if 0.12 < luminance(rgb) < 0.95 and (saturation(rgb) > 0.06 or luminance(rgb) < 0.28)
    ]
    if len(useful) < 4:
        useful.extend([MAROON, INK, (200, 120, 84), (74, 104, 110)])
    random.Random(seed).shuffle(useful)
    return [mix(color, PAPER, 0.18) for color in useful[:5]]


def rect(x: float, y: float, width: float, height: float, fill: str, opacity: float = 1, stroke: str | None = None) -> str:
    stroke_attr = f' stroke="{stroke}" stroke-width="1.1"' if stroke else ""
    return f'<rect x="{x:.1f}" y="{y:.1f}" width="{width:.1f}" height="{height:.1f}" fill="{fill}" opacity="{opacity:.3f}"{stroke_attr}/>'


def circle(cx: float, cy: float, radius: float, fill: str, opacity: float = 1) -> str:
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{radius:.1f}" fill="{fill}" opacity="{opacity:.3f}"/>'


def line(x1: float, y1: float, x2: float, y2: float, stroke: str, opacity: float = 1, width: float = 1) -> str:
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width:.1f}" opacity="{opacity:.3f}"/>'


def make_svg(source: CardSource, colors: list[tuple[int, int, int]]) -> str:
    seed = int(hashlib.sha256(source.slug.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)
    w, h = 360, 160
    c = [hex_color(color) for color in colors]
    paper = hex_color(mix(PAPER, colors[0], 0.08))
    rule = hex_color(mix(INK, colors[1], 0.28))
    accent = c[0]
    secondary = c[1]
    tertiary = c[2]
    dark = hex_color(mix(INK, colors[3], 0.16))
    phase = (seed % 100) / 100
    growth = 0.25 + phase * 0.62
    3 + seed % 6
    rng.choice(["horizontal", "vertical", "diagonal"])
    title = html.escape(source.title[:64])

    elements: list[str] = []
    elements.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Abstract illustration for {title}">')
    elements.append(f'<rect width="{w}" height="{h}" fill="{paper}"/>')
    elements.append(rect(10, 10, w - 20, h - 20, "none", 1, rule))

    for y in range(34, h - 24, 28):
        elements.append(line(46, y, w - 24, y, rule, 0.16, 0.9))

    if source.kind == "blog":
        block_w = 96 + rng.randint(-18, 34)
        block_h = 64 + rng.randint(-10, 28)
        elements.append(rect(58, 32, block_w, block_h, secondary, 0.78, dark))
        elements.append(rect(178, 42, 104 + rng.randint(-16, 24), 46 + rng.randint(0, 28), tertiary, 0.70))
        elements.append(circle(294, 50 + rng.randint(-8, 18), 16 + rng.randint(0, 14), accent, 0.72))
        for i in range(3 + seed % 4):
            px = 78 + i * (26 + seed % 7)
            py = 118 + math.sin(i + phase) * 9
            elements.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="16" ry="5" fill="{dark}" opacity="0.24" transform="rotate({-10 + i * 7} {px:.1f} {py:.1f})"/>')
    elif source.kind == "project":
        gx = 62 + growth * 230
        base_y = 122
        top_y = 38 + rng.randint(-8, 20)
        elements.append(rect(58, 30, 82, 84, secondary, 0.68, dark))
        elements.append(rect(158, 34, 110 + rng.randint(-18, 34), 38, tertiary, 0.76))
        elements.append(line(62, base_y, gx, top_y, dark, 0.72, 1.6))
        for i in range(1, 5):
            t = i / 5
            lx = 62 + (gx - 62) * t
            ly = base_y + (top_y - base_y) * t
            if t < growth + 0.15:
                elements.append(f'<ellipse cx="{lx:.1f}" cy="{ly:.1f}" rx="14" ry="4" fill="{accent}" opacity="0.28" transform="rotate({-28 + i * 12} {lx:.1f} {ly:.1f})"/>')
        elements.append(circle(gx, top_y, 6 + growth * 10, accent, 0.64))
    else:
        elements.append(rect(52, 30, 112, 76, dark, 0.78, dark))
        elements.append(rect(180, 34, 120, 70, secondary, 0.72, dark))
        elements.append(rect(70, 48, 70, 7, paper, 0.85))
        elements.append(rect(198, 52, 70, 7, paper, 0.85))
        for x in (70, 118, 190, 244, 300):
            elements.append(line(x, 126, x + rng.randint(-18, 18), 40 + rng.randint(-6, 16), accent, 0.48, 1.2))
        elements.append(circle(302, 110, 18 + seed % 9, tertiary, 0.70))

    elements.append(line(46, 137, 330, 137, dark, 0.34, 1.2))
    elements.append(line(46, 145, 46 + growth * 284, 145, hex_color(MAROON), 0.92, 3.0))
    elements.append(line(46 + growth * 284, 128, 46 + growth * 284, 150, accent, 0.70, 1.5))
    elements.append("</svg>")
    return "\n".join(elements)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for source in SOURCES:
        try:
            image = fetch_image(source.url)
            colors = palette(image, int(hashlib.sha256(source.url.encode()).hexdigest()[:8], 16))
        except Exception:
            colors = palette(Image.new("RGB", (8, 8), PAPER), int(hashlib.sha256(source.slug.encode()).hexdigest()[:8], 16))
        svg = make_svg(source, colors)
        path = OUT_DIR / f"{source.slug}.svg"
        path.write_text(svg + "\n", encoding="utf-8")
        manifest[source.slug] = {"title": source.title, "kind": source.kind, "source": source.url, "asset": f"/card-art/{source.slug}.svg"}
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
