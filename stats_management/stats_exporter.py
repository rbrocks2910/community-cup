"""
stats_exporter.py - Community Cup Stats Management & Reporting CLI Tool
Run this script to inspect tournament stats, print leaderboards, or export summaries.
"""

import os
import json
import sys

def load_data(file_path):
    if not os.path.exists(file_path):
        print(f"Error: Data file not found at {file_path}")
        return None
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def print_summary(data):
    tournament = data.get("tournament", {})
    teams = data.get("teams", [])
    matches = data.get("matches", [])

    print("=" * 70)
    print(f"  {tournament.get('name', 'Community Cup').upper()} - {tournament.get('subTitle', '')}")
    print(f"  Venue: {tournament.get('venue')}")
    print(f"  Date:  {tournament.get('date')} ({tournament.get('startTime')})")
    print("=" * 70)

    # Teams
    print("\n[PARTICIPATING TEAMS]")
    for t in teams:
        print(f"  * Group {t.get('group')}: {t.get('name')} ({len(t.get('players', []))} players)")

    # Matches
    print("\n[MATCH RESULTS & SCHEDULE]")
    for m in matches:
        t1 = m.get('team1Id') or m.get('team1Placeholder', 'TBD')
        t2 = m.get('team2Id') or m.get('team2Placeholder', 'TBD')
        status = m.get('status', 'scheduled').upper()
        score = f"{m.get('team1Score', 0)} - {m.get('team2Score', 0)}" if status != 'SCHEDULED' else "VS"
        print(f"  Match #{m.get('matchNumber'):02d} [{m.get('time')}] {t1:18s} {score:^7s} {t2:18s} | {status}")
        
        ref = m.get('referee', '')
        desk = m.get('statsKeeper', '')
        streamer = m.get('streamer', 'Paavan')
        if ref or desk or streamer:
            print(f"      * Ref: {ref:10s} | Stats: {desk:18s} | Streamer: {streamer}")

        events = m.get('events', [])
        for ev in events:
            ev_type = ev.get('type')
            min_str = f"{ev.get('minute')}'"
            print(f"      └─ [{min_str:4s}] {ev_type.upper()}: Player ID {ev.get('playerId')} (Team: {ev.get('teamId')})")

    print("\n" + "=" * 70)

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    backup_file = os.path.join(current_dir, "tournament_data.json")
    
    if len(sys.argv) > 1:
        backup_file = sys.argv[1]
    
    if os.path.exists(backup_file):
        data = load_data(backup_file)
        print_summary(data)
    else:
        print("Community Cup Stats Tool ready.")
        print("To inspect a downloaded JSON backup, run:")
        print("  python stats_exporter.py <path_to_backup.json>")
