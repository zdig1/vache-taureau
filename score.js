// ==================== CONFIGURATION ====================
const SCORE_CONFIG = {
    GITHUB: {
        REPO_OWNER: 'zdig1',
        REPO_NAME: 'vache-taureau',
        FILE_PATH: 'scores.json',
        get API_URL() {
            return `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${this.FILE_PATH}`;
        }
    },
    STORAGE: {
        CACHE: 'githubScoresCache',
        PENDING: 'pendingScores',
        LAST_SYNC: 'lastSyncTime'
    }
};

let githubAvailable = false;
let githubToken = null;

// ==================== GESTION DU TOKEN ====================

function getGitHubToken() {
    // Essayer de récupérer le token depuis localStorage ou une variable globale
    if (!githubToken) {
        githubToken = localStorage.getItem('github_token') || null;
    }
    return githubToken;
}

// ==================== FONCTIONS DE BASE ====================

function getCachedScores() {
    try {
        const cached = localStorage.getItem(SCORE_CONFIG.STORAGE.CACHE);
        return cached ? JSON.parse(cached).scores || [] : [];
    } catch (e) {
        return [];
    }
}

function getPendingScores() {
    try {
        const pending = localStorage.getItem(SCORE_CONFIG.STORAGE.PENDING);
        return pending ? JSON.parse(pending) : [];
    } catch (e) {
        return [];
    }
}

function updateLocalCache(scores) {
    localStorage.setItem(SCORE_CONFIG.STORAGE.CACHE, JSON.stringify({
        scores: scores,
        lastUpdate: new Date().toISOString()
    }));
}

function savePendingScore(score) {
    const pending = getPendingScores();
    pending.push({
        ...score,
        pending: true,
        pendingTime: Date.now()
    });
    localStorage.setItem(SCORE_CONFIG.STORAGE.PENDING, JSON.stringify(pending));
    console.log('📱 Score en attente:', score);
}

function backupScoreToLocalStorage(score) {
    savePendingScore(score);
}

// ==================== LECTURE DES SCORES GITHUB ====================

async function loadOnlineScores() {
    console.log('📡 Chargement des scores depuis GitHub...');
    
    try {
        const token = getGitHubToken();
        if (!token) {
            console.log('❌ Token GitHub non disponible');
            githubAvailable = false;
            return false;
        }

        const response = await fetch(SCORE_CONFIG.GITHUB.API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            console.error('❌ Erreur chargement scores:', response.status);
            return false;
        }

        const data = await response.json();
        
        if (data.content) {
            const decodedContent = atob(data.content.replace(/\s/g, ''));
            const jsonData = JSON.parse(decodedContent);
            
            // Mettre à jour le cache local
            updateLocalCache(jsonData.scores || []);
            localStorage.setItem(SCORE_CONFIG.STORAGE.LAST_SYNC, Date.now());
            
            console.log('✅ Scores GitHub chargés:', (jsonData.scores || []).length, 'scores');
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Erreur chargement GitHub:', error);
        return false;
    }
}

// ==================== ÉCRITURE DES SCORES GITHUB ====================

async function writeScoreToGitHub(scoreData) {
    console.log('🚀 Tentative d\'écriture sur GitHub...', scoreData);
    
    try {
        const token = getGitHubToken();
        if (!token) {
            console.log('❌ Token manquant');
            return false;
        }

        // 1. Récupérer le fichier actuel
        const getResponse = await fetch(SCORE_CONFIG.GITHUB.API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${token}`
            }
        });
        
        if (!getResponse.ok) {
            console.error('❌ Impossible de lire le fichier GitHub:', getResponse.status);
            
            // Si le fichier n'existe pas, on le crée
            if (getResponse.status === 404) {
                return await createNewScoresFile(scoreData, token);
            }
            return false;
        }
        
        const currentFile = await getResponse.json();
        
        // Décoder le contenu base64
        const decodedContent = atob(currentFile.content.replace(/\s/g, ''));
        const content = JSON.parse(decodedContent);
        
        // 2. Ajouter le nouveau score
        if (!content.scores) content.scores = [];
        
        // Vérifier si le score existe déjà
        const exists = content.scores.some(score => 
            score.gameId === scoreData.gameId ||
            (score.playerId === scoreData.playerId &&
             score.attempts === scoreData.attempts &&
             score.level === scoreData.level &&
             Math.abs(new Date(score.timestamp) - new Date(scoreData.timestamp)) < 10000)
        );
        
        if (exists) {
            console.log('⚠️ Score déjà présent sur GitHub');
            return true;
        }
        
        content.scores.push({
            ...scoreData,
            syncedAt: new Date().toISOString()
        });
        
        content.lastUpdate = new Date().toISOString();
        content.totalGames = (content.totalGames || 0) + 1;
        
        // 3. Mettre à jour le fichier
        const updateResponse = await fetch(SCORE_CONFIG.GITHUB.API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `🎮 Nouveau score: ${scoreData.playerName} - ${scoreData.attempts} coups (Niv. ${scoreData.level})`,
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

async function createNewScoresFile(scoreData, token) {
    console.log('📄 Création d\'un nouveau fichier scores.json...');
    
    try {
        const initialContent = {
            scores: [{
                ...scoreData,
                syncedAt: new Date().toISOString()
            }],
            lastUpdate: new Date().toISOString(),
            totalGames: 1,
            version: "3.0",
            description: "Scores du jeu Vache Taureau"
        };

        const response = await fetch(SCORE_CONFIG.GITHUB.API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "🎮 Création du fichier scores.json",
                content: btoa(unescape(encodeURIComponent(JSON.stringify(initialContent, null, 2))))
            })
        });

        if (response.ok) {
            console.log('✅ Fichier scores.json créé !');
            updateLocalCache(initialContent.scores);
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Erreur création fichier:', errorText);
            return false;
        }
    } catch (error) {
        console.error('❌ Erreur création fichier:', error);
        return false;
    }
}

// ==================== SAUVEGARDE HYBRIDE ====================

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

// ==================== FONCTIONS UTILES ====================

function removeFromPending(score) {
    const pending = getPendingScores();
    const index = pending.findIndex(p => 
        p.playerId === score.playerId &&
        p.timestamp === score.timestamp &&
        p.gameId === score.gameId
    );
    
    if (index !== -1) {
        pending.splice(index, 1);
        localStorage.setItem(SCORE_CONFIG.STORAGE.PENDING, JSON.stringify(pending));
        console.log('🧹 Score retiré de la liste d\'attente');
    }
}

function updateLocalDisplayWithNewScore(score) {
    // Cette fonction sera appelée par game.js pour mettre à jour l'affichage
    console.log('🔄 Mise à jour affichage local avec:', score);
}

async function syncAllPendingScores() {
    if (!githubAvailable) {
        showMessage("❌ GitHub non disponible", "message-error");
        return false;
    }
    
    const pending = getPendingScores();
    if (pending.length === 0) {
        showMessage("✅ Aucun score en attente");
        return true;
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
            console.error('❌ Erreur sync score:', error);
        }
    }
    
    if (failCount === 0) {
        showMessage(`✅ ${successCount} scores synchronisés !`);
        return true;
    } else {
        showMessage(`⚠️ ${successCount} synchronisés, ${failCount} échecs`, "message-error");
        return false;
    }
}

// ==================== VÉRIFICATION CONNEXION ====================

async function checkGitHubConnection() {
    console.log('🔍 Vérification connexion GitHub...');
    
    try {
        // Vérifier si on a un token
        const token = getGitHubToken();
        if (!token) {
            console.log('❌ Aucun token GitHub trouvé');
            githubAvailable = false;
            return false;
        }
        
        // Tester avec l'API
        const testUrl = `https://api.github.com/repos/${SCORE_CONFIG.GITHUB.REPO_OWNER}/${SCORE_CONFIG.GITHUB.REPO_NAME}`;
        
        const response = await fetch(testUrl, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        githubAvailable = response.ok;
        
        if (githubAvailable) {
            console.log('✅ GitHub connecté avec token valide !');
            
            // Charger les scores en ligne
            setTimeout(() => loadOnlineScores(), 1000);
            
            // Synchroniser automatiquement les scores en attente
            setTimeout(() => {
                const pending = getPendingScores();
                if (pending.length > 0) {
                    console.log('🔄 Sync auto des scores en attente:', pending.length);
                    syncAllPendingScores();
                }
            }, 3000);
        } else {
            console.log('❌ Token GitHub invalide ou expiré');
            githubAvailable = false;
        }
        
        return githubAvailable;
    } catch (error) {
        console.error('❌ Erreur connexion GitHub:', error);
        githubAvailable = false;
        return false;
    }
}

// ==================== AFFICHAGE DES SCORES ====================

function displayOnlineScores() {
    console.log('📊 Affichage des scores en ligne...');
    
    const cachedScores = getCachedScores();
    const container = document.getElementById("highscoresList");
    
    if (!cachedScores || cachedScores.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #666; padding: 30px;">
                <div style="font-size: 48px; margin-bottom: 10px;">🌐</div>
                <div>Aucun score en ligne</div>
                <div style="font-size: 12px; margin-top: 8px;">
                    Connectez-vous à GitHub pour synchroniser
                </div>
            </div>
        `;
        return;
    }
    
    // Utiliser la fonction d'affichage de game.js
    if (typeof window.displayScoresInContainer === 'function') {
        window.displayScoresInContainer(cachedScores, container);
    } else {
        container.innerHTML = `
            <div style="padding: 20px;">
                <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <strong>🌐 Scores depuis GitHub</strong>
                    <div style="font-size: 12px; color: #666; margin-top: 5px;">
                        ${cachedScores.length} scores synchronisés
                    </div>
                </div>
                ${cachedScores.map((score, index) => `
                    <div style="padding: 10px; margin: 5px 0; background: #f5f5f5; border-radius: 5px;">
                        ${index + 1}. ${score.playerName || 'Anonyme'} - ${score.attempts} coups (Niv. ${score.level})
                    </div>
                `).join('')}
            </div>
        `;
    }
}

// ==================== SYNCHRONISATION MANUELLE ====================

async function manualSync() {
    console.log('🔄 Synchronisation manuelle demandée...');
    
    if (!githubAvailable) {
        showMessage("❌ GitHub non disponible", "message-error");
        return false;
    }
    
    showMessage("🔄 Synchronisation complète...");
    
    try {
        // 1. Charger les derniers scores depuis GitHub
        const loaded = await loadOnlineScores();
        
        if (!loaded) {
            showMessage("❌ Impossible de charger les scores GitHub", "message-error");
            return false;
        }
        
        // 2. Synchroniser les scores en attente
        const pending = getPendingScores();
        
        if (pending.length > 0) {
            const syncResult = await syncAllPendingScores();
            return syncResult;
        } else {
            showMessage("✅ Tous les scores sont synchronisés");
            
            // Recharger l'affichage
            setTimeout(() => {
                if (typeof displayOnlineScores === 'function') {
                    displayOnlineScores();
                }
            }, 500);
            
            return true;
        }
        
    } catch (error) {
        console.error('❌ Erreur synchronisation:', error);
        showMessage("❌ Erreur synchronisation", "message-error");
        return false;
    }
}

// ==================== ÉTAT GITHUB ====================

function showGitHubStatus() {
    const pending = getPendingScores();
    const cached = getCachedScores();
    const lastSync = localStorage.getItem(SCORE_CONFIG.STORAGE.LAST_SYNC);
    const token = getGitHubToken();
    
    const statusHTML = `
        <div style="padding: 20px;">
            <div style="margin-bottom: 20px;">
                <h3 style="color: #333;">🔧 État GitHub</h3>
            </div>
            
            <div style="background: ${githubAvailable ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <strong>Connexion:</strong> ${githubAvailable ? '✅ Connecté' : '❌ Hors ligne'}<br>
                <strong>Token:</strong> ${token ? '✅ Présent' : '❌ Absent'}<br>
                <strong>Dernière synchro:</strong> ${lastSync ? new Date(parseInt(lastSync)).toLocaleString() : 'Jamais'}
            </div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <strong>Scores en cache:</strong> ${cached.length}<br>
                <strong>Scores en attente:</strong> ${pending.length}
            </div>
            
            ${pending.length > 0 ? `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 10px;">
                    <strong>Scores en attente de synchronisation:</strong>
                    ${pending.map((score, index) => `
                        <div style="margin-top: 8px; padding: 8px; background: white; border-radius: 5px; border-left: 4px solid #ffc107;">
                            ${index + 1}. ${score.playerName || 'Anonyme'} - ${score.attempts} coups (Niv. ${score.level})<br>
                            <small style="color: #666;">${new Date(score.timestamp).toLocaleString()}</small>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div style="margin-top: 20px; text-align: center;">
                <button onclick="manualSync()" class="btn" style="background: #4CAF50; color: white; padding: 10px 20px;">
                    🔄 Synchroniser maintenant
                </button>
            </div>
        </div>
    `;
    
    const container = document.getElementById("githubStatusContent");
    if (container) {
        container.innerHTML = statusHTML;
    }
    
    // Afficher le modal
    const modal = document.getElementById("githubStatusModal");
    if (modal) {
        modal.style.display = "block";
    }
}

// ==================== INITIALISATION ====================

// Fonction pour définir le token (à appeler depuis index.html)
function setGitHubToken(token) {
    if (token) {
        githubToken = token;
        localStorage.setItem('github_token', token);
        console.log('✅ Token GitHub défini');
        
        // Vérifier la connexion
        setTimeout(() => checkGitHubConnection(), 1000);
    }
}

// ==================== EXPOSER LES FONCTIONS ====================

window.displayOnlineScores = displayOnlineScores;
window.manualSync = manualSync;
window.syncAllPendingScores = syncAllPendingScores;
window.showGitHubStatus = showGitHubStatus;
window.checkGitHubConnection = checkGitHubConnection;
window.getCachedScores = getCachedScores;
window.getPendingScores = getPendingScores;
window.setGitHubToken = setGitHubToken;