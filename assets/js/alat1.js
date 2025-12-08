// alat1.js — full rewrite (drop-in replacement)
document.addEventListener('DOMContentLoaded', () => {
  // DOM refs (safe)
  const bracketContainer = document.getElementById('bracketContainer');
  const bracketColumns = document.getElementById('bracketColumns');
  const participantCountSelect = document.getElementById('participantCount');
  const tournamentNameInput = document.getElementById('tournamentName');
  const generateBtn = document.getElementById('generateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const simulateBtn = document.getElementById('simulateBtn');
  const clearBtn = document.getElementById('clearBtn');

  const totalMatchesEl = document.getElementById('totalMatches');
  const completedMatchesEl = document.getElementById('completedMatches');
  const remainingMatchesEl = document.getElementById('remainingMatches');
  const completionRateEl = document.getElementById('completionRate');
  const tournamentProgressEl = document.getElementById('tournamentProgress');
  const progressPercentageEl = document.getElementById('progressPercentage');

  // svg overlay for connector lines
  let svgOverlay = null;
  function ensureSvg() {
    if (svgOverlay) return;
    svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.classList.add('bracket-svg-overlay');
    svgOverlay.style.position = 'absolute';
    svgOverlay.style.top = 0;
    svgOverlay.style.left = 0;
    svgOverlay.style.width = '100%';
    svgOverlay.style.height = '100%';
    svgOverlay.style.pointerEvents = 'none';
    if (bracketContainer) bracketContainer.appendChild(svgOverlay);
  }
  function clearSvg() {
    if (!svgOverlay) return;
    while (svgOverlay.firstChild) svgOverlay.removeChild(svgOverlay.firstChild);
  }
  function createPolyline(points) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', 'none');
    poly.setAttribute('stroke', '#6c757d');
    poly.setAttribute('stroke-width', '2');
    poly.setAttribute('stroke-linecap', 'round');
    poly.setAttribute('stroke-linejoin', 'round');
    svgOverlay.appendChild(poly);
  }

  // data model
  const bracketData = {
    name: 'Championship Bracket',
    participants: 8,
    maxParticipants: 8,
    totalRounds: 0,
    rounds: [], // array of rounds; each round = array of matches {player1, player2, winner, isBye, status}
    champion: null
  };

  const defaultPlayerNames = Array.from({ length: 64 }, (_, i) => `Player ${i + 1}`);

  // safe addEvent
  generateBtn?.addEventListener('click', () => generateBracket());
  resetBtn?.addEventListener('click', () => resetBracket());
  simulateBtn?.addEventListener('click', () => simulateTournament());
  clearBtn?.addEventListener('click', () => clearResults());
  participantCountSelect?.addEventListener('change', function () {
    bracketData.participants = parseInt(this.value) || 8;
    generateBracket();
  });
  tournamentNameInput?.addEventListener('change', function () {
    bracketData.name = this.value || bracketData.name;
    const h = document.querySelector('.tournament-header h1');
    if (h) h.innerHTML = `<i class="fas fa-trophy"></i> ${bracketData.name}`;
  });

  // init
  generateBracket();
  window.addEventListener('resize', debounce(drawAllConnectors, 120));

  /* ------------- core ------------- */
  function generateBracket() {
    const p = Math.max(1, bracketData.participants || 8);
    bracketData.participants = p;
    bracketData.totalRounds = Math.ceil(Math.log2(p));
    bracketData.maxParticipants = Math.pow(2, bracketData.totalRounds);

    // build seeded array (left-to-right). we'll apply usual 1vN ordering for 4/8/16 to look normal
    const seeded = new Array(bracketData.maxParticipants).fill(null).map((_, i) => {
      if (i < p) return { id: i + 1, name: defaultPlayerNames[i], seed: i + 1 };
      return null;
    });

    if (bracketData.maxParticipants === 8) {
      const order = [0,7,3,4,2,5,1,6];
      const tmp = new Array(8).fill(null);
      for (let i=0;i<8;i++) tmp[i] = seeded[order[i]];
      for (let i=0;i<8;i++) seeded[i] = tmp[i];
    } else if (bracketData.maxParticipants === 16) {
      const order = [0,15,7,8,3,12,4,11,5,10,2,13,6,9,1,14];
      const tmp = new Array(16).fill(null);
      for (let i=0;i<16;i++) tmp[i] = seeded[order[i]];
      for (let i=0;i<16;i++) seeded[i] = tmp[i];
    }

    // build first round matches
    const rounds = [];
    const firstRound = [];
    for (let i = 0; i < bracketData.maxParticipants; i += 2) {
      const a = seeded[i] || null;
      const b = seeded[i+1] || null;
      firstRound.push({
        player1: a,
        player2: b,
        winner: null,
        isBye: !(a && b),
        status: 'pending'
      });
    }
    rounds.push(firstRound);

    // create later rounds with empty slots
    let prevCount = firstRound.length;
    for (let r = 1; r < bracketData.totalRounds; r++) {
      const nextCount = Math.ceil(prevCount / 2);
      const arr = new Array(nextCount).fill(null).map(() => ({
        player1: null,
        player2: null,
        winner: null,
        isBye: false,
        status: 'pending'
      }));
      rounds.push(arr);
      prevCount = nextCount;
    }

    bracketData.rounds = rounds;
    bracketData.champion = null;

    // DO NOT auto-advance byes here to avoid earlier bug. Use simulate to auto-fill if wanted.
    renderBracket();
    updateStats();
  }

  /* ------------- render ------------- */
  function renderBracket() {
    if (!bracketColumns) return;
    bracketColumns.innerHTML = '';
    bracketColumns.className = 'bracket-columns';
    bracketColumns.classList.add(`bracket-${bracketData.maxParticipants}`);

    // each round
    bracketData.rounds.forEach((roundArr, rIdx) => {
      const roundCol = document.createElement('div');
      roundCol.className = 'round-column';

      const header = document.createElement('div');
      header.className = 'round-header';
      if (rIdx === bracketData.rounds.length - 1) header.textContent = 'Final';
      else if (rIdx === bracketData.rounds.length - 2) header.textContent = 'Semi Final';
      else header.textContent = `Round ${rIdx + 1}`;
      roundCol.appendChild(header);

      const roundMatchesWrap = document.createElement('div');
      roundMatchesWrap.className = 'round-matches';

      // group by pairs for spacing: two matches per visual pair
      for (let m = 0; m < roundArr.length; m += 2) {
        const pair = document.createElement('div');
        pair.className = 'pair-wrapper';
        // match A
        const matchA = roundArr[m];
        pair.appendChild(buildMatchWrapper(matchA, rIdx, m));
        // match B (maybe undefined)
        if (m + 1 < roundArr.length) pair.appendChild(buildMatchWrapper(roundArr[m + 1], rIdx, m + 1));
        else pair.appendChild(buildMatchWrapper(null, rIdx, m + 1)); // empty placeholder
        roundMatchesWrap.appendChild(pair);
      }

      roundCol.appendChild(roundMatchesWrap);
      bracketColumns.appendChild(roundCol);
    });

    // champion column
    const champCol = document.createElement('div');
    champCol.className = 'champion-column';
    const title = document.createElement('div'); title.className = 'champion-title'; title.textContent = 'CHAMPION';
    const box = document.createElement('div'); box.className = 'champion-box';
    if (bracketData.champion) {
      box.innerHTML = `${bracketData.champion.name}<div class="champion-seed">Seed ${bracketData.champion.seed}</div>`;
      box.classList.remove('pending');
    } else {
      box.textContent = 'TBD';
      box.classList.add('pending');
    }
    champCol.appendChild(title); champCol.appendChild(box);
    bracketColumns.appendChild(champCol);

    // bind interactions AFTER DOM painted
    setTimeout(() => {
      // team click -> select winner
      document.querySelectorAll('.match-card').forEach(card => {
        if (card.classList.contains('bye-match')) return; // skip bye-only cards
        const teams = card.querySelectorAll('.team');
        teams.forEach(teamEl => {
          teamEl.onclick = () => {
            // protect: no double selection if match completed
            if (card.classList.contains('completed')) return;
            const roundIndex = parseInt(card.dataset.round, 10);
            const matchIndex = parseInt(card.dataset.index, 10);
            const teamNum = parseInt(teamEl.dataset.team, 10);
            selectWinnerByIndex(roundIndex, matchIndex, teamNum);
          };
        });
      });

      // editable names: contenteditable on .team-name
      document.querySelectorAll('.team-name[contenteditable="true"]').forEach(span => {
        span.onblur = () => {
          const wrapper = span.closest('.match-wrapper');
          if (!wrapper) return;
          const r = parseInt(wrapper.dataset.round, 10);
          const idx = parseInt(wrapper.dataset.index, 10);
          const parentTeam = span.closest('.team');
          const teamNum = parentTeam?.dataset?.team;
          if (isNaN(r) || isNaN(idx) || !teamNum) return;
          const newName = span.textContent.trim() || span.dataset.placeholder || 'TBD';
          // update model
          const match = bracketData.rounds[r][idx];
          if (!match) return;
          if (teamNum === '1') {
            if (match.player1) match.player1.name = newName;
            else match.player1 = { id: null, name: newName, seed: null };
          } else {
            if (match.player2) match.player2.name = newName;
            else match.player2 = { id: null, name: newName, seed: null };
          }
          renderBracket(); // rerender to reflect seed / classes
        };
      });

      ensureSvg();
      drawAllConnectors();
      updateStats();
    }, 0);
  }

  function buildMatchWrapper(matchObj, roundIndex, matchIndex) {
    const wrapper = document.createElement('div');
    wrapper.className = matchObj ? 'match-wrapper' : 'match-wrapper empty-match';
    wrapper.dataset.round = String(roundIndex);
    wrapper.dataset.index = String(matchIndex);

    const card = document.createElement('div');
    card.className = 'match-card';
    if (!matchObj) {
      card.classList.add('bye-match');
      card.innerHTML = `<div class="team"><span class="team-name">TBD</span></div><div class="vs">VS</div><div class="team"><span class="team-name">TBD</span></div><div class="match-status">MENUNGGU</div>`;
      wrapper.appendChild(card);
      return wrapper;
    }

    if (matchObj.status === 'completed') card.classList.add('completed'); else card.classList.add('pending');
    if (matchObj.isBye) card.classList.add('bye-match');

    // team1 element
    const t1 = document.createElement('div');
    t1.className = 'team' + (matchObj.winner && matchObj.winner.id === (matchObj.player1 && matchObj.player1.id) ? ' winner' : '');
    t1.dataset.team = '1';
    const name1 = document.createElement('span');
    name1.className = 'team-name';
    name1.textContent = matchObj.player1 ? matchObj.player1.name : 'TBD';
    name1.setAttribute('contenteditable', 'true');
    name1.dataset.placeholder = 'TBD';
    const seed1 = document.createElement('span');
    seed1.className = 'seed';
    seed1.textContent = matchObj.player1 && matchObj.player1.seed ? `Seed ${matchObj.player1.seed}` : '';
    if (!seed1.textContent) seed1.style.display = 'none';
    t1.appendChild(name1); if (seed1.textContent) t1.appendChild(seed1);

    // team2 element
    const t2 = document.createElement('div');
    t2.className = 'team' + (matchObj.winner && matchObj.winner.id === (matchObj.player2 && matchObj.player2.id) ? ' winner' : '');
    t2.dataset.team = '2';
    const name2 = document.createElement('span');
    name2.className = 'team-name';
    name2.textContent = matchObj.player2 ? matchObj.player2.name : 'TBD';
    name2.setAttribute('contenteditable', 'true');
    name2.dataset.placeholder = 'TBD';
    const seed2 = document.createElement('span');
    seed2.className = 'seed';
    seed2.textContent = matchObj.player2 && matchObj.player2.seed ? `Seed ${matchObj.player2.seed}` : '';
    if (!seed2.textContent) seed2.style.display = 'none';
    t2.appendChild(name2); if (seed2.textContent) t2.appendChild(seed2);

    const vs = document.createElement('div'); vs.className = 'vs'; vs.textContent = 'VS';
    const status = document.createElement('div'); status.className = 'match-status';
    status.textContent = matchObj.status === 'completed' ? 'SELESAI' : (matchObj.isBye ? 'BYE' : 'MENUNGGU');

    card.dataset.round = String(roundIndex);
    card.dataset.index = String(matchIndex);
    card.appendChild(t1);
    card.appendChild(vs);
    card.appendChild(t2);
    card.appendChild(status);

    wrapper.appendChild(card);
    return wrapper;
  }

  /* ------------- connectors ------------- */
  function drawAllConnectors() {
    clearSvg();
    ensureSvg();
    if (!bracketContainer) return;

    const containerRect = bracketContainer.getBoundingClientRect();
    const columns = Array.from(document.querySelectorAll('.round-column'));

    for (let r = 0; r < columns.length - 1; r++) {
      const currMatches = Array.from(columns[r].querySelectorAll('.match-wrapper'))
        .filter(m => !m.classList.contains('empty-match'));

      const nextMatches = Array.from(columns[r+1].querySelectorAll('.match-wrapper'))
        .filter(m => !m.classList.contains('empty-match'));

        currMatches.forEach((match,i)=>{
        const nextIndex = Math.floor(i/2)
        const target = nextMatches[nextIndex]
        if(!target) return

        const card1 = match.querySelector('.match-card')
        const card2 = target.querySelector('.match-card')

        const r1 = card1.getBoundingClientRect()
        const r2 = card2.getBoundingClientRect()

        const x1 = r1.right - containerRect.left
        const y1 = r1.top - containerRect.top + r1.height/2

        const x2 = r2.left - containerRect.left
        const y2 = r2.top - containerRect.top + r2.height/2

        const midX = x1 + (x2-x1)/2

        createPolyline(`${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`)
      })
    }
  }

  /* ------------- selection / progression ------------- */
  function selectWinnerByIndex(roundIndex, matchIndex, teamNum) {
    const round = bracketData.rounds[roundIndex];
    if (!round) return;
    const match = round[matchIndex];
    if (!match || match.status === 'completed') return;

    const winner = teamNum === 1 ? match.player1 : match.player2;
    if (!winner) return; // nothing to choose (TBD)

    // set winner & status
    match.winner = winner;
    match.status = 'completed';

    // advance to next round: nextMatchIndex = floor(matchIndex/2)
    if (roundIndex + 1 < bracketData.rounds.length) {
      const nextMatchIndex = Math.floor(matchIndex / 2);
      const nextMatch = bracketData.rounds[roundIndex + 1][nextMatchIndex];
      if (nextMatch) {
        const position = matchIndex % 2; // 0 => goes to player1 slot, 1 => player2 slot
        if (position === 0) {
          nextMatch.player1 = nextMatch.player1 || winner;
        } else {
          nextMatch.player2 = nextMatch.player2 || winner;
        }
        nextMatch.isBye = !(nextMatch.player1 && nextMatch.player2);
      }
    } else {
      // final
      bracketData.champion = winner;
    }

    renderBracket();
    updateStats();
    showNotification(`${winner.name} memenangkan match`);
  }

  /* ------------- simulate / reset / clear ------------- */
  function simulateTournament() {
    if (bracketData.champion) {
      alert('Turnamen sudah selesai. Reset dulu.');
      return;
    }
    for (let r=0;r<bracketData.rounds.length;r++) {
      const round = bracketData.rounds[r];
      for (let m=0;m<round.length;m++) {
        const match = round[m];
        if (!match || match.status === 'completed') continue;
        // determine winner: if one side null -> the other wins; else random
        let winner = null;
        if (match.player1 && !match.player2) winner = match.player1;
        else if (!match.player1 && match.player2) winner = match.player2;
        else if (match.player1 && match.player2) winner = Math.random() > 0.5 ? match.player1 : match.player2;
        if (!winner) continue;
        match.winner = winner;
        match.status = 'completed';
        if (r + 1 < bracketData.rounds.length) {
          const nextIdx = Math.floor(m / 2);
          const pos = m % 2;
          const next = bracketData.rounds[r+1][nextIdx];
          if (next) {
            if (pos === 0) next.player1 = next.player1 || winner;
            else next.player2 = next.player2 || winner;
            next.isBye = !(next.player1 && next.player2);
          }
        } else {
          bracketData.champion = winner;
        }
      }
    }
    renderBracket();
    updateStats();
    showNotification('Turnamen disimulasikan.');
  }

  function updateStats() {
    let total = 0, completed = 0;
    bracketData.rounds.forEach(r => {
      total += r.length;
      completed += r.filter(m => m && m.status === 'completed').length;
    });
    const remaining = total - completed;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    if (totalMatchesEl) totalMatchesEl.textContent = total;
    if (completedMatchesEl) completedMatchesEl.textContent = completed;
    if (remainingMatchesEl) remainingMatchesEl.textContent = remaining;
    if (completionRateEl) completionRateEl.textContent = `${percent}%`;
    if (tournamentProgressEl) tournamentProgressEl.style.width = `${percent}%`;
    if (progressPercentageEl) progressPercentageEl.textContent = `${percent}%`;
    if (tournamentProgressEl) {
      tournamentProgressEl.className = 'progress-bar';
      if (percent >= 70) tournamentProgressEl.classList.add('bg-success');
      else if (percent >= 30) tournamentProgressEl.classList.add('bg-warning');
    }
  }

  function resetBracket() {
    if (!confirm('Reset bracket? Semua progres hilang.')) return;
    generateBracket();
    showNotification('Bracket di-reset.');
  }

  function clearResults() {
    if (!confirm('Hapus semua hasil?')) return;
    bracketData.rounds.forEach((r, ridx) => {
      r.forEach((m, midx) => {
        if (!m) return;
        m.winner = null;
        m.status = 'pending';
        if (ridx > 0) {
          m.player1 = null;
          m.player2 = null;
          m.isBye = false;
        } else {
          m.isBye = !(m.player1 && m.player2);
        }
      });
    });
    bracketData.champion = null;
    renderBracket();
    updateStats();
    showNotification('Hasil dihapus.');
  }

  /* ------------- misc ------------- */
  function showNotification(msg) {
    const n = document.createElement('div');
    n.className = 'position-fixed bottom-0 end-0 p-3';
    n.style.zIndex = 1050;
    n.innerHTML = `
      <div class="toast show" role="alert">
        <div class="toast-header bg-primary text-white">
          <strong class="me-auto">Bracket</strong>
          <button type="button" class="btn-close btn-close-white"></button>
        </div>
        <div class="toast-body">${msg}</div>
      </div>
    `;
    document.body.appendChild(n);
    n.querySelector('.btn-close').addEventListener('click', () => n.remove());
    setTimeout(() => n.remove(), 2500);
  }

  function debounce(fn, wait=100) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
  }
});
