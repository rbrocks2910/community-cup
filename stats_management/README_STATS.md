# Community Cup - Complete Stats Management System

This directory houses the data architecture, offline reporting scripts, and schema for the **Community Cup (Season 2)** tournament.

## What is Tracked

1. **Match-by-Match Events**:
   - ⚽ **Goals**: Player attributed, minute, and optional assist player.
   - 👟 **Assists**: Key pass contributing directly to a goal.
   - ⚠️ **Own Goals**: Scored against one's own team (automatically awards +1 score to the opponent).
   - 🧤 **Goalkeeper Saves**: Total saves made by goalkeepers to preserve scorelines.
   - 🟨 **Yellow Cards**: Cautionary disciplinary bookings with match minute.
   - 🟥 **Red Cards**: Expulsions with match minute.

2. **Automatic Points Table (Standings) Calculations**:
   - Points system: **Win = 3 pts**, **Draw = 1 pt**, **Loss = 0 pts**.
   - Automatic calculation of **GF** (Goals For), **GA** (Goals Against), and **GD** (Goal Difference).
   - Tie-breakers: Points -> Goal Difference -> Goals For -> Head-to-Head.
   - Top team in each group is automatically qualified for the **Semifinals**.
   - 2nd and 3rd placed teams are automatically placed into the **Playoff Qualifiers**.

3. **Knockout Bracket Auto-Seeding**:
   - **Playoff Qualifier 1**: 2nd Group A vs 3rd Group B
   - **Playoff Qualifier 2**: 2nd Group B vs 3rd Group A
   - **Semi-Final 1**: 1st Group A vs Winner Qualifier 2
   - **Semi-Final 2**: 1st Group B vs Winner Qualifier 1
   - **3rd Place Playoff**: Loser SF1 vs Loser SF2
   - **Grand Final**: Winner SF1 vs Winner SF2

4. **Leaderboards**:
   - **Golden Boot**: Most individual goals scored.
   - **Top Playmaker**: Most assists provided.
   - **Golden Glove**: Most goalkeeper saves + clean sheets.
   - **Discipline Table**: Fewest yellow/red card infractions.
