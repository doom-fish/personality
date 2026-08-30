"""Build item banks and percentile norms for the two simple scale tests.

Both sources are Open-Source Psychometrics dumps: a tab-separated response file plus a
codebook that carries the item wording. Everything the app ships is derived here, so the
item text and the norms can never drift apart.
"""
import csv, html, io, json, re, sys, urllib.request, zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path("/tmp")

RIASEC = {
    "id": "riasec",
    "url": "https://openpsychometrics.org/_rawdata/RIASEC_data12Dec2018.zip",
    "zip": "RIASEC_data12Dec2018.zip",
    "scales": {"R": "Realistic", "I": "Investigative", "A": "Artistic",
               "S": "Social", "E": "Enterprising", "C": "Conventional"},
    "per_scale": 8,
    "response_range": (1, 5),
    "item_re": re.compile(r"^([RIASEC])(\d+)\t(.+)$"),
    "col": lambda code: code,
    "source": "Open-Source Psychometrics RIASEC dump (2015-2018); items are the O*NET "
              "Interest Profiler short form, US Department of Labor, public domain",
}

DASS = {
    "id": "dass",
    "url": "https://openpsychometrics.org/_rawdata/DASS_data_21.02.19.zip",
    "zip": "DASS_data_21.02.19.zip",
    "scales": {"D": "Depression", "A": "Anxiety", "S": "Stress"},
    "per_scale": 14,
    "response_range": (1, 4),
    "item_re": re.compile(r"^Q(\d+)\t(.+)$"),
    "col": lambda code: f"Q{code}A",
    "source": "Open-Source Psychometrics DASS dump (2017-2019); the DASS is public domain "
              "(Lovibond & Lovibond, UNSW)",
}

# Lovibond & Lovibond's published DASS-42 key; verified below by reliability.
DASS_KEY = {
    "D": [3, 5, 10, 13, 16, 17, 21, 24, 26, 31, 34, 37, 38, 42],
    "A": [2, 4, 7, 9, 15, 19, 20, 23, 25, 28, 30, 36, 40, 41],
    "S": [1, 6, 8, 11, 12, 14, 18, 22, 27, 29, 32, 33, 35, 39],
}

BANDS = [("-20", 13, 20), ("21-30", 21, 30), ("31-40", 31, 40), ("41-50", 41, 50), ("51+", 51, 99)]
MIN_GROUP = 300
MIN_ALPHA = 0.70


def fetch(cfg):
    path = CACHE / cfg["zip"]
    if not path.exists():
        print(f"downloading {cfg['id']}...", file=sys.stderr)
        urllib.request.urlretrieve(cfg["url"], path)
    z = zipfile.ZipFile(path)
    book = next(n for n in z.namelist() if n.endswith("codebook.txt"))
    data = next(n for n in z.namelist() if n.endswith("data.csv"))
    return z.read(book).decode("utf8", "replace"), z.read(data).decode("utf8", "replace")


def parse_items(cfg, codebook):
    out = {}
    for line in codebook.splitlines():
        m = cfg["item_re"].match(line.rstrip())
        if not m:
            continue
        code = "".join(m.groups()[:-1])
        text = html.unescape(m.groups()[-1]).strip()
        out.setdefault(code, text)
    return out


def alpha(x):
    k = x.shape[1]
    return k / (k - 1) * (1 - x.var(0, ddof=1).sum() / x.sum(1).var(ddof=1))


def table(scores, lo, hi):
    n = len(scores)
    c = np.bincount(scores - lo, minlength=hi - lo + 1)
    upto = np.cumsum(c)
    return [round(float(x), 1) for x in 100 * (upto - c + upto) / 2 / n]


def build(cfg, key):
    codebook, data = fetch(cfg)
    texts = parse_items(cfg, codebook)
    lo, hi = cfg["response_range"]
    codes = [c for s in key for c in key[s]]
    cols = [cfg["col"](c) for c in codes]

    rows = []
    for r in csv.DictReader(io.StringIO(data), delimiter="\t"):
        try:
            rows.append([int(r[c]) for c in cols] + [int(r["gender"]), int(float(r["age"]))])
        except (ValueError, TypeError, KeyError):
            continue
    a = np.array(rows, dtype=np.int32)
    it, sex, age = a[:, :len(cols)], a[:, -2], a[:, -1]
    ok = ((it >= lo).all(1) & (it <= hi).all(1) & np.isin(sex, (1, 2))
          & (age >= 13) & (age <= 99))
    it, sex, age = it[ok], sex[ok], age[ok]
    print(f"{cfg['id']}: {len(a)} rows, {ok.sum()} usable", file=sys.stderr)

    idx, at = {}, 0
    for s, members in key.items():
        idx[s] = list(range(at, at + len(members)))
        at += len(members)

    for s, ix in idx.items():
        x = it[:, ix].astype(float)
        al = alpha(x)
        worst = min(np.corrcoef(x[:, j], np.delete(x, j, 1).mean(1))[0, 1] for j in range(len(ix)))
        if al < MIN_ALPHA or worst <= 0:
            sys.exit(f"{cfg['id']} scale {s} failed: alpha={al:.3f}, weakest item r={worst:+.3f}")
        print(f"  {cfg['scales'][s]:<14} alpha={al:.3f} weakest item r={worst:+.2f}", file=sys.stderr)

    n_items = cfg["per_scale"]
    srange = [n_items * lo, n_items * hi]
    norms = {"meta": {"test": cfg["id"], "source": cfg["source"], "total_cases": int(ok.sum()),
                      "scale_range": srange, "scales": list(key), "response_range": [lo, hi]},
             "groups": {}}

    def group(mask):
        g = it[mask]
        return {"n": int(mask.sum()),
                "s": {s: table(g[:, ix].sum(1), *srange) for s, ix in idx.items()}}

    norms["groups"]["total"] = group(np.ones(len(it), bool))
    for sx in (1, 2):
        for name, alo, ahi in BANDS:
            m = (sex == sx) & (age >= alo) & (age <= ahi)
            if m.sum() < MIN_GROUP:
                print(f"  skip {sx}|{name} (n={int(m.sum())})", file=sys.stderr)
                continue
            norms["groups"][f"{sx}|{name}"] = group(m)

    items = []
    for s, members in key.items():
        for c in members:
            items.append({"scale": s, "code": str(c), "text": texts[str(c)]})
    # Present in the order the source questionnaire used, so subscales stay interleaved
    # rather than arriving as one long block of depression items.
    items.sort(key=lambda i: int(re.sub(r"\D", "", i["code"])) if cfg["id"] == "dass"
               else codes.index(i["code"]))
    for n, i in enumerate(items, 1):
        i["seq"] = n

    out = ROOT / "data" / cfg["id"]
    out.mkdir(parents=True, exist_ok=True)
    json.dump(items, open(out / "items.json", "w"), indent=0)
    json.dump(norms, open(out / "norms.json", "w"), separators=(",", ":"))
    print(f"  wrote {len(items)} items, {len(norms['groups'])} groups "
          f"({(out / 'norms.json').stat().st_size / 1024:.0f} KB)\n", file=sys.stderr)


if __name__ == "__main__":
    build(RIASEC, {s: [f"{s}{i}" for i in range(1, RIASEC["per_scale"] + 1)] for s in RIASEC["scales"]})
    build(DASS, DASS_KEY)
