const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = './valorant.db';
const matchBaseDir = './matches';

// Initialize DB
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // 1. Create Tables
    db.run(`CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        nationality TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        map TEXT,
        map_pick TEXT,
        team_a_name TEXT,
        team_a_score INTEGER,
        team_a_rounds TEXT,
        team_b_name TEXT,
        team_b_score INTEGER,
        team_b_rounds TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER,
        player_id INTEGER,
        team_name TEXT,
        agent TEXT,
        rating REAL,
        acs INTEGER,
        k INTEGER,
        d INTEGER,
        a INTEGER,
        diff INTEGER,
        kast TEXT,
        adr INTEGER,
        hs_percent TEXT,
        fk INTEGER,
        fd INTEGER,
        fkfd_diff INTEGER,
        FOREIGN KEY(match_id) REFERENCES matches(id),
        FOREIGN KEY(player_id) REFERENCES players(id)
    )`);

    // 2. Helper to get all JSON files
    function getAllJsonFiles(dir) {
        let results = [];
        if (!fs.existsSync(dir)) return results;
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllJsonFiles(fullPath));
            } else if (file.endsWith('.json')) {
                results.push(fullPath);
            }
        });
        return results;
    }

    const allJsonFiles = getAllJsonFiles(matchBaseDir);
    const playerCache = {}; // name -> id

    // 3. Insert Data
    const insertPlayer = db.prepare("INSERT OR IGNORE INTO players (name, nationality) VALUES (?, ?)");
    const getPlayerId = db.prepare("SELECT id FROM players WHERE name = ?");
    const insertMatch = db.prepare(`INSERT INTO matches (
        date, map, map_pick,
        team_a_name, team_a_score, team_a_rounds,
        team_b_name, team_b_score, team_b_rounds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertStat = db.prepare(`INSERT INTO stats (
        match_id, player_id, team_name, agent,
        rating, acs, k, d, a, diff, kast, adr, hs_percent, fk, fd, fkfd_diff
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    allJsonFiles.forEach(filePath => {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const pathParts = filePath.split(path.sep);
        const matchDate = pathParts[pathParts.length - 2]; // e.g., 20260213

        // Prepare Match Data
        const teamA = content.teams[0];
        const teamB = content.teams[1];

        insertMatch.run(
            matchDate,
            content.map,
            content.map_pick,
            teamA.team_name,
            teamA.score,
            JSON.stringify(teamA.round_history),
            teamB.team_name,
            teamB.score,
            JSON.stringify(teamB.round_history),
            function(err) {
                if (err) return console.error("Match Insert Error:", err);
                const matchId = this.lastID;

                // Process Players & Stats
                [teamA, teamB].forEach(team => {
                    team.players.forEach(p => {
                        // Ensure player exists
                        insertPlayer.run(p.name, p.nationality, (err) => {
                            // Get Player ID
                            getPlayerId.get(p.name, (err, row) => {
                                if (!row) return;
                                const playerId = row.id;

                                // Insert Stats (Handle multiple agents if necessary, currently taking first or loop?)
                                // The original build.js implies p.agents is an array.
                                // For simplicity in stats table, we might store main agent or duplicate stats rows?
                                // Original build.js aggregates stats per agent in `playerDb` but the JSON `stats` object is PER MATCH (aggregate of that match).
                                // So we store the stats for the match, and list the agents used.
                                // We'll store agents as a comma-separated string or just the first one if strict?
                                // Let's store the first agent for the 'agent' column for now, or loop if we want granulatiry.
                                // But the stats object in JSON is ONE set of stats for the whole match.
                                // So we insert ONE row per player per match.

                                // Agents:
                                const primaryAgent = p.agents[0];

                                insertStat.run(
                                    matchId,
                                    playerId,
                                    team.team_name,
                                    primaryAgent,
                                    p.stats.rating,
                                    p.stats.acs,
                                    p.stats.k,
                                    p.stats.d,
                                    p.stats.a,
                                    p.stats.diff,
                                    p.stats.kast,
                                    p.stats.adr,
                                    p.stats.hs_percent,
                                    p.stats.fk,
                                    p.stats.fd,
                                    p.stats.fkfd_diff
                                );
                            });
                        });
                    });
                });
            }
        );
    });

    // finalize is not strictly needed if we just exit, but good practice
    // We need to wait for async operations to finish if we were doing more,
    // but here we rely on the sync nature of simple loop + callbacks in sequence mostly
    // (though sqlite is async).
    // For a migration script, a timeout or wrapping in promises is better,
    // but for this scale, it will likely complete before node exits.

    console.log("Database migration started...");
    setTimeout(() => {
        console.log("Migration likely complete. Checking rows...");
        db.get("SELECT count(*) as c FROM players", (err, r) => console.log("Players:", r.c));
        db.get("SELECT count(*) as c FROM matches", (err, r) => console.log("Matches:", r.c));
        db.get("SELECT count(*) as c FROM stats", (err, r) => console.log("Stats:", r.c));
    }, 2000);

});
