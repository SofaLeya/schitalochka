"""Package the review catalog as one HTML file for opening offline."""

import argparse
import base64
from functools import cache
import mimetypes
from pathlib import Path
import re

CATALOG = Path(__file__).resolve().parents[1]


@cache
def image_url(relative_path):
    path = (CATALOG / relative_path).resolve()
    mime, _ = mimetypes.guess_type(path)
    if mime not in {"image/png", "image/jpeg"}:
        raise ValueError(f"Unsupported catalog image: {relative_path}")
    data = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{data}"


def embedded_asset(match):
    field, path = match.groups()
    url = f'"{image_url(path)}"'
    if field == "reference":
        url = f"conceptUrl({url})"
    return f'"{field}":{url}'


def build(output):
    html = (CATALOG / "index.html").read_text(encoding="utf-8")
    css = (CATALOG / "catalog.css").read_text(encoding="utf-8")
    engine = (CATALOG / "engine.js").read_text(encoding="utf-8")
    rigs = (CATALOG / "rigs.js").read_text(encoding="utf-8")
    catalog = (CATALOG / "catalog.js").read_text(encoding="utf-8")
    rigs = re.sub(r'"(src|reference|neutralReference)"\s*:\s*"([^"]+)"', embedded_asset, rigs)
    engine = re.sub(r"^export ", "", engine, flags=re.MULTILINE)
    script = f"const {{ Renderer, states }} = (() => {{\n{engine}\nreturn {{ Renderer, states }};\n}})();\n"
    script += re.sub(r"^export ", "", rigs, flags=re.MULTILINE)
    script += "\n" + re.sub(r"^import .*;\n", "", catalog, flags=re.MULTILINE)
    # Browsers block opening a data URL in a new tab. A blob URL preserves the
    # full-size concept link while keeping the exported page self-contained.
    script = """
function conceptUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), char => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
}
""" + script
    html = html.replace('<link rel="stylesheet" href="catalog.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script type="module" src="catalog.js"></script>', "")
    html = html.replace("</body>", f"<script>\n'use strict';\n{script}\n</script>\n</body>")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    build(parser.parse_args().output)
