from pathlib import Path

script_path = Path('.github/scripts/pr15_apply.py')
source = script_path.read_text(encoding='utf-8')
old = '    ") {\\n'
new = '    "} {\\n'
if old not in source:
    raise SystemExit('No se encontró el patrón de firma a corregir en pr15_apply.py')
source = source.replace(old, new)
exec(compile(source, str(script_path), 'exec'))
