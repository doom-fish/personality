"""Build item banks and percentile norms for the simple sum-per-scale tests.

Every source is an Open-Source Psychometrics dump: a response file plus a codebook carrying
the item wording. Everything the app ships for these tests is derived here, so the item text,
the keying and the norms can never drift apart.

Reverse-keyed items are not taken on trust. Each item's correlation with the rest of its own
scale decides the direction, and the resulting scale must then reproduce a credible alpha or
the build fails rather than emitting norms.
"""
import csv, html, io, json, re, sys, urllib.request, zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path("/tmp")

BANDS = [("-20", 13, 20), ("21-30", 21, 30), ("31-40", 31, 40), ("41-50", 41, 50), ("51+", 51, 99)]
MIN_GROUP = 300
MIN_ALPHA = 0.70

HTML_TABLE = ("html", None)


def txt(pattern):
    return ("txt", re.compile(pattern))


def seq(prefix, n):
    return [f"{prefix}{i}" for i in range(1, n + 1)]


RIASEC = dict(
    id="riasec", zip="RIASEC_data12Dec2018.zip", delim="\t", response_range=(1, 5),
    scales={"R": "Realistic", "I": "Investigative", "A": "Artistic",
            "S": "Social", "E": "Enterprising", "C": "Conventional"},
    key={s: seq(s, 8) for s in "RIASEC"},
    col=lambda c: c,
    text=txt(r"^([RIASEC]\d+)\t(.+)$"),
    source="Open-Source Psychometrics RIASEC dump (2015-2018); items are the O*NET "
           "Interest Profiler short form, US Department of Labor, public domain",
)

# Lovibond & Lovibond's published DASS-42 key; verified below by reliability.
DASS = dict(
    id="dass", zip="DASS_data_21.02.19.zip", delim="\t", response_range=(1, 4),
    scales={"D": "Depression", "A": "Anxiety", "S": "Stress"},
    key={"D": [3, 5, 10, 13, 16, 17, 21, 24, 26, 31, 34, 37, 38, 42],
         "A": [2, 4, 7, 9, 15, 19, 20, 23, 25, 28, 30, 36, 40, 41],
         "S": [1, 6, 8, 11, 12, 14, 18, 22, 27, 29, 32, 33, 35, 39]},
    col=lambda c: f"Q{c}A",
    text=txt(r"^Q(\d+)\t(.+)$"),
    order=int,
    source="Open-Source Psychometrics DASS dump (2017-2019); the DASS is public domain "
           "(Lovibond & Lovibond, UNSW)",
)

RSE = dict(
    id="rse", zip="RSE.zip", delim="\t", response_range=(1, 4),
    scales={"SE": "Self-esteem"},
    key={"SE": seq("Q", 10)},
    col=lambda c: c,
    text=txt(r"^(Q\d+)\. (.+?)\s*$"),
    order=lambda c: int(c[1:]),
    source="Open-Source Psychometrics RSE dump; the Rosenberg Self-Esteem Scale "
           "(Rosenberg, 1965) is free to use without permission",
)

# Brennan, Clark & Shaver's original ordering alternates the two dimensions: odd-numbered
# items measure avoidance, even-numbered items measure anxiety.
ECR = dict(
    id="ecr", zip="ECR-data-1March2018.zip", delim=",", response_range=(1, 5),
    scales={"AVO": "Avoidance", "ANX": "Anxiety"},
    key={"AVO": [f"Q{i}" for i in range(1, 37, 2)],
         "ANX": [f"Q{i}" for i in range(2, 37, 2)]},
    col=lambda c: c,
    text=HTML_TABLE,
    order=lambda c: int(c[1:]),
    source="Open-Source Psychometrics ECR dump; the Experiences in Close Relationships "
           "scale (Brennan, Clark & Shaver, 1998) is distributed for free research use",
)

DARK = dict(
    id="dark", zip="HSNS+DD.zip", delim="\t", response_range=(1, 5),
    scales={"M": "Machiavellianism", "P": "Psychopathy", "N": "Narcissism",
            "H": "Vulnerable narcissism"},
    key={"M": seq("DDM", 4), "P": seq("DDP", 4), "N": seq("DDN", 4), "H": seq("HSNS", 10)},
    col=lambda c: c,
    text=txt(r"^(HSNS\d+|DD[MPN]\d+)\t(.+)$"),
    source="Open-Source Psychometrics Dark Triad dump; the Dirty Dozen (Jonason & Webster, "
           "2010) and the Hypersensitive Narcissism Scale (Hendin & Cheek, 1997) are both "
           "published in full in their source articles",
)

TESTS = [RIASEC, DASS, RSE, ECR, DARK]


def fetch(cfg):
    path = CACHE / cfg["zip"]
    if not path.exists():
        print(f"downloading {cfg['id']}...", file=sys.stderr)
        urllib.request.urlretrieve("https://openpsychometrics.org/_rawdata/" + cfg["zip"], path)
    z = zipfile.ZipFile(path)
    book = next(n for n in z.namelist() if "codebook" in n.lower())
    data = next(n for n in z.namelist() if n.endswith("data.csv"))
    return z.read(book).decode("utf8", "replace"), z.read(data).decode("utf8", "replace")


def parse_items(cfg, codebook):
    kind, pat = cfg["text"]
    out = {}
    if kind == "html":
        for code, text in re.findall(r"<td>(Q\d+)</td>\s*<td>INTEGER</td>\s*<td>\"(.*?)\"",
                                     codebook, re.S):
            out.setdefault(code, html.unescape(text).strip())
    else:
        for line in codebook.splitlines():
            m = pat.match(line.rstrip())
            if m:
                out.setdefault(m.group(1), html.unescape(m.group(2)).strip())
    return out


def alpha(x):
    k = x.shape[1]
    return k / (k - 1) * (1 - x.var(0, ddof=1).sum() / x.sum(1).var(ddof=1))


def item_rest(x):
    """Correlation of each item with the mean of the other items in its scale."""
    return np.array([np.corrcoef(x[:, j], np.delete(x, j, 1).mean(1))[0, 1]
                     for j in range(x.shape[1])])


def keying(x):
    """Which items run against the rest of their scale.

    A single pass of item-rest correlations is not enough: when half a scale is reverse
    worded, the rest-score has almost no coherent direction and every correlation comes out
    near zero. The first principal component of the item correlation matrix does have a
    stable direction, so its loadings give the initial signs, and a short fixed-point loop
    cleans up anything left over.
    """
    c = np.corrcoef(x, rowvar=False)
    w, v = np.linalg.eigh(c)
    pc = v[:, -1]
    flip = pc * np.sign(pc[np.abs(pc).argmax()]) < 0
    for _ in range(10):
        y = np.where(flip, -x, x)
        bad = item_rest(y) < 0
        if not bad.any():
            break
        flip ^= bad
    return flip


def table(scores, lo, hi):
    n = len(scores)
    c = np.bincount(scores - lo, minlength=hi - lo + 1)
    upto = np.cumsum(c)
    return [round(float(x), 1) for x in 100 * (upto - c + upto) / 2 / n]


def build(cfg):
    codebook, data = fetch(cfg)
    texts = parse_items(cfg, codebook)
    lo, hi = cfg["response_range"]
    key = {s: [str(c) for c in v] for s, v in cfg["key"].items()}
    codes = [c for s in key for c in key[s]]
    cols = [cfg["col"](c) for c in codes]

    rows = []
    for r in csv.DictReader(io.StringIO(data), delimiter=cfg["delim"]):
        try:
            rows.append([int(r[c]) for c in cols] + [int(r["gender"]), int(float(r["age"]))])
        except (ValueError, TypeError, KeyError):
            continue
    a = np.array(rows, dtype=np.int32)
    it, sex, age = a[:, :len(cols)], a[:, -2], a[:, -1]
    ok = ((it >= lo).all(1) & (it <= hi).all(1) & np.isin(sex, (1, 2))
          & (age >= 13) & (age <= 99))
    it, sex, age = it[ok].astype(np.int32), sex[ok], age[ok]
    print(f"{cfg['id']}: {len(a)} rows, {ok.sum()} usable", file=sys.stderr)

    idx, at = {}, 0
    for s, members in key.items():
        idx[s] = list(range(at, at + len(members)))
        at += len(members)

    # Direction is decided by the data: an item that correlates negatively with the rest of
    # its own scale is reverse-keyed. Flip those, then demand a credible alpha.
    flipped = set()
    for s, ix in idx.items():
        neg = np.where(keying(it[:, ix].astype(float)))[0]
        for j in neg:
            it[:, ix[j]] = lo + hi - it[:, ix[j]]
            flipped.add(key[s][j])
        x = it[:, ix].astype(float)
        al, worst = alpha(x), item_rest(x).min()
        if al < MIN_ALPHA or worst <= 0:
            sys.exit(f"{cfg['id']} scale {s} failed: alpha={al:.3f}, weakest item r={worst:+.3f}")
        print(f"  {cfg['scales'][s]:<20} alpha={al:.3f} weakest item r={worst:+.2f} "
              f"reversed={len(neg)}/{len(ix)}", file=sys.stderr)

    srange = {s: [len(ix) * lo, len(ix) * hi] for s, ix in idx.items()}
    norms = {"meta": {"test": cfg["id"], "source": cfg["source"], "total_cases": int(ok.sum()),
                      "scale_range": srange, "scales": list(key), "response_range": [lo, hi]},
             "groups": {}}

    def group(mask):
        g = it[mask]
        return {"n": int(mask.sum()),
                "s": {s: table(g[:, ix].sum(1), *srange[s]) for s, ix in idx.items()}}

    norms["groups"]["total"] = group(np.ones(len(it), bool))
    for sx in (1, 2):
        for name, alo, ahi in BANDS:
            m = (sex == sx) & (age >= alo) & (age <= ahi)
            if m.sum() < MIN_GROUP:
                print(f"  skip {sx}|{name} (n={int(m.sum())})", file=sys.stderr)
                continue
            norms["groups"][f"{sx}|{name}"] = group(m)

    items = [{"scale": s, "code": c, "text": texts[c],
              "keyed": "minus" if c in flipped else "plus"}
             for s, members in key.items() for c in members]
    # Present in the order the source questionnaire used, so subscales stay interleaved
    # rather than arriving as one long block of depression items.
    order = cfg.get("order", codes.index)
    items.sort(key=lambda i: order(i["code"]))
    for n, i in enumerate(items, 1):
        i["seq"] = n

    out = ROOT / "data" / cfg["id"]
    out.mkdir(parents=True, exist_ok=True)
    json.dump(items, open(out / "items.json", "w"), indent=0)
    json.dump(norms, open(out / "norms.json", "w"), separators=(",", ":"))
    print(f"  wrote {len(items)} items, {len(norms['groups'])} groups "
          f"({(out / 'norms.json').stat().st_size / 1024:.0f} KB)\n", file=sys.stderr)


if __name__ == "__main__":
    want = sys.argv[1:]
    for cfg in TESTS:
        if not want or cfg["id"] in want:
            build(cfg)
