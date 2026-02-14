const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

// --- 1. 核心配置与目录初始化 ---
const matchBaseDir = "./matches";
const playersOutputDir = "./players";
if (!fs.existsSync(playersOutputDir)) fs.mkdirSync(playersOutputDir);

// 递归获取所有 JSON 文件
function getAllJsonFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllJsonFiles(fullPath));
    } else if (file.endsWith(".json")) {
      results.push(fullPath);
    }
  });
  return results;
}

// --- 2. 全局数据扫描与选手库构建 ---
const allJsonFiles = getAllJsonFiles(matchBaseDir);
const playerDb = {};
const allMatchesForMain = [];

allJsonFiles.forEach((filePath) => {
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const pathParts = filePath.split(path.sep);
  const matchDate = pathParts[pathParts.length - 2];

  // 默认展示 20260213 目录下的比赛
  if (matchDate === "20260213") {
    allMatchesForMain.push(content);
  }

  content.teams.forEach((team) => {
    const opponent = content.teams.find((t) => t.team_name !== team.team_name);
    team.players.forEach((p) => {
      if (!playerDb[p.name]) {
        playerDb[p.name] = {
          name: p.name,
          nationality: p.nationality,
          currentTeam: team.team_name,
          history: [],
          agents: {},
        };
      }
      const pData = playerDb[p.name];
      pData.history.push({
        date: matchDate,
        map: content.map,
        team: team.team_name,
        opponent: opponent.team_name,
        score: `${team.score} : ${opponent.score}`,
        isWin: team.score > opponent.score,
        agent: p.agents[0],
        stats: p.stats,
      });

      p.agents.forEach((agentName) => {
        if (!pData.agents[agentName]) {
          pData.agents[agentName] = {
            use: 0,
            r: 0,
            acs: 0,
            k: 0,
            d: 0,
            adr: 0,
          };
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
  });
});

// --- 3. 汇总函数 (通过 Name 匹配，彻底解决对不齐问题) ---
function generateAllMapsData(matches) {
  if (matches.length === 0) return null;

  // 计算大比分
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
      let tr = 0,
        tacs = 0,
        tadr = 0,
        tk = 0,
        td = 0,
        ta = 0,
        tfk = 0,
        tfd = 0,
        ksum = 0,
        hsum = 0,
        count = 0;
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

// --- 4. 生成个人主页 HTML ---
function generatePlayerHtml(player) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script><style>body{background:#f2f2f2;font-family:sans-serif}.vlr-card{background:white;border-bottom:1px solid #ddd;margin-bottom:20px}.tab-btn{padding:12px 20px;cursor:pointer;color:#777}.tab-btn.active{border-bottom:3px solid #2979ff;color:#2979ff;font-weight:bold}.match-item{display:flex;align-items:center;background:white;border-bottom:1px solid #eee;padding:10px 20px;font-size:13px}.score-box{width:50px;text-align:center;font-weight:bold;padding:3px;border-radius:2px}.win{background:#e7f3e7;color:#52a952}.lose{background:#fdeaea;color:#d04e4e}</style></head><body><div class="max-w-5xl mx-auto py-8"><div class="vlr-card p-6 flex items-end gap-6"><div class="w-24 h-24 bg-gray-200 flex items-center justify-center text-gray-400">PHOTO</div><div><div class="flex items-center gap-2"><span class="text-sm text-red-600 font-bold">${player.nationality.toUpperCase()}</span><h1 class="text-4xl font-bold">${player.name}</h1></div><div class="text-xl text-gray-500">${player.currentTeam}</div></div></div><div class="flex border-b border-gray-300 mb-4 bg-white px-4"><div class="tab-btn active" onclick="showTab('ov', this)">Overview</div><div class="tab-btn" onclick="showTab('mh', this)">Match History</div></div><div id="tab-ov" class="tab-content bg-white shadow-sm"><table class="w-full text-sm"><thead class="bg-gray-50 border-b"><tr class="text-center"><th class="p-4 text-left">AGENT</th><th>USE</th><th>RATING</th><th>ACS</th><th>K:D</th><th>ADR</th></tr></thead><tbody>${Object.entries(
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

// --- 5. 生成 index.html ---
const templateSource = `
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f2f2f2; font-family: sans-serif; }
        .score-header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px; border-bottom: 1px solid #ddd; }
        .score-large { font-size: 48px; font-weight: bold; }
        .text-win { color: #52a952; }
        .vlr-table { border-collapse: collapse; width: 100%; font-size: 13px; background: white; margin-bottom: 24px; table-layout: fixed; }
        .vlr-table th { color: #7a7a7a; padding: 12px 4px; border-bottom: 1px solid #eee; font-weight: normal; }
        .vlr-table td { padding: 8px 4px; border-bottom: 1px solid #eee; text-align: center; overflow: hidden; }
        .cell-player { text-align: left !important; padding-left: 12px !important; width: 160px; }
        .cell-stat { width: 55px; }
        .cell-agents { width: 80px; }
        .cell-kda { width: 90px; }
        .tab-btn { padding: 8px 16px; background: #ddd; font-weight: bold; cursor: pointer; border: none; }
        .tab-btn.active { background: #666; color: white; }
        .round-box { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; margin: 1px; background: #eee; }
        .win-green { background: #52a952 !important; } .win-red { background: #d04e4e !important; }
    </style>
</head>
<body>
    <div class="max-w-6xl mx-auto p-4">
        <div class="flex gap-1 mb-4">{{#each allData}}<button onclick="switchMatch({{id}})" class="tab-btn" id="btn-{{id}}">{{displayTitle}}</button>{{/each}}</div>
        <div id="content-area"></div>
    </div>
    <script>
        const matchesData = {{{jsonAllData}}};
        function switchMatch(id) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-' + id).classList.add('active');
            const data = matchesData.find(m => m.id === id);
            const s0 = data.isAllMaps ? data.seriesScore[0] : data.teams[0].score;
            const s1 = data.isAllMaps ? data.seriesScore[1] : data.teams[1].score;
            const pickText = data.map_pick === true ? '◀ PICK' : (data.map_pick === false ? 'PICK ▶' : '');

            let html = \`
                <div class="score-header mb-4 shadow-sm">
                    <div class="flex items-center gap-4"><span class="score-large \${s0 > s1 ? 'text-win' : ''}">\${s0}</span><div class="font-bold">\${data.teams[0].team_name}</div></div>
                    <div class="text-center"><div class="text-[10px] text-gray-400">\${pickText}</div><div class="font-bold text-xl">\${data.map}</div></div>
                    <div class="flex items-center gap-4"><div class="font-bold">\${data.teams[1].team_name}</div><span class="score-large \max-w-6xl \${s1 > s0 ? 'text-win' : ''}">\${s1}</span></div>
                </div>\`;

            if(!data.isAllMaps) {
                html += \`<div class="bg-white p-4 mb-4 shadow-sm">\`;
                data.teams.forEach((team, tIdx) => {
                    html += \`<div class="flex items-center mb-1"><div class="w-24 text-xs font-bold truncate">\${team.team_name}</div>\`;
                    for(let i=0; i<24; i++) {
                        const ev = team.round_history[i] || 'none';
                        const cls = ev !== 'none' ? (tIdx === 0 ? 'win-red' : 'win-green') : '';
                        html += \`<div class="round-box \${cls} \${i===12?'ml-4':''}">\${ev!=='none'?'<img src="./img/events/'+ev+'.webp" class="w-4">':''}</div>\`;
                    }
                    html += \`</div>\`;
                });
                html += \`</div>\`;
            }

            data.teams.forEach(team => {
                html += \`<table class="vlr-table shadow-sm"><thead><tr><th class="cell-player">PLAYER</th><th class="cell-agents">AGENTS</th><th class="cell-stat">R</th><th class="cell-stat">ACS</th><th class="cell-kda">K/D/A</th><th class="cell-stat">+/-</th><th class="cell-stat">KAST</th><th class="cell-stat">ADR</th><th class="cell-stat">HS%</th><th class="cell-stat">FK</th><th class="cell-stat">FD</th></tr></thead><tbody>\`;
                team.players.forEach(p => {
                    html += \`<tr>
                        <td class="cell-player"><a href="./players/\${p.name}.html" class="text-blue-600 font-bold hover:underline">\${p.name}</a></td>
                        <td class="cell-agents"><div class="flex justify-center gap-1">\${p.agents.map(a=>'<img src="./img/agents/'+a+'.png" class="w-5">').join('')}</div></td>
                        <td class="font-bold">\${p.stats.rating}</td><td>\${p.stats.acs}</td><td>\${p.stats.k}/\${p.stats.d}/\${p.stats.a}</td>
                        <td class="\${p.stats.diff>0?'text-green-600':'text-red-600'}">\${p.stats.diff}</td><td>\${p.stats.kast}</td><td>\${p.stats.adr}</td><td>\${p.stats.hs_percent}</td><td>\${p.stats.fk}</td><td>\${p.stats.fd}</td>
                    </tr>\`;
                });
                html += '</tbody></table>';
            });
            document.getElementById('content-area').innerHTML = html;
        }
        switchMatch(0);
    </script>
</body>
</html>`;

// --- 6. 执行生成 ---
Object.values(playerDb).forEach((p) =>
  fs.writeFileSync(
    path.join(playersOutputDir, `${p.name}.html`),
    generatePlayerHtml(p),
  ),
);

const individualMatches = allMatchesForMain.map((m, i) => ({
  id: i + 1,
  displayTitle: `${i + 1} ${m.map}`,
  ...m,
}));
const finalDataList = [
  generateAllMapsData(individualMatches),
  ...individualMatches,
];
const template = Handlebars.compile(templateSource);
fs.writeFileSync(
  "index.html",
  template({
    allData: finalDataList,
    jsonAllData: JSON.stringify(finalDataList),
  }),
);

console.log("✅ index.html & Player Pages Generated!");
