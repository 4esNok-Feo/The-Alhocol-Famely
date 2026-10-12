#!/usr/bin/env python3
"""package.py — три архива для платформы, редактора и промо-материалов.

Собирает:
  dist/Katme_Yandex.zip  — то, что загружается в консоль разработчика Яндекс Игр.
                           index.html лежит прямо в корне архива, SDK подключает
                           оболочка web/shell.html.
  dist/Katme_Source.zip  — редактируемый проект: исходный код, тесты, инструменты,
                           Godot-версия и документация.
  dist/Katme_Promo.zip   — обложка, иконка, скриншоты и тексты карточки.

Использование:
    python3 tools/package.py
    python3 tools/package.py --skip-promo     # если promo/ ещё не собран
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# Только то, что нужно игре в браузере.
WEB_FILES = [
    "index.html",
    "web/platform.js",
    "src/game.js",
    "src/audio/audio.js",
    "src/core/career.js",
    "src/core/config.js",
    "src/core/input.js",
    "src/core/run.js",
    "src/core/util.js",
    "src/ai/bot.js",
    "src/render/draw2d.js",
    "src/render/effects.js",
    "src/render/world.js",
    "src/ui/hud.js",
    "src/ui/screens.js",
    "assets/icon.svg",
    # Шрифты идут в сборку: так игра выглядит одинаково на любой машине, а
    # кириллица гарантированно есть даже там, где системный шрифт её не имеет.
    # Оба файла вместе — около 1,4 МБ, для веба это немного.
    "assets/fonts/DejaVuSans.ttf",
    "assets/fonts/DejaVuSans-Bold.ttf",
    "assets/fonts/LICENSE.txt",
]

# Исходники для редактора: без node_modules, dist и снимков-артефактов.
SOURCE_DIRS = ["src", "web", "tools", "tests", "godot", "docs"]
SOURCE_FILES = [
    "index.html", "README.md", "LICENSE.txt", "package.json",
    ".gitignore", "assets/icon.svg", "assets/fonts/LICENSE.txt",
    "assets/fonts/DejaVuSans.ttf", "assets/fonts/DejaVuSans-Bold.ttf",
]

EXCLUDE = {
    "node_modules", "dist", ".git", "__pycache__", ".shots-env",
    "promo/screenshots",
}


def human(size: float) -> str:
    for unit in ("Б", "КБ", "МБ"):
        if size < 1024 or unit == "МБ":
            return f"{size:.0f} {unit}" if unit == "Б" else f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} МБ"


def zip_files(archive: Path, files: list[tuple[Path, str]]) -> None:
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        archive.unlink()
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for src, arcname in files:
            zf.write(src, arcname)
    size = archive.stat().st_size
    print(f"  ✓ {archive.relative_to(ROOT)} — {len(files)} файлов, {human(size)}")


def build_web() -> None:
    print("Веб-сборка для Яндекс Игр:")
    # Оболочку с SDK ставим вместо отладочной страницы.
    files: list[tuple[Path, str]] = [(ROOT / "web/shell.html", "index.html")]
    for rel in WEB_FILES:
        if rel == "index.html":
            continue
        src = ROOT / rel
        if src.exists():
            files.append((src, rel))
        else:
            print(f"    ! пропущен отсутствующий файл {rel}", file=sys.stderr)
    zip_files(DIST / "Katme_Yandex.zip", files)


def build_source() -> None:
    print("Исходный проект:")
    files: list[tuple[Path, str]] = []
    for rel in SOURCE_FILES:
        src = ROOT / rel
        if src.exists():
            files.append((src, rel))
    for folder in SOURCE_DIRS:
        base = ROOT / folder
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            if any(part in EXCLUDE for part in rel.split("/")):
                continue
            files.append((path, rel))
    # Промо-материалы в исходниках нужны, а снимки экранов — да, они лёгкие.
    zip_files(DIST / "Katme_Source.zip", files)


def build_promo() -> None:
    promo = ROOT / "promo"
    if not promo.exists():
        print("Промо-материалов нет: сначала запустите npm run promo", file=sys.stderr)
        return
    print("Промо-материалы:")
    files = [(p, p.relative_to(ROOT).as_posix()) for p in sorted(promo.rglob("*")) if p.is_file()]
    zip_files(DIST / "Katme_Promo.zip", files)


def verify_web_archive() -> bool:
    archive = DIST / "Katme_Yandex.zip"
    if not archive.exists():
        return False
    with zipfile.ZipFile(archive) as zf:
        names = zf.namelist()
        checks = {
            "index.html в корне архива": "index.html" in names,
            "оболочка подключает SDK": b"/sdk.js" in zf.read("index.html"),
            "модуль игры на месте": "src/game.js" in names,
            "модель смены на месте": "src/core/run.js" in names,
            "слой платформы на месте": "web/platform.js" in names,
            "нет тестов и инструментов": not any(
                n.startswith(("tests/", "tools/", "godot/", "docs/")) for n in names
            ),
            "шрифты с кириллицей включены": "assets/fonts/DejaVuSans-Bold.ttf" in names,
            "лицензия шрифтов включена": "assets/fonts/LICENSE.txt" in names,
        }
        total = sum(i.file_size for i in zf.infolist())
    print("\nПроверка архива для платформы:")
    for name, ok in checks.items():
        print(f"  {'✓' if ok else '✗'} {name}")
    print(f"  распакованный размер: {human(total)}")
    return all(checks.values())


def main() -> int:
    parser = argparse.ArgumentParser(description="Собрать архивы проекта")
    parser.add_argument("--skip-promo", action="store_true")
    parser.add_argument("--only", choices=["web", "source", "promo"])
    args = parser.parse_args()

    DIST.mkdir(exist_ok=True)
    if args.only == "web":
        build_web()
    elif args.only == "source":
        build_source()
    elif args.only == "promo":
        build_promo()
    else:
        build_web()
        build_source()
        if not args.skip_promo:
            build_promo()

    ok = verify_web_archive()
    if not ok:
        print("\nАрхив для платформы не прошёл проверку.", file=sys.stderr)
        return 1
    print("\nГотово. Архивы лежат в dist/.")
    print("Порядок загрузки описан в docs/YANDEX_UPLOAD.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
