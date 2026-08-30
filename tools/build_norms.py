import json, numpy as np, urllib.request, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
OUT.mkdir(parents=True, exist_ok=True)
DAT = Path("/tmp/IPIP120.dat")
if not DAT.exists():
    print("downloading dataset (95 MB)...", file=sys.stderr)
    urllib.request.urlretrieve("https://osf.io/download/q9jrh/", DAT)

items = json.load(open(OUT / "items.json"))
neo = [i for i in items if i["instrument"] == "IPIP-NEO-120"]

raw = open(DAT, "rb").read()
rl = raw.find(b"\n") + 1
a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, rl)
sex, age = a[:, 6] - 48, (a[:, 7] - 48) * 10 + (a[:, 8] - 48)
r = a[:, 31:151] - 48
ok = (r >= 1).all(1) & (r <= 5).all(1) & (age >= 10) & (age <= 99)
r, sex, age = r[ok].astype(np.int16), sex[ok], age[ok]
print("usable", r.shape[0], file=sys.stderr)

FIDX, DIDX = {}, {}
for k, it in enumerate(neo):
    FIDX.setdefault(f"{it['domain']}|{it['facet']}", []).append(k)
    DIDX.setdefault(it["domain"], []).append(k)


def table(scores, lo, hi):
    """Tie-corrected percentile for every possible raw score in [lo, hi]."""
    n = len(scores)
    c = np.bincount(scores, minlength=hi + 1)[lo:hi + 1]
    upto = np.cumsum(c)
    below = upto - c
    return [round(float(x), 1) for x in 100 * (below + upto) / 2 / n]


def build(mask):
    g = r[mask]
    out = {"n": int(mask.sum()), "f": {}, "d": {}}
    for k, idx in FIDX.items():
        out["f"][k] = table(g[:, idx].sum(1), 4, 20)
    for k, idx in DIDX.items():
        out["d"][k] = table(g[:, idx].sum(1), 24, 120)
    return out


MAXROWS = 30000


def domain_matrix(mask, name):
    """Dump this group's five domain scores so the client can count exact joint frequencies.

    A Gaussian copula underestimates the real joint tail by roughly half, so profile
    rarity is counted against actual respondents instead of a fitted distribution.
    One byte per domain (raw score minus its floor of 24); loaded on demand, one group only.
    """
    g = r[mask]
    d = np.stack([g[:, DIDX[k]].sum(1) for k in DOM], 1)
    if len(d) > MAXROWS:
        d = d[np.random.default_rng(20140).choice(len(d), MAXROWS, replace=False)]
    f = DOMDIR / (name.replace("|", "_") + ".bin")
    (d - 24).astype(np.uint8).tofile(f)
    return {"rows": int(len(d)), "sampled": int(len(d)) < int(mask.sum()),
            "mu": [round(float(x), 2) for x in d.mean(0)],
            "sd": [round(float(x), 3) for x in d.std(0, ddof=1)],
            "file": f.name}


DOM = "NEOAC"
BANDS = [("-20", 10, 20), ("21-30", 21, 30), ("31-40", 31, 40), ("41-50", 41, 50), ("51+", 51, 99)]
norms = {"meta": {"source": "Johnson (2014) IPIP-NEO-120 validation data",
                  "total_cases": int(r.shape[0]), "facet_range": [4, 20], "domain_range": [24, 120],
                  "domain_order": list(DOM)},
         "groups": {}}
DOMDIR = OUT / "dom"
DOMDIR.mkdir(exist_ok=True)
_total = np.ones(len(r), bool)
norms["groups"]["total"] = build(_total)
norms["groups"]["total"]["rarity"] = domain_matrix(_total, "total")

for sx in (1, 2):
    for name, lo, hi in BANDS:
        m = (sex == sx) & (age >= lo) & (age <= hi)
        if m.sum() < 300:
            print("skip (too few)", sx, name, int(m.sum()), file=sys.stderr)
            continue
        norms["groups"][f"{sx}|{name}"] = build(m)
        norms["groups"][f"{sx}|{name}"]["rarity"] = domain_matrix(m, f"{sx}|{name}")
        print(f"  {sx}|{name:<6} n={m.sum():>7}", file=sys.stderr)

p = OUT / "norms.json"
json.dump(norms, open(p, "w"), separators=(",", ":"))
print(f"\nwrote {p} : {p.stat().st_size/1024:.0f} KB, {len(norms['groups'])} groups", file=sys.stderr)
