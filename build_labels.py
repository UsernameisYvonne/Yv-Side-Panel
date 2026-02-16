import csv
import json
import shutil
from pathlib import Path

import cv2
from PIL import Image

from ultralytics import YOLO
import torch
import open_clip

# ---- Config ----
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}  # avif skipped for now due to limited support in Python libraries; can add later if needed
LABELS = ["top", "bottom", "one_piece"]

PROMPTS = {
    "top": [
        "a photo of a top clothing item",
        "a photo of a shirt or blouse",
        "a photo of a jacket or coat",
        "a photo of a sweater",
        "a photo of a hoodie",
    ],
    "bottom": [
        "a photo of a bottom clothing item",
        "a photo of pants or trousers",
        "a photo of jeans",
        "a photo of a skirt",
        "a photo of shorts",
    ],
    "one_piece": [
        "a photo of a one-piece outfit",
        "a photo of a dress",
        "a photo of a jumpsuit",
        "a photo of a romper",
        "a photo of a full-body outfit",
    ],
}


def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)


def list_images(input_dir: Path):
    files, skipped = [], []
    for p in sorted(input_dir.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        if ext in IMAGE_EXTS:
            files.append(p)
        else:
            skipped.append(p)
    return files, skipped


def safe_copy(src: Path, dst_dir: Path) -> Path:
    ensure_dir(dst_dir)
    dst = dst_dir / src.name
    if not dst.exists():
        shutil.copy2(src, dst)
    return dst


def detect_source_type(yolo_model, img_bgr):
    """
    - flat_lay: no person detected
    - model_upperbody: person bbox height ratio < 0.60
    - model_fullbody: person bbox height ratio >= 0.60
    """
    h, w = img_bgr.shape[:2]
    results = yolo_model.predict(img_bgr, imgsz=640, conf=0.25, verbose=False)
    r = results[0]
    if r.boxes is None or len(r.boxes) == 0:
        return "flat_lay", 0.0

    best = None
    best_conf = -1.0
    for box in r.boxes:
        cls = int(box.cls[0].item())
        conf = float(box.conf[0].item())
        if cls == 0 and conf > best_conf:  # COCO class 0 = person
            best_conf = conf
            best = box

    if best is None:
        return "flat_lay", 0.0

    x1, y1, x2, y2 = best.xyxy[0].tolist()
    bbox_h = max(1.0, y2 - y1)
    bbox_h_ratio = bbox_h / h

    if bbox_h_ratio >= 0.60:
        return "model_fullbody", best_conf
    else:
        return "model_upperbody", best_conf


def clip_zero_shot_label(model, preprocess, tokenizer, device, img_pil: Image.Image):
    with torch.no_grad():
        image = preprocess(img_pil).unsqueeze(0).to(device)

        prompt_texts = []
        prompt_to_label = []
        for lbl in LABELS:
            for t in PROMPTS[lbl]:
                prompt_texts.append(t)
                prompt_to_label.append(lbl)

        text = tokenizer(prompt_texts).to(device)

        image_features = model.encode_image(image)
        text_features = model.encode_text(text)

        image_features = image_features / image_features.norm(dim=-1, keepdim=True)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        sims = (image_features @ text_features.T).squeeze(0).float()

        per_label_raw = {lbl: -1e9 for lbl in LABELS}
        for score, lbl in zip(sims.tolist(), prompt_to_label):
            if score > per_label_raw[lbl]:
                per_label_raw[lbl] = score

        scores = torch.tensor([per_label_raw[lbl] for lbl in LABELS], device=device)
        probs = torch.softmax(scores, dim=0).detach().cpu().tolist()

        best_i = int(torch.argmax(scores).item())
        best_label = LABELS[best_i]
        best_conf = float(probs[best_i])

        per_label_scores = {lbl: float(p) for lbl, p in zip(LABELS, probs)}
        return best_label, best_conf, per_label_scores


def main():
    import sys
    if len(sys.argv) < 2:
        print('Usage: python build_labels.py "/path/to/Clothes Material Library"')
        sys.exit(1)

    input_dir = Path(sys.argv[1]).expanduser()
    if not input_dir.exists():
        print("Folder not found:", input_dir)
        sys.exit(1)

    out_root = Path("YV_dataset")
    raw_dir = out_root / "raw_all"
    labels_dir = out_root / "labels"
    ensure_dir(raw_dir)
    ensure_dir(labels_dir)

    images, skipped = list_images(input_dir)
    print(f"Found {len(images)} supported images, skipped {len(skipped)} unsupported (e.g. .avif).")

    print("Loading YOLO (person detector)...")
    yolo = YOLO("yolov8n.pt")

    print("Loading CLIP (zero-shot classifier)...")
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="openai")
    model.to(device).eval()
    tokenizer = open_clip.get_tokenizer("ViT-B-32")

    rows = []
    # skipped first
    for p in skipped:
        rows.append({
            "id": p.name,
            "status": "skipped_unsupported_ext",
            "ext": p.suffix.lower(),
            "raw_path": "",
            "label": "",
            "label_confidence": "",
            "source_type": "",
            "source_confidence": "",
        })

    for i, src in enumerate(images, start=1):
        copied = safe_copy(src, raw_dir)

        img_bgr = cv2.imread(str(copied))
        if img_bgr is None:
            print(f"[{i}/{len(images)}] Skip unreadable: {copied.name}")
            rows.append({
                "id": copied.name,
                "status": "skipped_unreadable",
                "ext": copied.suffix.lower(),
                "raw_path": str(copied.as_posix()),
                "label": "",
                "label_confidence": "",
                "source_type": "",
                "source_confidence": "",
            })
            continue

        source_type, st_conf = detect_source_type(yolo, img_bgr)

        img_pil = Image.open(copied).convert("RGB")
        label, label_conf, per_label_scores = clip_zero_shot_label(
            model, preprocess, tokenizer, device, img_pil
        )

        item = {
            "id": copied.name,
            "status": "ok",
            "ext": copied.suffix.lower(),
            "label": label,
            "label_confidence": round(float(label_conf), 4),
            "source_type": source_type,
            "source_confidence": round(float(st_conf), 4),
            "per_label_scores": per_label_scores,
            "raw_path": str(copied.as_posix()),
        }

        with open(labels_dir / f"{copied.name}.json", "w", encoding="utf-8") as f:
            json.dump(item, f, ensure_ascii=False, indent=2)

        rows.append({
            "id": item["id"],
            "status": item["status"],
            "ext": item["ext"],
            "raw_path": item["raw_path"],
            "label": item["label"],
            "label_confidence": item["label_confidence"],
            "source_type": item["source_type"],
            "source_confidence": item["source_confidence"],
        })

        print(f"[{i}/{len(images)}] {copied.name} -> {label} ({label_conf:.2f}), {source_type}")

    # write manifest.csv (no pandas)
    ensure_dir(out_root)
    manifest_path = out_root / "manifest.csv"
    fieldnames = ["id", "status", "ext", "raw_path", "label", "label_confidence", "source_type", "source_confidence"]
    with open(manifest_path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print("\nDONE")
    print("Output folder:", out_root.resolve())
    print(" - raw_all/ (copied originals)")
    print(" - labels/  (per-image json)")
    print(" - manifest.csv (summary table)")
    print("\nNote: .avif files were skipped for now; we can add AVIF support later.")


if __name__ == "__main__":
    main()