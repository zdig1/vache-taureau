// Configuration
const CONFIG = {
    LEVELS: [3, 4, 5],
    DEFAULT_LEVEL: 4,
    STORAGE: {
        HISTORY: 'vacheTaureauHistory',
        LEVEL: 'gameLevel',
        RULES_SEEN: 'hasSeenRules',
        SCORES: 'vacheTaureauLocalScores',
        CURRENT_GAME_ID: 'currentGameId' // Nouveau : identifiant de partie
    }
};

// État du jeu
let secret = '';
let attempts = 0;
let startTime = Date.now();
let errorTimeout = null;
let currentGameId = null; // Identifiant unique de la partie en cours

// Éléments DOM
let guessInput, messageBox, historyList, gameLevelSelect;

// ==================== GESTION DU PSEUDO ====================

function getCurrentPlayer() {
    const pseudo = localStorage.getItem('playerPseudo');
    const playerId = localStorage.getItem('playerId');
    return (pseudo && playerId) ? {pseudo, playerId} : null;
}

function updatePseudoDisplay() {
    const player = getCurrentPlayer();
    const display = document.getElementById("currentPseudoDisplay");
    if (display) {
        display.textContent = player?.pseudo || "Non défini";
        display.style.color = player?.pseudo ? "#000" : "#666";
    }
}

function showPseudoModal(isEditMode = false) {
    const modal = document.getElementById("pseudoModal");
    const pseudoInput = document.getElementById("pseudoInput");
    const title = document.getElementById("pseudoModalTitle");

    if (isEditMode) {
        const currentPlayer = getCurrentPlayer();
        pseudoInput.value = currentPlayer?.pseudo || "";
        pseudoInput.select();
        title.textContent = "✏️ Modifier ton pseudo";
    } else {
        pseudoInput.value = "";
        title.textContent = "🎮 Choisis ton pseudo";
    }
    modal.style.display = "block";
    pseudoInput.focus();
}

function hidePseudoModal() {
    document.getElementById("pseudoModal").style.display = "none";
}

function savePseudo() {
    const pseudoInput = document.getElementById("pseudoInput");
    let pseudo = pseudoInput.value.trim();

    if (pseudo.length < 3) {
        showMessage("Le pseudo doit faire au moins 3 caractères", "message-error");
        return;
    }

    if (!/^[a-zA-Z0-9À-ÿ _-]+$/.test(pseudo)) {
        showMessage("Caractères autorisés : lettres, chiffres, espaces, -, _", "message-error");
        return;
    }

    let playerId = localStorage.getItem('playerId');
    if (!playerId) {
        playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('playerId', playerId);
    }

    localStorage.setItem('playerPseudo', pseudo);
    hidePseudoModal();
    showMessage(`Pseudo mis à jour : ${pseudo} ! 🎮`);
    updatePseudoDisplay();
}

function useAnonymous() {
    const adjectives = ["Super", "Mega", "Ultra", "Hyper", "Fantastique", "Incroyable", "Génial"];
    const nouns = ["Joueur", "Champion", "Expert", "Maître", "Pro", "As", "Guru"];
    const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(100 + Math.random() * 900);

    const randomPseudo = `${randomAdj}${randomNoun}${randomNumber}`;
    let playerId = localStorage.getItem('playerId');
    if (!playerId) {
        playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('playerId', playerId);
    }

    localStorage.setItem('playerPseudo', randomPseudo);
    hidePseudoModal();
    showMessage(`Bienvenue ${randomPseudo} ! 🎮`);
    updatePseudoDisplay();
}

// ==================== LOGIQUE DU JEU ====================

function generateSecret() {
    const level = parseInt(gameLevelSelect.value || CONFIG.DEFAULT_LEVEL);
    let digits = [Math.floor(9 * Math.random()) + 1];

    while (digits.length < level) {
        let digit = Math.floor(10 * Math.random());
        if (!digits.includes(digit)) digits.push(digit);
    }
    return digits.join("");
}

function updateDifficultyIndicator() {
    const level = gameLevelSelect.value;
    guessInput.placeholder = `${level} chiffres`;
    guessInput.maxLength = parseInt(level);
    
    const colors = {3: "#4CAF50", 4: "#FF9800", 5: "#F44336"};
    guessInput.style.borderColor = colors[level];
}

function checkGuess() {
    showMessage("");
    const guess = guessInput.value.trim();
    const level = parseInt(gameLevelSelect.value || CONFIG.DEFAULT_LEVEL);

    // Validations
    if (guess.length !== level) {
        guessInput.select();
        return showMessage(`Veuillez entrer ${level} chiffres`, "message-error");
    }
    if (guess[0] === "0") {
        guessInput.select();
        return showMessage("Le nombre ne peut pas commencer par 0", "message-error");
    }
    if (new Set(guess).size !== level) {
        guessInput.select();
        return showMessage("Chiffres uniques obligatoires", "message-error");
    }

    const existingGuesses = Array.from(historyList.children).map(item => 
        item.querySelector("div").textContent.replace(/#\d+\s/, "")
    );
    if (existingGuesses.includes(guess)) {
        guessInput.select();
        return showMessage(`Vous avez déjà essayé ${guess}`, "message-error");
    }

    // Calcul vaches/taureaux
    attempts++;
    let vaches = 0, taureaux = 0;
    for (let i = 0; i < guess.length; i++) {
        if (secret.includes(guess[i])) {
            guess[i] === secret[i] ? taureaux++ : vaches++;
        }
    }

    // Historique
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    historyItem.innerHTML = `
        <div><span class="history-number">#${attempts}</span> ${guess}</div>
        <div><span class="vache">${vaches} V</span> - <span class="taureau">${taureaux} T</span></div>
    `;
    historyList.prepend(historyItem);
    localStorage.setItem(CONFIG.STORAGE.HISTORY, historyList.innerHTML);

    // VICTOURE - UNIQUEMENT sauvegarder si c'est une nouvelle victoire
    if (taureaux === level) {
        const timeSec = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(timeSec / 60);
        const seconds = timeSec % 60;
        const timeDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        
        // Vérifier que cette partie n'a pas déjà été sauvegardée
        if (!isGameAlreadySaved()) {
            saveGameScore(secret.length, attempts, timeDisplay);
            markGameAsSaved();
        }
        
        showWinModal(attempts, timeDisplay);
    }

    guessInput.value = "";
    guessInput.focus();
}

// Nouvelle fonction : Vérifier si la partie actuelle a déjà été sauvegardée
function isGameAlreadySaved() {
    const savedGameId = localStorage.getItem(CONFIG.STORAGE.CURRENT_GAME_ID);
    return savedGameId === currentGameId;
}

// Nouvelle fonction : Marquer la partie comme sauvegardée
function markGameAsSaved() {
    localStorage.setItem(CONFIG.STORAGE.CURRENT_GAME_ID, currentGameId);
}

function showMessage(text, type = "") {
    if (!text) {
        messageBox.style.display = "none";
        messageBox.className = "message";
        return;
    }

    messageBox.style.display = "block";
    messageBox.className = `message ${type}`;
    messageBox.textContent = text;

    if (errorTimeout) clearTimeout(errorTimeout);
    if (type === "message-error") {
        errorTimeout = setTimeout(() => showMessage(""), 3000);
    }
}

function showWinModal(attempts, timeStr) {
    const modal = document.getElementById("winModal");
    document.getElementById("winDetails").innerHTML = `
        <div style="text-align: center;">
            <img src="icon-192.png" alt="Logo Vache Taureau" 
                 style="width: 70px; height: 70px; margin-bottom: 15px; border-radius: 12px; border: 2px solid #ffd700;">
          
            <div style="margin-bottom: 15px; color: #333;">
                Bravo, Vous avez gagné !
            </div>
            <div style="background: #fffde7; padding: 12px; border-radius: 8px; margin: 10px 0;">
                <div><strong>${attempts}</strong> tentative${attempts > 1 ? 's' : ''}</div>
                <div style="color: #666;">en ${timeStr}</div>
            </div>
        </div>
    `;
    modal.style.display = "block";
    modal.classList.add("show");
    modal.focus();
}

function hideWinModal() {
    document.getElementById("winModal").style.display = "none";
}

function resetGame() {
    // Générer un nouvel identifiant de partie
    currentGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    secret = generateSecret();
    attempts = 0;
    startTime = Date.now();
    guessInput.value = "";
    historyList.innerHTML = "";
    showMessage("Devinez le nombre secret");
    localStorage.removeItem(CONFIG.STORAGE.HISTORY);
    // NE PAS supprimer CURRENT_GAME_ID pour éviter les resauvegardes
    hideWinModal();
    guessInput.focus();
}

function replayGame() {
    resetGame();
    hideWinModal();
}

function changeGameLevel() {
    const newLevel = parseInt(gameLevelSelect.value);
    const currentLevel = secret.length;

    if (newLevel !== currentLevel && attempts > 0) {
        if (confirm(`Changer de niveau (${currentLevel} → ${newLevel} chiffres) réinitialisera la partie. Continuer ?`)) {
            applyLevelChange(newLevel);
        } else {
            gameLevelSelect.value = currentLevel;
        }
    } else {
        applyLevelChange(newLevel);
    }
}

function applyLevelChange(level) {
    // Générer un nouvel identifiant de partie
    currentGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    guessInput.maxLength = level;
    guessInput.placeholder = `${level} chiffres`;
    secret = generateSecret();
    attempts = 0;
    startTime = Date.now();
    guessInput.value = "";
    historyList.innerHTML = "";
    showMessage("Devinez le nombre secret");
    localStorage.removeItem(CONFIG.STORAGE.HISTORY);
    updateDifficultyIndicator();
}

// ==================== SCORES LOCAUX ====================

function saveGameScore(level, attempts, time, date = null) {
    const player = getCurrentPlayer();
    if (!player) {
        console.log("❌ Impossible de sauvegarder : joueur non identifié");
        return false;
    }

    const newScore = {
        level: level,
        attempts: attempts,
        time: time,
        date: date || new Date().toLocaleDateString("fr-FR"),
        timestamp: Date.now(),
        pseudo: player.pseudo,
        playerId: player.playerId,
        gameId: currentGameId // Ajouter l'identifiant de partie
    };

    console.log("💾 Sauvegarde du score:", newScore);

    // 1. Sauvegarde locale
    saveScoreLocal(newScore);
    
    // 2. Synchronisation GitLab
    if (typeof saveScoreOnline === 'function') {
        console.log("🔄 Tentative d'envoi vers GitLab...");
        saveScoreOnline(newScore)
            .then(success => {
                if (success) {
                    console.log("✅ Score envoyé à GitLab !");
                    showMessage("Score synchronisé en ligne ! 🌐");
                }
            })
            .catch(error => {
                console.log('❌ Erreur GitLab:', error.message);
                // Mettre en attente pour resync plus tard
                if (typeof savePendingScore === 'function') {
                    savePendingScore(newScore);
                    console.log("💾 Score mis en attente");
                }
            });
    } else {
        console.log("❌ Fonction saveScoreOnline non disponible");
    }

    return true;
}

function saveScoreLocal(newScore) {
    const scores = getLocalScores();
    
    // Vérifier les doublons avec l'identifiant de partie
    const isDuplicate = scores.some(score => 
        score.gameId === newScore.gameId || // Même partie
        (score.playerId === newScore.playerId &&
         score.attempts === newScore.attempts &&
         score.level === newScore.level &&
         Math.abs(new Date(score.timestamp) - new Date(newScore.timestamp)) < 5000) // 5 secondes
    );
    
    if (isDuplicate) {
        console.log("🚫 Score dupliqué ignoré:", newScore);
        return;
    }
    
    scores.push(newScore);

    // Garder top 10 par niveau
    const bestScores = [];
    [3, 4, 5].forEach(level => {
        const levelScores = scores
            .filter(score => score.level === level)
            .sort((a, b) => a.attempts - b.attempts)
            .slice(0, 10);
        bestScores.push(...levelScores);
    });

    localStorage.setItem(CONFIG.STORAGE.SCORES, JSON.stringify(bestScores));
    console.log("💾 Score sauvegardé localement:", newScore);
}

function getLocalScores() {
    try {
        return JSON.parse(localStorage.getItem(CONFIG.STORAGE.SCORES) || "[]");
    } catch (e) {
        return [];
    }
}

function clearAllLocalScores() {
    if (confirm("⚠️ Supprimer TOUS les scores locaux ?\n\nCette action est irréversible.")) {
        localStorage.removeItem(CONFIG.STORAGE.SCORES);
        showMessage("🗑️ Tous les scores locaux ont été supprimés !");
        console.log("🧹 Tous les scores locaux effacés");
    }
}

function displayLocalScores() {
    const scores = getLocalScores();
    const container = document.getElementById("highscoresList");
    const currentPlayer = getCurrentPlayer();

    if (!scores || scores.length === 0) {
        container.innerHTML = `
    <div style="text-align: center; color: #666; padding: 20px;">
        <div style="font-size: 48px; margin-bottom: 10px;">📊</div>
        <div>Aucun score enregistré</div>
        <div style="font-size: 12px; margin-top: 8px;">Soyez le premier à jouer !</div>
    </div>
`;
        return;
    }

    displayScoresInContainer(scores, container);
}

function cleanDuplicateScores() {
    const scores = getLocalScores();
    const uniqueScores = [];
    const seen = new Set();
    
    scores.forEach(score => {
        // Clé unique basée sur joueur + tentatives + niveau + timestamp
        const key = `${score.playerId}_${score.attempts}_${score.level}_${Math.round(score.timestamp / 1000)}`;
        
        if (!seen.has(key)) {
            seen.add(key);
            uniqueScores.push(score);
        }
    });
    
    localStorage.setItem(CONFIG.STORAGE.SCORES, JSON.stringify(uniqueScores));
    console.log(`🧹 Nettoyage: ${scores.length - uniqueScores.length} doublons supprimés`);
    return uniqueScores;
}

function calculateLocalStats() {
    const scores = getLocalScores();
    const currentPlayer = getCurrentPlayer();
    const playerScores = currentPlayer ? scores.filter(score => score.playerId === currentPlayer.playerId) : [];

    const stats = {
        totalGames: playerScores.length,
        bestScore: playerScores.length > 0 ? Math.min(...playerScores.map(s => s.attempts)) : 0,
        byLevel: {}
    };

    [3, 4, 5].forEach(level => {
        const levelScores = playerScores.filter(score => score.level === level);
        if (levelScores.length > 0) {
            stats.byLevel[level] = {
                count: levelScores.length,
                best: Math.min(...levelScores.map(s => s.attempts))
            };
        }
    });

    return stats;
}

function displayScoresInContainer(scores, container) {
    const currentPlayer = getCurrentPlayer();

    const scoresByLevel = {};
    scores.forEach(score => {
        if (!scoresByLevel[score.level]) scoresByLevel[score.level] = [];
        scoresByLevel[score.level].push(score);
    });

    // Couleurs par niveau
    const levelColors = {
        3: "#4CAF50", // Vert
        4: "#FF9800", // Orange  
        5: "#F44336"  // Rouge
    };

    let html = '<div style="text-align: center; font-weight: bold; margin-bottom: 20px; font-size: 18px; background: #ffd700; padding: 10px; border-radius: 8px;">Top 10</div>';

    Object.keys(scoresByLevel)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(level => {
            const levelColor = levelColors[level];
            
            html += `<div style="margin-bottom: 20px;">`;
            
            // Titre du niveau avec couleur de fond
            html += `<div style="font-weight: bold; margin-bottom: 12px; color: #000; font-size: 16px; padding: 8px; background: ${levelColor}; border-radius: 8px; text-align: center;">Niveau ${level} chiffres</div>`;

            const levelScores = scoresByLevel[level]
                .sort((a, b) => a.attempts - b.attempts)
                .slice(0, 10);

            levelScores.forEach((score, index) => {
                const position = index + 1;
                const isCurrentPlayer = currentPlayer && score.playerId === currentPlayer.playerId;
                
                // Médaille ou numéro
                let positionDisplay;
                if (position === 1) positionDisplay = "🥇";
                else if (position === 2) positionDisplay = "🥈";
                else if (position === 3) positionDisplay = "🥉";
                else positionDisplay = `${position}.`;

                // Style UNIFORME pour toutes les boîtes
                const boxStyle = `
                    display: flex; 
                    justify-content: space-between; 
                    align-items: start; 
                    padding: 10px 12px; 
                    background: #fff9c4; 
                    margin: 6px 0; 
                    border-radius: 8px; 
                    border: 2px solid ${levelColor};
                    ${isCurrentPlayer ? 'background: #fff176; border-width: 3px;' : ''}
                `;

                html += `
                    <div style="${boxStyle}">
                        
                        <!-- Colonne GAUCHE : Position + Pseudo + Date -->
                        <div style="flex: 1; display: flex; align-items: start;">
                            <div style="font-weight: bold; margin-right: 8px; min-width: 30px; text-align: center;">${positionDisplay}</div>
                            <div>
                                <div style="font-weight: ${isCurrentPlayer ? 'bold' : 'normal'}; color: ${isCurrentPlayer ? levelColor : '#000'}; margin-bottom: 4px;">
                                    ${score.pseudo || 'Anonyme'}
                                    ${isCurrentPlayer ? '<span style="font-size: 10px; color: ' + levelColor + ';"> (Vous)</span>' : ''}
                                </div>
                                <div style="font-size: 11px; color: #666;">${score.date}</div>
                            </div>
                        </div>
                        
                        <!-- Colonne DROITE : Tentatives + Temps -->
                        <div style="text-align: right; min-width: 80px;">
                            <div style="font-weight: bold; margin-bottom: 2px; color: #d32f2f;">
                                ${score.attempts} essai${score.attempts > 1 ? 's' : ''}
                            </div>
                            <div style="font-size: 11px; color: #666;">${score.time}</div>
                        </div>
                        
                    </div>
                `;
            });
            
            html += "</div>";
        });
    
    container.innerHTML = html;
}

// ==================== INTERFACE ====================

function showRules() {
    document.getElementById("rulesModal").style.display = "block";
}

function hideRules() {
    document.getElementById("rulesModal").style.display = "none";
}

function showOptions() {
    document.getElementById("optionsModal").style.display = "block";
}

function hideOptions() {
    document.getElementById("optionsModal").style.display = "none";
}

function changePseudo() {
    showPseudoModal(true);
}

function showStats() {
    const stats = calculateLocalStats();
    const container = document.getElementById("statsContent");

    if (stats.totalGames === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #666; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 10px;">📊</div>
                <div>Aucune donnée statistique</div>
                <div style="font-size: 12px; margin-top: 8px;">Jouez pour générer des statistiques !</div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #000; background: #ffd700; padding: 5px; border-radius: 5px; text-align: center;">📈 Global</div>
                <div style="display: flex; justify-content: space-between; padding: 8px;"><span>Parties jouées:</span><strong>${stats.totalGames}</strong></div>
                <div style="display: flex; justify-content: space-between; padding: 8px;"><span>Meilleur score:</span><strong>${stats.bestScore} essais</strong></div>
            </div>
            ${Object.keys(stats.byLevel).map(level => `
                <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 5px; color: #000;">${level} chiffres</div>
                    <div style="display: flex; justify-content: space-between; padding: 4px;"><span>Parties:</span><strong>${stats.byLevel[level].count}</strong></div>
                    <div style="display: flex; justify-content: space-between; padding: 4px;"><span>Meilleur:</span><strong>${stats.byLevel[level].best} essais</strong></div>
                </div>
            `).join('')}
        `;
    }
    document.getElementById("statsModal").style.display = "block";
}

function showScores() {
    document.getElementById("scoresModal").style.display = "block";
    
    // Demander à l'utilisateur ce qu'il veut voir
    const container = document.getElementById("highscoresList");
    container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div style="margin-bottom: 15px; font-weight: bold;">Que voulez-vous voir ?</div>
            <button onclick="showLocalScoresOnly()" class="btn btn-primary" style="margin: 5px;">
                📱 Mes scores locaux
            </button>
            <button onclick="showOnlineScores()" class="btn btn-primary" style="margin: 5px;">
                🌐 Scores en ligne
            </button>
        </div>
    `;
}

function showLocalScoresOnly() {
    displayLocalScores();
}

function showOnlineScores() {
    if (typeof displayOnlineScores === 'function') {
        displayOnlineScores();
    } else {
        displayLocalScores();
    }
}

function hideStats() {
    document.getElementById("statsModal").style.display = "none";
}

function hideScores() {
    document.getElementById("scoresModal").style.display = "none";
}

function confirmReset() {
    if (confirm("Démarrer une nouvelle partie ?")) resetGame();
}

// ==================== INITIALISATION ====================

function initEventListeners() {
    guessInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") checkGuess();
    });

    guessInput.addEventListener("input", (e) => {
        const level = parseInt(gameLevelSelect.value || CONFIG.DEFAULT_LEVEL);
        e.target.value = e.target.value.replace(/[^0-9]/g, "").slice(0, level);
    });

    window.addEventListener("click", (e) => {
        if (e.target.matches('.modal')) e.target.style.display = "none";
    });

    // Navigation modals
    const statsLink = document.querySelector('.stats-link');
    const scoresLink = document.querySelector('.scores-link');
    
    if (statsLink) {
        statsLink.onclick = () => { 
            hideOptions(); 
            showStats(); 
        };
    }
    
    if (scoresLink) {
        scoresLink.onclick = () => { 
            hideOptions(); 
            showScores();
        };
    }
}

window.addEventListener("load", () => {
    guessInput = document.getElementById("guessInput");
    messageBox = document.getElementById("messageBox");
    historyList = document.getElementById("historyList");
    gameLevelSelect = document.getElementById("gameLevel");

    // Générer un identifiant de partie au chargement
    currentGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Restaurer état
    const savedHistory = localStorage.getItem(CONFIG.STORAGE.HISTORY);
    if (savedHistory) historyList.innerHTML = savedHistory;

    const savedLevel = localStorage.getItem(CONFIG.STORAGE.LEVEL);
    if (savedLevel && CONFIG.LEVELS.includes(parseInt(savedLevel))) {
        gameLevelSelect.value = savedLevel;
    } else {
        gameLevelSelect.value = CONFIG.DEFAULT_LEVEL;
        localStorage.setItem(CONFIG.STORAGE.LEVEL, CONFIG.DEFAULT_LEVEL);
    }
    
    secret = generateSecret();
    updateDifficultyIndicator();
    initEventListeners();

    // Pseudo
    const player = getCurrentPlayer();
    if (!player) setTimeout(() => showPseudoModal(), 1500);
    else updatePseudoDisplay();

    // Règles première fois
    if (!localStorage.getItem(CONFIG.STORAGE.RULES_SEEN)) {
        setTimeout(() => {
            showRules();
            localStorage.setItem(CONFIG.STORAGE.RULES_SEEN, "true");
        }, 1000);
    }

    // Nettoyer les doublons existants au chargement
    setTimeout(() => {
        cleanDuplicateScores();
    }, 1000);

    gameLevelSelect.addEventListener("change", function() {
        localStorage.setItem(CONFIG.STORAGE.LEVEL, this.value);
        updateDifficultyIndicator();
        changeGameLevel();
    });

    guessInput.focus();
});