document.addEventListener('DOMContentLoaded', () => {
    // --- Éléments DOM ---
    const mainDisplay = document.getElementById('main-display');
    const pttButton = document.getElementById('ptt-button');
    const scrollUpButton = document.getElementById('scroll-up');
    const scrollDownButton = document.getElementById('scroll-down');
    const queryTextElement = document.getElementById('query-text');
    const responseTextElement = document.getElementById('response-text');
    const permissionStatusElement = document.getElementById('permission-status');
    const errorMessageElement = document.getElementById('error-message');

    // Récupération dynamique des écrans basée sur l'attribut data-screen-name
    const screens = {};
    document.querySelectorAll('.screen').forEach(screen => {
        const screenName = screen.dataset.screenName;
        if (screenName) {
            screens[screenName] = screen;
        }
    });
    // Ordre de navigation pour les boutons scroll (exclut écoute/réponse/erreur)
    const screenOrder = [
        'home',
        'alarms',
        'timer',
        'music',
        'vision'
    ];
    let currentScreenIndex = 0; // Index dans screenOrder

    // --- Variables d'état ---
    let isListening = false; // Flag: PTT est activement enfoncé
    let recognitionActive = false; // Flag: API SpeechRecognition est en cours d'exécution (onstart -> onend/onerror)
    let speechPromiseCallbacks = null; // Stocke { resolve, reject } de la promesse de reconnaissance en cours
    let recognition = null; // Instance de SpeechRecognition
    let speechApiAvailable = false; // Flag: API supportée et initialisée
    let permissionGranted = null; // null (pas encore demandé), true (accordé), false (refusé)

    // Minuteur
    const timerStartButton = document.getElementById('timer-start');
    const timerResetButton = document.getElementById('timer-reset');
    const timerDisplay = document.querySelector('.timer-display');
    let timerInterval = null;
    let timerSeconds = 0;
    let isTimerRunning = false;

    // Musique
    const playPauseButton = document.getElementById('play-pause');
    let isMusicPlaying = false;

    // Vision
    const captureButton = document.querySelector('.capture-btn');

    // --- Configuration ---
    // ATTENTION : Stocker la clé API directement dans le code front-end n'est PAS SÉCURISÉ.
    // Pour une application réelle, utilisez un backend pour gérer les appels API.
    const GEMINI_API_KEY = 'AIzaSyBW5xJAUSzhJP5n5p8znA39QFDR8JqtwPY'; // REMPLACEZ PAR VOTRE VRAIE CLÉ API GEMINI
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    // --- Fonctions ---

    /**
     * Affiche un écran spécifique et masque les autres.
     * @param {string} screenName - Le nom de l'écran à afficher (doit correspondre à data-screen-name).
     */
    function switchScreen(screenName) {
        console.log(`Switching to screen: ${screenName}`);
        let foundScreen = false;
        Object.entries(screens).forEach(([name, screenElement]) => {
            if (name === screenName) {
                screenElement.classList.add('active-screen');
                foundScreen = true;
                // Mettre à jour l'index si c'est un écran principal navigable
                const navigableIndex = screenOrder.indexOf(screenName);
                if (navigableIndex !== -1) {
                    currentScreenIndex = navigableIndex;
                    console.log(`Current navigable screen index updated to: ${currentScreenIndex} (${screenName})`);
                }
                // Si on affiche l'écran de réponse, s'assurer que le scroll est en haut
                if (name === 'response') {
                    screenElement.scrollTop = 0;
                }
            } else {
                screenElement.classList.remove('active-screen');
            }
        });

        if (!foundScreen) {
            console.error(`Screen "${screenName}" not found. Switching to home.`);
            switchScreen('home'); // Revenir à l'accueil en cas d'erreur
        }
    }

    /**
     * Affiche un message d'erreur sur l'écran d'erreur dédié ou en fallback.
     * @param {string} message - Le message d'erreur à afficher.
     */
    function showErrorScreen(message) {
        console.error("Displaying error:", message); // Log l'erreur
        if (errorMessageElement && screens.error) {
            errorMessageElement.textContent = message;
            switchScreen('error');
        } else {
            // Fallback si l'écran d'erreur n'existe pas
            console.error("Error screen elements not found. Fallback display on response screen.");
             switchScreen('response');
             queryTextElement.textContent = "Erreur";
             // Utilisation de single quotes pour éviter conflit avec style=""
             responseTextElement.innerHTML = `<p class="error-message">${message}</p>`;
        }
    }

    /**
     * Met à jour le message de statut de permission sur l'écran d'accueil.
     * @param {string} message - Le message à afficher.
     * @param {boolean} isError - Si true, ajoute la classe 'error' pour le style.
     */
    function updatePermissionStatus(message, isError = false) {
        if (permissionStatusElement) {
            permissionStatusElement.textContent = message;
            if (isError) {
                permissionStatusElement.classList.add('error');
            } else {
                permissionStatusElement.classList.remove('error');
            }
            console.log(`Permission status updated: "${message}" (isError: ${isError})`);
        }
    }

    // --- Initialisation de la Reconnaissance Vocale ---

    /**
     * Initialise l'API SpeechRecognition, vérifie les permissions et configure les callbacks.
     * @returns {Promise<boolean>} Promesse résolue avec true si l'API est prête et la permission n'est pas refusée, false sinon.
     */
    async function initializeSpeechRecognition() {
        console.log("Initializing Speech Recognition...");
        // Vérifier la compatibilité du navigateur
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            console.warn("API SpeechRecognition non supportée.");
            updatePermissionStatus("Reconnaissance vocale non supportée par ce navigateur.", true);
            speechApiAvailable = false;
            if (pttButton) pttButton.disabled = true;
            return false;
        }

        // Vérifier le contexte sécurisé (HTTPS ou localhost)
        // Note: SpeechRecognition peut parfois fonctionner sur HTTP localhost, mais getUserMedia (pour la permission) nécessite un contexte sécurisé.
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
             console.warn("Contexte non sécurisé détecté.");
             updatePermissionStatus("Le microphone nécessite une connexion sécurisée (HTTPS).", true);
             speechApiAvailable = false;
             if (pttButton) pttButton.disabled = true;
             return false;
        }
        // Vérification supplémentaire pour mediaDevices (plus fiable pour détecter le contexte sécurisé)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
             console.warn("navigator.mediaDevices.getUserMedia non disponible (contexte non sécurisé ?).");
              updatePermissionStatus("Impossible d'accéder aux périphériques média (connexion non sécurisée ?).", true);
             speechApiAvailable = false;
             if (pttButton) pttButton.disabled = true;
             return false;
        }


        // Initialiser l'instance de reconnaissance
        try {
            recognition = new SpeechRecognitionAPI();
        } catch (error) {
             console.error("Erreur lors de la création de l'instance SpeechRecognition:", error);
             updatePermissionStatus("Erreur d'initialisation de la reconnaissance vocale.", true);
             speechApiAvailable = false;
             if (pttButton) pttButton.disabled = true;
             return false;
        }

        recognition.lang = 'fr-FR';
        recognition.continuous = true; // Important pour le mode PTT
        recognition.interimResults = false; // Simplifie la gestion des résultats

        speechApiAvailable = true;
        console.log("API SpeechRecognition initialisée.");
        if (pttButton) pttButton.disabled = false; // Activer le bouton (sera désactivé si permission refusée plus tard)
        updatePermissionStatus("Prêt."); // Message initial neutre

        // --- Gestionnaires d'événements de reconnaissance (attachés une seule fois) ---
        let currentTranscript = ''; // Transcript accumulé pour une session d'écoute PTT

        recognition.onstart = () => {
            console.log("SpeechRecognition: onstart - Écoute démarrée.");
            recognitionActive = true;
            currentTranscript = ''; // Réinitialiser le transcript pour cette session
            if (pttButton) pttButton.classList.add('active');
            switchScreen('listening');
        };

        recognition.onresult = (event) => {
            console.log("SpeechRecognition: onresult");
            // Concaténer tous les résultats finaux reçus jusqu'à présent dans cette session
            let transcriptSegment = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    transcriptSegment += event.results[i][0].transcript + ' ';
                }
                // Ignorer les résultats non finaux car interimResults = false
            }
            if (transcriptSegment) {
                currentTranscript += transcriptSegment;
                console.log("Transcript final accumulé:", currentTranscript.trim());
            }
        };

        recognition.onerror = (event) => {
            console.error(`SpeechRecognition: onerror - Erreur: ${event.error}, Message: ${event.message}`);
            recognitionActive = false; // Marquer comme inactif
            if (pttButton) pttButton.classList.remove('active');

            let userMessage = "Une erreur de reconnaissance vocale s'est produite.";
            switch (event.error) {
                case 'no-speech':
                    userMessage = "Je n'ai rien entendu. Essayez de parler plus clairement.";
                    break;
                case 'audio-capture':
                    userMessage = "Problème technique avec le microphone. Vérifiez votre matériel ou les permissions système.";
                    break;
                case 'not-allowed':
                case 'permission-denied':
                    userMessage = "L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres de votre navigateur pour ce site.";
                    permissionGranted = false;
                    updatePermissionStatus(userMessage, true);
                    if (pttButton) pttButton.disabled = true;
                    break;
                case 'network':
                    userMessage = "Erreur réseau pendant la reconnaissance. Vérifiez votre connexion.";
                    break;
                case 'aborted':
                    userMessage = "Écoute arrêtée."; // Souvent normal quand on appelle stop()
                    console.log("Reconnaissance arrêtée (aborted).");
                    break;
                case 'service-not-allowed':
                     userMessage = "Le service de reconnaissance vocale est désactivé ou non autorisé par votre système/navigateur.";
                     break;
                default:
                    userMessage = `Erreur inconnue (${event.error}): ${event.message || 'Aucun détail'}`;
            }

            // Si une promesse est en attente (speechPromiseCallbacks), la rejeter
            // Ne rejeter que si l'erreur n'est pas 'aborted' (qui est souvent normal)
            if (speechPromiseCallbacks && speechPromiseCallbacks.reject && event.error !== 'aborted') {
                console.log("Rejet de la promesse de reconnaissance suite à une erreur.");
                speechPromiseCallbacks.reject(new Error(userMessage));
            } else if (event.error !== 'aborted') {
                 // Si l'erreur survient en dehors d'une écoute PTT ou si la promesse a déjà été traitée
                 showErrorScreen(userMessage);
            }
            speechPromiseCallbacks = null; // Nettoyer les callbacks
            isListening = false; // S'assurer que l'état PTT est réinitialisé en cas d'erreur
        };

        recognition.onend = () => {
            console.log("SpeechRecognition: onend - Fin de l'écoute.");
            recognitionActive = false; // Marquer comme inactif
            if (pttButton) pttButton.classList.remove('active');

            // Si une promesse est en attente, la résoudre avec le transcript final accumulé
            if (speechPromiseCallbacks && speechPromiseCallbacks.resolve) {
                console.log("Résolution de la promesse de reconnaissance avec le transcript final.");
                speechPromiseCallbacks.resolve(currentTranscript.trim());
            } else {
                 console.log("onend appelé mais pas de promesse en attente ou déjà résolue/rejetée.");
            }
            // isListening est déjà mis à false dans handlePttEnd ou onerror
            speechPromiseCallbacks = null; // Nettoyer les callbacks
        };

        // --- Vérification initiale des permissions ---
        // Utiliser l'API Permissions pour vérifier l'état sans déclencher de prompt si possible
        try {
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                permissionGranted = (permissionStatus.state === 'granted');
                console.log("Permission microphone initiale:", permissionStatus.state);

                const handlePermissionChange = () => {
                    console.log("Permission microphone changée:", permissionStatus.state);
                    permissionGranted = (permissionStatus.state === 'granted');
                     if (permissionStatus.state === 'denied') {
                         updatePermissionStatus("Accès microphone refusé. Modifiez les paramètres du site.", true);
                         if (pttButton) pttButton.disabled = true;
                         if (recognitionActive && recognition) {
                             try { recognition.abort(); } catch(e){} // Arrêter si en cours
                         }
                     } else if (permissionStatus.state === 'granted') {
                         updatePermissionStatus("Prêt.");
                         if (pttButton) pttButton.disabled = false;
                     } else { // 'prompt'
                         updatePermissionStatus("Cliquez et maintenez pour autoriser le micro.");
                         if (pttButton) pttButton.disabled = false; // Autoriser à essayer de déclencher le prompt
                     }
                };

                handlePermissionChange(); // Appeler une fois pour définir l'état initial
                permissionStatus.onchange = handlePermissionChange; // Écouter les changements

            } else {
                 console.warn("Permissions API non supportée. La permission sera demandée au premier usage.");
                 updatePermissionStatus("Prêt. L'autorisation micro sera demandée.");
                 // On ne peut pas connaître l'état initial, on suppose 'prompt' ou 'granted'
                 permissionGranted = null; // État inconnu
                 if (pttButton) pttButton.disabled = false;
            }
        } catch (err) {
            console.error("Erreur lors de la vérification/suivi des permissions:", err);
            updatePermissionStatus("Impossible de vérifier la permission micro.", true);
            // On suppose qu'on peut quand même essayer, le navigateur gérera
            permissionGranted = null; // État inconnu
            if (pttButton) pttButton.disabled = false;
        }

        return permissionGranted !== false; // Prêt si non explicitement refusé
    }


    /**
     * Démarre une session d'écoute SpeechRecognition et retourne une promesse.
     * Inclut une demande explicite de permission microphone si nécessaire.
     * @returns {Promise<string>} Une promesse qui résout avec le texte reconnu ou rejette avec une erreur.
     */
    async function startSpeechRecognition() { // Rendre la fonction async
        // Retourner une nouvelle promesse à chaque appel
        return new Promise(async (resolve, reject) => { // Rendre l'exécuteur de promesse async
            if (!speechApiAvailable || !recognition) {
                reject(new Error("Reconnaissance vocale non initialisée ou non supportée."));
                return;
            }
            if (recognitionActive) {
                console.warn("Tentative de démarrage alors que la reconnaissance est déjà active.");
                reject(new Error("Une écoute est déjà en cours."));
                return;
            }
             if (permissionGranted === false) {
                 // Message déjà affiché par updatePermissionStatus
                 reject(new Error("L'accès au microphone a été refusé."));
                 return;
             }

            // --- Nouvelle logique pour demander explicitement la permission si nécessaire ---
            // Si l'état de la permission est inconnu (probablement 'prompt' ou Permissions API non supportée)
            if (permissionGranted === null || (navigator.permissions && typeof navigator.permissions.query !== 'function')) {
                console.log("Permission microphone inconnue ou Permissions API non supportée, tentative de demande via getUserMedia...");
                try {
                    // Tenter d'obtenir un flux audio pour déclencher le prompt de permission
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    console.log("getUserMedia successful, permission granted.");
                    permissionGranted = true; // Mettre à jour l'état
                    updatePermissionStatus("Prêt."); // Mettre à jour le message
                    // Arrêter immédiatement le flux car nous n'en avons pas besoin ici, juste pour le prompt
                    stream.getTracks().forEach(track => track.stop());
                } catch (err) {
                    console.error("getUserMedia failed:", err);
                    permissionGranted = false; // Mettre à jour l'état
                    let userMessage = "Impossible d'accéder au microphone.";
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        userMessage = "L'accès au microphone a été refusé. Veuillez l'autoriser dans les paramètres de votre navigateur pour ce site.";
                    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                         userMessage = "Aucun microphone trouvé.";
                    } else if (err.name === 'NotReadableError' || err.name === 'OverconstrainedError') {
                         userMessage = "Le microphone est peut-être déjà utilisé par une autre application.";
                    } else {
                         userMessage = `Erreur technique microphone: ${err.message || err.name}`;
                    }
                    updatePermissionStatus(userMessage, true);
                    if (pttButton) pttButton.disabled = true;
                    reject(new Error(userMessage)); // Rejeter la promesse
                    return; // Arrêter l'exécution si getUserMedia échoue
                }
            }
            // --- Fin de la nouvelle logique ---

            // Si la permission est maintenant accordée (soit initialement, soit via getUserMedia)
            if (permissionGranted === true) {
                console.log("Tentative de démarrage de l'écoute (recognition.start())...");
                // Stocker les callbacks de la promesse pour les utiliser dans les événements recognition
                speechPromiseCallbacks = { resolve, reject };

                try {
                    // recognition.start() peut encore déclencher un prompt dans certains cas,
                    // mais getUserMedia l'aura déjà géré si permissionGranted était null.
                    recognition.start();
                    // Le passage à l'état 'listening' est géré par recognition.onstart
                } catch (e) {
                    console.error("Erreur immédiate lors de l'appel à recognition.start():", e);
                    recognitionActive = false; // Assurer la désactivation
                    speechPromiseCallbacks = null; // Nettoyer
                    // Rejeter la promesse immédiatement
                    reject(new Error(`Erreur technique au démarrage: ${e.message || e.name}`));
                }
            } else {
                 // Si permissionGranted est false après la vérification/tentative
                 reject(new Error("Accès microphone non accordé."));
            }
        });
    }

    // --- Gestion du Bouton Push-to-Talk (PTT) ---

    /** Gère l'appui sur le bouton PTT */
    function handlePttStart(event) {
        event.preventDefault();
        console.log("PTT Start");

        if (!speechApiAvailable || permissionGranted === false) {
            console.warn("PTT ignoré: API non dispo ou permission refusée.");
            if (permissionGranted === false) {
                 updatePermissionStatus("Accès microphone refusé. Modifiez les paramètres du site.", true);
            }
            return;
        }
        if (isListening || recognitionActive) {
             console.warn("PTT Start ignoré: déjà en écoute.");
             return;
        }

        isListening = true; // Marquer comme PTT enfoncé
        if (pttButton) {
            pttButton.classList.add('active');
            pttButton.setAttribute('aria-pressed', 'true');
        }

        // Démarrer la reconnaissance et stocker la promesse pour attendre le résultat
        const currentSpeechPromise = startSpeechRecognition();

        // Attendre le résultat (ou l'erreur) de cette promesse spécifique
        // Le traitement se fera dans processSpeechResult appelé par onend/onerror
        currentSpeechPromise
            .then(result => {
                // Ce .then est appelé lorsque recognition.onend résout la promesse
                console.log("Promesse résolue par onend.");
                processSpeechResult(result);
            })
            .catch(error => {
                // Ce .catch est appelé lorsque startSpeechRecognition rejette immédiatement
                // ou lorsque recognition.onerror rejette la promesse
                console.error("Promesse rejetée:", error);
                 // processSpeechResult gère l'affichage de l'erreur si elle vient de onerror
                 // Si l'erreur vient du démarrage (startSpeechRecognition), il faut l'afficher ici
                 if (!error.message.includes("reconnaissance vocale")) { // Éviter double affichage si onerror a déjà affiché
                     showErrorScreen(error.message);
                 }
                 // Assurer la réinitialisation de l'état PTT en cas d'erreur au démarrage
                 isListening = false;
                 if (pttButton) {
                     pttButton.classList.remove('active');
                     pttButton.setAttribute('aria-pressed', 'false');
                 }
            });
    }

    /** Gère le relâchement du bouton PTT */
    function handlePttEnd(event) {
        event.preventDefault();
        console.log("PTT End");

        if (!isListening) {
             console.warn("PTT End ignoré: n'était pas en écoute (isListening=false).");
             return; // Pas en écoute (peut arriver si erreur au start ou relâchement rapide)
        }

        isListening = false; // Marquer comme PTT relâché *immédiatement*
        if (pttButton) {
             pttButton.classList.remove('active');
             pttButton.setAttribute('aria-pressed', 'false');
        }

        // Si la reconnaissance était active, l'arrêter.
        // onend sera appelé de manière asynchrone et résoudra/rejettera la promesse.
        if (recognitionActive && recognition) {
            console.log("Arrêt de la reconnaissance via recognition.stop()...");
            try {
                // Ne pas attendre ici, onend gérera la suite
                recognition.stop();
                 // Afficher un message d'attente pendant que l'API traite les derniers sons
                 const currentScreen = document.querySelector('.screen.active-screen');
                 if (currentScreen === screens.listening) {
                    // Optionnel: Modifier le texte sur l'écran d'écoute
                    // screens.listening.querySelector('.listening-text').textContent = "Traitement...";
                 }
            } catch (e) {
                console.error("Erreur lors de l'appel à recognition.stop():", e);
                 // Si stop échoue, onend ne sera peut-être pas appelé.
                 // Tenter de rejeter la promesse manuellement si elle existe encore.
                 if (speechPromiseCallbacks && speechPromiseCallbacks.reject) {
                     speechPromiseCallbacks.reject(new Error("Échec de l'arrêt manuel de la reconnaissance."));
                     speechPromiseCallbacks = null; // Nettoyer
                 }
                 // Afficher une erreur générique
                 showErrorScreen("Erreur lors de l'arrêt de l'écoute.");
            }
        } else {
             // Si PTT End est appelé mais recognition n'était pas active (ex: erreur au start, arrêt très rapide)
             console.warn("PTT End: Recognition non active au moment de l'appel à stop(). La promesse a peut-être déjà été traitée.");
             // Si une promesse existe encore, c'est anormal, la rejeter pour éviter un blocage.
             if (speechPromiseCallbacks && speechPromiseCallbacks.reject) {
                 console.warn("Rejet d'une promesse potentiellement orpheline.");
                 speechPromiseCallbacks.reject(new Error("Écoute terminée prématurément ou état incohérent."));
                 speechPromiseCallbacks = null;
             }
        }
        // Le traitement du résultat se fait dans le .then/.catch attaché à la promesse dans handlePttStart
    }

    /**
     * Traite le résultat final (texte ou erreur) de la reconnaissance vocale et appelle Gemini si nécessaire.
     * @param {string | Error} result - Le texte reconnu ou un objet Error.
     */
    async function processSpeechResult(result) {
        console.log("Traitement du résultat final:", result);
        switchScreen('response'); // Assurer qu'on est sur l'écran de réponse

        if (result instanceof Error) {
            // C'est une erreur qui a rejeté la promesse
            queryTextElement.textContent = "Erreur de reconnaissance";
            // Correction: Utiliser single quotes pour la chaîne externe
            responseTextElement.innerHTML = `<p class="error-message">${result.message}</p>`;
        } else if (typeof result === 'string') {
            const query = result.trim();
            queryTextElement.textContent = query || "[Aucun texte reconnu]"; // Afficher le texte (ou message si vide)

            if (!query) {
                responseTextElement.innerHTML = "<p>Je n'ai pas compris ou rien entendu. Veuillez réessayer.</p>";
            } else {
                // C'est une vraie requête -> Interroger Gemini
                responseTextElement.innerHTML = "<p><i>Réflexion en cours...</i></p>"; // Message d'attente
                try {
                    const answer = await queryGemini(query);
                    displayMarkdownResponse(answer, responseTextElement); // Afficher la réponse formatée
                } catch (geminiError) {
                    console.error("Erreur lors de l'appel à Gemini:", geminiError);
                    // Correction: Utiliser single quotes pour la chaîne externe
                    responseTextElement.innerHTML = `<p class="error-message">Désolé, une erreur s'est produite avec l'IA : ${geminiError.message}</p>`;
                }
            }
        } else {
             console.error("Résultat de reconnaissance inattendu (ni string ni Error):", result);
             queryTextElement.textContent = "Erreur Inattendue";
             // Correction: Utiliser single quotes pour la chaîne externe
             responseTextElement.innerHTML = '<p class="error-message">Un problème inattendu est survenu lors du traitement de la voix.</p>';
        }
    }

    // --- Fonctions Utilitaires (Minuteur, Musique, Capture, Gemini, Markdown) ---

    // Minuteur
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    timerStartButton?.addEventListener('click', () => {
        if (!timerDisplay) return;
        if (isTimerRunning) {
            clearInterval(timerInterval);
            timerStartButton.textContent = 'Reprendre';
            timerStartButton.setAttribute('aria-label', 'Reprendre le minuteur');
            isTimerRunning = false;
        } else {
            timerStartButton.textContent = 'Pause';
            timerStartButton.setAttribute('aria-label', 'Mettre le minuteur en pause');
            // Démarrer ou reprendre le comptage
            timerInterval = setInterval(() => {
                timerSeconds++;
                timerDisplay.textContent = formatTime(timerSeconds);
            }, 1000);
            isTimerRunning = true;
        }
    });

    timerResetButton?.addEventListener('click', () => {
        if (!timerDisplay || !timerStartButton) return;
        clearInterval(timerInterval);
        timerSeconds = 0;
        timerDisplay.textContent = formatTime(timerSeconds);
        timerStartButton.textContent = 'Démarrer';
        timerStartButton.setAttribute('aria-label', 'Démarrer le minuteur');
        isTimerRunning = false;
    });

    // Musique (Simulation)
    playPauseButton?.addEventListener('click', () => {
        const icon = playPauseButton.querySelector('i');
        if (!icon) return;
        if (isMusicPlaying) {
            icon.classList.replace('fa-pause', 'fa-play');
            playPauseButton.setAttribute('aria-label', 'Lecture');
            isMusicPlaying = false;
            console.log("Musique mise en pause (simulation)");
            // TODO: Ajouter la logique réelle pour mettre la musique en pause
        } else {
            icon.classList.replace('fa-play', 'fa-pause');
             playPauseButton.setAttribute('aria-label', 'Pause');
            isMusicPlaying = true;
            console.log("Musique en lecture (simulation)");
            // TODO: Ajouter la logique réelle pour démarrer la musique
        }
    });
     // TODO: Ajouter listeners et logique pour prev/next track

    // Vision (Simulation)
    captureButton?.addEventListener('click', () => {
        const cameraPlaceholder = document.querySelector('.camera-placeholder');
        if (cameraPlaceholder) {
            // Simuler un flash
            cameraPlaceholder.style.transition = 'background-color 0.1s ease';
            cameraPlaceholder.style.backgroundColor = '#aaa';
            setTimeout(() => {
                cameraPlaceholder.style.backgroundColor = ''; // Réinitialiser
            }, 150);
        }
        console.log('Capture d\'image (simulation)');
        // TODO: Ajouter la logique réelle de capture d'image (ex: via getUserMedia API)
        // Afficher une confirmation sur l'écran de réponse
        setTimeout(() => {
            switchScreen('response');
            queryTextElement.textContent = "Vision";
             responseTextElement.innerHTML = "<p>Image capturée (simulation).</p>";
        }, 300); // Petit délai après le "flash"
    });

    // Appel API Gemini
    async function queryGemini(prompt) {
        console.log("Querying Gemini with:", prompt);
        if (!prompt) { // Vérification simplifiée
            console.warn("Requête Gemini annulée: prompt vide.");
            // Pas besoin de lancer une erreur ici, processSpeechResult gère déjà le cas vide
            return "Je n'ai pas compris, veuillez fournir une requête.";
        }
         if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') {
             console.error("Clé API Gemini manquante ou non configurée.");
             // Lancer une erreur pour qu'elle soit attrapée par processSpeechResult
             throw new Error("La clé API pour l'IA n'est pas configurée.");
         }

        responseTextElement.innerHTML = "<p><i>Réflexion en cours...</i></p>"; // Afficher pendant l'appel

        try {
            const response = await fetch(GEMINI_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { /* Options si besoin */ },
                     safetySettings: [ /* Configuration de sécurité */
                         { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                         { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                         { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                         { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                     ]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Erreur API Gemini:', response.status, data);
                const errorMessage = data?.error?.message || `Erreur HTTP ${response.status}`;
                throw new Error(`Erreur de l'API IA : ${errorMessage}`); // Lancer pour catch externe
            }

            console.log("Réponse Gemini brute:", data);

            // Gestion des réponses bloquées ou vides
            if (!data.candidates || data.candidates.length === 0) {
                 if (data.promptFeedback?.blockReason) {
                     const reason = data.promptFeedback.blockReason.replace(/_/g, ' ').toLowerCase();
                     console.warn(`Réponse bloquée par Gemini. Raison: ${reason}`);
                     return `Je ne peux pas répondre car la requête a été bloquée pour raison de sécurité (${reason}).`;
                 } else {
                     console.warn("Réponse Gemini vide ou sans candidats.");
                     return "Désolé, je n'ai pas pu générer de réponse. Veuillez réessayer.";
                 }
            }

            // Gestion des fins anormales
            const candidate = data.candidates[0];
             if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                 const reason = candidate.finishReason.replace(/_/g, ' ').toLowerCase();
                 console.warn(`Réponse Gemini terminée prématurément. Raison: ${reason}`);
                 const partialText = candidate.content?.parts?.[0]?.text || "";
                 return partialText + `\n\n_(Note : La réponse a été interrompue : ${reason}.)_`;
             }

            // Réponse nominale
            const responseText = candidate.content?.parts?.[0]?.text;
            if (responseText) {
                return responseText;
            } else {
                console.warn("Structure de réponse Gemini inattendue:", data);
                return "Désolé, j'ai reçu une réponse dans un format inattendu.";
            }

        } catch (error) {
            console.error('Erreur lors de la requête à Gemini:', error);
             // Renvoyer l'erreur pour qu'elle soit gérée par l'appelant (processSpeechResult)
             // Le message d'erreur est déjà formaté dans le bloc catch
             throw error; // Relancer l'erreur
        }
    }

    // --- Conversion Markdown vers HTML (Basique) ---
    function markdownToHtml(markdown) {
        if (typeof markdown !== 'string') return '';
        console.log("Converting Markdown to HTML...");

        let html = markdown;
        // Échapper le HTML potentiel dans le markdown pour éviter les injections simples
        // html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Blocs de code (avant les autres)
        html = html.replace(/```([\s\S]*?)```/gs, (match, code) =>
            // Échapper le contenu du code pour l'affichage
            `<pre><code>${code.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
        );

        // Titres
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Lignes horizontales
        html = html.replace(/^(?:-{3,}|_{3,}|\*{3,})$/gm, '<hr>');

        // Blockquotes (multilignes gérées)
        html = html.replace(/^(?:> (?:.*\n?))+/gm, (match) => {
            const content = match.replace(/^> /gm, '').trim();
            // Convertir récursivement le contenu du blockquote (simple ici)
            return `<blockquote>${markdownToHtmlSimpleInline(content)}</blockquote>`;
        });

        // Listes (ul/ol) - Gestion basique, fusionne les adjacentes
        html = html.replace(/^([*+-]) (.*(?:\n(?!\1 | {2,}).*)*)/gm, (match, marker, itemContent) => `<ul><li>${markdownToHtmlSimpleInline(itemContent.trim())}</li></ul>`);
        html = html.replace(/^(\d+)\. (.*(?:\n(?!\d+\. | {2,}).*)*)/gm, (match, num, itemContent) => `<ol start="${num}"><li>${markdownToHtmlSimpleInline(itemContent.trim())}</li></ol>`);
        html = html.replace(/<\/ul>\s*<ul>/g, '');
        html = html.replace(/<\/ol>\s*<ol start="\d+">/g, ''); // Gérer start attribute si nécessaire


        // Images
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

        // Liens
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

        // Éléments inline (après les blocs)
        html = markdownToHtmlSimpleInline(html);

        // Paragraphes (lignes restantes non vides et non déjà dans un bloc)
         html = html.split('\n').map(line => {
             line = line.trim();
             if (line.length === 0) return '';
             // Si la ligne ne commence PAS par une balise HTML bloc connue
             if (!line.match(/^<\/?(h[1-6]|ul|ol|li|blockquote|hr|pre|img|table|thead|tbody|tr|th|td)/i)) {
                 return `<p>${line}</p>`; // line contient déjà les éléments inline formatés
             }
             return line;
         }).join('\n');

        // Nettoyages finaux
         html = html.replace(/<p>\s*<\/p>/g, ''); // Supprimer paragraphes vides
         html = html.replace(/<\/blockquote>\s*<blockquote>/g, ''); // Fusionner blockquotes adjacentes (simple)
         html = html.replace(/\n/g, ''); // Supprimer les sauts de ligne restants (le CSS gère l'espacement)

        return html;
    }
    // Fonction helper pour les éléments inline (gras, italique, code)
    function markdownToHtmlSimpleInline(text) {
         text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Gras **
         text = text.replace(/__(.*?)__/g, '<strong>$1</strong>'); // Gras __
         text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');     // Italique *
         text = text.replace(/_(.*?)_/g, '<em>$1</em>');     // Italique _
         text = text.replace(/`([^`]+)`/g, '<code>$1</code>'); // Code inline
         return text;
    }


    /**
     * Affiche du texte Markdown converti en HTML dans un élément donné.
     * @param {string} markdownText - Le texte en Markdown.
     * @param {HTMLElement} element - L'élément où afficher le HTML.
     */
    function displayMarkdownResponse(markdownText, element) {
        if (element) {
            element.innerHTML = markdownToHtml(markdownText);
            element.style.opacity = 0; // Pour effet de fondu
            element.scrollTop = 0; // Remonter en haut de la réponse
            setTimeout(() => { element.style.opacity = 1; }, 50);
        } else {
            console.error("Élément d'affichage de la réponse non trouvé.");
        }
    }


    // --- Gestion des Contrôles (Scroll, Back buttons) ---

    scrollUpButton?.addEventListener('click', () => {
        const currentScreenElement = document.querySelector('.screen.active-screen');
        const currentScreenName = currentScreenElement?.dataset?.screenName;
        // Autoriser le scroll sauf pendant l'écoute active
        if (currentScreenName === 'listening') return;

        console.log("Scroll Up clicked. Current index:", currentScreenIndex);
        let newIndex = currentScreenIndex - 1;
        if (newIndex < 0) {
            newIndex = screenOrder.length - 1; // Boucle vers la fin
        }
        switchScreen(screenOrder[newIndex]);
    });

    scrollDownButton?.addEventListener('click', () => {
         const currentScreenElement = document.querySelector('.screen.active-screen');
         const currentScreenName = currentScreenElement?.dataset?.screenName;
         // Autoriser le scroll sauf pendant l'écoute active
         if (currentScreenName === 'listening') return;

        console.log("Scroll Down clicked. Current index:", currentScreenIndex);
        let newIndex = currentScreenIndex + 1;
        if (newIndex >= screenOrder.length) {
            newIndex = 0; // Boucle vers le début
        }
        switchScreen(screenOrder[newIndex]);
    });

    // Ajouter des gestionnaires pour TOUS les boutons "Retour"
    document.querySelectorAll('.back-button').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetScreen = event.currentTarget.dataset.targetScreen;
            console.log(`Back button clicked, target: ${targetScreen}`);
            if (targetScreen && screens[targetScreen]) {
                switchScreen(targetScreen);
            } else {
                switchScreen('home'); // Retour à l'accueil par défaut
            }
        });
    });


    // --- Initialisation de l'Application ---
    async function initializeApp() {
        console.log("Initialisation de l'application Rabbit R1...");
        switchScreen('home'); // Afficher l'écran d'accueil

        // Initialiser la reconnaissance vocale et vérifier/demander permissions
        const speechReady = await initializeSpeechRecognition();

        if (speechReady) {
            // Attacher les gestionnaires PTT seulement si l'API est prête et permission non refusée
            if (pttButton) {
                pttButton.addEventListener('mousedown', handlePttStart);
                pttButton.addEventListener('mouseup', handlePttEnd);
                // Gérer le cas où la souris quitte le bouton pendant l'appui
                pttButton.addEventListener('mouseleave', (e) => {
                    if (isListening) {
                         console.log("PTT Mouse Leave while listening - Triggering PTT End");
                         handlePttEnd(e); // Simuler un relâchement
                    }
                });

                // Support tactile amélioré
                pttButton.addEventListener('touchstart', handlePttStart, { passive: false });
                pttButton.addEventListener('touchend', handlePttEnd);
                // Gérer l'annulation du toucher (ex: doigt glisse en dehors)
                pttButton.addEventListener('touchcancel', (e) => {
                     if (isListening) {
                         console.log("PTT Touch Cancel while listening - Triggering PTT End");
                         handlePttEnd(e); // Simuler un relâchement
                     }
                });

                console.log("Gestionnaires PTT attachés.");
            } else {
                console.error("Bouton PTT non trouvé !");
            }
        } else {
             console.warn("Initialisation de la reconnaissance vocale échouée ou permission refusée. PTT restera désactivé.");
             // Le bouton PTT devrait déjà être désactivé par initializeSpeechRecognition
        }
        console.log("Application initialisée et prête.");
    }

    // Démarrer l'initialisation une fois le DOM chargé
    initializeApp();

}); // Fin du DOMContentLoaded
