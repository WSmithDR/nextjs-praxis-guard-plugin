#!/usr/bin/env python3
"""bump-version.py — sincroniza la versión en TODOS los manifiestos por-CLI.

Fuente de verdad: .claude-plugin/plugin.json. Propaga a los manifiestos por-CLI que
llevan `version`. (opencode.json NO lleva version → se ignora a propósito.)

Uso:
  python3 bin/bump-version.py <major|minor|patch>   # bumpea canónico y propaga a todos
  python3 bin/bump-version.py --set 1.2.3            # fija una versión exacta en todos
  python3 bin/bump-version.py --sync                 # propaga plugin.json sin bumpear
  python3 bin/bump-version.py --check                # detecta drift (exit 1 si hay)
  python3 bin/bump-version.py --root <dir>           # operar sobre otro repo (tests)

Adaptado de cli-plugin-template features/multi-cli-compat/files/bump-version.py
(sin PyYAML/marketplace/cursor; lista de manifiestos de este plugin). Sin dependencias.
"""
import json
import re
import sys
from pathlib import Path

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
ROOT = Path(__file__).resolve().parent.parent  # bin/ -> raíz del repo
PLUGIN_REL = ".claude-plugin/plugin.json"
# Manifiestos por-CLI que llevan "version" (opencode.json no lleva; cursor no existe).
MANIFESTS = [".codex-plugin/plugin.json", ".copilot-plugin/plugin.json", "gemini-extension.json"]


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def dump(p, d):
    p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def bump(version, part):
    m = SEMVER.match(version)
    if not m:
        sys.exit(f"✗ version no semver: '{version}'")
    major, minor, patch = (int(x) for x in m.groups())
    if part == "major":
        major, minor, patch = major + 1, 0, 0
    elif part == "minor":
        minor, patch = minor + 1, 0
    elif part == "patch":
        patch += 1
    else:
        sys.exit(f"✗ bump inválido: '{part}' (major|minor|patch)")
    return f"{major}.{minor}.{patch}"


def collect(root):
    out = []
    for rel in [PLUGIN_REL, *MANIFESTS]:
        p = root / rel
        if p.exists():
            out.append((rel, load(p).get("version")))
    return out


def apply_version(root, new):
    touched = []
    for rel in [PLUGIN_REL, *MANIFESTS]:
        p = root / rel
        if not p.exists():
            continue
        d = load(p)
        if d.get("version") != new:
            d["version"] = new
            dump(p, d)
            touched.append(rel)
    return touched


def main(argv):
    args = list(argv)
    root = ROOT
    if "--root" in args:
        i = args.index("--root")
        root = Path(args[i + 1]).resolve()
        del args[i:i + 2]

    plugin = root / PLUGIN_REL
    if not plugin.exists():
        sys.exit(f"✗ no existe {PLUGIN_REL} en {root}")
    canonical = load(plugin).get("version")

    if "--check" in args:
        items = collect(root)
        drift = [(rel, v) for rel, v in items if v != canonical]
        for rel, v in items:
            print(f"  {'✓' if v == canonical else '✗'} {rel}: {v}")
        if drift:
            print(f"\n✗ drift: {len(drift)} manifiesto(s) ≠ plugin.json '{canonical}'")
            return 1
        print(f"\n✓ {len(items)} manifiestos sincronizados en {canonical}")
        return 0

    if "--set" in args:
        i = args.index("--set")
        target = args[i + 1]
        if not SEMVER.match(target):
            sys.exit(f"✗ --set requiere MAJOR.MINOR.PATCH, recibí '{target}'")
    elif "--sync" in args:
        target = canonical
    else:
        parts = [a for a in args if not a.startswith("--")]
        if len(parts) != 1:
            sys.exit("uso: bump-version.py <major|minor|patch> | --set X.Y.Z | --sync | --check")
        target = bump(canonical, parts[0])

    touched = apply_version(root, target)
    if not touched:
        print(f"✓ ya estaba todo en {target}, nada que hacer")
    else:
        print(f"✓ version → {target} (era {canonical})")
        for rel in touched:
            print(f"    actualizado {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
