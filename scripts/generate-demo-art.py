"""Gera as ilustrações SVG temporárias do cardápio demo (public/demo).
São vetoriais: nítidas em qualquer tela (Retina, 4K, 8K) com poucos KB.
Troque por fotos reais no painel (Produtos → fotos)."""
import math, os, random

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "demo")
os.makedirs(OUT, exist_ok=True)
W, H = 800, 600

def bg(c1, c2, uid):
    return f'''<defs>
<radialGradient id="bg{uid}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></radialGradient>
<linearGradient id="bunTop{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2A54A"/><stop offset=".55" stop-color="#D9832B"/><stop offset="1" stop-color="#B8641C"/></linearGradient>
<linearGradient id="bunBot{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E39A45"/><stop offset="1" stop-color="#B9681F"/></linearGradient>
<linearGradient id="patty{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6B3A22"/><stop offset=".5" stop-color="#4E2716"/><stop offset="1" stop-color="#3A1C10"/></linearGradient>
<linearGradient id="cheese{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD24A"/><stop offset="1" stop-color="#F2A812"/></linearGradient>
<linearGradient id="crispy{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0B24E"/><stop offset="1" stop-color="#C77A22"/></linearGradient>
<filter id="soft{uid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#bg{uid})"/>
<circle cx="120" cy="90" r="160" fill="#fff" opacity=".05"/><circle cx="700" cy="520" r="220" fill="#000" opacity=".06"/>'''

def shadow(uid, cx=400, cy=500, rx=250, ry=34):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000" opacity=".28" filter="url(#soft{uid})"/>'

def board(cx=400, cy=495):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="300" ry="40" fill="#8A5A34"/><ellipse cx="{cx}" cy="{cy-6}" rx="300" ry="38" fill="#A9713F"/><path d="M{cx-260} {cy-10} q260 22 520 0" stroke="#8A5A34" stroke-width="3" fill="none" opacity=".5"/>'

def burger(uid, layers, cx=400, base=478, width=340):
    random.seed(uid)
    parts = []
    y = base
    hw = width / 2
    # pão de baixo
    parts.append(f'<path d="M{cx-hw} {y-34} h{width} q4 34 -30 40 h-{width-60} q-34 -6 -30 -40z" fill="url(#bunBot{uid})"/>')
    y -= 34
    for kind in layers:
        if kind == "patty":
            h = 46
            parts.append(f'<path d="M{cx-hw-8} {y-h+8} q0 -10 14 -12 h{width-12} q14 2 14 12 v{h-16} q0 12 -14 12 h-{width-12} q-14 0 -14 -12z" fill="url(#patty{uid})"/>')
            for i in range(9):
                x = cx - hw + 20 + i * (width - 40) / 8
                parts.append(f'<path d="M{x-10:.0f} {y-h+14} l20 {h-24}" stroke="#2A130A" stroke-width="5" stroke-linecap="round" opacity=".55"/>')
            for i in range(14):
                x = cx - hw + random.random() * width
                yy = y - h + 12 + random.random() * (h - 18)
                parts.append(f'<circle cx="{x:.0f}" cy="{yy:.0f}" r="{1.5+random.random()*2:.1f}" fill="#8B5232" opacity=".7"/>')
            y -= h - 4
        elif kind == "smash":
            h = 30
            parts.append(f'<path d="M{cx-hw-16} {y-h+6} q-6 8 4 14 q-8 8 6 12 h{width+16} q14 -4 6 -12 q10 -6 4 -14 q-4 -8 -18 -8 h-{width-8} q-14 0 -18 8z" fill="url(#patty{uid})"/>')
            parts.append(f'<path d="M{cx-hw-6} {y-h+10} h{width+12}" stroke="#7C4325" stroke-width="4" opacity=".6"/>')
            y -= h - 2
        elif kind == "cheese":
            drips = "".join(f' l-14 {12+random.randint(0,20)} l-14 -{12+random.randint(0,20)}' for _ in range(int((width+4)/28)))
            parts.append(f'<path d="M{cx-hw-6} {y-6} l10 -10 h{width-8} l10 10{drips} z" fill="url(#cheese{uid})" transform="translate(0,0)"/>')
            parts.append(f'<path d="M{cx-hw} {y-14} h{width}" stroke="#FFE58A" stroke-width="3" opacity=".8"/>')
            y -= 12
        elif kind == "bacon":
            for i in range(3):
                x = cx - hw + 10 + i * (width - 20) / 3
                parts.append(f'<path d="M{x:.0f} {y-6} q20 -16 40 0 t40 0 t20 -4" stroke="#8E2A1B" stroke-width="13" fill="none" stroke-linecap="round"/>')
                parts.append(f'<path d="M{x:.0f} {y-6} q20 -16 40 0 t40 0 t20 -4" stroke="#E7A07A" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>')
            y -= 14
        elif kind == "lettuce":
            waves = "".join(f" q10 -14 20 0" for _ in range(int((width + 20) / 20)))
            parts.append(f'<path d="M{cx-hw-12} {y}{waves} v8 h-{width+24} z" fill="#5DAA3F"/>')
            parts.append(f'<path d="M{cx-hw-12} {y}{waves}" stroke="#86CB5E" stroke-width="4" fill="none"/>')
            y -= 12
        elif kind == "tomato":
            for i in range(3):
                x = cx - hw + 46 + i * (width - 92) / 2
                parts.append(f'<ellipse cx="{x:.0f}" cy="{y-6}" rx="52" ry="11" fill="#D93A2B"/><ellipse cx="{x:.0f}" cy="{y-8}" rx="40" ry="6" fill="#F06A55"/>')
            y -= 12
        elif kind == "onion":
            for i in range(5):
                x = cx - hw + 30 + i * (width - 60) / 4
                parts.append(f'<path d="M{x-26:.0f} {y-4} q26 -16 52 0" stroke="#8B4A2A" stroke-width="7" fill="none" stroke-linecap="round"/>')
            y -= 8
        elif kind == "crispy":
            h = 52
            bumps = "".join(f" q{width/16:.1f} -{8+random.randint(0,8)} {width/8:.1f} 0" for _ in range(8))
            parts.append(f'<path d="M{cx-hw-18} {y} v-{h-14}{bumps.replace("q", "q").replace(" 0", " 0")} v{h-14} z" fill="url(#crispy{uid})" transform="translate(0,0)"/>')
            for i in range(26):
                x = cx - hw - 10 + random.random() * (width + 16)
                yy = y - h + 18 + random.random() * (h - 22)
                parts.append(f'<circle cx="{x:.0f}" cy="{yy:.0f}" r="{2+random.random()*3:.1f}" fill="#A9611A" opacity=".55"/>')
            y -= h - 8
        elif kind == "sauce":
            parts.append(f'<path d="M{cx-hw+10} {y-2} q{hw-10} 14 {width-20} 0" stroke="#F4E3C1" stroke-width="9" fill="none" stroke-linecap="round"/>')
            y -= 4
    # pão de cima
    top = y - 128
    parts.append(f'<path d="M{cx-hw-10} {y} q-4 -126 {hw+10} -128 q{hw+14} 2 {hw+10} 128 z" fill="url(#bunTop{uid})"/>')
    parts.append(f'<path d="M{cx-hw+30} {y-80} q60 -40 140 -42" stroke="#FFD9A0" stroke-width="10" fill="none" stroke-linecap="round" opacity=".45"/>')
    for i in range(22):
        a = random.random() * math.pi
        r = random.random() * 0.82
        x = cx + math.cos(a) * hw * r
        yy = y - 16 - math.sin(a) * 104 * r
        if yy > y - 18:
            continue
        rot = random.randint(-50, 50)
        parts.append(f'<ellipse cx="{x:.0f}" cy="{yy:.0f}" rx="6" ry="3" fill="#FFF3D6" transform="rotate({rot} {x:.0f} {yy:.0f})"/>')
    return "".join(parts)

def fries(uid, cx, base, scale=1.0, cheddar=False):
    random.seed(uid + "f")
    p = []
    w = 150 * scale
    for i in range(14):
        x = cx - w / 2 + 12 + random.random() * (w - 24)
        h = (110 + random.random() * 60) * scale
        rot = random.randint(-14, 14)
        p.append(f'<rect x="{x:.0f}" y="{base-170*scale-h+90*scale:.0f}" width="{16*scale:.0f}" height="{h:.0f}" rx="4" fill="#F6C24E" stroke="#D99A26" stroke-width="2" transform="rotate({rot} {x:.0f} {base-100*scale:.0f})"/>')
    if cheddar:
        p.append(f'<path d="M{cx-w/2+6} {base-150*scale} q{w/4} -30 {w/2} -6 q{w/4} 24 {w/2-12} -4 v30 h-{w-12} z" fill="url(#cheese{uid})"/>')
        for i in range(12):
            x = cx - w / 2 + 14 + random.random() * (w - 28)
            yy = base - 160 * scale + random.random() * 26
            p.append(f'<rect x="{x:.0f}" y="{yy:.0f}" width="12" height="9" rx="2" fill="#9B2C1E"/>')
    p.append(f'<path d="M{cx-w/2} {base-150*scale} h{w} l-{18*scale:.0f} {150*scale:.0f} h-{w-36*scale:.0f} z" fill="#C8321E"/>')
    p.append(f'<path d="M{cx-w/2+10} {base-150*scale} h{w-20}" stroke="#fff" stroke-width="6" opacity=".9"/>')
    p.append(f'<text x="{cx}" y="{base-62*scale:.0f}" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="{30*scale:.0f}" fill="#FFF3D6">FRITAS</text>')
    return "".join(p)

def can(cx, base, color, label, accent="#fff", scale=1.0):
    w, h = 110 * scale, 190 * scale
    return f'''<g>
<rect x="{cx-w/2}" y="{base-h}" width="{w}" height="{h}" rx="{14*scale}" fill="{color}"/>
<rect x="{cx-w/2+8*scale}" y="{base-h+4*scale}" width="{14*scale}" height="{h-8*scale}" rx="6" fill="#fff" opacity=".22"/>
<ellipse cx="{cx}" cy="{base-h+4*scale}" rx="{w/2-4*scale}" ry="{10*scale}" fill="#C9C9C9"/><ellipse cx="{cx}" cy="{base-h+2*scale}" rx="{w/2-12*scale}" ry="{6*scale}" fill="#E8E8E8"/>
<text x="{cx}" y="{base-h/2+8*scale}" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="{22*scale:.0f}" fill="{accent}" transform="rotate(-8 {cx} {base-h/2})">{label}</text>
</g>'''

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{body}</svg>'

def write(name, body):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(svg(body))

DEMO_TAG = '<g><rect x="24" y="24" width="96" height="30" rx="6" fill="#000" opacity=".35"/><text x="72" y="45" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="#fff">DEMO</text></g>'

burgers = {
    "levi-especial.svg": ("#3A2A55", "#1A1430", ["patty", "cheese", "bacon", "onion", "tomato", "lettuce", "sauce"]),
    "levi-especial-2.svg": ("#552A2A", "#2A1212", ["patty", "cheese", "patty", "cheese", "bacon", "sauce"]),
    "levi-bacon.svg": ("#5A2E1C", "#2A140A", ["patty", "cheese", "bacon", "bacon", "sauce"]),
    "cheddar-duplo.svg": ("#5C4410", "#2B1E04", ["patty", "cheese", "patty", "cheese", "onion"]),
    "frango-crispy.svg": ("#1E4636", "#0D2219", ["crispy", "tomato", "lettuce", "sauce"]),
    "smash-bacon.svg": ("#4A1E1E", "#200C0C", ["smash", "cheese", "smash", "cheese", "bacon"]),
    "smash-classico.svg": ("#2E3A55", "#121A2C", ["smash", "cheese", "onion", "sauce"]),
}
for name, (c1, c2, layers) in burgers.items():
    uid = name.split(".")[0].replace("-", "")
    write(name, bg(c1, c2, uid) + shadow(uid) + board() + burger(uid, layers) + DEMO_TAG)

uid = "combolevi"
write("combo-levi.svg", bg("#3A2A55", "#1A1430", uid) + shadow(uid, rx=320) + board() + fries(uid, 190, 480, 0.9) + burger(uid, ["patty", "cheese", "bacon", "lettuce"], cx=420, width=250) + can(640, 482, "#C8102E", "COLA", scale=0.85) + DEMO_TAG)
uid = "batata"
write("batata.svg", bg("#5C1F18", "#2A0C08", uid) + shadow(uid, rx=200) + board() + fries(uid, 400, 480, 1.25) + DEMO_TAG)
uid = "batatacheddar"
write("batata-cheddar.svg", bg("#5C4410", "#2B1E04", uid) + shadow(uid, rx=200) + board() + fries(uid, 400, 480, 1.25, cheddar=True) + DEMO_TAG)
uid = "lata1"
write("lata-vermelha.svg", bg("#5A1414", "#2A0808", uid) + shadow(uid, rx=120) + can(400, 470, "#C8102E", "COLA", scale=1.3) + DEMO_TAG)
uid = "lata2"
write("lata-verde.svg", bg("#1E4A22", "#0B240F", uid) + shadow(uid, rx=120) + can(400, 470, "#1F8A3B", "GUARANÁ", "#FFE14A", scale=1.3) + DEMO_TAG)
uid = "agua"
write("agua.svg", bg("#1C3D5C", "#0B1C2C", uid) + shadow(uid, rx=100) + '''<g><rect x="355" y="150" width="90" height="320" rx="30" fill="#BFE4FF" opacity=".85"/><rect x="372" y="110" width="56" height="50" rx="8" fill="#2A6FB5"/><rect x="355" y="270" width="90" height="90" fill="#2A6FB5"/><text x="400" y="322" text-anchor="middle" font-family="Arial Black,Arial" font-size="20" fill="#fff">ÁGUA</text><rect x="368" y="170" width="12" height="280" rx="6" fill="#fff" opacity=".5"/></g>''' + DEMO_TAG)
uid = "brownie"
body = bg("#3A2216", "#180C06", uid) + shadow(uid, rx=200) + board()
for i, (x, y) in enumerate([(300, 380), (420, 390), (360, 300)]):
    body += f'<g transform="translate({x},{y})"><path d="M0 0 l90 -20 l70 30 v70 l-90 20 l-70 -30 z" fill="#4A2617"/><path d="M0 0 l90 -20 l70 30 l-90 20 z" fill="#6B3A22"/><path d="M10 2 l80 -16 l58 24" stroke="#2A130A" stroke-width="5" fill="none" opacity=".5"/><circle cx="60" cy="8" r="5" fill="#2A130A"/><circle cx="100" cy="14" r="4" fill="#2A130A"/></g>'
write("brownie.svg", body + DEMO_TAG)

# Logo e banner demo (originais, apenas para demonstração)
with open(os.path.join(OUT, "levi-logo.svg"), "w") as f:
    f.write('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240"><rect width="240" height="240" rx="48" fill="#1A2B57"/><circle cx="120" cy="120" r="96" fill="none" stroke="#E9B10C" stroke-width="6" stroke-dasharray="4 10"/><path d="M62 118c0-30 26-50 58-50s58 20 58 50z" fill="#E9B10C"/><rect x="56" y="126" width="128" height="18" rx="9" fill="#7A2E1C"/><path d="M62 152h116v4c0 12-10 22-22 22H84c-12 0-22-10-22-22z" fill="#E9B10C"/><text x="120" y="212" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="26" fill="#FFF7E0" letter-spacing="2">LEVI</text><text x="120" y="56" text-anchor="middle" font-family="Arial" font-weight="700" font-size="14" fill="#E9B10C" letter-spacing="3">DEMO</text></svg>''')
uid = "banner"
body = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 600" width="1600" height="600"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#1A2B57"/><stop offset="1" stop-color="#0D1530"/></linearGradient><radialGradient id="fire" cx="80%" cy="100%" r="60%"><stop offset="0" stop-color="#E9B10C" stop-opacity=".55"/><stop offset="1" stop-color="#E9B10C" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="600" fill="url(#g)"/><rect width="1600" height="600" fill="url(#fire)"/>'
for i in range(40):
    random.seed(i)
    x, y = random.randint(900, 1580), random.randint(260, 600)
    body += f'<circle cx="{x}" cy="{y}" r="{random.randint(2,5)}" fill="#FFB648" opacity="{random.random()*0.7:.2f}"/>'
body += '<g transform="translate(1040,90) scale(1.25)">' + burger("banner2", ["patty", "cheese", "bacon", "lettuce"], cx=200, base=340, width=280).replace("url(#", "url(#") + '</g>'
body += '<text x="120" y="300" font-family="Arial Black,Arial" font-weight="900" font-size="96" fill="#FFF7E0">BURGER</text><text x="120" y="390" font-family="Arial Black,Arial" font-weight="900" font-size="96" fill="#E9B10C">NA BRASA</text><text x="124" y="450" font-family="Arial" font-size="26" fill="#C9D3EE" letter-spacing="4">SEXTA A DOMINGO · 18H</text></svg>'
# o banner reaproveita os gradientes do hambúrguer
defs = bg("#000", "#000", "banner2").split("</defs>")[0].replace("<defs>", "")
body = body.replace("</defs>", defs + "</defs>", 1)
with open(os.path.join(OUT, "levi-banner.svg"), "w") as f:
    f.write(body)
print("ok", sorted(os.listdir(OUT)))
