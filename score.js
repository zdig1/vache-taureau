const SCORE_CONFIG = {
    STORAGE: {
        PENDING: "pendingScores",
        LAST_SYNC: "lastScoreSync", 
        ONLINE_CACHE: "onlineScoresCache"
    },
    GITLAB: {
        REPO_URL: "https://gitlab.com/api/v4/projects/76151178",
        TOKEN: "glpat-CYgRVOLca0ORevk6zbJJEW86MQp1Oml2eWNyCw.01.121gla7aa",
        SCORES_FILE: "scores.json",
        BRANCH: "main"
    },
    SYNC_INTERVAL: 60000 // 1 minute
};

let gitlabAvailable = false;

async function checkGitLabConnection() {
    try {
        const response = await fetch(`${SCORE_CONFIG.GITLAB.REPO_URL}`, {
            headers: {
                "Private-Token": SCORE_CONFIG.GITLAB.TOKEN
            },
            method: "GET"
        });
        gitlabAvailable = response.ok;
        return gitlabAvailable;
    } catch (error) {
        console.error('❌ Erreur connexion GitLab:', error);
        gitlabAvailable = false;
        return false;
    }
}

async function saveScoreOnline(newScore) {
    if (!gitlabAvailable) {
        console.log('📴 GitLab non disponible - score mis en attente');
        savePendingScore(newScore);
        return false;
    }

    try {
        let existingScores = [];
        let fileExists = true;
        
        // Charger les scores existants
        try {
            const response = await fetch(
                `${SCORE_CONFIG.GITLAB.REPO_URL}/repository/files/${encodeURIComponent(SCORE_CONFIG.GITLAB.SCORES_FILE)}/raw?ref=${SCORE_CONFIG.GITLAB.BRANCH}`,
                {
                    headers: {"Private-Token": SCORE_CONFIG.GITLAB.TOKEN}
                }
            );
            
            if (response.ok) {
                const content = await response.text();
                const data = JSON.parse(content);
                existingScores = data.scores || [];
            } else if (response.status === 404) {
                fileExists = false;
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            fileExists = false;
        }

        // Vérifier les doublons
        const isDuplicate = existingScores.some(score => 
            score.playerId === newScore.playerId &&
            score.attempts === newScore.attempts &&
            score.level === newScore.level &&
            Math.abs(new Date(score.timestamp) - new Date(newScore.timestamp)) < 5000
        );
        
        if (isDuplicate) {
            console.log("🚫 Score en ligne dupliqué ignoré");
            return true;
        }

        // Ajouter le nouveau score
        existingScores.push(newScore);
        
        // Limiter à 200 scores maximum
        if (existingScores.length > 200) {
            existingScores = existingScores.slice(-200);
        }

        const scoresData = {
            scores: existingScores,
            lastUpdate: new Date().toISOString(),
            totalGames: existingScores.length,
            version: "2.1"
        };

        const method = fileExists ? "PUT" : "POST";
        const commitMessage = fileExists 
            ? `Nouveau score: ${newScore.pseudo} - ${newScore.attempts} essais`
            : "Création fichier scores.json";

        const response = await fetch(
            `${SCORE_CONFIG.GITLAB.REPO_URL}/repository/files/${encodeURIComponent(SCORE_CONFIG.GITLAB.SCORES_FILE)}`,
            {
                method: method,
                headers: {
                    "Content-Type": "application/json",
                    "Private-Token": SCORE_CONFIG.GITLAB.TOKEN
                },
                body: JSON.stringify({
                    branch: SCORE_CONFIG.GITLAB.BRANCH,
                    content: btoa(unescape(encodeURIComponent(JSON.stringify(scoresData, null, 2)))),
                    commit_message: commitMessage,
                    encoding: "base64"
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`GitLab Error ${response.status}: ${JSON.stringify(errorData)}`);
        }

        console.log("✅ Score sauvegardé en ligne avec succès");
        return true;

    } catch (error) {
        console.error('❌ Erreur sauvegarde en ligne:', error);
        savePendingScore(newScore);
        return false;
    }
}

function savePendingScore(score) {
    const pending = JSON.parse(localStorage.getItem(SCORE_CONFIG.STORAGE.PENDING) || "[]");
    pending.push(score);
    localStorage.setItem(SCORE_CONFIG.STORAGE.PENDING, JSON.stringify(pending));
    console.log("📥 Score mis en attente:", score);
}

function getPendingScores() {
    return JSON.parse(localStorage.getItem(SCORE_CONFIG.STORAGE.PENDING) || "[]");
}

function clearPendingScores() {
    localStorage.removeItem(SCORE_CONFIG.STORAGE.PENDING);
}

async function syncPendingScores() {
    const pending = getPendingScores();
    if (pending.length === 0) return;

    console.log(`🔄 Synchronisation de ${pending.length} scores en attente...`);
    
    let successCount = 0;
    for (const score of pending) {
        try {
            const success = await saveScoreOnline(score);
            if (success) successCount++;
        } catch (error) {
            console.error('❌ Erreur sync score:', error);
            break;
        }
    }
    
    if (successCount === pending.length) {
        clearPendingScores();
        console.log('✅ Tous les scores synchronisés');
    }
}

async function loadOnlineScores() {
    try {
        console.log('🔄 Chargement des scores en ligne...');
        
        const response = await fetch(
            `${SCORE_CONFIG.GITLAB.REPO_URL}/repository/files/${encodeURIComponent(SCORE_CONFIG.GITLAB.SCORES_FILE)}/raw?ref=${SCORE_CONFIG.GITLAB.BRANCH}`,
            {
                headers: {
                    "Private-Token": SCORE_CONFIG.GITLAB.TOKEN,
                    "Cache-Control": "no-cache"
                },
                cache: "no-cache"
            }
        );
        
        console.log('📡 Status réponse:', response.status);
        
        if (response.ok) {
            const content = await response.text();
            console.log('📄 Contenu brut:', content.substring(0, 200) + '...');
            
            const data = JSON.parse(content);
            const scores = data.scores || [];
            
            console.log(`✅ ${scores.length} scores chargés`);
            
            // Mettre à jour le cache
            localStorage.setItem(SCORE_CONFIG.STORAGE.ONLINE_CACHE, JSON.stringify(scores));
            localStorage.setItem(SCORE_CONFIG.STORAGE.LAST_SYNC, Date.now().toString());
            
            return scores;
        } else {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
    } catch (error) {
        console.error('❌ Erreur chargement scores:', error);
        
        // Fallback au cache
        const cached = localStorage.getItem(SCORE_CONFIG.STORAGE.ONLINE_CACHE);
        if (cached) {
            console.log('📱 Utilisation du cache local');
            return JSON.parse(cached);
        }
        
        return [];
    }
}

async function displayOnlineScores() {
    const container = document.getElementById("highscoresList");
    if (!container) {
        console.error('❌ Container highscoresList non trouvé');
        return;
    }

    console.log('🔄 Chargement des scores en ligne...');
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">🌐 Chargement des scores en ligne...</div>';

    try {
        const scores = await loadOnlineScores();
        console.log(`📊 ${scores.length} scores chargés en ligne`);
        
        if (scores.length > 0) {
            // Utilise la fonction de game.js pour afficher
            if (typeof displayScoresInContainer === 'function') {
                displayScoresInContainer(scores, container);
            } else {
                // Fallback simple
                container.innerHTML = `<div>${scores.length} scores en ligne chargés</div>`;
            }
        } else {
            container.innerHTML = `
                <div style="text-align: center; color: #666; padding: 20px;">
                    <div style="font-size: 48px; margin-bottom: 10px;">🌐</div>
                    <div>Aucun score en ligne</div>
                    <div style="font-size: 12px; margin-top: 8px;">Soyez le premier à jouer !</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ Erreur chargement scores en ligne:', error);
        container.innerHTML = `
            <div style="text-align: center; color: #666; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 10px;">📱</div>
                <div>Mode hors ligne</div>
                <div style="font-size: 12px; margin-top: 8px;">Affichage des scores locaux</div>
            </div>
        `;
        // Fallback aux scores locaux
        setTimeout(() => {
            if (typeof displayLocalScores === 'function') {
                displayLocalScores();
            }
        }, 1000);
    }
}

// Initialisation
window.addEventListener("load", (async function () {
    if (await checkGitLabConnection()) {
        console.log('✅ GitLab connecté');
        getPendingScores().length > 0 && setTimeout(() => syncPendingScores(), 2000);
    } else {
        console.log('❌ GitLab non disponible');
    }
    
    setInterval(async () => {
        if (gitlabAvailable && getPendingScores().length > 0) {
            await syncPendingScores();
        }
    }, SCORE_CONFIG.SYNC_INTERVAL);
}));