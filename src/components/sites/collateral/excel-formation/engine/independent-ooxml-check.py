"""Test/QA-only independent package reader: Python stdlib only (zipfile + ElementTree + hashlib), no code shared with the app.
Usage: python3 independent-ooxml-check.py file.xlsx -> JSON with the sheets (name, state, part), every cell ([type, value, formula]), the zip parts with a sha256 and the
relationship targets, so a caller can prove which cells changed and that nothing else did."""
import hashlib, json, sys, zipfile
import xml.etree.ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

def text_of(node):
    out = []
    def walk(n):
        for child in n:
            if child.tag == M + "rPh": continue
            if child.tag == M + "t": out.append(child.text or "")
            else: walk(child)
    walk(node)
    return "".join(out)

def check(path):
    z = zipfile.ZipFile(path)
    bad = z.testzip()
    shared = [text_of(si) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si")] if "xl/sharedStrings.xml" in z.namelist() else []
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets, cells = [], {}
    for sheet in wb.iter(M + "sheet"):
        name, target = sheet.get("name"), rels[sheet.get(R + "id")]
        part = target.lstrip("/") if target.startswith("/") else "xl/" + target
        sheets.append({"name": name, "state": sheet.get("state", "visible"), "part": part})
        for c in ET.fromstring(z.read(part)).iter(M + "c"):
            t, v, f = c.get("t"), c.find(M + "v"), c.find(M + "f")
            if t == "s" and v is not None: value = shared[int(v.text)]
            elif t == "inlineStr":
                i = c.find(M + "is"); value = text_of(i) if i is not None else ""
            else: value = v.text if v is not None else None
            cells[f"{name}!{c.get('r')}"] = [t or "n", value, f.text if f is not None else None]
    parts = {n: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}
    return {"zipOk": bad is None, "sheets": sheets, "cells": cells, "parts": parts, "relationships": rels}

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(check(sys.argv[1]), ensure_ascii=False))
