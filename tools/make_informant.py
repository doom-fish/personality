"""Add third-person wording to the item bank so someone else can rate you.

IPIP items are written as first-person verb phrases ("Worry about things"). Singular "they"
keeps the verb in its base form, so no conjugation is needed and no gender is assumed; only
the leading "Am" and the embedded first-person pronouns have to move.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ITEMS = ROOT / "data" / "items.json"

# Only where a mechanical rewrite would be ambiguous: this item already uses "they" for
# other people, so a second "they" for the subject would be unreadable.
OVERRIDES = {
    123: "They tell other people what those people want to hear, so that they will do what "
         "this person wants them to do.",
}

SUBS = [
    (r"\bI'm\b", "they're"),
    (r"\bI am\b", "they are"),
    (r"\bmyself\b", "themselves"),
    (r"\bmine\b", "theirs"),
    (r"\bmy\b", "their"),
    (r"\bme\b", "them"),
    (r"\bI\b", "they"),
]


def third_person(text):
    body = re.sub(r"^Am\b", "are", text)
    for pat, rep in SUBS:
        body = re.sub(pat, rep, body)
    return "They " + body[0].lower() + body[1:] if body[:2] != "ar" else "They " + body


def main():
    items = json.load(open(ITEMS))
    for it in items:
        it["third"] = OVERRIDES.get(it["seq"]) or third_person(it["text"])
    json.dump(items, open(ITEMS, "w"), indent=0)

    bad = [i for i in items if re.search(r"\b(I|my|me|myself|mine)\b", i["third"])]
    if bad:
        raise SystemExit(f"first person survived in: {[i['seq'] for i in bad]}")
    print(f"rewrote {len(items)} items")
    for seq in (1, 41, 46, 86, 123, 126, 134, 137, 138):
        it = next(i for i in items if i["seq"] == seq)
        print(f"  {seq:>4}  {it['text']}\n        -> {it['third']}")


if __name__ == "__main__":
    main()
