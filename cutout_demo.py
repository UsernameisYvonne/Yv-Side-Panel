from pathlib import Path
from rembg import remove

TOP_IDS = [
  "171100055504b741e94179c4cceb0185084578a0cd_thumbnail_900x.webp",
  "1728380084fe9b514458826ea6192a6a37a12d7bba_thumbnail_900x.webp",
  "2594573A-3250-4AB3-AB73-91F734F87550.webp",
  "5B1558BB-FC00-4B41-B8BE-B381EA2884DE.webp",
]

BOTTOM_IDS = [
  "80384961.webp",
  "860694_XNA6E_1000_001_100_0000_Light-leather-mini-skirt.webp",
  "864574_ZAUU8_9413_001_100_0000_Light-printed-silk-twill-pleated-skirt.webp",
  "864707_XDDF1_1165_001_100_0000_Light-cotton-denim-pants-with-horsebit.webp",
]

RAW = Path("YV_dataset/raw_all")
OUT_TOP = Path("assets/demo_clothes/top")
OUT_BOTTOM = Path("assets/demo_clothes/bottom")
OUT_TOP.mkdir(parents=True, exist_ok=True)
OUT_BOTTOM.mkdir(parents=True, exist_ok=True)

def cutout(src_path: Path, dst_path: Path):
    data = src_path.read_bytes()
    out = remove(data)  # PNG bytes with alpha
    dst_path.write_bytes(out)

def main():
    # top -> top_01.png...
    for i, fn in enumerate(TOP_IDS, start=1):
        src = RAW / fn
        dst = OUT_TOP / f"top_{i:02d}.png"
        cutout(src, dst)
        print("TOP saved:", dst)

    # bottom -> bottom_01.png...
    for i, fn in enumerate(BOTTOM_IDS, start=1):
        src = RAW / fn
        dst = OUT_BOTTOM / f"bottom_{i:02d}.png"
        cutout(src, dst)
        print("BOTTOM saved:", dst)

    print("\nDONE Now you have assets/demo_clothes/top_*.png and bottom_*.png")

if __name__ == "__main__":
    main()