// alat1.js (replace existing)
document.addEventListener('DOMContentLoaded', function() {
  // DOM refs
  const bracketContainer = document.getElementById('bracketContainer');
  const bracketColumns = document.getElementById('bracketColumns');
  const participantCountSelect = document.getElementById('participantCount');
  const tournamentNameInput = document.getElementById('tournamentName');
  const generateBtn = document.getElementById('generateBtn');
  const resetBtn = document.getElementById('resetBtn');
  const simulateBtn = document.getElementById('simulateBtn');
  const clearBtn = document.getElementById('clearBtn');
  

  // stats
  const totalMatchesEl = document.getElementById('totalMatches');
  const completedMatchesEl = document.getElementById('completedMatches');
  const remainingMatchesEl = document.getElementById('remainingMatches');
  const completionRateEl = document.getElementById('completionRate');
  const tournamentProgressEl = document.getElementById('tournamentProgress');
  const progressPercentageEl = document.getElementById('progressPercentage');

  // SVG overlay for connectors
  let svgOverlay = null;
  function ensureSvg(){
    if(svgOverlay) return;
    svgOverlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svgOverlay.style.position = 'absolute';
    svgOverlay.style.left = '0';
    svgOverlay.style.top = '0';
    svgOverlay.style.width = '100%';
    svgOverlay.style.height = '100%';
    svgOverlay.style.pointerEvents = 'none';
    svgOverlay.setAttribute('class','bracket-svg-overlay');
    bracketContainer.appendChild(svgOverlay);
  }
  function clearSvg(){ if(!svgOverlay) return; while(svgOverlay.firstChild) svgOverlay.removeChild(svgOverlay.firstChild); }

  // data
  let tournamentData = {
    name: "Championship Bracket",
    participants: 8,
    rounds: [],
    champion: null,
    stats: {}
  };

  const defaultPlayerNames = Array.from({length:16}, (_,i) => `Player ${i+1}`);

  // events
  generateBtn.addEventListener('click', initializeBracket);
  resetBtn.addEventListener('click', resetBracket);
  simulateBtn.addEventListener('click', simulateTournament);
  clearBtn.addEventListener('click', clearResults);
  participantCountSelect.addEventListener('change', () => tournamentData.participants = parseInt(participantCountSelect.value));
  tournamentNameInput.addEventListener('change', () => {
    tournamentData.name = tournamentNameInput.value;
    document.querySelector('.tournament-header h1').innerHTML = `<i class="fas fa-trophy"></i> ${tournamentData.name}`;
  });

  // delegation for team clicks (prevents lost listeners)
  bracketColumns.addEventListener('click', function(e){
    const team = e.target.closest('.team');
    if(!team) return;
    const matchWrapper = team.closest('.match-wrapper');
    if(!matchWrapper) return;
    const round = parseInt(matchWrapper.dataset.round,10);
    const idx = parseInt(matchWrapper.dataset.index,10);
    const playerType = team.dataset.player; // "player1" or "player2"
    if(isNaN(round) || isNaN(idx)) return;

    const match = tournamentData.rounds[round][idx];
    if(!match) return;
    if(match.status !== 'pending' || match.isBye) return;

    const player = match[playerType];
    if(!player) return;

    selectWinner(match, player, round, idx);
  });

  // init
  initializeBracket();
  window.addEventListener('resize', debounce(()=> {
    drawAllConnectors();
  }, 120));

  /* --------- core: initialize & generation --------- */
  function initializeBracket(){
    const participants = tournamentData.participants;
    tournamentData.rounds = [];
    tournamentData.champion = null;

    const totalRounds = Math.ceil(Math.log2(participants));
    // players
    const players = [];
    for(let i=0;i<participants;i++){
      players.push({ id: i+1, name: defaultPlayerNames[i] || `Player ${i+1}`, seed: i+1 });
    }

    // first round
    const bracketFormat = document.querySelector('input[name="bracketFormat"]:checked')?.value || 'standard';
    let round1 = bracketFormat === 'random' ? generateRandomBracket(players) : generateStandardBracket(players);
    tournamentData.rounds.push(round1);

    // next rounds
    let prev = round1;
    for(let r=2; r<= totalRounds; r++){
      const next = generateNextRound(prev, r);
      tournamentData.rounds.push(next);
      prev = next;
    }

    renderBracket();
    updateStats();
  }

  function generateStandardBracket(players){
    const p = players.length;
    const m = [];
    if(p===2) m.push(createMatch(players[0],players[1],1,0));
    else if(p===4){
      m.push(createMatch(players[0],players[3],1,0));
      m.push(createMatch(players[1],players[2],1,1));
    } else if(p===8){
      m.push(createMatch(players[0],players[7],1,0));
      m.push(createMatch(players[3],players[4],1,1));
      m.push(createMatch(players[2],players[5],1,2));
      m.push(createMatch(players[1],players[6],1,3));
    } else if(p===16){
      // common seeding for 16
      m.push(createMatch(players[0],players[15],1,0));
      m.push(createMatch(players[7],players[8],1,1));
      m.push(createMatch(players[4],players[11],1,2));
      m.push(createMatch(players[3],players[12],1,3));
      m.push(createMatch(players[5],players[10],1,4));
      m.push(createMatch(players[2],players[13],1,5));
      m.push(createMatch(players[6],players[9],1,6));
      m.push(createMatch(players[1],players[14],1,7));
    } else {
      // fallback: pair sequentially
      for(let i=0;i<players.length;i+=2){
        m.push(createMatch(players[i], players[i+1]||null, 1, i/2));
      }
    }
    return m;
  }

  function generateRandomBracket(players){
    const shuffled = [...players].sort(()=>Math.random()-0.5);
    const m = [];
    for(let i=0;i<shuffled.length;i+=2){
      m.push(createMatch(shuffled[i], shuffled[i+1]||null, 1, i/2));
    }
    return m;
  }

  function createMatch(p1,p2,round,idx){
    return {
      id: `match-${round}-${idx}`,
      player1: p1 || null,
      player2: p2 || null,
      winner: null,
      round: round-1, // store zero-based round index for easier mapping
      status: 'pending',
      isBye: p2 == null
    };
  }

  function generateNextRound(prevRound, roundNum){
    const count = Math.ceil(prevRound.length/2);
    const arr = [];
    for(let i=0;i<count;i++){
      arr.push({
        id: `match-${roundNum}-${i}`,
        player1: null,
        player2: null,
        winner: null,
        round: roundNum-1,
        status: 'pending',
        isBye: false
      });
    }
    return arr;
  }

  /* --------- render --------- */
  function renderBracket(){
    // clear svg first (so overlay doesn't get messed)
    if(svgOverlay){ clearSvg(); }
    bracketColumns.innerHTML = '';

    ensureSvg();

    const rounds = tournamentData.rounds;
    bracketContainer.className = 'bracket-container';
    bracketContainer.classList.add(`bracket-${tournamentData.participants}`);

    rounds.forEach((round, roundIndex) => {
      const roundColumn = document.createElement('div');
      roundColumn.className = 'round-column';
      roundColumn.id = `round-${roundIndex+1}`;

      const header = document.createElement('div');
      header.className = 'round-header';
      if(roundIndex === 0) header.textContent = 'Round 1';
      else if(roundIndex === rounds.length-1) header.textContent = 'Final';
      else if(roundIndex === rounds.length-2 && rounds.length>2) header.textContent = 'Semi Final';
      else if(roundIndex === rounds.length-3 && rounds.length>3) header.textContent = 'Quarter Final';
      else header.textContent = `Round ${roundIndex+1}`;
      roundColumn.appendChild(header);

      const columnContent = document.createElement('div');
      columnContent.className = 'column-content';

      round.forEach((match, matchIndex) => {
        const matchWrapper = document.createElement('div');
        matchWrapper.className = 'match-wrapper';
        matchWrapper.dataset.round = roundIndex;
        matchWrapper.dataset.index = matchIndex;

        const matchCard = document.createElement('div');
        matchCard.className = `match-card ${match.status === 'completed' ? 'completed' : 'pending'}`;
        matchCard.id = match.id;

        // team1
        const t1 = createTeamNode(match.player1, 'player1');
        // vs / or bye
        if(!match.isBye){
          const vs = document.createElement('div'); vs.className='vs'; vs.textContent='VS';
          const t2 = createTeamNode(match.player2, 'player2');
          matchCard.appendChild(t1);
          matchCard.appendChild(vs);
          matchCard.appendChild(t2);
        } else {
          matchCard.appendChild(t1);
          const bye = document.createElement('div'); bye.className='bye-label'; bye.textContent='BYE';
          matchCard.appendChild(bye);
          // auto advance for bye
          if(match.player1 && match.status==='pending'){
            setTimeout(()=> selectWinner(match, match.player1, roundIndex, matchIndex), 100);
          }
        }

        // status
        const statusDiv = document.createElement('div');
        statusDiv.className = 'match-status';
        statusDiv.textContent = match.status === 'completed' ? 'SELESAI' : 'MENUNGGU';
        matchCard.appendChild(statusDiv);

        matchWrapper.appendChild(matchCard);
        columnContent.appendChild(matchWrapper);
      });

      roundColumn.appendChild(columnContent);
      bracketColumns.appendChild(roundColumn);
    });

    renderChampionColumn();
    // Wait a tick for layout to settle then draw connectors
    requestAnimationFrame(()=> {
      drawAllConnectors();
    });
  }

  function createTeamNode(player, key){
    const div = document.createElement('div');
    div.className = 'team';
    div.dataset.player = key; // used by delegation

    if(!player){
      div.innerHTML = '<span class="team-name text-muted">TBD</span>';
      div.classList.add('pending');
      return div;
    }

    const name = document.createElement('span'); name.className='team-name'; name.textContent = player.name;
    const seed = document.createElement('span'); seed.className='seed'; seed.textContent = `Seed ${player.seed}`;

    div.appendChild(name); div.appendChild(seed);

    // mark winner
    // (we do visual class on render via tournamentData)
    return div;
  }

  function renderChampionColumn(){
    const championColumn = document.createElement('div');
    championColumn.className = 'champion-column';

    const championTitle = document.createElement('div'); championTitle.className='champion-title'; championTitle.textContent='CHAMPION';
    championColumn.appendChild(championTitle);

    const championBox = document.createElement('div'); championBox.className='champion-box';
    if(tournamentData.champion){
      championBox.innerHTML = `${tournamentData.champion.name}<div class="champion-seed">Seed ${tournamentData.champion.seed}</div>`;
    } else {
      championBox.textContent = 'TBD';
      championBox.classList.add('pending');
    }
    championColumn.appendChild(championBox);
    bracketColumns.appendChild(championColumn);
  }

  /* --------- connectors drawing (SVG polylines) --------- */
  function drawAllConnectors(){
    clearSvg();
    ensureSvg();
    const rounds = Array.from(document.querySelectorAll('.round-column'));
    if(rounds.length <= 1) return;

    // calculate offset of svg relative to page
    const containerRect = bracketContainer.getBoundingClientRect();
    // for each round except last
    rounds.forEach((roundCol, i) => {
      const nextCol = rounds[i+1];
      if(!nextCol) return;

      const matches = Array.from(roundCol.querySelectorAll('.match-wrapper'));
      const nextMatches = Array.from(nextCol.querySelectorAll('.match-wrapper'));

      matches.forEach((m, idx) => {
        const targetIndex = Math.floor(idx/2);
        const target = nextMatches[targetIndex];
        if(!target) return;
        drawConnectorBetween(m, target, containerRect);
      });
    });
  }

  function drawConnectorBetween(fromWrap, toWrap, containerRect){
    const fromRect = fromWrap.getBoundingClientRect();
    const toRect = toWrap.getBoundingClientRect();

    // compute points relative to svg (container)
    const x1 = fromRect.right - containerRect.left; // start at right edge of from
    const y1 = fromRect.top - containerRect.top + fromRect.height/2;
    const x2 = toRect.left - containerRect.left; // end at left edge of to
    const y2 = toRect.top - containerRect.top + toRect.height/2;

    // midpoint x (for elbow)
    const midX = x1 + Math.max(20, (x2 - x1) / 2);

    // polyline points: x1,y1 -> midX,y1 -> midX,y2 -> x2,y2
    const points = `${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`;

    const poly = document.createElementNS('http://www.w3.org/2000/svg','polyline');
    poly.setAttribute('points', points);
    poly.setAttribute('fill','none');
    poly.setAttribute('stroke','#6c757d');
    poly.setAttribute('stroke-width','2');
    poly.setAttribute('stroke-linecap','round');
    poly.setAttribute('stroke-linejoin','round');
    svgOverlay.appendChild(poly);
  }

  /* --------- selection / progression --------- */
  function selectWinner(match, winner, roundIndex, matchIndex){
    if(match.status !== 'pending') return;
    match.winner = winner;
    match.status = 'completed';
    tournamentData.rounds[roundIndex][matchIndex] = match;

    // progress to next round
    if(roundIndex < tournamentData.rounds.length - 1){
      const nextIndex = Math.floor(matchIndex/2);
      const position = matchIndex % 2; // 0 -> player1, 1 -> player2
      const nextMatch = tournamentData.rounds[roundIndex+1][nextIndex];
      if(nextMatch){
        if(position === 0) nextMatch.player1 = winner;
        else nextMatch.player2 = winner;
        tournamentData.rounds[roundIndex+1][nextIndex] = nextMatch;
        // if both players present and one is null, it's pending until the other fills
      }
    } else {
      tournamentData.champion = winner;
    }

    // visual: re-render whole bracket (cheap and simple)
    renderBracket();
    updateStats();
    showNotification(`${winner.name} (Seed ${winner.seed}) memenangkan match!`);
  }

  /* --------- utilities: stats, simulate, reset, clear --------- */
  function updateStats(){
    let total=0, completed=0;
    tournamentData.rounds.forEach(r => r.forEach(m => { total++; if(m.status==='completed') completed++; }));
    const remaining = total - completed;
    const percent = total ? Math.round((completed/total)*100) : 0;
    totalMatchesEl.textContent = total;
    completedMatchesEl.textContent = completed;
    remainingMatchesEl.textContent = remaining;
    completionRateEl.textContent = `${percent}%`;
    tournamentProgressEl.style.width = `${percent}%`;
    progressPercentageEl.textContent = `${percent}%`;
    // color classes
    tournamentProgressEl.className = percent < 30 ? 'progress-bar' : (percent < 70 ? 'progress-bar bg-warning' : 'progress-bar bg-success');
    tournamentData.stats = { total, completed, remaining, completionRate: `${percent}%`};
  }

  function simulateTournament(){
    if(tournamentData.champion){ alert('Turnamen sudah selesai! Reset terlebih dahulu.'); return; }
    // simulate from round 0 to last
    for(let r=0;r<tournamentData.rounds.length;r++){
      for(let m=0;m<tournamentData.rounds[r].length;m++){
        const match = tournamentData.rounds[r][m];
        if(match.status === 'pending'){
          if(match.isBye && match.player1){ match.winner = match.player1; match.status='completed'; if(r < tournamentData.rounds.length-1) updateNextRoundData(r,m,match.player1); else tournamentData.champion = match.player1; }
          else if(match.player1 && match.player2){
            const winner = Math.random()>0.5 ? match.player1 : match.player2;
            match.winner = winner; match.status='completed';
            if(r < tournamentData.rounds.length-1) updateNextRoundData(r,m,winner); else tournamentData.champion = winner;
          }
        }
      }
    }
    renderBracket(); updateStats(); showNotification('Turnamen telah disimulasikan!');
  }

  function updateNextRoundData(roundIndex, matchIndex, winner){
    const nextIdx = Math.floor(matchIndex/2);
    const pos = matchIndex % 2;
    const nextMatch = tournamentData.rounds[roundIndex+1][nextIdx];
    if(!nextMatch) return;
    if(pos===0) nextMatch.player1 = winner; else nextMatch.player2 = winner;
    tournamentData.rounds[roundIndex+1][nextIdx] = nextMatch;
  }

  function resetBracket(){
    if(!confirm('Apakah Anda yakin ingin mereset bracket? Semua progres akan hilang.')) return;
    initializeBracket();
    showNotification('Bracket telah direset');
  }

  function clearResults(){
    if(!confirm('Apakah Anda yakin ingin menghapus semua hasil?')) return;
    tournamentData.rounds.forEach((r,ri)=> r.forEach((m,mi)=>{
      if(ri===0){
        m.winner=null; m.status='pending';
      } else {
        m.player1=null; m.player2=null; m.winner=null; m.status='pending';
      }
    }));
    tournamentData.champion = null;
    renderBracket(); updateStats(); showNotification('Semua hasil telah dihapus');
  }

  /* --------- small helpers --------- */
  function showNotification(message){
    const notification = document.createElement('div');
    notification.className = 'position-fixed bottom-0 end-0 p-3';
    notification.style.zIndex = '1050';
    notification.innerHTML = `
      <div class="toast show" role="alert">
        <div class="toast-header bg-primary text-white">
          <strong class="me-auto">Bracket</strong>
          <button type="button" class="btn-close btn-close-white"></button>
        </div>
        <div class="toast-body">${message}</div>
      </div>`;
    document.body.appendChild(notification);
    const btn = notification.querySelector('.btn-close');
    btn.addEventListener('click', ()=> notification.remove());
    setTimeout(()=> notification.remove(), 3000);
  }

  function debounce(fn, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

});
