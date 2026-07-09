#!/usr/bin/env python3
"""
Crunches the raw Match Charting Project CSVs down into small JSON files
for the "Why Roger Federer is better than Novak Djokovic" piece.

Run from anywhere; paths are resolved relative to this file.
"""
import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root (has the CSVs)
OUT = Path(__file__).resolve().parents[1] / "data"
OUT.mkdir(parents=True, exist_ok=True)

MATCHES_FILE = ROOT / "charting-m-matches.csv"
POINTS_FILES = [
    ROOT / "charting-m-points-to-2009.csv",
    ROOT / "charting-m-points-2010s.csv",
    ROOT / "charting-m-points-2020s.csv",
]

FEDERER = "Roger Federer"
DJOKOVIC = "Novak Djokovic"
PLAYERS = {FEDERER, DJOKOVIC}

SLAMS = {"Australian Open", "Roland Garros", "Wimbledon", "US Open"}

FEDERER_BIRTH_YEAR = 1981
DJOKOVIC_BIRTH_YEAR = 1987


def num(v, cast=int, default=0):
    if v is None or v == "":
        return default
    try:
        return cast(v)
    except ValueError:
        return default


def pct(n, d):
    return round(100 * n / d, 1) if d else None


def ratio(n, d):
    return round(n / d, 2) if d else None


def new_bucket():
    return defaultdict(int)


def add_row(bucket, row, fields):
    for f in fields:
        bucket[f] += num(row.get(f))


# ---------------------------------------------------------------------------
# 1. Load match metadata
# ---------------------------------------------------------------------------
print("Loading matches...")
match_info = {}
with open(MATCHES_FILE, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        mid = row["match_id"]
        match_info[mid] = {
            "p1": row["Player 1"], "p2": row["Player 2"],
            "date": row["Date"],
            "year": row["Date"][:4] if row["Date"] else None,
            "round": row["Round"],
            "surface": row["Surface"],
            "tournament": row["Tournament"],
        }


def matches_for(player):
    out = {}
    for mid, m in match_info.items():
        if m["p1"] == player:
            out[mid] = m["p2"]
        elif m["p2"] == player:
            out[mid] = m["p1"]
    return out


federer_matches = matches_for(FEDERER)
djokovic_matches = matches_for(DJOKOVIC)

h2h_ids = {mid for mid in federer_matches
           if match_info[mid]["p1"] in PLAYERS and match_info[mid]["p2"] in PLAYERS}

print(f"  Federer: {len(federer_matches)} matches, Djokovic: {len(djokovic_matches)}, "
      f"H2H: {len(h2h_ids)}")


def own_match(player, mid):
    if player == FEDERER:
        return mid in federer_matches
    if player == DJOKOVIC:
        return mid in djokovic_matches
    return False


SURFACES = ["Hard", "Grass", "Clay"]


def surface_of(mid):
    s = match_info[mid]["surface"]
    return s if s in SURFACES else None


def add_row_all_and_surface(bucket, mid, row, fields):
    add_row(bucket["All"], row, fields)
    s = surface_of(mid)
    if s:
        add_row(bucket[s], row, fields)


# ---------------------------------------------------------------------------
# 2. Overview.csv
# ---------------------------------------------------------------------------
print("Streaming Overview...")
OVERVIEW_FIELDS = ["serve_pts", "aces", "dfs", "first_in", "first_won", "second_in",
                    "second_won", "bk_pts", "bp_saved", "return_pts", "return_pts_won",
                    "winners", "winners_fh", "winners_bh", "unforced", "unforced_fh", "unforced_bh"]

by_year = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}
by_year_matches = {FEDERER: defaultdict(set), DJOKOVIC: defaultdict(set)}
style_overview = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}
style_match_counts = {FEDERER: defaultdict(set), DJOKOVIC: defaultdict(set)}
h2h_overview = {FEDERER: new_bucket(), DJOKOVIC: new_bucket()}
h2h_surface = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}
best_ace_match = {"aces": -1}
best_winner_ratio_match = {"ratio": -1}

with open(ROOT / "charting-m-stats-Overview.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["set"] != "Total":
            continue
        mid, player = row["match_id"], row["player"]
        if player not in PLAYERS or not own_match(player, mid):
            continue

        yr = match_info[mid]["year"]
        add_row(by_year[player][yr], row, OVERVIEW_FIELDS)
        by_year_matches[player][yr].add(mid)

        add_row_all_and_surface(style_overview[player], mid, row, OVERVIEW_FIELDS)
        style_match_counts[player]["All"].add(mid)
        s = surface_of(mid)
        if s:
            style_match_counts[player][s].add(mid)

        if mid in h2h_ids:
            add_row(h2h_overview[player], row, OVERVIEW_FIELDS)
            surf = match_info[mid]["surface"] or "Unknown"
            add_row(h2h_surface[player][surf], row, OVERVIEW_FIELDS)

        if player == FEDERER:
            aces = num(row.get("aces"))
            if aces > best_ace_match["aces"]:
                best_ace_match = {"aces": aces, "match_id": mid, **match_info[mid]}
            winners, unforced = num(row.get("winners")), num(row.get("unforced"))
            if unforced > 0 and (winners + unforced) >= 20:
                r = winners / unforced
                if r > best_winner_ratio_match["ratio"]:
                    best_winner_ratio_match = {"ratio": round(r, 2), "winners": winners,
                                                "unforced": unforced, "match_id": mid, **match_info[mid]}
print("  done.")

# ---------------------------------------------------------------------------
# 3. NetPoints.csv
# ---------------------------------------------------------------------------
print("Streaming NetPoints...")
NET_FIELDS = ["net_pts", "pts_won", "net_winner", "induced_forced", "net_unforced",
              "passed_at_net", "passing_shot_induced_forced", "total_shots"]
by_year_net = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}
style_net = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}

with open(ROOT / "charting-m-stats-NetPoints.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["row"] != "NetPoints":
            continue
        mid, player = row["match_id"], row["player"]
        if player not in PLAYERS or not own_match(player, mid):
            continue
        yr = match_info[mid]["year"]
        add_row(by_year_net[player][yr], row, NET_FIELDS)
        add_row_all_and_surface(style_net[player], mid, row, NET_FIELDS)
print("  done.")

# ---------------------------------------------------------------------------
# 4. ServeDirection.csv
# ---------------------------------------------------------------------------
print("Streaming ServeDirection...")
DIR_FIELDS = ["deuce_wide", "deuce_middle", "deuce_t", "ad_wide", "ad_middle", "ad_t"]
serve_dir = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}

with open(ROOT / "charting-m-stats-ServeDirection.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["row"] != "Total":
            continue
        mid, player = row["match_id"], row["player"]
        if player not in PLAYERS or not own_match(player, mid):
            continue
        add_row_all_and_surface(serve_dir[player], mid, row, DIR_FIELDS)
print("  done.")

# ---------------------------------------------------------------------------
# 5. ShotTypes.csv (slice usage)
# ---------------------------------------------------------------------------
print("Streaming ShotTypes...")
style_shots = {FEDERER: defaultdict(new_bucket), DJOKOVIC: defaultdict(new_bucket)}

with open(ROOT / "charting-m-stats-ShotTypes.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["row"] not in ("Total", "Sl"):
            continue
        mid, player = row["match_id"], row["player"]
        if player not in PLAYERS or not own_match(player, mid):
            continue
        key = "total_shots" if row["row"] == "Total" else "slice_shots"
        shots = num(row.get("shots"))
        style_shots[player]["All"][key] += shots
        s = surface_of(mid)
        if s:
            style_shots[player][s][key] += shots
print("  done.")

# ---------------------------------------------------------------------------
# 6. Rally.csv (rally length distribution)
# ---------------------------------------------------------------------------
print("Streaming Rally...")
BUCKETS = ["1-3", "4-6", "7-9", "10"]
style_rally = defaultdict(new_bucket)

with open(ROOT / "charting-m-stats-Rally.csv", newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        if row["row"] not in BUCKETS:
            continue
        mid = row["match_id"]
        pts = num(row.get("pts"))
        for player in (row["server"], row["returner"]):
            if player in PLAYERS and own_match(player, mid):
                style_rally[player][row["row"]] += pts
print("  done.")

# ---------------------------------------------------------------------------
# 7. Points files -> real match winners for the 47 H2H matches
# ---------------------------------------------------------------------------
print("Scanning points files for H2H match winners...")
best_pt = {}  # match_id -> (Pt, PtWinner)
for pf in POINTS_FILES:
    with open(pf, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mid = row["match_id"]
            if mid not in h2h_ids:
                continue
            pt = num(row.get("Pt"))
            if mid not in best_pt or pt > best_pt[mid][0]:
                best_pt[mid] = (pt, row.get("PtWinner"))
print(f"  resolved {len(best_pt)} / {len(h2h_ids)} H2H matches")

h2h_matches_out = []
federer_h2h_wins = 0
djokovic_h2h_wins = 0
for mid in sorted(h2h_ids, key=lambda m: match_info[m]["date"]):
    m = match_info[mid]
    winner = None
    if mid in best_pt:
        _, pt_winner = best_pt[mid]
        if pt_winner == "1":
            winner = m["p1"]
        elif pt_winner == "2":
            winner = m["p2"]
    if winner == FEDERER:
        federer_h2h_wins += 1
    elif winner == DJOKOVIC:
        djokovic_h2h_wins += 1
    h2h_matches_out.append({
        "match_id": mid, "date": m["date"], "tournament": m["tournament"],
        "round": m["round"], "surface": m["surface"], "winner": winner,
        "is_slam_final": m["tournament"] in SLAMS and m["round"] == "F",
        "is_slam": m["tournament"] in SLAMS,
    })

print(f"  Charted H2H record: Federer {federer_h2h_wins} - {djokovic_h2h_wins} Djokovic "
      f"({len(h2h_ids) - federer_h2h_wins - djokovic_h2h_wins} unresolved)")

# ---------------------------------------------------------------------------
# Build output JSON
# ---------------------------------------------------------------------------

def year_series(player, birth_year):
    out = []
    for yr in sorted(by_year[player].keys()):
        o = by_year[player][yr]
        n = by_year_net[player][yr]
        out.append({
            "year": int(yr),
            "age": int(yr) - birth_year,
            "matches": len(by_year_matches[player][yr]),
            "ace_rate_pct": pct(o["aces"], o["serve_pts"]),
            "first_serve_win_pct": pct(o["first_won"], o["first_in"]),
            "second_serve_win_pct": pct(o["second_won"], o["second_in"]),
            "first_serve_in_pct": pct(o["first_in"], o["serve_pts"]),
            "return_pts_won_pct": pct(o["return_pts_won"], o["return_pts"]),
            "winners": o["winners"],
            "unforced": o["unforced"],
            "winner_ufe_ratio": ratio(o["winners"], o["unforced"]),
            "bp_saved_pct": pct(o["bp_saved"], o["bk_pts"]),
            "net_pts": n["net_pts"],
            "net_win_pct": pct(n["pts_won"], n["net_pts"]),
            "net_freq_pct": pct(n["net_pts"], o["serve_pts"] + o["return_pts"]),
        })
    return out


(OUT / "federer_by_year.json").write_text(json.dumps(year_series(FEDERER, FEDERER_BIRTH_YEAR), indent=2))
(OUT / "djokovic_by_year.json").write_text(json.dumps(year_series(DJOKOVIC, DJOKOVIC_BIRTH_YEAR), indent=2))

SURFACE_KEYS = ["All"] + SURFACES
r_all = style_rally  # {player: {bucket: pts}} — not surface-split

fingerprint = {}
for player in PLAYERS:
    fingerprint[player] = {}
    total_rally_pts = sum(r_all[player].values())
    for surf in SURFACE_KEYS:
        o = style_overview[player][surf]
        n = style_net[player][surf]
        s = style_shots[player][surf]
        entry = {
            "matches": len(style_match_counts[player][surf]),
            "ace_rate_pct": pct(o["aces"], o["serve_pts"]),
            "df_rate_pct": pct(o["dfs"], o["serve_pts"]),
            "first_serve_in_pct": pct(o["first_in"], o["serve_pts"]),
            "first_serve_win_pct": pct(o["first_won"], o["first_in"]),
            "second_serve_win_pct": pct(o["second_won"], o["second_in"]),
            "return_pts_won_pct": pct(o["return_pts_won"], o["return_pts"]),
            "winner_rate_pct": pct(o["winners"], o["serve_pts"] + o["return_pts"]),
            "ufe_rate_pct": pct(o["unforced"], o["serve_pts"] + o["return_pts"]),
            "winner_ufe_ratio": ratio(o["winners"], o["unforced"]),
            "fh_bh_winner_ratio": ratio(o["winners_fh"], o["winners_bh"]),
            "net_freq_pct": pct(n["net_pts"], o["serve_pts"] + o["return_pts"]),
            "net_win_pct": pct(n["pts_won"], n["net_pts"]),
            "slice_pct": pct(s["slice_shots"], s["total_shots"]),
        }
        if surf == "All":
            entry["rally_dist_pct"] = {b: pct(r_all[player][b], total_rally_pts) for b in BUCKETS}
        fingerprint[player][surf] = entry
(OUT / "style_fingerprint.json").write_text(json.dumps(fingerprint, indent=2))

placement = {}
for player in PLAYERS:
    placement[player] = {}
    for surf in SURFACE_KEYS:
        d = serve_dir[player][surf]
        total = sum(d[f] for f in DIR_FIELDS)
        placement[player][surf] = {
            "counts": {f: d[f] for f in DIR_FIELDS},
            "pct": {f: pct(d[f], total) for f in DIR_FIELDS},
            "total": total,
        }
(OUT / "serve_placement.json").write_text(json.dumps(placement, indent=2))


def h2h_player_block(player):
    o = h2h_overview[player]
    surfaces = {}
    for surf, fields in h2h_surface[player].items():
        surfaces[surf] = {
            "first_serve_win_pct": pct(fields["first_won"], fields["first_in"]),
            "return_pts_won_pct": pct(fields["return_pts_won"], fields["return_pts"]),
        }
    return {
        "first_serve_win_pct": pct(o["first_won"], o["first_in"]),
        "second_serve_win_pct": pct(o["second_won"], o["second_in"]),
        "return_pts_won_pct": pct(o["return_pts_won"], o["return_pts"]),
        "winner_ufe_ratio": ratio(o["winners"], o["unforced"]),
        "bp_saved_pct": pct(o["bp_saved"], o["bk_pts"]),
        "surfaces": surfaces,
    }


slam_final_meetings = [m for m in h2h_matches_out if m["is_slam_final"]]
federer_slam_final_wins = sum(1 for m in slam_final_meetings if m["winner"] == FEDERER)
djokovic_slam_final_wins = sum(1 for m in slam_final_meetings if m["winner"] == DJOKOVIC)

h2h_out = {
    "meetings": len(h2h_ids),
    "federer_wins": federer_h2h_wins,
    "djokovic_wins": djokovic_h2h_wins,
    "unresolved": len(h2h_ids) - federer_h2h_wins - djokovic_h2h_wins,
    "slam_final_meetings": len(slam_final_meetings),
    "federer_slam_final_wins": federer_slam_final_wins,
    "djokovic_slam_final_wins": djokovic_slam_final_wins,
    "matches": h2h_matches_out,
    "federer": h2h_player_block(FEDERER),
    "djokovic": h2h_player_block(DJOKOVIC),
}
(OUT / "h2h.json").write_text(json.dumps(h2h_out, indent=2))

callouts = {
    "best_ace_match": best_ace_match,
    "best_winner_ratio_match": best_winner_ratio_match,
    "federer_total_matches_charted": len(federer_matches),
    "federer_years_span": [min(int(y) for y in by_year[FEDERER]), max(int(y) for y in by_year[FEDERER])],
    "djokovic_total_matches_charted": len(djokovic_matches),
    "djokovic_years_span": [min(int(y) for y in by_year[DJOKOVIC]), max(int(y) for y in by_year[DJOKOVIC])],
}
# best single-match ace count for Federer, kept from Overview scan below
(OUT / "callouts.json").write_text(json.dumps(callouts, indent=2, default=str))

print("\nAll JSON written to", OUT)
for p in sorted(OUT.glob("*.json")):
    print(" -", p.name, f"({p.stat().st_size} bytes)")
