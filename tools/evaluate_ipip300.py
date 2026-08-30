"""Evaluate whether Johnson's 300-item dataset can be added to the norm sample.

The IPIP-NEO-120 items are a subset of the IPIP-NEO-300, so IPIP300.dat looks like a free
source of ~145,000 extra cases. It isn't. This script establishes the column mapping by
matching item text, confirms the mapping is right by reproducing published reliabilities,
and then measures whether the two samples are actually the same population.

They are not: respondents who complete the 35-minute 300-item inventory score consistently
higher on Openness, which is what you would expect from the people willing to sit through it.
Merging would push everyone's Openness percentile down for a purely artefactual reason.

Run:  python3 tools/evaluate_ipip300.py
"""
import json, re, sys, urllib.request, zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path("/tmp")
FILES = {
    "IPIP120.dat": "https://osf.io/q9jrh/download",
    "IPIP300.dat": "https://osf.io/jdu2v/download",
    "q300.docx": "https://osf.io/xzje4/download",
}
DOM = "NEOAC"
# Thresholds: alpha agreement proves the mapping; d is the selection-bias budget.
MAX_ALPHA_DIFF = 0.05
MAX_DOMAIN_D = 0.20


def fetch(name):
    p = CACHE / name
    if not p.exists():
        print(f"downloading {name} ...", file=sys.stderr)
        urllib.request.urlretrieve(FILES[name], p)
    return p


def norm_text(s):
    s = s.lower().replace("\u2019", "'").replace("\u2018", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def items_300():
    """Item text for I1..I300, read out of the printable questionnaire."""
    xml = zipfile.ZipFile(fetch("q300.docx")).read("word/document.xml").decode("utf8")
    lines = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S)).strip()
        if t:
            lines.append(t)
    out = {}
    for i, l in enumerate(lines):
        if re.fullmatch(r"\d{1,3}", l) and 1 <= int(l) <= 300 and i + 1 < len(lines):
            nxt = lines[i + 1]
            if nxt != "O" and len(nxt) > 3 and not re.fullmatch(r"\d+", nxt):
                out.setdefault(int(l), nxt)
    return out


def build_mapping(neo):
    src = items_300()
    if len(src) != 300:
        sys.exit(f"expected 300 item texts, parsed {len(src)}")
    by_text = {}
    for n, t in src.items():
        by_text.setdefault(norm_text(t), []).append(n)

    mapping, fuzzy = {}, []
    for it in neo:
        hit = by_text.get(norm_text(it["text"]))
        if hit and len(hit) == 1:
            mapping[it["seq"]] = hit[0]
        else:
            import difflib
            best = max(((difflib.SequenceMatcher(None, norm_text(it["text"]), k).ratio(), v[0])
                        for k, v in by_text.items()))
            if best[0] < 0.9:
                sys.exit(f"could not map item {it['seq']}: {it['text']!r}")
            mapping[it["seq"]] = best[1]
            fuzzy.append((it["seq"], it["text"], src[best[1]], best[0]))

    if len(set(mapping.values())) != 120:
        sys.exit("mapping is not one-to-one")
    print(f"mapped 120 items ({len(fuzzy)} by near-match)")
    for seq, a, b, r in fuzzy:
        print(f"   seq {seq}: {a!r}\n        -> {b!r}  (similarity {r:.3f})")
    return mapping


def load(path, item_start, item_count):
    raw = open(path, "rb").read()
    rl = raw.find(b"\n") + 1
    rows = len(raw) // rl
    a = np.frombuffer(raw[: rows * rl], dtype=np.uint8).reshape(rows, rl)
    sex = a[:, 6] - 48
    age = (a[:, 7] - 48) * 10 + (a[:, 8] - 48)
    resp = a[:, item_start : item_start + item_count] - 48
    keep = (resp >= 1).all(1) & (resp <= 5).all(1) & (age >= 10) & (age <= 99) & np.isin(sex, [1, 2])
    return sex[keep], age[keep], resp[keep].astype(np.int16), keep


def alpha(x):
    k = x.shape[1]
    return k / (k - 1) * (1 - x.var(0, ddof=1).sum() / x.sum(1).var(ddof=1))


def main():
    items = json.load(open(ROOT / "data" / "items.json"))
    neo = [i for i in items if i["instrument"] == "IPIP-NEO-120"]
    mapping = build_mapping(neo)

    s1, a1, r1, k1 = load(fetch("IPIP120.dat"), 31, 120)
    s3, a3, r3full, k3 = load(fetch("IPIP300.dat"), 33, 300)
    r3 = r3full[:, [mapping[i["seq"]] - 1 for i in neo]]
    print(f"\nIPIP120 usable: {len(r1):>7,} of {len(k1):>7,}")
    print(f"IPIP300 usable: {len(r3):>7,} of {len(k3):>7,}")

    fidx, didx = {}, {}
    for k, it in enumerate(neo):
        fidx.setdefault(f"{it['domain']}|{it['facet']}", []).append(k)
        didx.setdefault(it["domain"], []).append(k)

    print("\n== 1. does the mapping reproduce the published reliabilities? ==")
    worst, worst_name = 0, ""
    for name, idx in list(fidx.items()) + [(f"DOMAIN {d}", didx[d]) for d in DOM]:
        diff = abs(alpha(r1[:, idx]) - alpha(r3[:, idx]))
        if diff > worst:
            worst, worst_name = diff, name
    print(f"largest alpha difference across all 35 scales: {worst:.3f} ({worst_name})")
    mapping_ok = worst < MAX_ALPHA_DIFF
    print("mapping verified" if mapping_ok else "MAPPING LOOKS WRONG")

    print("\n== 2. are the two samples the same population? ==")
    bands = [("-20", 10, 20), ("21-30", 21, 30), ("31-40", 31, 40), ("41-50", 41, 50), ("51+", 51, 99)]
    prank = lambda arr, v: 100 * ((arr < v).mean() + (arr <= v).mean()) / 2
    print(f"{'group':<12}{'now':>9}{'+300':>8}{'gain':>7}   Openness bias and cost")
    worst_d, worst_shift = 0, 0
    for sx in (1, 2):
        for nm, lo, hi in bands:
            m1 = (s1 == sx) & (a1 >= lo) & (a1 <= hi)
            m3 = (s3 == sx) & (a3 >= lo) & (a3 <= hi)
            if m1.sum() < 300 or m3.sum() < 300:
                continue
            x = r1[m1][:, didx["O"]].sum(1)
            y = r3[m3][:, didx["O"]].sum(1)
            d = (y.mean() - x.mean()) / np.sqrt((x.var(ddof=1) + y.var(ddof=1)) / 2)
            merged = np.concatenate([x, y])
            shifts = [prank(merged, v) - prank(x, v) for v in np.percentile(x, [10, 25, 50, 75, 90]).astype(int)]
            worst_d, worst_shift = max(worst_d, abs(d)), max(worst_shift, max(abs(s) for s in shifts))
            print(f"{sx}|{nm:<10}{m1.sum():>9,}{m3.sum():>8,}{100 * m3.sum() / m1.sum():>6.0f}%"
                  f"   d={d:+.2f}  percentiles move {min(shifts):+.1f}..{max(shifts):+.1f}")

    print(f"\nworst Openness bias d={worst_d:.2f}, worst percentile distortion {worst_shift:.1f} points")
    print("\n" + "=" * 72)
    if mapping_ok and worst_d < MAX_DOMAIN_D:
        print("VERDICT: merging is justified")
    else:
        print("VERDICT: do not merge")
        print("The extra cases reduce sampling noise by well under one percentile point,")
        print(f"but import a systematic Openness bias worth up to {worst_shift:.1f} percentile points.")
    print("=" * 72)


if __name__ == "__main__":
    main()
