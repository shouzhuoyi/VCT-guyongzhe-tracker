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

// --- 2. 数据扫描与选手数据库构建 ---
const allJsonFiles = getAllJsonFiles(matchBaseDir);
const playerDb = {};
const allMatchesForMain = [];

allJsonFiles.forEach((filePath) => {
  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const pathParts = filePath.split(path.sep);
  const matchDate = pathParts[pathParts.length - 2];

  // 默认将 20260213 文件夹下的比赛显示在主页
  if (matchDate === "20260213") {
    allMatchesForMain.push(content);
  }

  // 建立全局选手档案
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

// --- 3. 辅助函数：按姓名汇总全地图数据 (修复索引错位问题) ---
function generateAllMapsData(matches) {
  if (matches.length === 0) return null;

  // 计算系列赛大比分 (BO3/BO5)
  let seriesScore = [0, 0];
  matches.forEach((m) => {
    if (m.teams[0].score > m.teams[1].score) seriesScore[0]++;
    else if (m.teams[1].score > m.teams[0].score) seriesScore[1]++;
  });

  const allMaps = {
    id: 0,
    displayTitle: "All Maps",
    map: "Overall Stats",
    isAllMaps: true, // 标识符用于前端切换比分显示
    seriesScore: seriesScore,
    teams: matches[0].teams.map((t) => ({
      team_name: t.team_name,
      players: [],
    })),
  };

  allMaps.teams.forEach((team) => {
    const teamName = team.team_name;
    // 搜集该战队在所有地图中上场过的所有选手
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
    // 按 Rating 排序
    team.players.sort((a, b) => b.stats.rating - a.stats.rating);
  });
  return allMaps;
}

// --- 4. 生成选手个人页 ---
function generatePlayerHtml(player) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background-color: #f2f2f2; font-family: sans-serif; }
            .vlr-card { background: white; border-bottom: 1px solid #ddd; margin-bottom: 20px; }
            .tab-btn { padding: 12px 20px; cursor: pointer; border-bottom: 3px solid transparent; color: #777; }
            .tab-btn.active { border-bottom-color: #2979ff; color: #2979ff; font-weight: bold; }
            .match-item { display: flex; align-items: center; background: white; border-bottom: 1px solid #eee; padding: 10px 20px; font-size: 13px; }
            .score-box { width: 50px; text-align: center; font-weight: bold; padding: 3px; border-radius: 2px; }
            .win { background: #e7f3e7; color: #52a952; }
            .lose { background: #fdeaea; color: #d04e4e; }
        </style>
    </head>
    <body>
        <div class="max-w-5xl mx-auto py-8">
            <div class="vlr-card p-6 flex items-end gap-6">
                <div class="w-24 h-24 bg-gray-200 border border-gray-300 flex items-center justify-center text-gray-400">PHOTO</div>
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-red-600 font-bold">${player.nationality.toUpperCase()}</span>
                        <h1 class="text-4xl font-bold">${player.name}</h1>
                    </div>
                    <div class="text-xl text-gray-500">${player.currentTeam}</div>
                </div>
            </div>
            <div class="flex border-b border-gray-300 mb-4 bg-white px-4">
                <div class="tab-btn active" id="btn-ov" onclick="showTab('ov')">Overview</div>
                <div class="tab-btn" id="btn-mh" onclick="showTab('mh')">Match History</div>
            </div>
            <div id="tab-ov" class="tab-content bg-white shadow-sm">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-500 border-b">
                        <tr class="text-center"><th class="p-4 text-left">AGENT</th><th>USE</th><th>RATING</th><th>ACS</th><th>K:D</th><th>ADR</th></tr>
                    </thead>
                    <tbody>
                        ${Object.entries(player.agents)
                          .map(
                            ([name, s]) => `
                        <tr class="border-b text-center hover:bg-gray-50">
                            <td class="p-3 text-left flex items-center gap-3">
                                <img src="../img/agents/${name}.png" class="w-8 h-8">
                                <span class="font-bold text-blue-600">${name.toUpperCase()}</span>
                            </td>
                            <td>${s.use}</td>
                            <td class="font-bold">${(s.r / s.use).toFixed(2)}</td>
                            <td>${Math.round(s.acs / s.use)}</td>
                            <td>${(s.k / s.d).toFixed(2)}</td>
                            <td>${Math.round(s.adr / s.use)}</td>
                        </tr>`,
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
            <div id="tab-mh" class="tab-content hidden space-y-1">
                ${player.history
                  .reverse()
                  .map(
                    (m) => `
                <div class="match-item">
                    <div class="w-32 text-gray-400 font-mono">${m.date}</div>
                    <div class="flex-1 flex items-center justify-center gap-6">
                        <span class="w-40 text-right font-bold">${m.team}</span>
                        <div class="score-box ${m.isWin ? "win" : "lose"}">${m.score}</div>
                        <span class="w-40 text-left text-gray-600">${m.opponent}</span>
                    </div>
                    <div class="w-24 text-right flex items-center justify-end gap-2">
                        <span class="text-xs text-gray-400 uppercase">${m.map}</span>
                        <img src="../img/agents/${m.agent}.png" class="w-6 h-6">
                    </div>
                </div>`,
                  )
                  .join("")}
            </div>
        </div>
        <script>
            function showTab(t){
                document.querySelectorAll('.tab-content').forEach(e=>e.classList.add('hidden'));
                document.querySelectorAll('.tab-btn').forEach(e=>e.classList.remove('active'));
                document.getElementById('tab-'+t).classList.remove('hidden');
                document.getElementById('btn-'+t).classList.add('active');
            }
        </script>
    </body>
    </html>`;
}

Object.values(playerDb).forEach((player) => {
  fs.writeFileSync(
    path.join(playersOutputDir, `${player.name}.html`),
    generatePlayerHtml(player),
  );
});

// --- 5. 生成主页 main.html ---
const templateSource = `
<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #f2f2f2; font-family: sans-serif; }
        .score-header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 20px; border-bottom: 1px solid #ddd; }
        .score-large { font-size: 48px; font-weight: bold; }
        .text-win { color: #52a952; }
        .round-box { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; margin: 1px; background: #e5e5e5; }
        .win-green { background-color: #52a952 !important; }
        .win-red { background-color: #d04e4e !important; }
        .vlr-table { border-collapse: collapse; width: 100%; font-size: 13px; background: white; margin-bottom: 24px; }
        .vlr-table th { color: #7a7a7a; padding: 12px 4px; border-bottom: 1px solid #eee; }
        .vlr-table td { padding: 8px 4px; border-bottom: 1px solid #eee; text-align: center; }
        .cell-player { text-align: left !important; padding-left: 12px !important; }
        .tab-btn { padding: 8px 16px; background: #ddd; font-weight: bold; cursor: pointer; border: none; }
        .tab-btn.active { background: #666; color: white; }
        .text-pos { color: #52a952; }
        .text-neg { color: #d04e4e; }
    </style>
</head>
<body>
    <div class="max-w-6xl mx-auto p-4">
        <div class="flex gap-1 mb-4">
            {{#each allData}}
            <button onclick="switchMatch({{id}})" class="tab-btn" id="btn-{{id}}">{{displayTitle}}</button>
            {{/each}}
        </div>
        <div id="content-area"></div>
    </div>
    <script>
        const matchesData = {{{jsonAllData}}};
        function switchMatch(id) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-' + id).classList.add('active');
            renderPage(matchesData.find(m => m.id === id));
        }
        function renderPage(data) {
            const container = document.getElementById('content-area');
            const s0 = data.isAllMaps ? data.seriesScore[0] : data.teams[0].score;
            const s1 = data.isAllMaps ? data.seriesScore[1] : data.teams[1].score;

            let html = \`
                <div class="score-header shadow-sm mb-4">
                    <div class="flex items-center gap-4"><span class="score-large \${s0 > s1 ? 'text-win' : ''}">\${s0}</span><div class="font-bold">\${data.teams[0].team_name}</div></div>
                    <div class="text-center">
                        <div class="text-[10px] text-gray-400">\${data.map_pick === true ? '◀ PICK' : (data.map_pick === false ? 'PICK ▶' : '')}</div>
                        <div class="font-bold text-xl">\${data.map}</div>
                    </div>
                    <div class="flex items-center gap-4"><div class="font-bold">\${data.teams[1].team_name}</div><span class="score-large \max-w-6xl \${s1 > s0 ? 'text-win' : ''}">\${s1}</span></div>
                </div>\`;

            if(!data.isAllMaps) {
                html += \`<div class="bg-white p-4 mb-4 shadow-sm flex flex-col gap-1">\`;
                data.teams.forEach((team, tIdx) => {
                    html += \`<div class="flex items-center"><div class="w-24 text-xs font-bold">\${team.team_name}</div>\`;
                    for(let i=0; i<24; i++) {
                        const ev = team.round_history[i] || 'none';
                        const cls = ev !== 'none' ? (tIdx === 0 ? 'win-red' : 'win-green') : 'bg-gray-100';
                        html += \`<div class="round-box \${cls} \${i===12?'ml-4':''}">\${ev!=='none'?'<img src="./img/events/'+ev+'.webp" class="w-4">':''}</div>\`;
                    }
                    html += \`</div>\`;
                });
                html += \`</div>\`;
            }

            data.teams.forEach(team => {
                html += \`<table class="vlr-table shadow-sm"><thead><tr><th class="cell-player">PLAYER</th><th>AGENTS</th><th>R</th><th>ACS</th><th>K/D/A</th><th>+/-</th><th>KAST</th><th>ADR</th><th>HS%</th><th>FK</th><th>FD</th></tr></thead><tbody>\`;
                team.players.forEach(p => {
                    html += \`<tr>
                        <td class="cell-player"><a href="./players/\${p.name}.html" class="text-blue-600 font-bold hover:underline">\${p.name}</a></td>
                        <td><div class="flex justify-center gap-1">\${p.agents.map(a=>'<img src="./img/agents/'+a+'.png" class="w-6">').join('')}</div></td>
                        <td class="font-bold">\${p.stats.rating}</td><td>\${p.stats.acs}</td><td>\${p.stats.k}/\${p.stats.d}/\${p.stats.a}</td>
                        <td class="\${p.stats.diff>0?'text-pos':'text-neg'}">\${p.stats.diff}</td><td>\${p.stats.kast}</td><td>\${p.stats.adr}</td><td>\${p.stats.hs_percent}</td><td>\${p.stats.fk}</td><td>\${p.stats.fd}</td>
                    </tr>\`;
                });
                html += '</tbody></table>';
            });
            container.innerHTML = html;
        }
        switchMatch(0);
    </script>
</body>
</html>`;

const individualMatches = allMatchesForMain.map((content, index) => ({
  id: index + 1,
  displayTitle: `${index + 1} ${content.map}`,
  ...content,
}));

const finalDataList = [
  generateAllMapsData(individualMatches),
  ...individualMatches,
];
const template = Handlebars.compile(templateSource);
fs.writeFileSync(
  "main.html",
  template({
    allData: finalDataList,
    jsonAllData: JSON.stringify(finalDataList),
  }),
);

console.log("✅ 成功生成 main.html 和所有选手个人主页！");
