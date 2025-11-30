const SCORE_CONFIG = {
    STORAGE: {
        PENDING: "pendingScores",
        LAST_SYNC: "lastScoreSync", 
        ONLINE_CACHE: "onlineScoresCache",
        LOCAL_BACKUP: "localScoresBackup"
    },
    GITHUB: {
        // URL pour lire les scores depuis GitHub
        SCORES_URL: "https://zdig1.github.io/vache-taureau/scores.json",
        RAW_URL: "https://raw.githubusercontent.com/zdig1/vache-taureau/main/scores.json"
    },
    SYNC_INTERVAL: 30000, // 30 secondes
    MAX_PENDING_SCORES: 50
};

let githubAvailable = false;
let onlineScores = [];

// ==================== CONNEXION GITHUB ====================

async function checkGitHubConnection() {
    try {
        const response = await fetch(SCORE_CONFIG.GITHUB.RAW_URL, {
            method: 'HEAD',
            cache: 'no-cache'
        });
        githubAvailable = response.ok;
        
        if (githubAvailable) {
            console.log('✅ GitHub connecté');
            setTimeout(() => loadOnlineScores(), 1000);
        } else {
            console.log('❌ GitHub non disponible');
        }
        
        return githubAvailable;
    } catch (error) {
        console.error('❌ Erreur connexion GitHub:', error);
        githubAvailable = false;
        return false;
    }
}

// ==================== LECTURE DES SCORES (GitHub) ====================

async function loadOnlineScores() {
    if (!githubAvailable) {
        console.log('📴 GitHub non disponible - utilisation du cache');
        return getCachedScores();
    }

    try {
        console.log('🔄 Chargement des scores depuis GitHub...');
        
        const response = await fetch(`${SCORE_CONFIG.GITHUB.RAW_URL}?t=${Date.now()}`, {
            cache: "no-cache",
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            onlineScores = data.scores || [];
            
            console.log(`✅ ${onlineScores.length} scores chargés depuis GitHub`);
            
            updateLocalCache(onlineScores);
            
            return onlineScores;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Erreur chargement scores GitHub:', error);
        githubAvailable = false;
        return getCachedScores();
    }
}

function getCachedScores() {
    const cached = localStorage.getItem(SCORE_CONFIG.STORAGE.ONLINE_CACHE);
    if (cached) {
        console.log('📱 Utilisation du cache local');
        return JSON.parse(cached);
    }
    return [];
}

function updateLocalCache(scores) {
    localStorage.setItem(SCORE_CONFIG.STORAGE.ONLINE_CACHE, JSON.stringify(scores));
    localStorage.setItem(SCORE_CONFIG.STORAGE.LAST_SYNC, Date.now().toString());
}

// ==================== ÉCRITURE HYBRIDE ====================

async function saveScoreOnline(newScore) {
    console.log('💾 Sauvegarde hybride du score:', newScore);
    
    // 1. Sauvegarde locale immédiate
    savePendingScore(newScore);
    
    // 2. Mise à jour de l'affichage local
    updateLocalDisplayWithNewScore(newScore);
    
    // 3. Tentative d'envoi vers le système de backup
    if (githubAvailable) {
        try {
            await backupScoreToLocalStorage(newScore);
        } catch (error) {
            console.log('⚠️ Backup échoué, score conservé localement');
        }
    }
    
    return false; // Toujours false car pas d'écriture directe sur GitHub
}

function savePendingScore(score) {
    const pending = getPendingScores();
    
    const isDuplicate = pending.some(pendingScore => 
        pendingScore.playerId === score.playerId &&
        pendingScore.attempts === score.attempts &&
        pendingScore.level === score.level &&
        Math.abs(new Date(pendingScore.timestamp) - new Date(score.timestamp)) < 5000
    );
    
    if (!isDuplicate) {
        pending.push(score);
        
        if (pending.length > SCORE_CONFIG.MAX_PENDING_SCORES) {
            pending.shift();
        }
        
        localStorage.setItem(SCORE_CONFIG.STORAGE.PENDING, JSON.stringify(pending));
        console.log("📥 Score mis en attente:", score);
    } else {
        console.log("🚫 Score dupliqué ignoré");
    }
}

function getPendingScores() {
    return JSON.parse(localStorage.getItem(SCORE_CONFIG.STORAGE.PENDING) || "[]");
}

function clearPendingScores() {
    localStorage.removeItem(SCORE_CONFIG.STORAGE.PENDING);
}

// ==================== BACKUP LOCAL ====================

async function backupScoreToLocalStorage(score) {
    try {
        const backup = JSON.parse(localStorage.getItem(SCORE_CONFIG.STORAGE.LOCAL_BACKUP) || "{}");
        const today = new Date().toISOString().split('T')[0];
        
        if (!backup[today]) {
            backup[today] = [];
        }
        
        backup[today].push({
            ...score,
            backedUpAt: new Date().toISOString()
        });
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        Object.keys(backup).forEach(date => {
            if (new Date(date) < oneWeekAgo) {
                delete backup[date];
            }
        });
        
        localStorage.setItem(SCORE_CONFIG.STORAGE.LOCAL_BACKUP, JSON.stringify(backup));
        console.log('📦 Score sauvegardé en backup local');
        
    } catch (error) {
        console.error('❌ Erreur backup local:', error);
    }
}

// ==================== AFFICHAGE DES SCORES ====================

async function displayOnlineScores() {
    const container = document.getElementById("highscoresList");
    if (!container) {
        console.error('❌ Container highscoresList non trouvé');
        return;
    }

    console.log('🔄 Affichage des scores en ligne...');
    container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">🌐 Chargement des scores...</div>';

    try {
        const scores = await loadOnlineScores();
        const pendingScores = getPendingScores();
        
        console.log(`📊 ${scores.length} scores en ligne + ${pendingScores.length} en attente`);
        
        if (scores.length === 0 && pendingScores.length === 0) {
            showNoScoresMessage(container);
            return;
        }

        const allScores = [...scores, ...pendingScores];
        
        if (typeof displayScoresInContainer === 'function') {
            displayScoresInContainer(allScores, container);
            
            if (pendingScores.length > 0) {
                const indicator = document.createElement('div');
                indicator.innerHTML = `
                    <div style="text-align: center; margin-top: 15px; padding: 10px; background: #fff9c4; border-radius: 8px; border: 2px solid #ffd700;">
                        <span style="color: #ff9800;">⏳</span> 
                        ${pendingScores.length} score(s) en attente de synchronisation
                    </div>
                `;
                container.appendChild(indicator);
            }
        } else {
            container.innerHTML = `<div>${allScores.length} scores disponibles (${pendingScores.length} en attente)</div>`;
        }
        
    } catch (error) {
        console.error('❌ Erreur affichage scores:', error);
        showOfflineMessage(container);
    }
}

function updateLocalDisplayWithNewScore(newScore) {
    const container = document.getElementById("highscoresList");
    if (container && container.innerHTML.includes('scores disponibles')) {
        const pending = getPendingScores();
        if (typeof displayScoresInContainer === 'function') {
            displayScoresInContainer(pending, container);
        }
    }
}

function showNoScoresMessage(container) {
    container.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 10px;">🌐</div>
            <div>Aucun score en ligne</div>
            <div style="font-size: 12px; margin-top: 8px;">Soyez le premier à jouer !</div>
            <button onclick="showLocalScoresOnly()" class="btn btn-primary" style="margin-top: 15px;">
                📱 Voir mes scores locaux
            </button>
        </div>
    `;
}

function showOfflineMessage(container) {
    container.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 10px;">📱</div>
            <div>Mode hors ligne</div>
            <div style="font-size: 12px; margin-top: 8px;">Connexion GitHub indisponible</div>
            <button onclick="showLocalScoresOnly()" class="btn btn-primary" style="margin-top: 15px;">
                📱 Voir mes scores locaux
            </button>
        </div>
    `;
}

// ==================== SYNCHRONISATION ====================

async function manualSync() {
    if (!githubAvailable) {
        showMessage("❌ GitHub non disponible", "message-error");
        return;
    }
    
    showMessage("🔄 Synchronisation...");
    
    try {
        await loadOnlineScores();
        const pending = getPendingScores();
        
        if (pending.length > 0) {
            showMessage(`⏳ ${pending.length} scores en attente (écriture manuelle nécessaire)`);
        } else {
            showMessage("✅ Scores à jour");
        }
        
    } catch (error) {
        showMessage("❌ Erreur synchronisation", "message-error");
    }
}

// ==================== INITIALISATION ====================

window.addEventListener("load", async function () {
    await checkGitHubConnection();
    
    setInterval(async () => {
        if (githubAvailable) {
            await loadOnlineScores();
        }
    }, SCORE_CONFIG.SYNC_INTERVAL);
    
    cleanupOldBackups();
});

function cleanupOldBackups() {
    try {
        const backup = JSON.parse(localStorage.getItem(SCORE_CONFIG.STORAGE.LOCAL_BACKUP) || "{}");
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        let cleanedCount = 0;
        Object.keys(backup).forEach(date => {
            if (new Date(date) < oneWeekAgo) {
                delete backup[date];
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            localStorage.setItem(SCORE_CONFIG.STORAGE.LOCAL_BACKUP, JSON.stringify(backup));
            console.log(`🧹 ${cleanedCount} vieux backups nettoyés`);
        }
    } catch (error) {
        console.error('❌ Erreur nettoyage backups:', error);
    }
}