"""Test-only independent reader: Python stdlib only (zipfile + ElementTree), no code shared with the app's reader.
Usage: python independent-xlsx-dump.py file.xlsx  ->  JSON {"Sheet name!A1": "text", ...} for every non-numeric cell with a value."""
import json, re, sys, zipfile
import xml.etree.ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

def text_of(node):
    # Concatenate every <t> that is not inside a phonetic <rPh> run.
    out = []
    def walk(n):
        for child in n:
            if child.tag == M + "rPh":
                continue
            if child.tag == M + "t":
                out.append(child.text or "")
            else:
                walk(child)
    walk(node)
    return "".join(out)

def dump(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si"):
            shared.append(text_of(si))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    cells = {}
    for sheet in wb.iter(M + "sheet"):
        name, target = sheet.get("name"), rels[sheet.get(R + "id")]
        part = target.lstrip("/") if target.startswith("/") else "xl/" + target
        for c in ET.fromstring(z.read(part)).iter(M + "c"):
            t, v = c.get("t"), c.find(M + "v")
            if t == "s" and v is not None:
                value = shared[int(v.text)]
            elif t == "inlineStr":
                is_ = c.find(M + "is")
                value = text_of(is_) if is_ is not None else ""
            elif t == "str" and v is not None:
                value = v.text or ""
            else:
                continue
            if value != "":
                cells[f"{name}!{c.get('r')}"] = value
    return cells

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(dump(sys.argv[1]), ensure_ascii=False))
