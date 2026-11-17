"""
build_data.py
Upazila-level GeoJSON (544 ta) theke 8 ta bibhag ar 64 ta jela-r sima toiri kore.

Chalate:  pip install shapely   &&   python build_data.py
Output :  public/data/divisions.geojson, public/data/districts.geojson

Note: Raw data-te 118 ta upazila-r bibhag/jela tag nei (jemon Dhaka metro thana).
Ei script segulo-ke tader protibeshi (shared boundary) dekhe bibhag/jela-e boshay.
"""
import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

GAP = 0.004      # upazila-r majhe chhoto fak bondho korar jonno (degree)
SIMPLIFY = 0.004 # sima halka kora (file chhoto, 3D fast)


def rnd(obj, nd=4):
    """Coordinate-gulo round kore file size komay."""
    if isinstance(obj, (list, tuple)):
        return [rnd(x, nd) for x in obj]
    if isinstance(obj, float):
        return round(obj, nd)
    return obj


def load():
    gj = json.loads((RAW / "bd-upazilas.geojson").read_text(encoding="utf-8"))
    divs = json.loads((RAW / "bd-divisions.json").read_text(encoding="utf-8"))["divisions"]
    dists = json.loads((RAW / "bd-districts.json").read_text(encoding="utf-8"))["districts"]
    return gj["features"], {d["id"]: d for d in divs}, {d["id"]: d for d in dists}


def reset_name_collisions(items, max_dist=0.6):
    """Raw data-te same-nam upazila (Mirpur, Sreepur, Companiganj...) bhul jela-te match hoye jay.
    Jar centroid nijer jela-r median theke onek dure, take 'tag chhara' hishebe dhori."""
    from statistics import median
    by_dist = {}
    for it in items:
        if it["div"]:
            by_dist.setdefault(it["dist"], []).append(it)
    n = 0
    for lst in by_dist.values():
        mx = median(i["geom"].centroid.x for i in lst)
        my = median(i["geom"].centroid.y for i in lst)
        for it in lst:
            c = it["geom"].centroid
            if ((c.x - mx) ** 2 + (c.y - my) ** 2) ** 0.5 > max_dist:
                it["div"], it["dist"], it["orig"], it["bn"] = "", "", False, ""
                n += 1
    print(f"Nam-er golmal (bhul match) thik kora hoyeche: {n}")


def assign_missing(items):
    """Tag-chhara upazila-ke protibeshir majority-te boshay (boro shared sima = beshi vote)."""
    pending = [it for it in items if not it["div"]]
    print(f"Tag chhara upazila: {len(pending)}")
    guard = 0
    while pending and guard < 30:
        guard += 1
        progressed = []
        for it in pending:
            zone = it["geom"].buffer(0.004)
            votes_div, votes_dist = {}, {}
            for other in items:
                if other is it or not other["div"]:
                    continue
                if not zone.intersects(other["geom"]):
                    continue
                w = zone.intersection(other["geom"]).area
                votes_div[other["div"]] = votes_div.get(other["div"], 0) + w
                votes_dist[other["dist"]] = votes_dist.get(other["dist"], 0) + w
            if votes_div:
                it["div"] = max(votes_div, key=votes_div.get)
                # jela: shudhu oi bibhager protibeshi theke
                cand = {k: v for k, v in votes_dist.items()
                        if any(o["dist"] == k and o["div"] == it["div"] for o in items)}
                it["dist"] = max(cand, key=cand.get) if cand else max(votes_dist, key=votes_dist.get)
                progressed.append(it)
        pending = [it for it in pending if it not in progressed]
        if not progressed:
            break
    # ja ekhono baki: sobcheye kachher centroid
    for it in pending:
        c = it["geom"].centroid
        best = min((o for o in items if o["div"]), key=lambda o: c.distance(o["geom"].centroid))
        it["div"], it["dist"] = best["div"], best["dist"]
    print("Sob upazila-r bibhag/jela thik hoyeche.")


def apply_overrides(items, divisions, districts):
    """Neighbor-vote-e jegulo bhul hoy segulo thik kori (Dhaka shohorer thana, Kabirhat)."""
    def find(did_name, name):
        for k, d in districts.items():
            if d["name"] == name and divisions[d["division_id"]]["name"] == did_name:
                return d["division_id"], k
        raise KeyError(name)
    dhaka = find("Dhaka", "Dhaka")
    noakhali = find("Chattogram", "Noakhali")
    for it in items:
        if it["orig"]:
            continue
        c = it["geom"].centroid
        if 90.28 <= c.x <= 90.52 and 23.66 <= c.y <= 23.93:   # Dhaka metro thana
            it["div"], it["dist"] = dhaka
        elif it["name"] == "Kabirhat":
            it["div"], it["dist"] = noakhali


def build_upazilas(items, divisions, districts):
    """Upazila-level GeoJSON + dak-code (postcode) lookup -> live map-er jonno."""
    import difflib
    ulist = json.loads((RAW / "bd-upazila-list.json").read_text(encoding="utf-8"))["upazilas"]
    by_dist = {}
    for u in ulist:
        by_dist.setdefault(u["district_id"], {})[u["name"].lower()] = u["bn_name"]
    feats = []
    for n, it in enumerate(items):
        dd = districts.get(it["dist"], {})
        bn_name = it["bn"]
        if not bn_name:
            pool = by_dist.get(it["dist"], {})
            m = difflib.get_close_matches(it["name"].lower(), list(pool), n=1, cutoff=0.78)
            bn_name = pool[m[0]] if m else ""
        g = it["geom"].simplify(0.002, preserve_topology=True)
        c = g.representative_point()
        feats.append({"type": "Feature", "properties": {
            "id": n, "name_en": it["name"], "name_bn": bn_name,
            "division_id": it["div"], "district_id": it["dist"],
            "district_bn": dd.get("bn_name", ""), "district_en": dd.get("name", ""),
            "cx": round(c.x, 4), "cy": round(c.y, 4)},
            "geometry": rnd(mapping(g))})
    (OUT / "upazilas.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), encoding="utf-8")
    pc = json.loads((RAW / "bd-postcodes.json").read_text(encoding="utf-8"))["postcodes"]
    by_d = {}
    for r in pc:
        by_d.setdefault(r["district_id"], {}).setdefault(r["upazila"].lower(), []).append([r["postOffice"], r["postCode"]])
    lookup = {}
    for f in feats:
        pr = f["properties"]
        pool = by_d.get(pr["district_id"], {})
        m = difflib.get_close_matches(pr["name_en"].lower(), list(pool), n=1, cutoff=0.72)
        if m:
            lookup[str(pr["id"])] = pool[m[0]]
    (OUT / "postcodes.json").write_text(json.dumps(lookup, ensure_ascii=False), encoding="utf-8")
    nb = sum(1 for f in feats if f["properties"]["name_bn"])
    print(f"Upazila: {len(feats)} (Bangla nam ache: {nb})  Postcode key: {len(lookup)}")


def dissolve(geoms, gap=GAP):
    merged = unary_union(geoms)
    merged = merged.buffer(gap).buffer(-gap)
    return merged.simplify(SIMPLIFY, preserve_topology=True)


def main():
    feats, divisions, districts = load()
    items = []
    for f in feats:
        p = f["properties"]
        items.append({"geom": shape(f["geometry"]).buffer(0),
                      "div": p.get("division_id") or "", "dist": p.get("district_id") or "",
                      "name": p.get("name", ""), "bn": p.get("bn_name") or "", "orig": bool(p.get("division_id"))})
    reset_name_collisions(items)
    assign_missing(items)
    apply_overrides(items, divisions, districts)

    # Bibhag
    div_feats = []
    for did, d in divisions.items():
        g = dissolve([i["geom"] for i in items if i["div"] == did])
        c = g.representative_point()
        n_dist = sum(1 for x in districts.values() if x["division_id"] == did)
        div_feats.append({"type": "Feature",
                          "properties": {"id": did, "name_en": d["name"], "name_bn": d["bn_name"],
                                         "districts": n_dist, "cx": round(c.x, 4), "cy": round(c.y, 4)},
                          "geometry": rnd(mapping(g))})
    (OUT / "divisions.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": div_feats}, ensure_ascii=False), encoding="utf-8")

    # Jela
    dist_feats = []
    for kid, d in districts.items():
        geoms = [i["geom"] for i in items if i["dist"] == kid]
        if not geoms:
            continue
        g = dissolve(geoms, gap=0.002)
        c = g.representative_point()
        dist_feats.append({"type": "Feature",
                           "properties": {"id": kid, "division_id": d["division_id"],
                                          "name_en": d["name"], "name_bn": d["bn_name"],
                                          "cx": round(c.x, 4), "cy": round(c.y, 4)},
                           "geometry": rnd(mapping(g))})
    (OUT / "districts.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": dist_feats}, ensure_ascii=False), encoding="utf-8")

    build_upazilas(items, divisions, districts)
    print(f"Bibhag: {len(div_feats)}  Jela: {len(dist_feats)}")
    for fn in ("divisions.geojson", "districts.geojson"):
        print(fn, (OUT / fn).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
