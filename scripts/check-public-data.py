#!/usr/bin/env python3
"""Local, redacted gate for accidental credentials or private assets in a fork diff."""
import argparse
import pathlib
import re
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base", default="upstream/main")
parser.add_argument("--forbidden-file", type=pathlib.Path, help="Private newline-delimited literals, never printed")
args = parser.parse_args()
root = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
names = subprocess.check_output(
    ["git", "diff", "--name-only", "--diff-filter=ACMR", "-z", args.base], cwd=root
).decode().split("\0")
patterns = {
    "private key": re.compile(r"-----BEGIN (?:OPENSSH |RSA |EC |DSA )?PRIVATE KEY-----"),
    "GitHub token": re.compile(r"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})"),
    "AWS access key": re.compile(r"(?:AKIA|ASIA)[A-Z0-9]{16}"),
    "JWT": re.compile(r"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}"),
    "credential URL": re.compile(r"https?://[^/\s:]+:[^/@\s]+@(?![^/\s]*\.invalid\b)"),
    "home path": re.compile(r"(?:/Users/|/home/)[A-Za-z0-9_.-]+/"),
    "private network address": re.compile(r"\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"),
    "credential assignment": re.compile(r"""(?i)(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_+/=-]{20,}["']"""),
}
forbidden = args.forbidden_file.read_text().splitlines() if args.forbidden_file else []
assets = {".glb", ".gltf", ".ply", ".usdz", ".p12", ".pem", ".key", ".sqlite", ".db", ".zip"}
findings = []
checked = 0
for name in filter(None, names):
    path = root / name
    if path.suffix.lower() in assets or path.name in {".env", "secrets.yaml"} or \
            path.name.startswith(".env.") and path.name != ".env.example" or \
            any(part in {".private", ".local-data", "secrets"} for part in path.parts):
        findings.append((name, "private asset"))
        continue
    if not path.is_file():
        continue
    data = path.read_bytes()
    if b"\0" in data:
        findings.append((name, "unexpected binary asset"))
        continue
    content = data.decode("utf-8")
    checked += 1
    for label, pattern in patterns.items():
        if pattern.search(content):
            findings.append((name, label))
    if any(value and value.casefold() in content.casefold() for value in forbidden):
        findings.append((name, "private deployment or household literal"))
for name, label in findings:
    print(f"{name}: {label}", file=sys.stderr)
print(f"Public-data gate: {checked} changed text files, {len(findings)} findings. Values are never printed.")
sys.exit(bool(findings))
