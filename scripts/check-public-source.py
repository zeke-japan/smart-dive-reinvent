#!/usr/bin/env python3
"""Heuristic credential scan of Git-tracked content; never prints matched values."""
from pathlib import Path
import re, subprocess, sys
root = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
patterns = {
    'AWS access key': r'(?:AKIA|ASIA)[A-Z0-9]{16}',
    'Private key': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'GitHub token': r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})',
    'Literal JWT': r'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]+',
    'Literal pairing code': r'sd1\.[a-f0-9]{32}\.[a-f0-9]{64}',
    'Client secret assignment': r'(?i)client[_-]?secret\s*[:=]\s*[\x22\x27][^\x22\x27\n]{8,}[\x22\x27]',
}
issues = []
for name in filter(None, paths):
    p = root / name
    if p.is_symlink():
        issues.append((name, 1, 'Symlink must not be published'))
        continue
    if p.suffix.lower() in {'.png', '.jpg', '.jpeg'}:
        continue  # Curated synthetic previews require visual review separately.
    body = p.read_text(errors='replace')
    for label, pattern in patterns.items():
        for match in re.finditer(pattern, body):
            issues.append((name, body[:match.start()].count('\n') + 1, label))
for name, line, label in issues:
    print(f'{name}:{line}: {label}; value withheld')
print(f'Checked {len(list(filter(None, paths)))} tracked files; high-signal findings: {len(issues)}')
print('This is a heuristic scan, not a security audit or a scan of remote history.')
sys.exit(bool(issues))
