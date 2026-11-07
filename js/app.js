// app.js - Community Cup Tournament Management Engine (Cloud-Synced & Mobile-First)

const CLOUD_READ_URL = 'https://j.jstash.app/UhlcxaxaXZVESq2hfZOvrA';
const CLOUD_WRITE_URL = 'https://api.jstash.app/v1/bins/UhlcxaxaXZVESq2hfZOvrA';
const CLOUD_TOKEN = 'Bearer js_edit_8C0B03R8bhxRXoH5uly_-ggmPOF1gdUwZlVoylWTGsg';
const STORAGE_KEY = 'COMMUNITY_CUP_2026_CLOUD';

let tournamentData = null;
let currentTab = 'overview';
let selectedTeamId = 'inter_babuganj';
let activeMatchId = null;
let matchFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initLocalData();
  initNavigation();
  initSettings();
  recalculateAll(false);
  renderAll();

  // Instant Cloud Fetch on load
  fetchCloudData(false);

  // Background Cloud Sync Poll (every 4 seconds)
  setInterval(() => fetchCloudData(false), 4000);

  // Also fetch immediately when user returns to tab/screen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchCloudData(false);
    }
  });
});

// -------------------------------------------------------------
// DATA MANAGEMENT & CLOUD SYNC
// -------------------------------------------------------------
function initLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      tournamentData = JSON.parse(raw);
    } else {
      tournamentData = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
      tournamentData.updatedAt = Date.now();
      saveLocalDataOnly();
    }
  } catch (e) {
    tournamentData = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
    tournamentData.updatedAt = Date.now();
    saveLocalDataOnly();
  }
}

function saveLocalDataOnly() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tournamentData));
  } catch (e) {
    console.error("Local save error:", e);
  }
}

async function fetchCloudData(showFeedback = false) {
  try {
    setCloudStatus('syncing', 'Syncing...');
    // Cache buster ensures phone and laptop always fetch fresh data
    const res = await fetch(`${CLOUD_READ_URL}?_t=${Date.now()}`, {
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('Cloud fetch failed');
    const cloudData = await res.json();

    if (cloudData && cloudData.teams && cloudData.matches) {
      const localUpdated = tournamentData ? (tournamentData.updatedAt || 0) : 0;
      const remoteUpdated = cloudData.updatedAt || 0;

      // Update if remote is newer or equal, or if explicitly requested
      if (remoteUpdated > localUpdated || showFeedback || !localUpdated) {
        tournamentData = cloudData;
        saveLocalDataOnly();
        recalculateAll(false);
        renderAll();
        if (activeMatchId) renderLoggerContent();
      }
      setCloudStatus('synced', 'Cloud Live');
      if (showFeedback) showToast('Live cloud data updated!');
    }
  } catch (err) {
    console.warn('Cloud poll notice:', err.message);
    setCloudStatus('synced', 'Cloud Live');
  }
}

async function pushCloudData() {
  if (!tournamentData) return;
  tournamentData.updatedAt = Date.now();
  saveLocalDataOnly();

  try {
    setCloudStatus('syncing', 'Saving...');
    const res = await fetch(CLOUD_WRITE_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': CLOUD_TOKEN,
        'User-Agent': 'CommunityCupApp/1.0'
      },
      body: JSON.stringify(tournamentData)
    });
    if (res.ok) {
      setCloudStatus('synced', 'Cloud Live');
    } else {
      setCloudStatus('error', 'Sync Delay');
    }
  } catch (e) {
    console.warn('Cloud push offline:', e);
    setCloudStatus('error', 'Offline');
  }
}

function setCloudStatus(state, text) {
  const dot = document.getElementById('cloud-dot');
  const txt = document.getElementById('cloud-status-text');
  if (dot) {
    dot.className = 'cloud-dot ' + (state === 'syncing' ? 'syncing' : (state === 'error' ? 'error' : ''));
  }
  if (txt) {
    txt.textContent = text;
  }
}

// -------------------------------------------------------------
// NAVIGATION
// -------------------------------------------------------------
function initNavigation() {
  const allNavBtns = document.querySelectorAll('.nav-link, .mobile-tab-btn');
  allNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      switchTab(target);
    });
  });

  const overlay = document.getElementById('logger-drawer-overlay');
  if (overlay) overlay.addEventListener('click', closeLoggerModal);
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-link').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.mobile-tab-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(p => {
    p.classList.toggle('active', p.id === `tab-${tabId}`);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Helper: Get Team & Player
function getTeam(id) {
  if (!id || !tournamentData || !tournamentData.teams) return null;
  return tournamentData.teams.find(t => t.id === id) || null;
}

function getPlayer(teamId, playerId) {
  const team = getTeam(teamId);
  if (!team || !team.players) return null;
  return team.players.find(p => p.id === playerId) || null;
}

// -------------------------------------------------------------
// STANDINGS, SCORES & KNOCKOUT PROGRESSION ENGINE
// -------------------------------------------------------------
let standingsA = [];
let standingsB = [];

function recalculateAll(shouldPush = true) {
  recalculateMatchScores();
  standingsA = computeGroupTable('A');
  standingsB = computeGroupTable('B');
  recalculateKnockouts();

  if (shouldPush) {
    pushCloudData();
  } else {
    saveLocalDataOnly();
  }
}

function recalculateMatchScores() {
  if (!tournamentData || !tournamentData.matches) return;
  tournamentData.matches.forEach(m => {
    let s1 = 0;
    let s2 = 0;
    if (m.events && m.events.length > 0) {
      m.events.forEach(ev => {
        if (ev.type === 'goal') {
          if (ev.teamId === m.team1Id) s1++;
          if (ev.teamId === m.team2Id) s2++;
        } else if (ev.type === 'own_goal') {
          if (ev.teamId === m.team1Id) s2++;
          if (ev.teamId === m.team2Id) s1++;
        }
      });
    }
    // ALWAYS reset and re-apply scores (fixes the undo bug!)
    m.team1Score = s1;
    m.team2Score = s2;

    // If all events are cleared and match was marked live, revert back to scheduled
    if ((!m.events || m.events.length === 0) && m.status === 'live' && s1 === 0 && s2 === 0) {
      m.status = 'scheduled';
    }
  });
}

function computeGroupTable(groupName) {
  if (!tournamentData || !tournamentData.teams) return [];
  const teams = tournamentData.teams.filter(t => t.group === groupName);
  const rows = teams.map(t => ({
    teamId: t.id,
    teamName: t.name,
    logo: t.logo,
    shortName: t.shortName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  }));

  const map = {};
  rows.forEach(r => map[r.teamId] = r);

  const groupMatches = tournamentData.matches.filter(m => m.stage === 'group' && m.group === groupName);
  groupMatches.forEach(m => {
    // Counted in live/final standings if finished OR currently live with events
    const isCountable = m.status === 'finished' || (m.status === 'live' && (m.team1Score > 0 || m.team2Score > 0 || (m.events && m.events.length > 0)));
    if (isCountable) {
      const t1 = map[m.team1Id];
      const t2 = map[m.team2Id];
      if (t1 && t2) {
        t1.played++;
        t2.played++;
        t1.goalsFor += m.team1Score;
        t1.goalsAgainst += m.team2Score;
        t2.goalsFor += m.team2Score;
        t2.goalsAgainst += m.team1Score;

        if (m.team1Score > m.team2Score) {
          t1.won++;
          t1.points += 3;
          t2.lost++;
        } else if (m.team2Score > m.team1Score) {
          t2.won++;
          t2.points += 3;
          t1.lost++;
        } else {
          t1.drawn++;
          t1.points += 1;
          t2.drawn++;
          t2.points += 1;
        }
      }
    }
  });

  // Calculate Goal Difference
  rows.forEach(r => r.goalDifference = r.goalsFor - r.goalsAgainst);

  // Official Tie-breaker sorting: Points -> GD -> Goals For -> Alphabetical
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}

function getStreamer(m) {
  if (!m) return "Paavan";
  const t1 = m.team1Id;
  const t2 = m.team2Id;

  // Paavan is on Babuganj United
  const paavanPlaying = (t1 === 'babuganj_united' || t2 === 'babuganj_united');
  // Parth is on Soviet Union FC
  const parthPlaying = (t1 === 'soviet_union' || t2 === 'soviet_union');

  if (!paavanPlaying) {
    return "Paavan";
  }
  if (!parthPlaying) {
    return "Parth";
  }
  // Both Paavan and Parth are playing
  return "Ishaan";
}

function recalculateKnockouts() {
  if (!tournamentData || !tournamentData.matches) return;
  const matchMap = {};
  tournamentData.matches.forEach(m => matchMap[m.id] = m);

  const groupAMatches = tournamentData.matches.filter(m => m.stage === 'group' && m.group === 'A');
  const groupBMatches = tournamentData.matches.filter(m => m.stage === 'group' && m.group === 'B');

  const gAPlayed = groupAMatches.filter(m => m.status === 'finished').length;
  const gBPlayed = groupBMatches.filter(m => m.status === 'finished').length;

  const groupACompleted = gAPlayed >= 3;
  const groupBCompleted = gBPlayed >= 3;

  function getWinnerAndLoser(m) {
    if (!m || m.status !== 'finished' || !m.team1Id || !m.team2Id) {
      return { winnerId: null, loserId: null };
    }
    if (m.team1Score > m.team2Score) return { winnerId: m.team1Id, loserId: m.team2Id };
    if (m.team2Score > m.team1Score) return { winnerId: m.team2Id, loserId: m.team1Id };
    if (m.penalties) {
      if (m.penalties.team1 > m.penalties.team2) return { winnerId: m.team1Id, loserId: m.team2Id };
      if (m.penalties.team2 > m.penalties.team1) return { winnerId: m.team2Id, loserId: m.team1Id };
    }
    return { winnerId: m.team1Id, loserId: m.team2Id };
  }

  // M7: Qualifier 1 (2nd Group A vs 3rd Group B)
  const m7 = matchMap['M7'];
  if (m7) {
    m7.team1Id = groupACompleted && standingsA.length >= 2 ? standingsA[1].teamId : null;
    m7.team2Id = groupBCompleted && standingsB.length >= 3 ? standingsB[2].teamId : null;
  }

  // M8: Qualifier 2 (2nd Group B vs 3rd Group A)
  const m8 = matchMap['M8'];
  if (m8) {
    m8.team1Id = groupBCompleted && standingsB.length >= 2 ? standingsB[1].teamId : null;
    m8.team2Id = groupACompleted && standingsA.length >= 3 ? standingsA[2].teamId : null;
  }

  // M9: Semifinal 1 (1st Group A vs Winner M8)
  const m9 = matchMap['M9'];
  if (m9) {
    m9.team1Id = groupACompleted && standingsA.length >= 1 ? standingsA[0].teamId : null;
    m9.team2Id = getWinnerAndLoser(m8).winnerId;
  }

  // M10: Semifinal 2 (1st Group B vs Winner M7)
  const m10 = matchMap['M10'];
  if (m10) {
    m10.team1Id = groupBCompleted && standingsB.length >= 1 ? standingsB[0].teamId : null;
    m10.team2Id = getWinnerAndLoser(m7).winnerId;
  }

  // M11: 3rd Place Match (Loser M9 vs Loser M10)
  const m11 = matchMap['M11'];
  if (m11) {
    m11.team1Id = getWinnerAndLoser(m9).loserId;
    m11.team2Id = getWinnerAndLoser(m10).loserId;
  }

  // M12: Grand Final (Winner M9 vs Winner M10)
  const m12 = matchMap['M12'];
  if (m12) {
    m12.team1Id = getWinnerAndLoser(m9).winnerId;
    m12.team2Id = getWinnerAndLoser(m10).winnerId;
  }

  // Update dynamic streamers for all matches
  tournamentData.matches.forEach(m => {
    m.streamer = getStreamer(m);
  });
}

// -------------------------------------------------------------
// RENDER VIEWS
// -------------------------------------------------------------
function renderAll() {
  renderOverview();
  renderMatches();
  renderStandings();
  renderBracket();
  renderSquads();
  renderLeaderboards();
}

// 1. OVERVIEW
function renderOverview() {
  if (!tournamentData) return;

  // Clubs Strip
  const strip = document.getElementById('clubs-strip-container');
  if (strip && tournamentData.teams) {
    strip.innerHTML = tournamentData.teams.map(t => `
      <div class="club-pill" onclick="switchTab('squads'); selectTeam('${t.id}')">
        <img src="${t.logo}" onerror="this.src='images/tournament_logo.jpg'"/>
        <div>
          <div class="club-pill-name">${t.name}</div>
          <div class="club-pill-group">Group ${t.group} • ${t.players.length} Players</div>
        </div>
      </div>
    `).join('');
  }

  // Spotlight Next Match
  const spotEl = document.getElementById('overview-spotlight-match');
  if (spotEl && tournamentData.matches) {
    const nextM = tournamentData.matches.find(m => m.status === 'live') ||
                  tournamentData.matches.find(m => m.status === 'scheduled') ||
                  tournamentData.matches[0];
    const t1 = getTeam(nextM.team1Id);
    const t2 = getTeam(nextM.team2Id);
    spotEl.innerHTML = `
      <div class="match-card-top">
        <span class="match-stage-tag">${nextM.stageLabel} • Match #${nextM.matchNumber}</span>
        <span class="match-time-tag">⏰ ${nextM.time} (${nextM.duration})</span>
      </div>
      <div class="match-teams-box">
        <div class="team-side">
          ${t1 ? `<img src="${t1.logo}" onerror="this.src='images/tournament_logo.jpg'"/>` : `<div class="team-placeholder-circle">${nextM.seedCode1 || 'TBD'}</div>`}
          <div class="${t1 ? 'team-side-name' : 'team-side-placeholder'}">${t1 ? t1.name : (nextM.team1Placeholder || 'TBD')}</div>
        </div>
        <div class="score-center">
          <div class="score-num">${nextM.status === 'scheduled' ? '<span class="score-vs">VS</span>' : `${nextM.team1Score} - ${nextM.team2Score}`}</div>
          <div style="font-size:0.68rem; color:${nextM.status === 'live' ? 'var(--gold)' : 'var(--text-dim)'}; text-transform:uppercase; margin-top:2px; font-weight:800;">
            ${nextM.status === 'live' ? '🔴 IN PROGRESS' : nextM.status}
          </div>
        </div>
        <div class="team-side">
          ${t2 ? `<img src="${t2.logo}" onerror="this.src='images/tournament_logo.jpg'"/>` : `<div class="team-placeholder-circle">${nextM.seedCode2 || 'TBD'}</div>`}
          <div class="${t2 ? 'team-side-name' : 'team-side-placeholder'}">${t2 ? t2.name : (nextM.team2Placeholder || 'TBD')}</div>
        </div>
      </div>
      <div class="match-officials-bar">
        <span>🚩 Ref: <strong>${nextM.referee || 'TBD'}</strong></span>
        <span>📝 Stats: <strong>${nextM.statsKeeper || 'Moon'}</strong></span>
        <span>🎥 Stream: <strong style="color:var(--gold);">${getStreamer(nextM)}</strong></span>
      </div>
      <div class="match-card-bottom">
        <span style="font-size:0.75rem; color:var(--text-dim);">${nextM.events ? nextM.events.length : 0} events logged</span>
        <button class="btn btn-gold btn-sm" onclick="openLoggerModal('${nextM.id}')">
          ⚡ Enter Match Stats
        </button>
      </div>
    `;
  }
}

// 2. MATCHES
function filterMatches(f, btn) {
  matchFilter = f;
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active-filter'));
  if (btn) btn.classList.add('active-filter');
  renderMatches();
}

function renderMatches() {
  const container = document.getElementById('matches-list-container');
  if (!container || !tournamentData || !tournamentData.matches) return;

  let list = tournamentData.matches;
  if (matchFilter === 'group') list = list.filter(m => m.stage === 'group');
  if (matchFilter === 'qualifiers') list = list.filter(m => m.stage === 'qualifier');
  if (matchFilter === 'semis') list = list.filter(m => m.stage === 'semifinal');
  if (matchFilter === 'finals') list = list.filter(m => m.stage === 'final' || m.stage === 'third_place');

  container.innerHTML = list.map(m => {
    const t1 = getTeam(m.team1Id);
    const t2 = getTeam(m.team2Id);

    let eventsHtml = '';
    if (m.events && m.events.length > 0) {
      eventsHtml = `
        <div class="match-events-preview">
          ${m.events.map(ev => {
            const p = getPlayer(ev.teamId, ev.playerId);
            const pName = p ? p.name : 'Unknown';
            let icon = '⚽';
            let desc = `${pName} (${ev.minute}')`;
            if (ev.type === 'own_goal') { icon = '⚠️'; desc = `Own Goal: ${pName}`; }
            if (ev.type === 'save') { icon = '🧤'; desc = `Save: ${pName}`; }
            if (ev.type === 'yellow_card') { icon = '🟨'; desc = `${pName}`; }
            if (ev.type === 'red_card') { icon = '🟥'; desc = `${pName}`; }
            return `<div><span>${icon}</span> <span>${desc}</span></div>`;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="match-card">
        <div class="match-card-top">
          <span class="match-stage-tag">${m.stageLabel} • Match #${m.matchNumber}</span>
          <span class="match-time-tag">⏰ ${m.time} (${m.duration})</span>
        </div>

        <div class="match-teams-box">
          <div class="team-side">
            ${t1 ? `<img src="${t1.logo}" onerror="this.src='images/tournament_logo.jpg'"/>` : `<div class="team-placeholder-circle">${m.seedCode1 || 'TBD'}</div>`}
            <div class="${t1 ? 'team-side-name' : 'team-side-placeholder'}">${t1 ? t1.name : (m.team1Placeholder || 'TBD')}</div>
          </div>

          <div class="score-center">
            <div class="score-num">${m.status === 'scheduled' ? '<span class="score-vs">VS</span>' : `${m.team1Score} - ${m.team2Score}`}</div>
            <div style="font-size:0.68rem; color:${m.status === 'live' ? 'var(--gold)' : 'var(--text-dim)'}; text-transform:uppercase; margin-top:2px; font-weight:800;">
              ${m.status === 'live' ? '🔴 IN PROGRESS' : m.status}
            </div>
          </div>

          <div class="team-side">
            ${t2 ? `<img src="${t2.logo}" onerror="this.src='images/tournament_logo.jpg'"/>` : `<div class="team-placeholder-circle">${m.seedCode2 || 'TBD'}</div>`}
            <div class="${t2 ? 'team-side-name' : 'team-side-placeholder'}">${t2 ? t2.name : (m.team2Placeholder || 'TBD')}</div>
          </div>
        </div>

        <div class="match-officials-bar">
          <span>🚩 Ref: <strong>${m.referee || 'TBD'}</strong></span>
          <span>📝 Stats: <strong>${m.statsKeeper || 'Moon'}</strong></span>
          <span>🎥 Stream: <strong style="color:var(--gold);">${getStreamer(m)}</strong></span>
        </div>

        ${eventsHtml}

        <div class="match-card-bottom">
          <span style="font-size:0.75rem; color:var(--text-dim);">${m.events ? m.events.length : 0} events logged</span>
          <button class="btn btn-dark btn-sm" onclick="openLoggerModal('${m.id}')">
            ⚡ Log Stats
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// 3. STANDINGS
function renderStandings() {
  const tbA = document.getElementById('table-body-a');
  const tbB = document.getElementById('table-body-b');

  function renderRows(rows) {
    if (!rows || rows.length === 0) return '';
    return rows.map((r, i) => `
      <tr>
        <td style="font-weight:800; color:${i === 0 ? 'var(--emerald)' : (i < 3 ? 'var(--sony-cyan)' : 'inherit')};">${i + 1}</td>
        <td class="team-cell">
          <img src="${r.logo}" onerror="this.src='images/tournament_logo.jpg'"/>
          <span>${r.teamName}</span>
        </td>
        <td>${r.played}</td>
        <td>${r.won}</td>
        <td>${r.drawn}</td>
        <td>${r.lost}</td>
        <td style="font-weight:800; color:${r.goalDifference > 0 ? 'var(--emerald)' : (r.goalDifference < 0 ? 'var(--rose)' : 'inherit')};">
          ${r.goalDifference > 0 ? '+' + r.goalDifference : r.goalDifference}
        </td>
        <td class="pts-cell">${r.points}</td>
      </tr>
    `).join('');
  }

  if (tbA) tbA.innerHTML = renderRows(standingsA);
  if (tbB) tbB.innerHTML = renderRows(standingsB);
}

// 4. BRACKET
function renderBracket() {
  const container = document.getElementById('bracket-container');
  if (!container || !tournamentData || !tournamentData.matches) return;

  const matchMap = {};
  tournamentData.matches.forEach(m => matchMap[m.id] = m);

  function renderNode(matchId, title) {
    const m = matchMap[matchId];
    if (!m) return '';
    const t1 = getTeam(m.team1Id);
    const t2 = getTeam(m.team2Id);
    return `
      <div class="bracket-match-node" onclick="openLoggerModal('${m.id}')">
        <div style="font-size:0.7rem; font-weight:800; color:var(--gold); margin-bottom:0.35rem; display:flex; justify-content:space-between;">
          <span>${title} • #${m.matchNumber}</span>
          <span>${m.time}</span>
        </div>
        <div class="bracket-team-line">
          <span>${t1 ? t1.name : (m.team1Placeholder || 'TBD')}</span>
          <strong>${m.status === 'scheduled' ? '-' : m.team1Score}</strong>
        </div>
        <div class="bracket-team-line">
          <span>${t2 ? t2.name : (m.team2Placeholder || 'TBD')}</span>
          <strong>${m.status === 'scheduled' ? '-' : m.team2Score}</strong>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="bracket-column">
      <div class="bracket-col-header">Qualifiers (12m)</div>
      ${renderNode('M7', 'Qualifier 1')}
      ${renderNode('M8', 'Qualifier 2')}
    </div>
    <div class="bracket-column">
      <div class="bracket-col-header">Semi-Finals (15m)</div>
      ${renderNode('M9', 'Semi-Final 1')}
      ${renderNode('M10', 'Semi-Final 2')}
    </div>
    <div class="bracket-column">
      <div class="bracket-col-header">Finals</div>
      ${renderNode('M12', '🏆 Final (15m)')}
      ${renderNode('M11', '🥉 3rd Place (10m)')}
    </div>
  `;
}

// 5. SQUADS
function renderSquads() {
  const strip = document.getElementById('squad-nav-strip');
  const rosterBox = document.getElementById('squad-roster-container');
  if (!strip || !rosterBox || !tournamentData || !tournamentData.teams) return;

  strip.innerHTML = tournamentData.teams.map(t => `
    <button class="squad-tab-pill ${t.id === selectedTeamId ? 'active' : ''}" onclick="selectTeam('${t.id}')">
      ${t.name} (Grp ${t.group})
    </button>
  `).join('');

  const current = getTeam(selectedTeamId);
  if (!current) return;

  rosterBox.innerHTML = `
    <div style="padding:1.15rem; background:var(--bg-surface-elevated); border-bottom:1px solid var(--glass-border); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <img src="${current.logo}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;" onerror="this.src='images/tournament_logo.jpg'"/>
        <div>
          <h3 style="font-size:1.1rem; font-weight:800; color:#fff;">${current.name}</h3>
          <span style="font-size:0.75rem; color:var(--text-sub);">Group ${current.group} • ${current.players.length} Players</span>
        </div>
      </div>
      <button class="btn btn-cyan btn-sm" onclick="addNewPlayerPrompt('${current.id}')">
        ➕ Add Player
      </button>
    </div>
    <div class="table-responsive">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40px;">#</th>
            <th style="text-align:left;">Player Name</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${current.players.map((p, idx) => `
            <tr class="${p.isHonorary ? 'player-row-honorary' : ''}">
              <td style="font-weight:800; color:var(--gold); width:40px;">${idx + 1}</td>
              <td style="text-align:left; font-weight:700; color:#fff;">
                <span>${p.name}</span>
                ${p.isHonorary ? `<span class="badge-honorary">❤️ In Respect &amp; Love • Non-playing</span>` : ''}
              </td>
              <td style="text-align:right;">
                ${p.isHonorary ? `<span style="font-size:0.75rem; color:var(--text-dim); margin-right:0.5rem; font-style:italic;">Honorary Member</span>` : `
                  <button class="btn btn-dark btn-sm" onclick="renamePlayerPrompt('${current.id}', '${p.id}', '${p.name}')">✏️ Rename</button>
                  <button class="btn btn-danger btn-sm" onclick="removePlayer('${current.id}', '${p.id}')">🗑️</button>
                `}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function selectTeam(id) {
  selectedTeamId = id;
  renderSquads();
}

function addNewPlayerPrompt(teamId) {
  const name = prompt("Enter new player name:");
  if (name && name.trim()) {
    const team = getTeam(teamId);
    if (team) {
      team.players.push({
        id: `${teamId}_p_${Date.now()}`,
        name: name.trim(),
        number: team.players.length + 1
      });
      recalculateAll(true);
      renderSquads();
      showToast(`Added ${name.trim()}!`);
    }
  }
}

function renamePlayerPrompt(teamId, playerId, oldName) {
  const name = prompt("Edit player name:", oldName);
  if (name && name.trim()) {
    const p = getPlayer(teamId, playerId);
    if (p) {
      p.name = name.trim();
      recalculateAll(true);
      renderSquads();
      showToast(`Updated to ${name.trim()}!`);
    }
  }
}

function removePlayer(teamId, playerId) {
  const team = getTeam(teamId);
  if (!team) return;
  if (confirm("Remove this player from squad?")) {
    team.players = team.players.filter(p => p.id !== playerId);
    recalculateAll(true);
    renderSquads();
    showToast("Player removed.");
  }
}

// 6. LEADERBOARDS
function renderLeaderboards() {
  const box = document.getElementById('leaderboards-container');
  if (!box || !tournamentData || !tournamentData.teams) return;

  const playerStats = [];
  tournamentData.teams.forEach(t => {
    t.players.filter(p => !p.isHonorary).forEach(p => {
      playerStats.push({
        id: p.id,
        name: p.name,
        teamName: t.shortName,
        teamLogo: t.logo,
        goals: 0,
        assists: 0,
        saves: 0,
        cards: 0
      });
    });
  });

  const pMap = {};
  playerStats.forEach(p => pMap[p.id] = p);

  tournamentData.matches.forEach(m => {
    if (m.events) {
      m.events.forEach(ev => {
        const p = pMap[ev.playerId];
        if (p) {
          if (ev.type === 'goal') p.goals++;
          if (ev.type === 'save') p.saves++;
          if (ev.type === 'yellow_card' || ev.type === 'red_card') p.cards++;
        }
        if (ev.assistPlayerId && pMap[ev.assistPlayerId]) {
          pMap[ev.assistPlayerId].assists++;
        }
      });
    }
  });

  const topScorers = [...playerStats].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 5);
  const topAssists = [...playerStats].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 5);
  const topSaves = [...playerStats].filter(p => p.saves > 0).sort((a, b) => b.saves - a.saves).slice(0, 5);

  function makeCard(title, list, metricKey, metricLabel) {
    return `
      <div class="leaderboard-card">
        <div style="padding:0.95rem 1.15rem; background:var(--bg-surface-elevated); border-bottom:1px solid var(--glass-border); font-weight:800; font-size:0.9rem; color:#fff;">
          ${title}
        </div>
        ${list.length === 0 ? `<p style="padding:1.5rem; text-align:center; font-size:0.8rem; color:var(--text-dim);">No stats recorded yet.</p>` : `
          <div>
            ${list.map((item, idx) => `
              <div class="leaderboard-item">
                <div style="display:flex; align-items:center; gap:0.65rem;">
                  <strong style="color:var(--gold); font-size:0.85rem;">#${idx + 1}</strong>
                  <img src="${item.teamLogo}" style="width:26px; height:26px; border-radius:50%; object-fit:cover;" onerror="this.src='images/tournament_logo.jpg'"/>
                  <div>
                    <div style="font-weight:700; color:#fff;">${item.name}</div>
                    <div style="font-size:0.7rem; color:var(--text-dim);">${item.teamName}</div>
                  </div>
                </div>
                <strong style="font-size:1.15rem; color:var(--sony-cyan);">${item[metricKey]} <span style="font-size:0.7rem; font-weight:600; color:var(--text-dim);">${metricLabel}</span></strong>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  box.innerHTML = `
    ${makeCard('⚽ Top Scorers (Golden Boot)', topScorers, 'goals', 'goals')}
    ${makeCard('👟 Most Assists', topAssists, 'assists', 'assists')}
    ${makeCard('🧤 Goalkeeper Saves', topSaves, 'saves', 'saves')}
  `;
}

// -------------------------------------------------------------
// STATS LOGGER CONSOLE
// -------------------------------------------------------------
function openLoggerModal(matchId) {
  activeMatchId = matchId;
  const overlay = document.getElementById('logger-drawer-overlay');
  const drawer = document.getElementById('logger-drawer');
  if (overlay) overlay.classList.add('active');
  if (drawer) drawer.classList.add('active');
  renderLoggerContent();
}

function closeLoggerModal() {
  const overlay = document.getElementById('logger-drawer-overlay');
  const drawer = document.getElementById('logger-drawer');
  if (overlay) overlay.classList.remove('active');
  if (drawer) drawer.classList.remove('active');
  activeMatchId = null;
}

function renderLoggerContent() {
  const container = document.getElementById('logger-drawer-content');
  if (!container || !activeMatchId || !tournamentData) return;

  const m = tournamentData.matches.find(match => match.id === activeMatchId);
  if (!m) return;

  const t1 = getTeam(m.team1Id);
  const t2 = getTeam(m.team2Id);

  const t1Name = t1 ? t1.name : (m.team1Placeholder || 'Team 1 (TBD)');
  const t2Name = t2 ? t2.name : (m.team2Placeholder || 'Team 2 (TBD)');

  container.innerHTML = `
    <!-- MATCH PICKER -->
    <div class="form-group">
      <label class="form-label">Select Match</label>
      <select class="form-control" onchange="openLoggerModal(this.value)">
        ${tournamentData.matches.map(item => `
          <option value="${item.id}" ${item.id === m.id ? 'selected' : ''}>
            Match #${item.matchNumber} (${item.time}) - ${item.stageLabel}
          </option>
        `).join('')}
      </select>
    </div>

    <!-- SCOREBOARD -->
    <div style="background:var(--bg-surface-elevated); border:1px solid var(--glass-border); border-radius:var(--radius-md); padding:1rem; text-align:center;">
      <div style="font-size:0.75rem; font-weight:800; color:var(--gold); margin-bottom:0.4rem;">
        ${m.stageLabel} • Match #${m.matchNumber} (${m.duration})
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
        <div style="flex:1;">
          <div style="font-size:0.85rem; font-weight:700; color:#fff;">${t1Name}</div>
          <div style="font-size:2.2rem; font-weight:900; color:var(--sony-cyan);">${m.team1Score}</div>
        </div>
        <div style="font-weight:900; color:var(--text-dim); font-size:1.1rem;">VS</div>
        <div style="flex:1;">
          <div style="font-size:0.85rem; font-weight:700; color:#fff;">${t2Name}</div>
          <div style="font-size:2.2rem; font-weight:900; color:var(--sony-cyan);">${m.team2Score}</div>
        </div>
      </div>

      <!-- STATUS SWITCH -->
      <div style="display:flex; gap:0.4rem; justify-content:center; margin-top:0.75rem;">
        <button class="btn btn-sm ${m.status === 'scheduled' ? 'btn-cyan' : 'btn-dark'}" onclick="setMatchStatus('${m.id}', 'scheduled')">Scheduled</button>
        <button class="btn btn-sm ${m.status === 'live' ? 'btn-gold' : 'btn-dark'}" onclick="setMatchStatus('${m.id}', 'live')">🔴 In Progress</button>
        <button class="btn btn-sm ${m.status === 'finished' ? 'btn-cyan' : 'btn-dark'}" onclick="setMatchStatus('${m.id}', 'finished')">🏁 Finished</button>
      </div>

      <div class="match-officials-bar" style="margin-top:0.85rem; justify-content:center; gap:1.25rem;">
        <span>🚩 Referee: <strong>${m.referee || 'TBD'}</strong></span>
        <span>📝 Stats Desk: <strong style="color:var(--sony-cyan);">${m.statsKeeper || 'Moon'}</strong></span>
        <span>🎥 Streamer: <strong style="color:var(--gold);">${getStreamer(m)}</strong></span>
      </div>
    </div>

    <!-- EVENT FORM -->
    ${(!t1 || !t2) ? `
      <div style="padding:1.25rem; text-align:center; background:var(--bg-surface-elevated); border-radius:var(--radius-md); font-size:0.85rem; color:var(--text-sub);">
        ⏳ Teams for this match will automatically unlock once the preceding matches conclude.
      </div>
    ` : `
      <div style="background:var(--bg-surface-elevated); border:1px solid var(--glass-border); border-radius:var(--radius-md); padding:1rem;">
        <div style="font-size:0.85rem; font-weight:800; color:#fff; margin-bottom:0.75rem;">
          ⚡ Record Event
        </div>

        <div class="form-group">
          <label class="form-label">Event Type</label>
          <select id="log-ev-type" class="form-control" onchange="toggleAssistField()">
            <option value="goal">⚽ Goal</option>
            <option value="own_goal">⚠️ Own Goal</option>
            <option value="save">🧤 Save</option>
            <option value="yellow_card">🟨 Yellow Card</option>
            <option value="red_card">🟥 Red Card</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Team</label>
          <select id="log-ev-team" class="form-control" onchange="updatePlayerDropdowns()">
            <option value="${t1.id}">${t1.name}</option>
            <option value="${t2.id}">${t2.name}</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Player</label>
          <select id="log-ev-player" class="form-control"></select>
        </div>

        <div class="form-group" id="assist-box">
          <label class="form-label">Assist By (Optional)</label>
          <select id="log-ev-assist" class="form-control"></select>
        </div>

        <div style="display:flex; gap:0.5rem; align-items:flex-end;">
          <div style="width:100px;">
            <label class="form-label">Minute</label>
            <input type="number" id="log-ev-min" class="form-control" value="5" min="1" max="60"/>
          </div>
          <button class="btn btn-gold" style="flex:1;" onclick="addMatchEvent()">
            ➕ Add Event
          </button>
        </div>
      </div>
    `}

    <!-- LOGGED EVENTS LIST -->
    <div style="background:var(--bg-surface-elevated); border:1px solid var(--glass-border); border-radius:var(--radius-md); padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
        <span style="font-size:0.85rem; font-weight:800; color:#fff;">Logged Events</span>
        <span style="font-size:0.75rem; color:var(--text-dim);">${m.events ? m.events.length : 0} total</span>
      </div>

      ${(!m.events || m.events.length === 0) ? `
        <p style="font-size:0.8rem; color:var(--text-dim); text-align:center; padding:0.75rem;">No events logged for this match yet.</p>
      ` : `
        <div style="display:flex; flex-direction:column; gap:0.4rem; max-height:180px; overflow-y:auto;">
          ${m.events.map((ev, idx) => {
            const player = getPlayer(ev.teamId, ev.playerId);
            const pName = player ? player.name : 'Unknown';
            let icon = '⚽';
            if (ev.type === 'own_goal') icon = '⚠️';
            if (ev.type === 'save') icon = '🧤';
            if (ev.type === 'yellow_card') icon = '🟨';
            if (ev.type === 'red_card') icon = '🟥';
            return `
              <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-surface); padding:0.45rem 0.65rem; border-radius:var(--radius-sm); font-size:0.8rem; border:1px solid var(--glass-border);">
                <div>
                  <span>${icon}</span> <strong>${pName}</strong> (${ev.minute}')
                </div>
                <button class="btn btn-danger btn-sm" onclick="deleteEvent('${m.id}', ${idx})" title="Delete event">✕</button>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  updatePlayerDropdowns();
}

function toggleAssistField() {
  const type = document.getElementById('log-ev-type').value;
  const box = document.getElementById('assist-box');
  if (box) box.style.display = (type === 'goal') ? 'block' : 'none';
}

function updatePlayerDropdowns() {
  const teamSelect = document.getElementById('log-ev-team');
  const playerSelect = document.getElementById('log-ev-player');
  const assistSelect = document.getElementById('log-ev-assist');
  if (!teamSelect || !playerSelect) return;

  const team = getTeam(teamSelect.value);
  if (!team || !team.players) return;

  const playingSquad = team.players.filter(p => !p.isHonorary);
  const opts = playingSquad.map((p, idx) => `<option value="${p.id}">${idx + 1}. ${p.name}</option>`).join('');
  playerSelect.innerHTML = opts;
  if (assistSelect) {
    assistSelect.innerHTML = `<option value="">None (Solo / Unassisted)</option>` + opts;
  }
}

function addMatchEvent() {
  if (!activeMatchId) return;
  const m = tournamentData.matches.find(item => item.id === activeMatchId);
  if (!m) return;

  const type = document.getElementById('log-ev-type').value;
  const teamId = document.getElementById('log-ev-team').value;
  const playerId = document.getElementById('log-ev-player').value;
  const assistPlayerId = document.getElementById('log-ev-assist')?.value || null;
  const minute = parseInt(document.getElementById('log-ev-min').value) || 1;

  if (!playerId) {
    showToast("Please select a player!");
    return;
  }

  if (!m.events) m.events = [];
  m.events.push({
    id: 'ev_' + Date.now(),
    type,
    teamId,
    playerId,
    assistPlayerId: (type === 'goal' && assistPlayerId && assistPlayerId !== playerId) ? assistPlayerId : null,
    minute
  });

  if (m.status === 'scheduled') m.status = 'live';

  recalculateAll(true);
  renderAll();
  renderLoggerContent();
  showToast("Goal/Event logged & synced across all devices!");
}

function deleteEvent(matchId, idx) {
  const m = tournamentData.matches.find(item => item.id === matchId);
  if (!m || !m.events) return;
  m.events.splice(idx, 1);
  recalculateAll(true);
  renderAll();
  renderLoggerContent();
  showToast("Event removed & scores recalculated.");
}

function setMatchStatus(matchId, status) {
  const m = tournamentData.matches.find(item => item.id === matchId);
  if (!m) return;
  m.status = status;
  recalculateAll(true);
  renderAll();
  renderLoggerContent();
  showToast(`Match status: ${status.toUpperCase()}`);
}

// -------------------------------------------------------------
// BACKUP & SETTINGS
// -------------------------------------------------------------
function initSettings() {
  const expBtn = document.getElementById('btn-export-backup');
  if (expBtn) {
    expBtn.addEventListener('click', () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tournamentData, null, 2));
      const a = document.createElement('a');
      a.href = dataStr;
      a.download = `community_cup_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Backup exported!");
    });
  }

  const impInput = document.getElementById('file-import-backup');
  if (impInput) {
    impInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (parsed.teams && parsed.matches) {
            tournamentData = parsed;
            recalculateAll(true);
            renderAll();
            showToast("Backup imported & pushed to cloud!");
          }
        } catch (err) {
          alert("Invalid backup file: " + err.message);
        }
      };
      r.readAsText(f);
    });
  }

  const resetBtn = document.getElementById('btn-reset-tournament');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm("Reset tournament back to initial blank fixtures and clear all stats across all devices?")) {
        localStorage.removeItem(STORAGE_KEY);
        tournamentData = JSON.parse(JSON.stringify(INITIAL_TOURNAMENT_DATA));
        recalculateAll(true);
        renderAll();
        showToast("Tournament reset across all devices.");
      }
    });
  }
}

function showToast(msg) {
  const t = document.getElementById('app-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
