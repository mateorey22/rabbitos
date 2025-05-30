
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const mainDisplay = document.getElementById('main-display');
    const pttButton = document.getElementById('ptt-button');
    const scrollUpButton = document.getElementById('scroll-up');
    const scrollDownButton = document.getElementById('scroll-down');
    const queryTextElement = document.getElementById('query-text');
    const responseTextElement = document.getElementById('response-text');
    const permissionStatusElement = document.getElementById('permission-status');
    const errorMessageElement = document.getElementById('error-message');
    const greetingElement = document.querySelector('.home-screen .greeting');
    const homeTimeElement = document.getElementById('home-time');
    const homeDateElement = document.getElementById('home-date');
    const homeBatteryElement = document.getElementById('home-battery');

    // Screen elements map
    const screens = {};
    document.querySelectorAll('.screen').forEach(screen => {
        const screenName = screen.dataset.screenName;
        if (screenName) screens[screenName] = screen;
    });

    // --- Screen Navigation Order ---
    const screenOrder = [
        'home', 'calendar', 'notes', 'gallery', 'alarms',
        'timer', 'music', 'vision', 'look_and_ask'
    ];
    let currentScreenIndex = 0;

    // --- State Variables ---
    let userName = 'Utilisateur'; // Default name
    let isListening = false;
    let recognitionActive = false;
    let speechPromiseCallbacks = null;
    let recognition = null;
    let speechApiAvailable = false;
    let permissionGranted = null; // null, true, false
    let conversationHistory = [];
    let lastInteractionTime = Date.now();
    const CONTEXT_TIMEOUT = 5 * 60 * 1000; // 5 minutes context

    // Timer Elements & State
    const timerStartButton = document.getElementById('timer-start');
    const timerResetButton = document.getElementById('timer-reset');
    const timerDisplayElement = document.getElementById('timer-display');
    let timerInterval = null;
    let timerSeconds = 0;
    let isTimerRunning = false;

    // Music Elements & State
    const audioPlayer = document.getElementById('audio-player');
    const playPauseButton = document.getElementById('play-pause');
    const prevTrackButton = document.getElementById('prev-track');
    const nextTrackButton = document.getElementById('next-track');
    const trackTitleElement = document.getElementById('track-title');
    const artistNameElement = document.getElementById('artist-name');
    let currentTrackIndex = 0;
    let isMusicPlaying = false;
    // !!! REMPLACEZ CES URLS PAR LES VÔTRES !!!
    const playlist = [
         { title: "Titre Chanson 1", artist: "Artiste 1", src: "URL_VERS_VOTRE_MUSIQUE_1.mp3" },
         { title: "Titre Chanson 2", artist: "Artiste 2", src: "URL_VERS_VOTRE_MUSIQUE_2.mp3" },
         // Ajoutez d'autres chansons ici
    ];

    // Vision (Simple Capture) Elements
    const visionCaptureButton = document.getElementById('vision-capture-btn');
    const visionCameraContainer = document.getElementById('vision-camera-container');

    // Notes Elements
    const notesTextarea = document.getElementById('notes-textarea');
    const saveNoteButton = document.getElementById('save-note-btn');
    const notesFeedback = document.getElementById('notes-feedback');

    // Gallery Elements
    const galleryContainer = document.getElementById('gallery-container');
    const galleryEmptyMsg = document.getElementById('gallery-empty-msg');
    let capturedPhotos = []; // In-memory storage for demo

    // Look & Ask (Multimodal) Elements & State
    const lookCameraContainer = document.getElementById('look-camera-container');
    const lookCaptureButton = document.getElementById('look-capture-btn');
    const lookStatusText = document.getElementById('look-status-text');
    let capturedImageDataForPrompt = null; // Base64 image data
    let isMultimodalPrompt = false; // Flag for PTT handler

    // Shared Media Elements
    let videoStream = null;
    const videoElement = document.createElement('video');
    videoElement.setAttribute('playsinline', ''); // Important for iOS
    videoElement.classList.add('live-video');
    const canvasElement = document.createElement('canvas');

    // --- Configuration ---
    // WARNING: Storing API keys client-side is insecure. Use a backend proxy in production.
     const GEMINI_API_KEY = 'AIzaSyBW5xJAUSzhJP5n5p8znA39QFDR8JqtwPY'; // REPLACE WITH YOUR ACTUAL KEY
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const GEMINI_SAFETY_SETTINGS = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ];

    // --- System Instruction for Gemini (Updated) ---
    // Note: userName, date, time are added dynamically to the prompt now
    const SYSTEM_INSTRUCTION = `Tu es un assistant vocal intégré dans une interface web simulant un appareil Rabbit R1. Ton nom est Rabbit. Tu réponds à l'utilisateur actuel (dont le nom est fourni dans le contexte).
    La date et l'heure actuelles sont fournies dans le contexte.
    Tu peux répondre aux questions et exécuter certaines actions. Tu peux afficher du texte formaté en Markdown (listes, gras, italique, titres, blocs de code, tableaux simples). Pour les questions simples ne nécessitant pas d'action, réponds directement en texte. Sois concis et direct.
    Pour exécuter une action, commence ta réponse EXACTEMENT par "% nom_fonction %" suivi de ta réponse textuelle normale. Ne mets rien avant le %. N'utilise qu'une seule commande de fonction par réponse.
    Les fonctions disponibles sont :
    - % start_timer % : Démarre ou reprend le minuteur.
    - % reset_timer % : Réinitialise le minuteur.
    - % play_music % : Lance la lecture de la musique (si en pause ou arrêtée).
    - % pause_music % : Met la musique en pause (si en lecture).
    - % play_pause_music % : Met en lecture ou en pause la musique (bascule).
    - % prev_track % : Passe à la piste précédente.
    - % next_track % : Passe à la piste suivante.
    - % capture_image % : Prend une photo simple (depuis l'écran Vision) et l'ajoute à la galerie. Doit être sur l'écran Vision. Confirme.
    - % go_home % : Affiche l'écran d'accueil.
    - % show_alarms % : Affiche l'écran des alarmes.
    - % show_timer % : Affiche l'écran du minuteur.
    - % show_music % : Affiche l'écran de musique.
    - % show_vision % : Affiche l'écran de vision (pour capture simple).
    - % show_calendar % : Affiche l'écran du calendrier (placeholder).
    - % show_notes % : Affiche l'écran des notes et charge la dernière note sauvegardée.
    - % save_current_note % : Sauvegarde le texte dans la zone de notes. Confirme.
    - % show_gallery % : Affiche la galerie des photos capturées.
    - % look_and_ask % : Active le mode caméra spécial pour analyser une image. Réponds avec un texte invitant l'utilisateur.
    Adapte ta réponse textuelle après la commande pour confirmer l'action ou répondre à la question.`;

    // --- Core Functions ---

     /** Switches the active screen with animations. */
     async function switchScreen(screenName) {
         console.log(`Switching to screen: ${screenName}`);
         const currentActiveScreen = document.querySelector('.screen.active-screen');
         const targetScreen = screens[screenName];

         if (!targetScreen) {
             console.error(`Screen "${screenName}" not found. Switching to home.`);
             screenName = 'home';
             targetScreen = screens.home;
         }

         if (currentActiveScreen === targetScreen) return;

         const previousScreenName = currentActiveScreen?.dataset.screenName;

         // Deactivate current screen
         if (currentActiveScreen) {
             currentActiveScreen.classList.remove('active-screen');
         }

         // Activate target screen
         targetScreen.classList.add('active-screen');

         // Update current index for scroll navigation
         const navigableIndex = screenOrder.indexOf(screenName);
         if (navigableIndex !== -1) currentScreenIndex = navigableIndex;

         // Handle screen-specific actions AFTER transition starts
         if (screenName === 'response') screens.response.scrollTop = 0;
         if (screenName === 'gallery') displayGallery(); // Refresh gallery view
         if (screenName === 'notes') loadNote(); // Load note when entering

         // --- Camera Management ---
         const needsCamera = ['vision', 'look_and_ask'].includes(screenName);
         const cameraWasActive = ['vision', 'look_and_ask'].includes(previousScreenName);

         // Detach video from previous container immediately if it exists
         if (cameraWasActive && videoElement.parentElement) {
             const oldContainer = videoElement.parentElement;
             videoElement.classList.remove('active'); // Start fade out
             videoElement.remove(); // Detach
             oldContainer.classList.remove('video-active');
             oldContainer.querySelector('.placeholder-icon')?.style.removeProperty('display');
         }

         if (needsCamera) {
             await startVideoStream(screenName);
         } else if (cameraWasActive) {
             stopVideoStream(); // Stop stream fully if leaving a camera screen
         }

         // Reset multimodal state if leaving look_and_ask screen
          if (previousScreenName === 'look_and_ask' && screenName !== 'look_and_ask') {
              resetLookAskState();
          }
     }

     /** Displays an error message on the dedicated error screen or fallback. */
     function showErrorScreen(message) {
         console.error("Displaying error:", message);
         if (errorMessageElement && screens.error) {
             errorMessageElement.textContent = message;
             switchScreen('error');
         } else {
             console.error("Error screen elements not found. Fallback display.");
             switchScreen('response'); // Fallback to response screen
             queryTextElement.textContent = "Erreur";
             responseTextElement.innerHTML = `<p class="error-message">${message}</p>`;
         }
         lastInteractionTime = Date.now();
     }

     /** Updates the permission status message on the home screen. */
     function updatePermissionStatus(message, isError = false) {
         if (permissionStatusElement) {
             permissionStatusElement.textContent = message;
             permissionStatusElement.classList.toggle('error', isError);
             console.log(`Permission status updated: "${message}" (isError: ${isError})`);
         }
     }

     /** Gets user name from storage or prompt */
     function getUserName() {
        let storedName = null;
        try {
           storedName = localStorage.getItem('rabbitUserName');
        } catch (e) {
            console.warn("localStorage access denied or failed:", e);
        }

        if (storedName) {
            userName = storedName;
            console.log("User name loaded from localStorage:", userName);
        } else {
            const nameFromPrompt = prompt("Quel est votre nom ?", "Utilisateur");
            // Simple validation: use default if prompt is cancelled or empty
            userName = nameFromPrompt && nameFromPrompt.trim() ? nameFromPrompt.trim() : 'Utilisateur';
            try {
                localStorage.setItem('rabbitUserName', userName);
                console.log("User name saved to localStorage:", userName);
            } catch (e) {
                console.warn("localStorage access denied or failed:", e);
            }
        }
        if (greetingElement) {
            greetingElement.textContent = `Bonjour ${userName}`;
        } else {
             console.warn("Greeting element not found.");
        }
     }

    // --- Date/Time & Battery Update ---
    function updateDateTime() {
        const now = new Date();
        if (homeTimeElement) {
            homeTimeElement.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
        if (homeDateElement) {
            homeDateElement.textContent = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }
    }

    function updateBatteryStatus() {
        if ('getBattery' in navigator) {
            navigator.getBattery().then(battery => {
                const level = Math.floor(battery.level * 100);
                const charging = battery.charging;

                if (homeBatteryElement) {
                    let iconClass = 'fa-battery-empty';
                    if (level > 95) iconClass = 'fa-battery-full';
                    else if (level > 70) iconClass = 'fa-battery-three-quarters';
                    else if (level > 40) iconClass = 'fa-battery-half';
                    else if (level > 15) iconClass = 'fa-battery-quarter';

                    // Update icon and text
                    homeBatteryElement.innerHTML = `<i class="fas ${iconClass}"></i> ${level}% ${charging ? '<i class="fas fa-plug"></i>' : ''}`;
                }

                // Listen for changes
                battery.addEventListener('levelchange', updateBatteryStatus);
                battery.addEventListener('chargingchange', updateBatteryStatus);

            }).catch(err => {
                console.warn("Battery API error:", err);
                if (homeBatteryElement) homeBatteryElement.textContent = 'N/A';
            });
        } else {
            console.warn("Battery Status API not supported.");
            if (homeBatteryElement) homeBatteryElement.innerHTML = `<i class="fas fa-battery-slash"></i> N/A`; // Show unsupported icon
        }
    }

    // --- Speech Recognition ---
    async function initializeSpeechRecognition() {
         console.log("Initializing Speech Recognition...");
         updatePermissionStatus("Initialisation...");

         const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
         if (!SpeechRecognitionAPI) { updatePermissionStatus("Reconnaissance vocale non supportée.", true); return false; }
         if (window.location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(window.location.hostname)) { updatePermissionStatus("Connexion non sécurisée (HTTPS requis).", true); return false; }
         if (!navigator.mediaDevices?.getUserMedia) { updatePermissionStatus("Accès aux périphériques média impossible.", true); return false; }

         // Request Permissions
         try {
             updatePermissionStatus("Demande des permissions...");
             const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); // Request both
             permissionGranted = true;
             updatePermissionStatus("Microphone et caméra prêts.");
             stream.getTracks().forEach(track => track.stop()); // Stop the temporary stream

             if (navigator.permissions?.query) {
                   const handlePermissionChange = (status, type) => {
                       console.log(`${type} permission state changed: ${status.state}`);
                       const isMic = type === 'microphone';
                       const currentlyGranted = status.state === 'granted';
                       if (isMic) permissionGranted = currentlyGranted;

                       updatePermissionStatus(currentlyGranted ? "Microphone et caméra prêts." : `Accès ${type} refusé.`, !currentlyGranted);
                       if (isMic) pttButton.disabled = !currentlyGranted;
                       if (!currentlyGranted) {
                           if (isMic && recognitionActive) recognition?.abort();
                           stopVideoStream();
                       }
                   };
                   try {
                       const micStatus = await navigator.permissions.query({ name: 'microphone' });
                       micStatus.onchange = () => handlePermissionChange(micStatus, 'microphone');
                       const camStatus = await navigator.permissions.query({ name: 'camera' });
                       camStatus.onchange = () => handlePermissionChange(camStatus, 'camera');
                   } catch (e) { console.warn("Permission query API not fully supported or failed:", e); }
             }

         } catch (err) {
             permissionGranted = false;
             let userMessage = "Impossible d'accéder aux périphériques.";
             if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') userMessage = "Accès microphone/caméra refusé.";
             else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') userMessage = "Aucun microphone/caméra trouvé.";
             else if (err.name === 'NotReadableError') userMessage = "Périphérique déjà utilisé ou problème matériel.";
             else userMessage = `Erreur accès périphériques: ${err.name}`;
             updatePermissionStatus(userMessage, true);
             return false;
         }

         // Initialize SpeechRecognition Instance
         try {
             recognition = new SpeechRecognitionAPI();
             recognition.lang = 'fr-FR';
             recognition.continuous = true;
             recognition.interimResults = false;
             speechApiAvailable = true;
             if (pttButton) pttButton.disabled = false;

             let currentTranscript = '';
             recognition.onstart = () => {
                 console.log("SpeechRecognition: onstart");
                 recognitionActive = true; currentTranscript = '';
                 pttButton?.classList.add('active');
                 const currentScreen = document.querySelector('.screen.active-screen')?.dataset.screenName;
                 if (currentScreen === 'look_and_ask') { lookStatusText.textContent = "Écoute en cours..."; }
                 else { switchScreen('listening'); }
             };
             recognition.onresult = (event) => {
                 let segment = '';
                 for (let i = event.resultIndex; i < event.results.length; ++i) {
                     if (event.results[i].isFinal) segment += event.results[i][0].transcript + ' ';
                 }
                 if (segment) currentTranscript += segment;
                 console.log("Transcript final accumulé:", currentTranscript.trim());
             };
             recognition.onerror = (event) => {
                 console.error(`SpeechRecognition: onerror - ${event.error}`, event.message);
                 recognitionActive = false; pttButton?.classList.remove('active');
                 let userMessage = `Erreur reconnaissance: ${event.error}`;
                 if (event.error === 'not-allowed') { permissionGranted = false; updatePermissionStatus("Accès microphone refusé.", true); pttButton.disabled = true; userMessage = "Accès microphone refusé."; }
                 else if (event.error === 'no-speech') userMessage = "Je n'ai rien entendu.";
                 else if (event.error === 'audio-capture') userMessage = "Problème capture audio.";
                 else if (event.error === 'network') userMessage = "Erreur réseau reconnaissance.";

                 if (speechPromiseCallbacks?.reject && event.error !== 'aborted') { speechPromiseCallbacks.reject(new Error(userMessage)); }
                 else if (event.error !== 'aborted') {
                     const currentScreen = document.querySelector('.screen.active-screen')?.dataset.screenName;
                     if (currentScreen === 'look_and_ask') { lookStatusText.textContent = userMessage; setTimeout(resetLookAskState, 3000); }
                     else { showErrorScreen(userMessage); }
                 }
                 speechPromiseCallbacks = null; isListening = false;
             };
             recognition.onend = () => {
                 console.log("SpeechRecognition: onend");
                 recognitionActive = false; pttButton?.classList.remove('active');
                 if (speechPromiseCallbacks?.resolve) speechPromiseCallbacks.resolve(currentTranscript.trim());
                 speechPromiseCallbacks = null;
                 const currentScreen = document.querySelector('.screen.active-screen')?.dataset.screenName;
                 if (currentScreen === 'look_and_ask' && lookStatusText.textContent === "Écoute en cours...") {
                     lookStatusText.textContent = "Traitement...";
                 }
             };
         } catch (error) { console.error("Error initializing SpeechRecognition instance:", error); updatePermissionStatus("Erreur init reconnaissance.", true); return false; }
         return true; // Success
     }

    /** Starts the speech recognition process, returning a promise. */
    async function startSpeechRecognition() {
        return new Promise(async (resolve, reject) => {
            if (!speechApiAvailable || !recognition) return reject(new Error("Reco. non initialisée."));
            if (recognitionActive) return reject(new Error("Écoute déjà en cours."));
            if (permissionGranted === false) return reject(new Error("Accès microphone refusé."));

            // Quick permission re-check
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                permissionGranted = true; if (pttButton) pttButton.disabled = false;
            } catch (err) {
                permissionGranted = false; updatePermissionStatus("Accès microphone refusé.", true); if (pttButton) pttButton.disabled = true;
                return reject(new Error("Accès microphone refusé."));
            }

            console.log("Attempting to start listening...");
            speechPromiseCallbacks = { resolve, reject };
            try {
                recognition.start();
            } catch (e) {
                console.error("Immediate error on recognition.start():", e);
                recognitionActive = false; speechPromiseCallbacks = null;
                reject(new Error(`Erreur démarrage reco: ${e.message || e.name}`));
            }
        });
    }

    // --- PTT Button Handlers ---
    function handlePttStart(event) {
        event.preventDefault();
        console.log("PTT Start");
        if (!speechApiAvailable || permissionGranted === false) { console.warn("PTT ignored: API/Permission issue."); return; }
        if (isListening || recognitionActive) { console.warn("PTT ignored: Already listening."); return; }

        // Check for multimodal context
        const currentScreen = document.querySelector('.screen.active-screen')?.dataset.screenName;
        isMultimodalPrompt = (currentScreen === 'look_and_ask' && !!capturedImageDataForPrompt);
        if (currentScreen === 'look_and_ask' && !capturedImageDataForPrompt) {
            console.warn("PTT on Look&Ask screen but no image captured yet.");
            lookStatusText.textContent = "Veuillez d'abord capturer une image.";
            lookCaptureButton.style.animation = 'shake 0.5s ease';
            setTimeout(() => { lookCaptureButton.style.animation = ''; }, 500);
            return; // Don't start listening without image
        }

        isListening = true;
        pttButton?.setAttribute('aria-pressed', 'true');

        startSpeechRecognition()
            .then(result => {
                console.log("Recognition promise resolved.");
                processSpeechResult(result); // Process the final transcript
            })
            .catch(error => {
                console.error("Recognition promise rejected:", error);
                 if (!error.message.includes("reconnaissance") && !error.message.includes("microphone") && !error.message.includes("entendu")) {
                     if (isMultimodalPrompt) { lookStatusText.textContent = `Erreur: ${error.message}`; setTimeout(resetLookAskState, 3000); }
                     else { showErrorScreen(error.message); }
                 }
                isListening = false; pttButton?.classList.remove('active'); pttButton?.setAttribute('aria-pressed', 'false');
                isMultimodalPrompt = false; // Reset flag on error
            });
    }

    function handlePttEnd(event) {
        event.preventDefault();
        console.log("PTT End");
        if (!isListening) { console.warn("PTT End ignored: Not listening."); return; }
        isListening = false;
        pttButton?.setAttribute('aria-pressed', 'false');

        if (recognitionActive && recognition) {
            console.log("Stopping recognition via recognition.stop()...");
            try {
                recognition.stop(); // Triggers onend
            } catch (e) {
                console.error("Error on recognition.stop():", e);
                if (speechPromiseCallbacks?.reject) speechPromiseCallbacks.reject(new Error("Échec arrêt reco."));
                speechPromiseCallbacks = null;
                if (isMultimodalPrompt) { lookStatusText.textContent = "Erreur lors de l'arrêt."; setTimeout(resetLookAskState, 3000); }
                else { showErrorScreen("Erreur lors de l'arrêt de l'écoute."); }
                isMultimodalPrompt = false;
            }
        } else {
            console.warn("PTT End: Recognition not active or already stopped.");
            if (speechPromiseCallbacks?.reject) speechPromiseCallbacks.reject(new Error("Écoute terminée prématurément."));
            speechPromiseCallbacks = null;
            isMultimodalPrompt = false;
        }
    }

    /** Processes the final speech result, calls Gemini, and handles the response. */
    async function processSpeechResult(result) {
        console.log("Processing final speech result:", result);
        lastInteractionTime = Date.now(); // Update context timer

        const wasMultimodal = isMultimodalPrompt;
        const imageForPrompt = capturedImageDataForPrompt;

        // Reset multimodal state early, API call handles its own logic
        if (wasMultimodal) {
            lookStatusText.textContent = "Traitement...";
        } else {
            switchScreen('response'); // Switch to response screen for normal queries
        }

        if (result instanceof Error) {
            queryTextElement.textContent = "Erreur de reconnaissance";
            responseTextElement.innerHTML = `<p class="error-message">${result.message}</p>`;
            if (wasMultimodal) { lookStatusText.textContent = `Erreur: ${result.message}`; setTimeout(resetLookAskState, 3000); switchScreen('response'); } // Show error on response screen
        } else if (typeof result === 'string') {
            const query = result.trim();
            queryTextElement.textContent = query || "[Aucun texte reconnu]"; // Show query

            if (!query) {
                const noUnderstandMsg = "<p>Je n'ai pas compris ou rien entendu. Veuillez réessayer.</p>";
                responseTextElement.innerHTML = noUnderstandMsg;
                if (wasMultimodal) {
                    lookStatusText.textContent = "Rien entendu. Réessayez.";
                    lookCaptureButton.disabled = true; // Keep disabled
                }
            } else {
                // Show loading indicator
                if (!wasMultimodal) {
                    responseTextElement.innerHTML = `<div class="loading-indicator"><div class="spinner medium"></div><i>Réflexion en cours...</i></div>`;
                } else {
                     // Status already shows "Traitement..."
                }

                // Call API (normal or multimodal)
                if (GEMINI_API_KEY && GEMINI_API_KEY !== 'YOUR_API_KEY') {
                    try {
                        let answer;
                        const currentDateTime = new Date().toLocaleString('fr-FR');
                        const contextPrefix = `[Contexte: Utilisateur=${userName}, Date/Heure=${currentDateTime}]`;
                        const fullQuery = `${contextPrefix} ${query}`; // Add context to the query

                        if (wasMultimodal && imageForPrompt) {
                            console.log("Calling Gemini with Image and Text (with context)");
                            answer = await queryGeminiWithImage(fullQuery, imageForPrompt);
                            // Switch to response screen AFTER getting the multimodal response
                            switchScreen('response');
                        } else {
                            console.log("Calling Gemini with Text only (with context)");
                            answer = await queryGemini(fullQuery, query); // Pass original query for history
                        }
                        processApiResponse(answer); // Process function calls/text and display
                    } catch (geminiError) {
                        console.error("Gemini API call error:", geminiError);
                        const errorHtml = `<p class="error-message">Erreur IA : ${geminiError.message}</p>`;
                        responseTextElement.innerHTML = errorHtml; // Display error on response screen
                        if (wasMultimodal) {
                            lookStatusText.textContent = `Erreur IA: ${geminiError.message}`;
                            setTimeout(resetLookAskState, 3500);
                            switchScreen('response');
                        }
                    } finally {
                        // Clean up multimodal state fully AFTER API call attempt
                        if (wasMultimodal) {
                            setTimeout(resetLookAskState, 100);
                        }
                    }
                } else {
                    // No API Key
                    const noApiKeyMsg = "<p><i>(Fonctionnalité IA non configurée - Veuillez ajouter votre clé API dans le code JS)</i></p>";
                    responseTextElement.innerHTML = noApiKeyMsg;
                    addToHistory('user', query); // Add user's original query to history
                    addToHistory('model', "(Fonctionnalité IA non configurée)");
                    if (wasMultimodal) {
                        lookStatusText.textContent = "Fonctionnalité IA non configurée.";
                        setTimeout(resetLookAskState, 3000);
                        switchScreen('response');
                    }
                }
            }
        } else {
            // Unexpected result type
            const unexpectedMsg = '<p class="error-message">Problème inattendu (traitement voix).</p>';
            queryTextElement.textContent = "Erreur Inattendue"; responseTextElement.innerHTML = unexpectedMsg;
            if (wasMultimodal) { lookStatusText.textContent = "Erreur inattendue."; setTimeout(resetLookAskState, 3000); switchScreen('response'); }
        }
        // Ensure flags are reset
         isMultimodalPrompt = false;
    }

    // --- Context and Function Calling ---

    /** Adds a message to the conversation history. */
    function addToHistory(role, text) {
         // Keep history concise, maybe limit length
         if (conversationHistory.length > 10) {
             conversationHistory = conversationHistory.slice(-10); // Keep last 10 turns (user+model)
         }
         conversationHistory.push({ role, parts: [{ text }] });
         console.log("Added to history:", { role, text: text.substring(0, 60) + '...' });
    }
    /** Checks context timeout and clears history if needed. */
    function checkContextTimeout() {
         const now = Date.now();
         if (now - lastInteractionTime > CONTEXT_TIMEOUT) {
             console.log("Context timeout. Clearing conversation history.");
             conversationHistory = [];
         }
    }
    /** Executes a local function based on the name provided by the AI. */
    function executeFunction(functionName) {
         console.log(`Executing function: ${functionName}`);
         try {
             switch (functionName) {
                 case 'start_timer': if (timerStartButton && !isTimerRunning) timerStartButton.click(); break;
                 case 'reset_timer': timerResetButton?.click(); break;
                 case 'play_music': if (!isMusicPlaying) playMusic(); break; // Only play if not playing
                 case 'pause_music': if (isMusicPlaying) pauseMusic(); break; // Only pause if playing
                 case 'play_pause_music': togglePlayPause(); break; // Use toggle function
                 case 'prev_track': prevTrack(); break; // Use dedicated function
                 case 'next_track': nextTrack(); break; // Use dedicated function
                 case 'capture_image':
                     if (document.querySelector('.screen.active-screen')?.dataset.screenName === 'vision') {
                         visionCaptureButton?.click();
                     } else {
                         console.warn("Capture_image called outside Vision screen.");
                         // Optional: Switch first?
                         // switchScreen('vision');
                         // setTimeout(() => visionCaptureButton?.click(), 500);
                     }
                     break;
                 case 'go_home': switchScreen('home'); break;
                 case 'show_alarms': switchScreen('alarms'); break;
                 case 'show_timer': switchScreen('timer'); break;
                 case 'show_music': switchScreen('music'); break;
                 case 'show_vision': switchScreen('vision'); break;
                 case 'show_calendar': switchScreen('calendar'); break;
                 case 'show_notes': switchScreen('notes'); break;
                 case 'save_current_note': saveNote(); break;
                 case 'show_gallery': switchScreen('gallery'); break;
                 case 'look_and_ask': switchScreen('look_and_ask'); break;

                 default: console.warn(`Function "${functionName}" not recognized.`);
             }
         } catch (error) { console.error(`Error executing function "${functionName}":`, error); }
    }
    /** Processes the API response, handles function calls, and displays text. */
    function processApiResponse(apiResponseText) {
        const functionCallRegex = /^\s*%\s*([a-zA-Z0-9_]+)\s*%([\s\S]*)/;
        const match = apiResponseText.match(functionCallRegex);
        let displayText = apiResponseText;

        if (match) {
            const functionName = match[1].trim();
            const remainingText = match[2].trim();
            console.log(`Function call detected: ${functionName}`);
            executeFunction(functionName);
            // Use remaining text if available, otherwise provide a generic confirmation
            displayText = remainingText || `(Action ${functionName} exécutée)`;
        }

        // Display the textual part of the response
        displayMarkdownResponse(displayText, responseTextElement);

        // Add the RAW model response to history for context
        addToHistory('model', apiResponseText);
        lastInteractionTime = Date.now(); // Update context timer after response
    }

     // --- Utility Functions (Timer) ---
     function formatTime(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }
     timerStartButton?.addEventListener('click', () => {
         if (!timerDisplayElement) return;
         if (isTimerRunning) {
             clearInterval(timerInterval);
             timerStartButton.textContent = 'Reprendre';
             timerDisplayElement.classList.remove('running');
         } else {
             timerStartButton.textContent = 'Pause';
             timerDisplayElement.classList.add('running');
             if (timerSeconds === 0) { // Only increment if starting from 0 or paused at 0
                timerSeconds++;
                timerDisplayElement.textContent = formatTime(timerSeconds);
             } else if (timerSeconds > 0) { // Resume normally if paused > 0
                 // Display current time immediately before interval starts
                 timerDisplayElement.textContent = formatTime(timerSeconds);
             }

             timerInterval = setInterval(() => {
                 timerSeconds++;
                 timerDisplayElement.textContent = formatTime(timerSeconds);
             }, 1000);
         }
         isTimerRunning = !isTimerRunning;
         timerStartButton.setAttribute('aria-label', isTimerRunning ? 'Mettre le minuteur en pause' : 'Reprendre le minuteur');
     });
     timerResetButton?.addEventListener('click', () => {
         if (!timerDisplayElement || !timerStartButton) return;
         clearInterval(timerInterval); timerSeconds = 0; isTimerRunning = false;
         timerDisplayElement.textContent = formatTime(timerSeconds);
         timerStartButton.textContent = 'Démarrer';
         timerStartButton.setAttribute('aria-label', 'Démarrer le minuteur');
         timerDisplayElement.classList.remove('running');
     });

     // --- Music Player Logic ---
     function loadTrack(index) {
        if (!audioPlayer || !playlist || playlist.length === 0) return;
        currentTrackIndex = (index + playlist.length) % playlist.length; // Wrap around
        const track = playlist[currentTrackIndex];
        audioPlayer.src = track.src;
        if (trackTitleElement) trackTitleElement.textContent = track.title;
        if (artistNameElement) artistNameElement.textContent = track.artist;
        console.log(`Loading track ${currentTrackIndex}: ${track.title}`);
        // Reset button state visually
        playPauseButton?.classList.remove('playing');
        playPauseButton?.setAttribute('aria-label', 'Lecture');
        isMusicPlaying = false;
     }

     function playMusic() {
        if (!audioPlayer || !playPauseButton) return;
        audioPlayer.play().then(() => {
            isMusicPlaying = true;
            playPauseButton.classList.add('playing');
            playPauseButton.setAttribute('aria-label', 'Pause');
            console.log("Music playing");
        }).catch(error => {
            console.error("Error playing audio:", error);
            // Handle potential errors (e.g., user interaction needed on mobile)
            showErrorScreen("Lecture audio impossible. Interaction utilisateur requise ?");
            isMusicPlaying = false; // Reset state
            playPauseButton.classList.remove('playing');
            playPauseButton.setAttribute('aria-label', 'Lecture');
        });
    }

    function pauseMusic() {
        if (!audioPlayer || !playPauseButton) return;
        audioPlayer.pause();
        isMusicPlaying = false;
        playPauseButton.classList.remove('playing');
        playPauseButton.setAttribute('aria-label', 'Lecture');
        console.log("Music paused");
    }

    function togglePlayPause() {
        if (isMusicPlaying) {
            pauseMusic();
        } else {
            playMusic();
        }
    }

    function nextTrack() {
        if (!playlist || playlist.length === 0) return;
        console.log("Next track requested");
        loadTrack(currentTrackIndex + 1);
        // If it was playing, start the next track automatically
        if (isMusicPlaying || audioPlayer.autoplay) { // Check if it should autoplay
             // Small delay sometimes helps ensure src is loaded before play
             setTimeout(playMusic, 50);
        }
    }

    function prevTrack() {
        if (!playlist || playlist.length === 0) return;
         console.log("Previous track requested");
        loadTrack(currentTrackIndex - 1);
        if (isMusicPlaying || audioPlayer.autoplay) {
             setTimeout(playMusic, 50);
        }
    }

    // Event listeners for music controls
    playPauseButton?.addEventListener('click', togglePlayPause);
    nextTrackButton?.addEventListener('click', nextTrack);
    prevTrackButton?.addEventListener('click', prevTrack);
    audioPlayer?.addEventListener('ended', () => {
        console.log("Track ended, playing next.");
        nextTrack(); // Automatically play next track when current one finishes
    });
    // Set initial track display (without playing)
    if (playlist.length > 0) {
         loadTrack(0); // Load the first track initially
    }

    // --- Camera Management ---
    async function startVideoStream(targetScreenName) {
         const targetContainer = targetScreenName === 'vision' ? visionCameraContainer : (targetScreenName === 'look_and_ask' ? lookCameraContainer : null);
         if (!targetContainer) { console.error(`No valid target container found for screen: ${targetScreenName}`); return false; }

         if (videoStream && videoElement.parentElement === targetContainer) {
             console.log("Video stream already active for this screen.");
             targetContainer.classList.add('video-active');
             videoElement.classList.add('active');
             return true;
         }
         if (videoStream && videoElement.parentElement !== targetContainer) {
             console.log("Attaching existing video stream to new screen.");
             targetContainer.appendChild(videoElement);
             targetContainer.classList.add('video-active');
             videoElement.play().catch(e => console.error("Error re-playing video:", e));
             setTimeout(() => videoElement.classList.add('active'), 10);
             return true;
         }

         if (!videoStream) {
             if (permissionGranted === false) { console.warn("Cannot start video: permission denied."); showErrorScreen("Accès caméra refusé."); return false; }
             try {
                 console.log(`Attempting to start NEW video stream for ${targetScreenName}...`);
                 const constraints = { video: { facingMode: "environment" } };
                 videoStream = await navigator.mediaDevices.getUserMedia(constraints)
                     .catch(async (e) => {
                         console.warn("Environment camera failed, trying default:", e);
                         if (e.name === 'OverconstrainedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError') {
                             return navigator.mediaDevices.getUserMedia({ video: true });
                         }
                         throw e;
                     });
                 videoElement.srcObject = videoStream;
                 await videoElement.play();
                 console.log("Video stream started successfully.");
                 targetContainer.appendChild(videoElement);
                 targetContainer.classList.add('video-active');
                 setTimeout(() => videoElement.classList.add('active'), 10);
                 return true;
             } catch (err) {
                 console.error("Error starting video stream:", err);
                 let userMessage = "Impossible de démarrer le flux vidéo.";
                  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') userMessage = "Accès caméra refusé.";
                  else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') userMessage = "Aucune caméra trouvée.";
                  else if (err.name === 'NotReadableError' || err.name === 'OverconstrainedError' || err.name === 'TrackStartError' || err.name === 'AbortError') userMessage = "Caméra déjà utilisée ou problème matériel.";
                  else userMessage = `Erreur caméra: ${err.message || err.name}`;
                 showErrorScreen(userMessage); videoStream = null; return false;
             }
         }
         return false; // Should be unreachable
     }

    function stopVideoStream() {
         if (videoStream) {
             console.log("Stopping video stream.");
             videoStream.getTracks().forEach(track => track.stop());
             videoStream = null;
             videoElement.srcObject = null;
             videoElement.classList.remove('active');
             if (videoElement.parentElement) {
                 videoElement.parentElement.classList.remove('video-active');
                 videoElement.remove();
             }
             visionCameraContainer?.querySelector('.placeholder-icon')?.style.removeProperty('display');
             lookCameraContainer?.querySelector('.placeholder-icon')?.style.removeProperty('display');
         }
    }

    function captureImageFromVideo() {
         if (!videoStream || !videoElement.videoWidth || !videoElement.videoHeight || videoElement.paused || videoElement.ended) {
             console.error("Cannot capture: video stream not ready or inactive.");
             showErrorScreen("Impossible de capturer (flux vidéo non prêt).");
             return null;
         }
         canvasElement.width = videoElement.videoWidth;
         canvasElement.height = videoElement.videoHeight;
         try {
             const context = canvasElement.getContext('2d');
             context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
             const imageDataUrl = canvasElement.toDataURL('image/jpeg', 0.9);
             console.log('Image captured (JPEG):', imageDataUrl.substring(0, 60) + '...');
             return imageDataUrl;
         } catch (e) {
             console.error("Error capturing or converting image:", e);
             if (e.name === 'SecurityError') { showErrorScreen("Erreur de sécurité lors de la capture."); }
             else { showErrorScreen("Erreur lors de la capture de l'image."); }
             return null;
         }
    }

    // --- Vision Screen Capture Handler ---
    visionCaptureButton?.addEventListener('click', () => {
         console.log('Vision Capture button clicked.');
         const imageDataUrl = captureImageFromVideo();
         if (imageDataUrl) {
             capturedPhotos.push(imageDataUrl);
             console.log(`Photo added to gallery. Total: ${capturedPhotos.length}`);
             mainDisplay.style.transition = 'opacity 0.1s ease-out';
             mainDisplay.style.opacity = '0.8';
             setTimeout(() => { mainDisplay.style.opacity = '1'; }, 100);
             switchScreen('response');
             queryTextElement.textContent = "Vision";
             responseTextElement.innerHTML = "<p>Photo capturée et ajoutée à la galerie.</p>";
         }
    });

    // --- Gallery Display ---
    function displayGallery() {
         if (!galleryContainer || !galleryEmptyMsg) return;
         galleryContainer.innerHTML = ''; // Clear previous items
         if (capturedPhotos.length === 0) {
             galleryEmptyMsg.style.display = 'block';
         } else {
             galleryEmptyMsg.style.display = 'none';
             capturedPhotos.forEach((dataUrl, index) => {
                 const item = document.createElement('div'); item.className = 'gallery-item';
                 const img = document.createElement('img'); img.src = dataUrl; img.alt = `Photo capturée ${index + 1}`;
                 img.onerror = () => { img.alt = "Erreur chargement image"; };
                 const downloadLink = document.createElement('a'); downloadLink.href = dataUrl; downloadLink.download = `rabbit_capture_${index + 1}.jpg`;
                 downloadLink.className = 'download-link'; downloadLink.innerHTML = '<i class="fas fa-download"></i>';
                 downloadLink.setAttribute('aria-label', 'Télécharger l\'image'); downloadLink.title = 'Télécharger';
                 item.appendChild(img); item.appendChild(downloadLink);
                 galleryContainer.appendChild(item);
                 item.style.animationDelay = `${index * 0.05}s`;
             });
         }
    }

    // --- Notes Management ---
    function saveNote() {
         if (notesTextarea) {
             const noteContent = notesTextarea.value;
             try {
                 localStorage.setItem('rabbit_note', noteContent);
                 console.log("Note saved to localStorage.");
                 if(notesFeedback) {
                     notesFeedback.textContent = "Note enregistrée !";
                     notesFeedback.classList.add('visible');
                     setTimeout(() => { notesFeedback.classList.remove('visible'); }, 2000);
                 }
             } catch (e) {
                 console.error("Error saving note:", e);
                 if(notesFeedback) {
                     notesFeedback.textContent = "Erreur sauvegarde.";
                     notesFeedback.style.color = 'var(--error-red)';
                     notesFeedback.classList.add('visible');
                     setTimeout(() => {
                         notesFeedback.classList.remove('visible');
                         notesFeedback.style.color = 'var(--success-green)';
                     }, 3000);
                 }
             }
         }
    }
    function loadNote() {
         if (notesTextarea) {
             try {
                 const savedNote = localStorage.getItem('rabbit_note');
                 if (savedNote !== null) { notesTextarea.value = savedNote; console.log("Note loaded."); }
                 else { notesTextarea.value = ''; }
             } catch (e) { console.error("Error loading note:", e); notesTextarea.value = ''; }
         }
    }
    saveNoteButton?.addEventListener('click', saveNote);

    // --- Look & Ask (Multimodal) Management ---
    function resetLookAskState() {
         console.log("Resetting Look & Ask state.");
         capturedImageDataForPrompt = null; isMultimodalPrompt = false;
         lookStatusText.textContent = "Visez, puis capturez l'image.";
         lookCaptureButton.disabled = false;

         const preview = lookCameraContainer?.querySelector('.captured-image-preview');
         if (preview) preview.remove();

         if (videoStream && videoElement.parentElement === lookCameraContainer) {
             videoElement.style.display = 'block';
             videoElement.classList.add('active');
         } else if (!videoStream) {
             lookCameraContainer?.classList.remove('video-active');
             lookCameraContainer?.querySelector('.placeholder-icon')?.style.removeProperty('display');
         }
    }
    lookCaptureButton?.addEventListener('click', () => {
         console.log('Look & Ask Capture button clicked.');
         const imageDataUrl = captureImageFromVideo();
         if (imageDataUrl) {
             capturedImageDataForPrompt = imageDataUrl;
             lookStatusText.textContent = "Image capturée. Parlez maintenant.";
             lookCaptureButton.disabled = true;

             const existingPreview = lookCameraContainer?.querySelector('.captured-image-preview');
             if(existingPreview) existingPreview.remove();

             const previewImg = document.createElement('img');
             previewImg.src = imageDataUrl;
             previewImg.className = 'captured-image-preview';
             lookCameraContainer.appendChild(previewImg);

             videoElement.style.display = 'none';
             videoElement.classList.remove('active');

         } else {
             lookStatusText.textContent = "Échec de la capture. Réessayez.";
         }
    });

     // --- Gemini API Calls ---
     async function queryGemini(fullPrompt, originalPromptForHistory) {
         console.log("Querying Gemini (Text):", originalPromptForHistory); // Log original prompt
         checkContextTimeout();
         // Add original user prompt to history, full prompt sent to API
         addToHistory('user', originalPromptForHistory);

         if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') { const errorMsg = "Clé API non configurée."; addToHistory('model', errorMsg); throw new Error(errorMsg); }

         // Construct payload including system instruction, history, and the NEW full prompt
         const requestContents = [
             { role: 'user', parts: [{ text: SYSTEM_INSTRUCTION }] },
             // Pass history excluding the latest user prompt (which is now part of the new fullPrompt)
             ...conversationHistory.slice(0, -1),
             // Add the new full prompt as the latest user turn
             { role: 'user', parts: [{ text: fullPrompt }] }
         ];

         try {
             const response = await fetch(GEMINI_API_URL, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     contents: requestContents,
                     safetySettings: GEMINI_SAFETY_SETTINGS
                 })
             });
             const data = await response.json();

             if (!response.ok) {
                 console.error('Gemini API Error:', response.status, data);
                 const errorMessage = data?.error?.message || `Erreur HTTP ${response.status}`;
                 const fullErrorMsg = `Erreur API IA : ${errorMessage}`;
                 addToHistory('model', `Erreur: ${fullErrorMsg}`);
                 throw new Error(fullErrorMsg);
             }

             console.log("Gemini API Response (Raw):", data);

             let responseText = "Désolé, je n'ai pas pu générer de réponse.";
             if (data.candidates?.length > 0) {
                 const candidate = data.candidates[0];
                 if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                     const reason = candidate.finishReason.replace(/_/g, ' ').toLowerCase();
                     responseText = (candidate.content?.parts?.[0]?.text || "") + `\n\n_(Réponse interrompue: ${reason}.)_`;
                     console.warn(`Gemini response finish reason: ${candidate.finishReason}`);
                 } else {
                     responseText = candidate.content?.parts?.[0]?.text || "Format de réponse inattendu.";
                 }
             } else if (data.promptFeedback?.blockReason) {
                 const reason = data.promptFeedback.blockReason.replace(/_/g, ' ').toLowerCase();
                 responseText = `Réponse bloquée (${reason}).`;
                 console.warn(`Gemini response blocked: ${data.promptFeedback.blockReason}`);
             }
             return responseText;

         } catch (error) {
             console.error('Error fetching Gemini (Text):', error);
             if (!error.message.includes("Erreur API IA")) {
                 addToHistory('model', `Erreur réseau/fetch: ${error.message}`);
             }
             throw error;
         }
     }

     async function queryGeminiWithImage(fullPrompt, base64ImageData) {
         console.log("Querying Gemini (Multimodal):", fullPrompt.split('] ')[1]); // Log original query part
         checkContextTimeout();
         // Add original user prompt part to history
         const originalPromptForHistory = fullPrompt.split('] ')[1] || "[Question sur image]";
         addToHistory('user', originalPromptForHistory);


         if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY') { const errorMsg = "Clé API non configurée."; addToHistory('model', errorMsg); throw new Error(errorMsg); }

         const pureBase64 = base64ImageData.includes(',') ? base64ImageData.split(',')[1] : base64ImageData;

         // Construct payload: system instruction, history, new multimodal user prompt (with full context)
         const requestContents = [
             { role: 'user', parts: [{ text: SYSTEM_INSTRUCTION }] },
             ...conversationHistory.slice(0, -1), // History up to the last user prompt
             {
                 role: 'user',
                 parts: [
                     { text: fullPrompt }, // The user's spoken question WITH context
                     { inline_data: { mime_type: 'image/jpeg', data: pureBase64 } }
                 ]
             }
         ];

         // Update UI to show analysis is happening (on the response screen)
          switchScreen('response');
          queryTextElement.textContent = originalPromptForHistory; // Show only original query
          responseTextElement.innerHTML = `<div class="loading-indicator"><div class="spinner medium"></div><i>Analyse de l'image...</i></div>`;

         try {
             const response = await fetch(GEMINI_API_URL, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     contents: requestContents,
                     safetySettings: GEMINI_SAFETY_SETTINGS
                  })
             });
             const data = await response.json();

             if (!response.ok) {
                 console.error('Gemini API Error (Multimodal):', response.status, data);
                 const errorMessage = data?.error?.message || `Erreur HTTP ${response.status}`;
                 const fullErrorMsg = `Erreur IA (image) : ${errorMessage}`;
                 addToHistory('model', `Erreur: ${fullErrorMsg}`);
                 throw new Error(fullErrorMsg);
             }

             console.log("Gemini API Response (Multimodal Raw):", data);

             let responseText = "Désolé, je n'ai pas pu analyser l'image.";
             if (data.candidates?.length > 0) {
                  const candidate = data.candidates[0];
                  if (candidate.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== 'MAX_TOKENS') {
                      const reason = candidate.finishReason.replace(/_/g, ' ').toLowerCase();
                      responseText = (candidate.content?.parts?.[0]?.text || "") + `\n\n_(Analyse interrompue: ${reason}.)_`;
                      console.warn(`Gemini multimodal response finish reason: ${candidate.finishReason}`);
                  } else {
                      responseText = candidate.content?.parts?.[0]?.text || "Je n'ai pas de commentaire sur cette image.";
                  }
             } else if (data.promptFeedback?.blockReason) {
                  const reason = data.promptFeedback.blockReason.replace(/_/g, ' ').toLowerCase();
                  responseText = `Analyse bloquée (${reason}).`;
                  console.warn(`Gemini multimodal response blocked: ${data.promptFeedback.blockReason}`);
             }
             return responseText;

         } catch (error) {
             console.error('Error fetching Gemini (Multimodal):', error);
              if (!error.message.includes("Erreur IA")) {
                  addToHistory('model', `Erreur réseau/fetch (image): ${error.message}`);
              }
             throw error;
         }
     }

    // --- Markdown Display ---
    function markdownToHtml(markdown) {
         if (typeof markdown !== 'string') return '';
         let html = markdown;
         // Basic block elements
         html = html.replace(/```(?:[a-z]+\n)?([\s\S]*?)```/gs, (match, code) => `<pre><code>${code.trim().replace(/</g, '<').replace(/>/g, '>')}</code></pre>`);
         html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
         html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
         html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
         html = html.replace(/^(?:-{3,}|_{3,}|\*{3,})$/gm, '<hr>');
         html = html.replace(/^(?:> (?:.*\n?))+/gm, (match) => `<blockquote>${markdownToHtmlSimpleInline(match.replace(/^> /gm, '').trim())}</blockquote>`);
         // Improved Lists (handles multi-line items better, still basic)
         html = html.replace(/^([*+-]) (.*(?:\n {2,}.*|\n(?!\n))*)/gm, (match, marker, itemContent) => `<ul><li>${markdownToHtmlSimpleInline(itemContent.trim().replace(/\n {2,}/g, '\n'))}</li></ul>`);
         html = html.replace(/^(\d+)\. (.*(?:\n {2,}.*|\n(?!\n))*)/gm, (match, num, itemContent) => `<ol start="${num}"><li>${markdownToHtmlSimpleInline(itemContent.trim().replace(/\n {2,}/g, '\n'))}</li></ol>`);
         html = html.replace(/<\/ul>\s*<ul>/g, '');
         html = html.replace(/<\/ol>\s*<ol(?: start="\d+")?>/g, '');
         // Inline elements
         html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0;">');
         html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
         html = markdownToHtmlSimpleInline(html); // Bold, italic, code
         // Paragraphs
         html = html.split('\n').map(line => {
             line = line.trim();
             if (line.length === 0) return '';
             if (!line.match(/^<\/?(h[1-6]|ul|ol|li|blockquote|hr|pre|img|table|thead|tbody|tr|th|td)/i)) {
                 return `<p>${line}</p>`;
             }
             return line;
         }).join('');
         // Cleanup
         html = html.replace(/<p>\s*<\/p>/g, '');
         html = html.replace(/<\/blockquote>\s*<blockquote>/g, '');
         return html;
    }
    function markdownToHtmlSimpleInline(text) {
         text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/__(.*?)__/g, '<strong>$1</strong>');
         text = text.replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/_(.*?)_/g, '<em>$1</em>');
         text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
         return text;
    }
    function displayMarkdownResponse(markdownText, element) {
        if (element) {
            const htmlContent = markdownToHtml(markdownText);
            element.style.transition = 'opacity 0.2s ease-out';
            element.style.opacity = 0;
            setTimeout(() => {
                element.innerHTML = htmlContent;
                element.scrollTop = 0;
                element.style.transition = 'opacity 0.3s ease-in';
                element.style.opacity = 1;
            }, 200);
        } else { console.error("Response display element not found."); }
    }

    // --- Scroll & Back Button Handlers ---
    scrollUpButton?.addEventListener('click', () => {
         const currentScreenName = document.querySelector('.screen.active-screen')?.dataset.screenName;
         if (currentScreenName === 'listening') return;
         currentScreenIndex = (currentScreenIndex - 1 + screenOrder.length) % screenOrder.length;
         switchScreen(screenOrder[currentScreenIndex]);
    });
    scrollDownButton?.addEventListener('click', () => {
         const currentScreenName = document.querySelector('.screen.active-screen')?.dataset.screenName;
         if (currentScreenName === 'listening') return;
         currentScreenIndex = (currentScreenIndex + 1) % screenOrder.length;
         switchScreen(screenOrder[currentScreenIndex]);
    });
    document.querySelectorAll('.back-button').forEach(button => {
         button.addEventListener('click', (event) => {
             const target = event.currentTarget.dataset.targetScreen || 'home';
             switchScreen(target);
         });
    });

    // --- App Initialization ---
    async function initializeApp() {
        console.log("Initializing Rabbit R1 Web App (Cool Edition)...");

        // 1. Get User Name (before anything else that might need it)
        getUserName();

        // 2. Initial Setup
        switchScreen('home'); // Start on home screen
        loadNote(); // Load initial note state
        if (playlist.length > 0) loadTrack(0); // Load initial track display

        // 3. Setup Status Bar Updates
        updateDateTime(); // Initial call
        updateBatteryStatus(); // Initial call
        setInterval(updateDateTime, 1000); // Update time every second

        // 4. Initialize Speech Recognition and PTT
        const speechReady = await initializeSpeechRecognition();
        if (speechReady && pttButton) {
            pttButton.addEventListener('pointerdown', handlePttStart);
            pttButton.addEventListener('pointerup', handlePttEnd);
            pttButton.addEventListener('pointerleave', (e) => { if (isListening) handlePttEnd(e); });
            pttButton.addEventListener('contextmenu', (e) => e.preventDefault());
            console.log("PTT Handlers attached.");
        } else {
             console.warn("PTT initialization failed or permissions denied.");
             if(pttButton) pttButton.disabled = true;
        }

        console.log("Application initialized.");
    }

    // Start the application
    initializeApp();

    // Cleanup: Stop video stream when leaving the page/closing tab
    window.addEventListener('beforeunload', stopVideoStream);

}); // End DOMContentLoaded
