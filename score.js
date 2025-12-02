// ==================== CONFIGURATION AVEC ÉCRITURE ====================
const GITHUB_WRITE_CONFIG = {
    // VOTRE TOKEN (le même que vous avez partagé)
    TOKEN: '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',
    
    // VOTRE REPO
    REPO_OWNER: 'zdig1',
    REPO_NAME: 'vache-taureau',
    
    // URLs API
    get API_URL() {
        return `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/scores.json`;
    }
};

// ==================== ÉCRITURE SUR GITHUB ====================

async function writeScoreToGitHub(scoreData) {
    console.log('🚀 Tentative d\'écriture directe sur GitHub...');
    
    try {
        // 1. Récupérer le fichier actuel (avec token)
        const getResponse = await fetch(GITHUB_WRITE_CONFIG.API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_WRITE_CONFIG.TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (!getResponse.ok) {
            console.error('❌ Impossible de lire le fichier GitHub');
            return false;
        }
        
        const currentFile = await getResponse.json();
        
        // Décoder le contenu base64
        const decodedContent = atob(currentFile.content.replace(/\s/g, ''));
        const content = JSON.parse(decodedContent);
        
        // 2. Ajouter le nouveau score
        content.scores.push({
            ...scoreData,
            syncedAt: new Date().toISOString(),
            source: 'github-write'
        });
        
        content.lastUpdate = new Date().toISOString();
        content.totalGames = (content.totalGames || 0) + 1;
        
        // 3. Mettre à jour le fichier (avec token)
        const updateResponse = await fetch(GITHUB_WRITE_CONFIG.API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_WRITE_CONFIG.TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `🎮 Nouveau score: ${scoreData.playerName} - ${scoreData.attempts} coups`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
                sha: currentFile.sha
            })
        });
        
        if (updateResponse.ok) {
            console.log('✅ Score écrit sur GitHub avec succès !');
            
            // Mettre à jour le cache local
            updateLocalCache(content.scores);
            
            return true;
        } else {
            const errorText = await updateResponse.text();
            console.error('❌ Erreur écriture GitHub:', errorText);
            return false;
        }
        
    } catch (error) {
        console.error('❌ Erreur critique:', error);
        return false;
    }
}

// ==================== MODIFIER LA FONCTION saveScoreOnline ====================

// REMPLACEZ la fonction saveScoreOnline existante par celle-ci :
async function saveScoreOnline(newScore) {
    console.log('💾 Sauvegarde hybride du score:', newScore);
    
    // 1. Sauvegarde locale immédiate
    savePendingScore(newScore);
    
    // 2. Mise à jour de l'affichage local
    updateLocalDisplayWithNewScore(newScore);
    
    // 3. Tentative d'écriture DIRECTE sur GitHub
    let writeSuccess = false;
    
    if (githubAvailable) {
        try {
            writeSuccess = await writeScoreToGitHub(newScore);
            
            if (writeSuccess) {
                console.log('✅ Score écrit sur GitHub !');
                // Nettoyer du cache pending si écriture réussie
                removeFromPending(newScore);
                return true;
            } else {
                console.log('⚠️ Écriture GitHub échouée, backup local');
                await backupScoreToLocalStorage(newScore);
            }
        } catch (error) {
            console.log('⚠️ Erreur écriture, fallback local:', error);
            await backupScoreToLocalStorage(newScore);
        }
    } else {
        console.log('📱 GitHub non disponible, sauvegarde locale seulement');
        await backupScoreToLocalStorage(newScore);
    }
    
    return writeSuccess;
}

// ==================== NOUVELLES FONCTIONS UTILES ====================

function removeFromPending(score) {
    const pending = getPendingScores();
    const index = pending.findIndex(p => 
        p.playerId === score.playerId &&
        p.timestamp === score.timestamp
    );
    
    if (index !== -1) {
        pending.splice(index, 1);
        localStorage.setItem(SCORE_CONFIG.STORAGE.PENDING, JSON.stringify(pending));
        console.log('🧹 Score retiré de la liste d\'attente');
    }
}

async function syncAllPendingScores() {
    if (!githubAvailable) {
        showMessage("❌ GitHub non disponible", "message-error");
        return;
    }
    
    const pending = getPendingScores();
    if (pending.length === 0) {
        showMessage("✅ Aucun score en attente");
        return;
    }
    
    showMessage(`🔄 Synchronisation de ${pending.length} scores...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const score of pending) {
        try {
            const success = await writeScoreToGitHub(score);
            if (success) {
                successCount++;
                removeFromPending(score);
            } else {
                failCount++;
            }
        } catch (error) {
            failCount++;
        }
    }
    
    if (failCount === 0) {
        showMessage(`✅ ${successCount} scores synchronisés !`);
    } else {
        showMessage(`⚠️ ${successCount} synchronisés, ${failCount} échecs`, "message-error");
    }
}

// ==================== MODIFIER checkGitHubConnection ====================

// REMPLACEZ la fonction checkGitHubConnection par :
async function checkGitHubConnection() {
    try {
        // Test avec l'API pour vérifier le token
        const testUrl = `https://api.github.com/repos/${GITHUB_WRITE_CONFIG.REPO_OWNER}/${GITHUB_WRITE_CONFIG.REPO_NAME}`;
        
        const response = await fetch(testUrl, {
            headers: {
                'Authorization': `token ${GITHUB_WRITE_CONFIG.TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        githubAvailable = response.ok;
        
        if (githubAvailable) {
            console.log('✅ GitHub connecté avec token valide !');
            setTimeout(() => loadOnlineScores(), 1000);
            
            // Synchroniser automatiquement les scores en attente
            setTimeout(() => syncAllPendingScores(), 3000);
        } else {
            console.log('❌ Token GitHub invalide ou expiré');
        }
        
        return githubAvailable;
    } catch (error) {
        console.error('❌ Erreur connexion GitHub:', error);
        githubAvailable = false;
        return false;
    }
}

// ==================== MODIFIER manualSync ====================

// REMPLACEZ la fonction manualSync par :
async function manualSync() {
    if (!githubAvailable) {
        showMessage("❌ GitHub non disponible", "message-error");
        return;
    }
    
    showMessage("🔄 Synchronisation complète...");
    
    try {
        // 1. Charger les derniers scores
        await loadOnlineScores();
        
        // 2. Synchroniser les scores en attente
        const pending = getPendingScores();
        
        if (pending.length > 0) {
            await syncAllPendingScores();
        } else {
            showMessage("✅ Tous les scores sont synchronisés");
        }
        
    } catch (error) {
        showMessage("❌ Erreur synchronisation", "message-error");
    }
}

// ==================== AJOUTER CETTE FONCTION ====================

function showGitHubStatus() {
    const pending = getPendingScores();
    const cached = getCachedScores();
    
    alert(`🔧 État GitHub:\n\n` +
          `Connexion: ${githubAvailable ? '✅ Connecté' : '❌ Hors ligne'}\n` +
          `Token: ${GITHUB_WRITE_CONFIG.TOKEN ? '✅ Présent' : '❌ Absent'}\n` +
          `Scores en cache: ${cached.length}\n` +
          `Scores en attente: ${pending.length}\n` +
          `\nActions:\n` +
          `• F5 pour rafraîchir\n` +
          `• Vérifiez la console pour les détails`);
}

// ==================== EXPOSER LES FONCTIONS ====================

// Ajoutez à la fin du fichier :
window.syncAllPendingScores = syncAllPendingScores;
window.showGitHubStatus = showGitHubStatus;