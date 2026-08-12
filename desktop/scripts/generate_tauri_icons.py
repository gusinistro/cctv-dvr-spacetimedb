from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src-tauri" / "icons"
SIZE = 1024


def rgba(value: str) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4)) + (255,)


def build_icon() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), rgba("07111F"))
    draw = ImageDraw.Draw(image)

    for offset in range(0, 150, 6):
        alpha = max(0, 48 - offset // 4)
        draw.ellipse(
            (100 + offset, 100 + offset, SIZE - 100 - offset, SIZE - 100 - offset),
            outline=(25, 194, 255, alpha),
            width=4,
        )

    draw.rounded_rectangle((164, 330, 430, 682), radius=96, fill=rgba("0D2238"), outline=rgba("20C6FF"), width=28)
    draw.polygon([(375, 378), (650, 250), (650, 762), (375, 634)], fill=rgba("174, 237, 255".replace(", ", "")))
    draw.rounded_rectangle((480, 286, 884, 726), radius=140, fill=rgba("102238"), outline=rgba("20C6FF"), width=30)
    draw.ellipse((550, 356, 814, 620), fill=rgba("03101D"), outline=rgba("77E0FF"), width=34)
    draw.ellipse((614, 420, 750, 556), fill=rgba("20C6FF"))
    draw.ellipse((652, 458, 704, 510), fill=rgba("E7FBFF"))
    return image


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    icon = build_icon()
    icon.save(OUTPUT / "icon.png", format="PNG")
    icon.save(OUTPUT / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(OUTPUT / "icon@2x.png", format="PNG")


if __name__ == "__main__":
    main()
