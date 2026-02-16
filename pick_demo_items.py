import csv
from pathlib import Path

manifest = Path("YV_dataset/manifest.csv")
rows = []
with open(manifest, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for r in reader:
        if r["status"] == "ok":
            rows.append(r)

tops = [r for r in rows if r["label"] == "top" and r["source_type"] == "flat_lay"]
bottoms = [r for r in rows if r["label"] == "bottom" and r["source_type"] == "flat_lay"]

# fallback: if not enough flat_lay, allow any source_type
if len(tops) < 5:
    tops = [r for r in rows if r["label"] == "top"]
if len(bottoms) < 5:
    bottoms = [r for r in rows if r["label"] == "bottom"]

print("TOP picks:")
for r in tops[:4]:
    print(" -", r["id"])

print("\nBOTTOM picks:")
for r in bottoms[:4]:
    print(" -", r["id"])