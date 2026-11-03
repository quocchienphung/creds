"""One-time dataset build step (never runs inside the app): pull the NAMES of roads, places and named features out of an OpenStreetMap PBF extract.

    python scripts/geo/osm_extract.py data/vn-geo/raw/vietnam.osm.pbf data/vn-geo/staging/osm-names.ndjson

Needs `pip install osmium` (pyosmium). Output: one JSON object per distinct (name, kind): {"n": name, "k": kind, "c": number of OSM objects}.
Only names are kept (no coordinates, no ids, no tags other than the kind): enough to learn which names exist, small enough to ship.
Data (c) OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright
"""
import json
import sys
from collections import Counter

import osmium

ADDR_KEYS = ("addr:street", "addr:suburb", "addr:district", "addr:city", "addr:province", "addr:subdistrict", "addr:hamlet", "addr:quarter")
FEATURE_KEYS = ("amenity", "shop", "tourism", "leisure", "office", "building", "man_made", "public_transport", "railway", "waterway", "natural")


def kinds(tags):
    """The kinds an object's own name stands for, from its tags. Only describes what OSM says; nothing is inferred."""
    out = []
    if "highway" in tags:
        out.append("road:" + tags["highway"])
    if "place" in tags:
        out.append("place:" + tags["place"])
    if tags.get("boundary") == "administrative":
        out.append("admin:" + tags.get("admin_level", "?"))
    if "landuse" in tags:
        out.append("landuse:" + tags["landuse"])
    for key in FEATURE_KEYS:
        if key in tags and tags[key] not in ("yes", "no"):
            out.append(key + ":" + tags[key])
            break
    else:
        if "name" in tags and any(k in tags for k in FEATURE_KEYS):
            out.append("feature")
    return out


class Names(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.count = Counter()

    def add(self, tags):
        name = tags.get("name")
        if name:
            for kind in kinds(tags) or []:
                self.count[(name.strip(), kind)] += 1
        for key in ADDR_KEYS:
            value = tags.get(key)
            if value:
                self.count[(value.strip(), "addr:" + key[5:])] += 1

    def node(self, n):
        if n.tags:
            self.add(n.tags)

    def way(self, w):
        if w.tags:
            self.add(w.tags)

    def relation(self, r):
        if r.tags:
            self.add(r.tags)


def main():
    source, target = sys.argv[1], sys.argv[2]
    handler = Names()
    handler.apply_file(source)
    with open(target, "w", encoding="utf-8") as out:
        for (name, kind), count in sorted(handler.count.items()):
            out.write(json.dumps({"n": name, "k": kind, "c": count}, ensure_ascii=False) + "\n")
    print("distinct (name, kind):", len(handler.count))


if __name__ == "__main__":
    main()
