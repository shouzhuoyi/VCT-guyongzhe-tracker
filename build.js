const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

// --- Config ---
const matchBaseDir = "./matches";
const playersOutputDir = "./players";
const matchDetailsOutputDir = "./"; 

if (!fs.existsSync(playersOutputDir)) fs.mkdirSync(playersOutputDir);

// Load Templates
const detailTemplateSource = fs.readFileSync('template.html', 'utf8');
const detailTemplate = Handlebars.compile(detailTemplateSource);

const homeTemplateSource = fs.readFileSync('home_template.html', 'utf8');
const homeTemplate = Handlebars.compile(homeTemplateSource);

const statsTemplateSource = fs.readFileSync('stats_template.html', 'utf8');
const statsTemplate = Handlebars.compile(statsTemplateSource);

Handlebars.registerHelper('isWinner', function(team) {
    return team && team.isWin;
});

// --- Logic ---
const playerDb = {}; 
const allSeriesSummaries = []; 

// Header Generator
function getHeader(isRoot = true) {
    const rootPath = isRoot ? '.' : '..';
    return `
    <nav class="bg-gray-800 text-white shadow-md mb-6">
        <div class="max-w-6xl mx-auto px-4">
            <div class="flex items-center h-16 gap-8">
                <a href="${rootPath}/index.html" class="font-bold text-xl tracking-wide">VCT赛事吧-孤勇者杯内战</a>
                <div class="flex gap-4 text-sm font-medium">
                    <a href="${rootPath}/index.html" class="hover:text-gray-300 transition-colors">MATCHES</a>
                    <a href="${rootPath}/stats.html" class="hover:text-gray-300 transition-colors">STATS</a>
                </div>
            </div>
        </div>
    </nav>`;
}


// 1. Scan Matches Directory
if (fs.existsSync(matchBaseDir)) {
    const dateFolders = fs.readdirSync(matchBaseDir).filter(f => {
        return fs.statSync(path.join(matchBaseDir, f)).isDirectory();
    });

    dateFolders.forEach(dateFolder => {
        const currentDir = path.join(matchBaseDir, dateFolder);
        const jsonFiles = fs.readdirSync(currentDir).filter(f => f.endsWith('.json'));
        
        if (jsonFiles.length === 0) return;
        
        const seriesMatches = [];
        jsonFiles.forEach(file => {
            const content = JSON.parse(fs.readFileSync(path.join(currentDir, file), 'utf8'));
            seriesMatches.push(content);
        });

        // --- Process Player Stats ---
        seriesMatches.forEach(match => {
            const totalRounds = match.teams[0].score + match.teams[1].score;

            match.teams.forEach(team => {
                const opponent = match.teams.find(t => t.team_name !== team.team_name);
                
                team.players.forEach(p => {
                    // Rating Calculation
                    if (totalRounds > 0) {
                        const kpr = p.stats.k / totalRounds;
                        const newRating = 0.3 + (p.stats.acs / 200 * 0.5) + (kpr * 0.5) + (p.stats.adr / 150 * 0.2);
                        p.stats.rating = newRating.toFixed(2);
                    }

                    if (!playerDb[p.name]) {
                        playerDb[p.name] = {
                            name: p.name,
                            nationality: p.nationality,
                            currentTeam: team.team_name,
                            history: [],
                            agents: {},
                            // Aggregate Stats Accumulators
                            total: {
                                rounds: 0,
                                acsSum: 0, // acs * rounds
                                ratingSum: 0, // rating * rounds
                                adrSum: 0, // adr * rounds
                                k: 0, d: 0, a: 0,
                                fk: 0, fd: 0,
                                kastSum: 0, // kast% * rounds
                                hsSum: 0 // hs% * rounds
                            }
                        };
                    }
                    const pData = playerDb[p.name];
                    
                    // Accumulate totals
                    pData.total.rounds += totalRounds;
                    pData.total.acsSum += p.stats.acs * totalRounds;
                    pData.total.ratingSum += parseFloat(p.stats.rating) * totalRounds;
                    pData.total.adrSum += p.stats.adr * totalRounds;
                    pData.total.k += p.stats.k;
                    pData.total.d += p.stats.d;
                    pData.total.a += p.stats.a;
                    pData.total.fk += p.stats.fk;
                    pData.total.fd += p.stats.fd;
                    pData.total.kastSum += parseFloat(p.stats.kast) * totalRounds;
                    pData.total.hsSum += parseFloat(p.stats.hs_percent) * totalRounds;

                    // Add History
                    pData.history.push({
                        date: dateFolder,
                        map: match.map,
                        team: team.team_name,
                        opponent: opponent.team_name,
                        score: `${team.score} : ${opponent.score}`,
                        isWin: team.score > opponent.score,
                        agent: p.agents[0],
                        stats: p.stats
                    });

                    // Aggregate Agent Stats
                    p.agents.forEach(agentName => {
                        if (!pData.agents[agentName]) {
                            pData.agents[agentName] = { use: 0, r: 0, acs: 0, k: 0, d: 0, adr: 0 };
                        }
                        const aStats = pData.agents[agentName];
                        aStats.use++;
                        aStats.r += parseFloat(p.stats.rating);
                        aStats.acs += p.stats.acs;
                        aStats.k += p.stats.k;
                        aStats.d += p.stats.d;
                        aStats.adr += p.stats.adr;
                    });
                });
                
                team.players.sort((a, b) => parseFloat(b.stats.rating) - parseFloat(a.stats.rating));
            });
        });

        // --- Generate Detail Page ---
        const individualMatches = seriesMatches.map((m, i) => ({
            id: i + 1,
            displayTitle: `${i + 1} ${m.map}`,
            ...m
        }));
        const allMapsData = generateAllMapsData(individualMatches);
        const finalDataList = [allMapsData, ...individualMatches];
        const fileName = `match_${dateFolder}.html`;
        
        // Inject Header
        // Note: detailTemplate uses {{...}} for data. We can pass header as data.
        // But template.html needs to have {{{header}}} placeholder.
        // Let's assume template.html has {{{header}}} at top of body. 
        // Wait, I need to update template.html to include {{{header}}}! 
        // (I will do that via search/replace or just rewrite it in memory if needed, but better to edit file)
        
        // Actually, let's just prepend it to the body content in the template source?
        // No, cleaner to use Handlebars data.
        // My template.html does NOT have {{{header}}} placeholder yet.
        // I will update template.html in next step. For now, assume it has it.
        
        fs.writeFileSync(
            path.join(matchDetailsOutputDir, fileName),
            detailTemplate({
                header: getHeader(true),
                allData: finalDataList,
                jsonAllData: JSON.stringify(finalDataList)
            })
        );

        // --- Summarize for Index ---
        if (seriesMatches.length > 0) {
            const teamAName = seriesMatches[0].teams[0].team_name;
            const teamBName = seriesMatches[0].teams[1].team_name;
            let scoreA = 0, scoreB = 0;
            seriesMatches.forEach(m => {
                const tA = m.teams.find(t => t.team_name === teamAName);
                const tB = m.teams.find(t => t.team_name === teamBName);
                if (tA.score > tB.score) scoreA++; else scoreB++;
            });
            allSeriesSummaries.push({
                date: dateFolder,
                fileName: fileName,
                mapCount: seriesMatches.length,
                teamA: { name: teamAName, score: scoreA, isWin: scoreA > scoreB },
                teamB: { name: teamBName, score: scoreB, isWin: scoreB > scoreA }
            });
        }
    });
}

// 2. Generate Index (Home)
// Need to update home_template.html to accept header? 
// I'll prepend header manually for now or update template.
// I will update home_template.html to include {{{header}}}.
fs.writeFileSync(
    'index.html',
    homeTemplate({ 
        header: getHeader(true),
        matches: allSeriesSummaries 
    })
);


// 3. Generate Stats Page (All Players)
const allPlayersList = Object.values(playerDb).map(p => {
    const t = p.total;
    const r = t.rounds || 1;
    
    // Sort agents by usage
    const sortedAgents = Object.entries(p.agents)
        .sort((a, b) => b[1].use - a[1].use)
        .map(entry => entry[0])
        .slice(0, 3);

    return {
        name: p.name,
        team: p.currentTeam,
        agents: sortedAgents, // Added agents
        rounds: t.rounds,
        rating: (t.ratingSum / r).toFixed(2),
        acs: Math.round(t.acsSum / r),
        k: t.k,
        d: t.d,
        a: t.a,
        kd: (t.k / (t.d || 1)).toFixed(2), // Changed to Ratio
        kast: Math.round(t.kastSum / r),
        adr: Math.round(t.adrSum / r),
        hs: Math.round(t.hsSum / r),
        kpr: (t.k / r).toFixed(2),
        apr: (t.a / r).toFixed(2),
        fkpr: (t.fk / r).toFixed(2),
        fdpr: (t.fd / r).toFixed(2)
    };
});
// Sort by Rating default
allPlayersList.sort((a, b) => b.rating - a.rating);

fs.writeFileSync(
    'stats.html',
    statsTemplate({
        header: getHeader(true),
        players: allPlayersList,
        jsonPlayers: JSON.stringify(allPlayersList)
    })
);
console.log("✅ Stats Page Generated!");


// 4. Generate Player Pages
function generatePlayerHtml(player) {
    const header = getHeader(false); // isRoot = false
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${player.name} - Stats</title><script src="https://cdn.tailwindcss.com"></script><style>body{background:#f2f2f2;font-family:sans-serif}.vlr-card{background:white;border-bottom:1px solid #ddd;margin-bottom:20px}.tab-btn{padding:12px 20px;cursor:pointer;color:#777}.tab-btn.active{border-bottom:3px solid #2979ff;color:#2979ff;font-weight:bold}.match-item{display:flex;align-items:center;background:white;border-bottom:1px solid #eee;padding:10px 20px;font-size:13px}.score-box{width:50px;text-align:center;font-weight:bold;padding:3px;border-radius:2px}.win{background:#e7f3e7;color:#52a952}.lose{background:#fdeaea;color:#d04e4e}</style></head><body>
    ${header}
    <div class="max-w-5xl mx-auto py-8"><div class="vlr-card p-6 flex items-end gap-6"><div class="w-24 h-24 bg-gray-200 flex items-center justify-center text-gray-400">PHOTO</div><div><div class="flex items-center gap-2"><span class="text-sm text-red-600 font-bold">${player.nationality.toUpperCase()}</span><h1 class="text-4xl font-bold">${player.name}</h1></div><div class="text-xl text-gray-500">${player.currentTeam}</div></div></div><div class="flex border-b border-gray-300 mb-4 bg-white px-4"><div class="tab-btn active" onclick="showTab('ov', this)">Overview</div><div class="tab-btn" onclick="showTab('mh', this)">Match History</div></div><div id="tab-ov" class="tab-content bg-white shadow-sm"><table class="w-full text-sm"><thead class="bg-gray-50 border-b"><tr class="text-center"><th class="p-4 text-left">AGENT</th><th>USE</th><th>RATING</th><th>ACS</th><th>K:D</th><th>ADR</th></tr></thead><tbody>${Object.entries(
      player.agents,
    )
      .map(
        ([name, s]) =>
          `<tr class="border-b text-center hover:bg-gray-50"><td class="p-3 text-left flex items-center gap-3"><img src="../img/agents/${name}.png" class="w-8 h-8"><span class="font-bold text-blue-600">${name.toUpperCase()}</span></td><td>${s.use}</td><td class="font-bold">${(s.r / s.use).toFixed(2)}</td><td>${Math.round(s.acs / s.use)}</td><td>${(s.k / s.d).toFixed(2)}</td><td>${Math.round(s.adr / s.use)}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div id="tab-mh" class="tab-content hidden space-y-1">${player.history
      .reverse()
      .map(
        (m) =>
          `<div class="match-item"><div class="w-32 text-gray-400">${m.date}</div><div class="flex-1 flex items-center justify-center gap-6"><span class="w-40 text-right font-bold">${m.team}</span><div class="score-box ${m.isWin ? "win" : "lose"}">${m.score}</div><span class="w-40 text-left">${m.opponent}</span></div><div class="w-24 flex items-center justify-end gap-2"><span class="text-xs text-gray-400">${m.map}</span><img src="../img/agents/${m.agent}.png" class="w-6 h-6"></div></div>`,
      )
      .join(
        "",
      )}</div></div><script>function showTab(t, b){document.querySelectorAll('.tab-content').forEach(e=>e.classList.add('hidden'));document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));document.getElementById('tab-'+t).classList.remove('hidden');b.classList.add('active')}</script></body></html>`;
}

Object.values(playerDb).forEach((p) =>
  fs.writeFileSync(
    path.join(playersOutputDir, `${p.name}.html`),
    generatePlayerHtml(p),
  ),
);
console.log("✅ Player Pages Generated!");

// Helper function remains same
function generateAllMapsData(matches) {
    if (matches.length === 0) return null;
    let seriesScore = [0, 0];
    matches.forEach((m) => {
      if (m.teams[0].score > m.teams[1].score) seriesScore[0]++;
      else if (m.teams[1].score > m.teams[0].score) seriesScore[1]++;
    });
    const allMaps = {
      id: 0,
      displayTitle: "All Maps",
      map: "Overall Stats",
      isAllMaps: true,
      seriesScore: seriesScore,
      teams: matches[0].teams.map((t) => ({
        team_name: t.team_name,
        players: [],
      })),
    };
    allMaps.teams.forEach((team) => {
      const teamName = team.team_name;
      const playerNames = new Set();
      matches.forEach((m) => {
        const mTeam = m.teams.find((t) => t.team_name === teamName);
        if (mTeam) mTeam.players.forEach((p) => playerNames.add(p.name));
      });
      playerNames.forEach((pName) => {
        let tr = 0, tacs = 0, tadr = 0, tk = 0, td = 0, ta = 0, tfk = 0, tfd = 0, ksum = 0, hsum = 0, count = 0;
        let agents = new Set();
        let nat = "cn";
        matches.forEach((m) => {
          const mTeam = m.teams.find((t) => t.team_name === teamName);
          if (!mTeam) return;
          const p = mTeam.players.find((player) => player.name === pName);
          if (p) {
            count++;
            nat = p.nationality;
            tr += parseFloat(p.stats.rating);
            tacs += p.stats.acs;
            tadr += p.stats.adr;
            tk += p.stats.k;
            td += p.stats.d;
            ta += p.stats.a;
            tfk += p.stats.fk;
            tfd += p.stats.fd;
            ksum += parseFloat(p.stats.kast);
            hsum += parseFloat(p.stats.hs_percent);
            p.agents.forEach((a) => agents.add(a));
          }
        });
        team.players.push({
          name: pName,
          nationality: nat,
          agents: Array.from(agents),
          stats: {
            rating: (tr / count).toFixed(2),
            acs: Math.round(tacs / count),
            k: tk,
            d: td,
            a: ta,
            diff: tk - td,
            kast: Math.round(ksum / count) + "%",
            adr: Math.round(tadr / count),
            hs_percent: Math.round(hsum / count) + "%",
            fk: tfk,
            fd: tfd,
            fkfd_diff: tfk - tfd,
          },
        });
      });
      team.players.sort((a, b) => b.stats.rating - a.stats.rating);
    });
    return allMaps;
  }
