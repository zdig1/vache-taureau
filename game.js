// Configuration
const CONFIG = {
    LEVELS: [3, 4, 5],
    DEFAULT_LEVEL: 4,
    STORAGE: {
        HISTORY: 'vacheTaureauHistory',
        LEVEL: 'gameLevel',
        RULES_SEEN: 'hasSeenRules',
        SCORES: 'vacheTaureauLocalScores',
        CURRENT_GAME_ID: 'currentGameId',
        SECRET: 'currentSecret',
        ATTEMPTS: 'currentAttempts',
        START_TIME: 'gameStartTime'
    }
};

// État du jeu
let secret = '';
let attempts = 0;
let startTime = Date.now();
let errorTimeout = null;
let currentGameId = null;

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
    
    // Sauvegarder le nouveau nombre d'essais
    localStorage.setItem(CONFIG.STORAGE.ATTEMPTS, attempts.toString());
    
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

    // VICTOIRE - Logique corrigée
    if (taureaux === level) {
        const timeSec = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(timeSec / 60);
        const seconds = timeSec % 60;
        const timeDisplay = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        
        console.log("🎯 Victoire détectée!", {
            secret: secret,
            attempts: attempts,
            time: timeDisplay,
            gameId: currentGameId
        });
        
        // Sauvegarder le score (appel simple et direct)
        const saved = saveGameScore(secret.length, attempts, timeDisplay);
        
        if (saved) {
            console.log("✅ Score sauvegardé avec succès");
            // Marquer que cette partie a été sauvegardée
            localStorage.setItem(CONFIG.STORAGE.CURRENT_GAME_ID, currentGameId);
        }
        
        showWinModal(attempts, timeDisplay);
    }

    guessInput.value = "";
    guessInput.focus();
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
    
    // Nettoyer l'état précédent
    clearGameState();
    
    // Générer un NOUVEAU secret
    secret = generateSecret();
    attempts = 0;
    startTime = Date.now();
    guessInput.value = "";
    historyList.innerHTML = "";
    showMessage("Devinez le nombre secret");
    
    // Sauvegarder le NOUVEL état
    localStorage.setItem(CONFIG.STORAGE.SECRET, secret);
    localStorage.setItem(CONFIG.STORAGE.ATTEMPTS, attempts.toString());
    localStorage.setItem(CONFIG.STORAGE.START_TIME, startTime.toString());
    localStorage.setItem(CONFIG.STORAGE.CURRENT_GAME_ID, currentGameId);
    
    hideWinModal();
    guessInput.focus();
    
    console.log("🔄 Nouvelle partie:", { secret: secret, gameId: currentGameId });
}

function replayGame() {
    resetGame();
    hideWinModal();
}

function clearGameState() {
    localStorage.removeItem(CONFIG.STORAGE.SECRET);
    localStorage.removeItem(CONFIG.STORAGE.ATTEMPTS);
    localStorage.removeItem(CONFIG.STORAGE.START_TIME);
    localStorage.removeItem(CONFIG.STORAGE.HISTORY);
    // Note: On ne supprime pas CURRENT_GAME_ID ici
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
    
    // Nettoyer l'état précédent
    clearGameState();
    
    guessInput.maxLength = level;
    guessInput.placeholder = `${level} chiffres`;
    secret = generateSecret();
    attempts = 0;
    startTime = Date.now();
    guessInput.value = "";
    historyList.innerHTML = "";
    showMessage("Devinez le nombre secret");
    
    // Sauvegarder tout le nouvel état
    localStorage.setItem(CONFIG.STORAGE.SECRET, secret);
    localStorage.setItem(CONFIG.STORAGE.ATTEMPTS, attempts.toString());
    localStorage.setItem(CONFIG.STORAGE.START_TIME, startTime.toString());
    localStorage.setItem(CONFIG.STORAGE.CURRENT_GAME_ID, currentGameId);
    localStorage.setItem(CONFIG.STORAGE.LEVEL, level.toString());
    
    updateDifficultyIndicator();
    
    console.log("📏 Changement de niveau:", { level: level, gameId: currentGameId });
}

// ==================== SCORES LOCAUX (VERSION SIMPLIFIÉE) ====================

function saveGameScore(level, attempts, time, date = null) {
    const player = getCurrentPlayer();
    if (!player) {
        console.log("❌ Impossible de sauvegarder : joueur non identifié");
        showMessage("Définis un pseudo pour sauvegarder ton score!", "message-error");
        return false;
    }

    const newScore = {
        level: level,
        attempts: attempts,
        time: time,
        date: date || new Date().toLocaleDateString("fr-FR", {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }),
        timestamp: Date.now(),
        pseudo: player.pseudo,
        playerId: player.playerId,
        gameId: currentGameId
    };

    console.log("💾 Sauvegarde du score:", newScore);

    // Sauvegarde locale (méthode simplifiée et fiable)
    const saved = saveScoreLocalSimple(newScore);
    
    if (saved) {
        showMessage(`Score sauvegardé: ${attempts} essais en ${time} 🏆`);
        return true;
    } else {
        showMessage("Erreur lors de la sauvegarde du score", "message-error");
        return false;
    }
}

function saveScoreLocalSimple(newScore) {
    try {
        // Récupérer tous les scores existants
        let scores = JSON.parse(localStorage.getItem(CONFIG.STORAGE.SCORES) || '[]');
        
        // Vérifier si ce score (même gameId) existe déjà
        const existingIndex = scores.findIndex(score => score.gameId === newScore.gameId);
        
        if (existingIndex !== -1) {
            console.log("🔄 Mise à jour du score existant");
            scores[existingIndex] = newScore;
        } else {
            console.log("➕ Ajout d'un nouveau score");
            scores.push(newScore);
        }
        
        // Trier par: niveau → tentatives → date
        scores.sort((a, b) => {
            if (a.level !== b.level) return a.level - b.level;
            if (a.attempts !== b.attempts) return a.attempts - b.attempts;
            return b.timestamp - a.timestamp;
        });
        
        // Limiter à 30 scores maximum (10 par niveau)
        if (scores.length > 30) {
            scores = scores.slice(0, 30);
        }
        
        // Sauvegarder dans localStorage
        localStorage.setItem(CONFIG.STORAGE.SCORES, JSON.stringify(scores));
        
        console.log(`✅ Score sauvegardé. Total: ${scores.length} scores`);
        return true;
    } catch (error) {
        console.error("❌ Erreur sauvegarde score:", error);
        return false;
    }
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
        
        // Recharger l'affichage des scores si la modal est ouverte
        if (document.getElementById("scoresModal").style.display === "block") {
            displayLocalScores();
        }
    }
}

function displayLocalScores() {
    const scores = getLocalScores();
    const container = document.getElementById("highscoresList");
    const currentPlayer = getCurrentPlayer();

    if (!scores || scores.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #666; padding: 40px;">
                <div style="font-size: 48px; margin-bottom: 10px;">📊</div>
                <div>Aucun score enregistré</div>
                <div style="font-size: 12px; margin-top: 8px;">Jouez et gagnez pour apparaître ici !</div>
            </div>
        `;
        return;
    }

    displayScoresInContainer(scores, container);
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

    let html = '<div style="text-align: center; font-weight: bold; margin-bottom: 20px; font-size: 18px; background: #ffd700; padding: 10px; border-radius: 8px;">Top 10 par niveau</div>';

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

                html += `
                    <div style="padding: 12px; background: #fff9c4; margin: 8px 0; border-radius: 10px; border: 2px solid ${levelColor}; ${isCurrentPlayer ? 'background: #fff176; border-width: 3px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' : ''}">
                        <!-- Ligne 1 -->
                        <div style="margin-bottom: 5px;">
                            <span style="font-weight: bold; font-size: 16px; color: ${levelColor}; margin-right: 8px;">${positionDisplay}</span>
                            <span style="font-size: 15px; font-weight: ${isCurrentPlayer ? 'bold' : 'normal'}; color: #000;">
                                ${score.pseudo || 'Anonyme'}
                                ${isCurrentPlayer ? '<span style="font-size: 11px; color: ' + levelColor + '; margin-left: 5px;">(vous)</span>' : ''}
                            </span>
                        </div>
                        
                        <!-- Ligne 2 -->
                        <div style="margin-bottom: 3px; font-size: 14px;">
                            <span style="font-weight: bold; color: #d32f2f;">${score.attempts} essai${score.attempts > 1 ? 's' : ''}</span>
                            <span style="color: #666; margin-left: 8px;">en ${score.time}</span>
                        </div>
                        
                        <!-- Ligne 3 -->
                        <div style="font-size: 12px; color: #888; text-align: right;">
                            ${score.date}
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
                <div style="font-size: 12px; margin-top: 8px;">Jouez et gagnez pour générer des statistiques !</div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="font-weight: bold; margin-bottom: 10px; color: #000; background: #ffd700; padding: 5px; border-radius: 5px; text-align: center;">📈 Statistiques Globales</div>
                <div style="display: flex; justify-content: space-between; padding: 8px;"><span>Parties jouées:</span><strong>${stats.totalGames}</strong></div>
                <div style="display: flex; justify-content: space-between; padding: 8px;"><span>Meilleur score:</span><strong>${stats.bestScore} essais</strong></div>
            </div>
            ${Object.keys(stats.byLevel).map(level => `
                <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; margin-bottom: 5px; color: #000; background: #f5f5f5; padding: 5px; border-radius: 5px;">Niveau ${level} chiffres</div>
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
    displayLocalScores();
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

    // RESTAURER l'état précédent ou créer une nouvelle partie
    const savedSecret = localStorage.getItem(CONFIG.STORAGE.SECRET);
    const savedAttempts = localStorage.getItem(CONFIG.STORAGE.ATTEMPTS);
    const savedStartTime = localStorage.getItem(CONFIG.STORAGE.START_TIME);
    const savedGameId = localStorage.getItem(CONFIG.STORAGE.CURRENT_GAME_ID);
    const savedHistory = localStorage.getItem(CONFIG.STORAGE.HISTORY);

    if (savedSecret && savedAttempts && savedStartTime && savedGameId) {
        // RESTAURER la partie existante
        currentGameId = savedGameId;
        secret = savedSecret;
        attempts = parseInt(savedAttempts) || 0;
        startTime = parseInt(savedStartTime) || Date.now();
        
        console.log("🔄 Partie restaurée:", { 
            secret: secret, 
            attempts: attempts, 
            gameId: currentGameId 
        });
    } else {
        // NOUVELLE partie
        currentGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        secret = generateSecret();
        attempts = 0;
        startTime = Date.now();
        
        // Sauvegarder la nouvelle partie
        localStorage.setItem(CONFIG.STORAGE.SECRET, secret);
        localStorage.setItem(CONFIG.STORAGE.ATTEMPTS, attempts.toString());
        localStorage.setItem(CONFIG.STORAGE.START_TIME, startTime.toString());
        localStorage.setItem(CONFIG.STORAGE.CURRENT_GAME_ID, currentGameId);
    }

    // Restaurer l'historique
    if (savedHistory) {
        historyList.innerHTML = savedHistory;
    }

    const savedLevel = localStorage.getItem(CONFIG.STORAGE.LEVEL);
    if (savedLevel && CONFIG.LEVELS.includes(parseInt(savedLevel))) {
        gameLevelSelect.value = savedLevel;
    } else {
        gameLevelSelect.value = CONFIG.DEFAULT_LEVEL;
        localStorage.setItem(CONFIG.STORAGE.LEVEL, CONFIG.DEFAULT_LEVEL);
    }
    
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
        const scores = getLocalScores();
        console.log("📊 Scores au chargement:", scores.length);
        if (scores.length > 0) {
            console.log("Dernier score:", scores[scores.length - 1]);
        }
    }, 500);

    gameLevelSelect.addEventListener("change", function() {
        localStorage.setItem(CONFIG.STORAGE.LEVEL, this.value);
        updateDifficultyIndicator();
        changeGameLevel();
    });

    guessInput.focus();
});

// ==================== FONCTIONS EXPOSÉES ====================

// Exposer les fonctions nécessaires
window.clearAllLocalScores = clearAllLocalScores;