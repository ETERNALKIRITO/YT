// --- YouTube Player State ---
const youtubePlayers = {};
let ytApiLoaded = false;
let ytApiLoadingPromise = null;
let isMediaPlayerInitialized = false;

const DEFAULT_YOUTUBE_VIDEO_ID = 'WXuK6gekU1Y'; // A default video to load

// --- YouTube Player Logic ---
function loadYouTubeApi() {
    if (ytApiLoaded) return Promise.resolve();
    if (ytApiLoadingPromise) return ytApiLoadingPromise;

    ytApiLoadingPromise = new Promise((resolve, reject) => {
        if (window.YT && window.YT.Player) {
            ytApiLoaded = true;
            resolve();
            return;
        }
        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = (err) => {
            console.error("Failed to load YouTube API script:", err);
            ytApiLoadingPromise = null;
            reject(new Error("YouTube API script load failed"));
        };
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
            document.head.appendChild(tag);
        }

        window.onYouTubeIframeAPIReady = () => {
            ytApiLoaded = true;
            ytApiLoadingPromise = null;
            resolve();
        };
        setTimeout(() => {
            if (!ytApiLoaded) {
                if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady = null;
                ytApiLoadingPromise = null;
                reject(new Error("YouTube API load timeout"));
            }
        }, 10000);
    });
    return ytApiLoadingPromise;
}

function getYouTubeVideoId(urlOrId) {
    if (!urlOrId) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId; // It's already an ID
    const regExp = /^.*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]{11}).*/;
    const match = urlOrId.match(regExp);
    return (match && match[1]) ? match[1] : null;
}

async function initMediaPlayer(playerContainerElement) {
    const appName = playerContainerElement.id; // e.g., "gemPlayerContainer"
    const urlInput = playerContainerElement.querySelector('.media-player-input');
    const loadButton = playerContainerElement.querySelector('.media-player-load-button');
    const playerContainerDivId = `youtube-player-${appName}`; // e.g., "youtube-player-gemPlayerContainer"
    const playerDiv = playerContainerElement.querySelector(`#${playerContainerDivId}`);
    const playButton = playerContainerElement.querySelector('#media-player-play');
    const pauseButton = playerContainerElement.querySelector('#media-player-pause');
    const stopButton = playerContainerElement.querySelector('#media-player-stop');

    if (!urlInput || !loadButton || !playerDiv || !playButton || !pauseButton || !stopButton) {
        console.error("Media Player UI elements not found in", appName);
        if (playerDiv) playerDiv.innerHTML = `<p class="media-player-status-message" style="color:red;">Error: Player UI missing.</p>`;
        return;
    }

    const updateButtonStates = (playerState) => {
        const YTPlayerState = window.YT?.PlayerState;
        if (!YTPlayerState) {
             playButton.disabled = true; pauseButton.disabled = true; stopButton.disabled = true;
             return;
        }
        const currentPlayer = youtubePlayers[appName];
        const state = playerState !== undefined ? playerState
            : (currentPlayer && typeof currentPlayer.getPlayerState === 'function' ? currentPlayer.getPlayerState() : YTPlayerState.UNSTARTED);

        playButton.disabled = state === YTPlayerState.PLAYING || state === YTPlayerState.BUFFERING;
        pauseButton.disabled = state !== YTPlayerState.PLAYING && state !== YTPlayerState.BUFFERING;
        stopButton.disabled = state === YTPlayerState.ENDED || state === YTPlayerState.UNSTARTED || state === -1; // -1 is unstarted
    };

    updateButtonStates(-1); // Initial state: unstarted

    const showPlayerMessage = (message, isError = false) => {
        const player = youtubePlayers[appName];
        if (player && typeof player.destroy === 'function') {
            try { player.destroy(); } catch(e) { console.warn("Minor error destroying player:", e); }
            delete youtubePlayers[appName];
        }
        if (playerDiv) playerDiv.innerHTML = `<p class="media-player-status-message" style="color:${isError ? 'tomato' : 'var(--text-color-muted)'};">${message}</p>`;
        updateButtonStates(-1); // Reset buttons if player is removed/error
    };
    
    const initialStatusMessageEl = playerDiv.querySelector('.media-player-status-message');
    if (initialStatusMessageEl) initialStatusMessageEl.textContent = 'Connecting to YouTube...';


    try {
        await loadYouTubeApi();
        isMediaPlayerInitialized = true;
        if (initialStatusMessageEl) initialStatusMessageEl.textContent = 'YouTube API Ready. Enter URL or ID.';
    } catch (error) {
        showPlayerMessage(`Error: Could not load YouTube API. ${error.message}`, true);
        isMediaPlayerInitialized = false;
        return;
    }

    const createPlayer = (videoId) => {
        const existingPlayer = youtubePlayers[appName];
        if (existingPlayer && typeof existingPlayer.destroy === 'function') {
            try { existingPlayer.destroy(); } catch(e) { console.warn("Minor error destroying previous player:", e); }
        }
        if (playerDiv) playerDiv.innerHTML = ''; // Clear previous content/message before creating new player

        try {
            youtubePlayers[appName] = new YT.Player(playerContainerDivId, {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: {
                    'playsinline': 1,
                    'autoplay': 1,       // Autoplay the new video
                    'controls': 0,       // Hide YouTube's default controls
                    'modestbranding': 1, // Reduce YouTube logo
                    'rel': 0,            // Do not show related videos at the end
                    'fs': 0,             // Disable fullscreen button (we are already kinda fullscreen)
                    'origin': window.location.origin // Important for iframe API security
                },
                events: {
                    'onReady': (event) => {
                        updateButtonStates(event.target.getPlayerState());
                        // event.target.playVideo(); // Ensure it plays if autoplay failed
                    },
                    'onError': (event) => {
                        console.error("YouTube Player Error:", event.data);
                        const errorMessages = {
                            2: "Invalid video ID or parameters.",
                            5: "HTML5 Player error occurred.",
                            100: "Video not found or marked private.",
                            101: "Playback disallowed by video owner (embedding).",
                            150: "Playback disallowed by video owner (embedding)."
                        };
                        showPlayerMessage(errorMessages[event.data] || `Playback Error (Code: ${event.data})`, true);
                    },
                    'onStateChange': (event) => {
                        updateButtonStates(event.data);
                    }
                }
            });
        } catch (error) {
             showPlayerMessage(`Failed to create video player: ${error.message}`, true);
        }
    };

    loadButton.addEventListener('click', () => {
        const videoUrlOrId = urlInput.value.trim();
        const videoId = getYouTubeVideoId(videoUrlOrId);
        if (videoId) {
             if (playerDiv) showPlayerMessage("Loading video...", false); // Not an error
             createPlayer(videoId);
        } else {
            if (playerDiv && videoUrlOrId) { // Only show error if input was not empty
                showPlayerMessage("Invalid YouTube URL or Video ID provided.", true);
            } else if (playerDiv) { // Input was empty
                 showPlayerMessage("Please enter a YouTube URL or Video ID.", false);
            }
        }
    });

    playButton.addEventListener('click', () => {
        const p = youtubePlayers[appName];
        if (p && typeof p.playVideo === 'function') p.playVideo();
    });
    pauseButton.addEventListener('click', () => {
        const p = youtubePlayers[appName];
        if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
    });
    stopButton.addEventListener('click', () => {
        const p = youtubePlayers[appName];
        if (p && typeof p.stopVideo === 'function') {
            p.stopVideo(); // This effectively resets the player
            // For some players, stopVideo might put it in an ENDED state or UNSTARTED.
            // We might want to show a message or clear the player visually.
            // For now, updateButtonStates will handle the state.
            updateButtonStates(window.YT?.PlayerState?.ENDED); // Treat as ended. Or UNSTARTED for some cases.
        }
    });

    // Automatically load the default video if specified
    if (DEFAULT_YOUTUBE_VIDEO_ID) {
        if (initialStatusMessageEl) initialStatusMessageEl.textContent = `Loading default video...`;
        urlInput.value = DEFAULT_YOUTUBE_VIDEO_ID; // Pre-fill for clarity
        createPlayer(DEFAULT_YOUTUBE_VIDEO_ID);
    } else if (initialStatusMessageEl) {
        initialStatusMessageEl.textContent = "Enter a YouTube URL or ID and click Load.";
    }
}


// --- Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    const gemPlayerContainer = document.getElementById('gemPlayerContainer');

    if (!gemPlayerContainer) {
        console.error("GemPlayer container element not found!");
        document.body.innerHTML = "<p style='color:red; text-align:center; padding-top: 50px;'>Critical Error: Player container missing.</p>";
        return;
    }

    initMediaPlayer(gemPlayerContainer)
        .then(() => {
            console.log("GemPlayer Initialized.");
            // Any post-initialization logic can go here
        })
        .catch(error => {
            console.error("GemPlayer initialization failed:", error);
             const playerDiv = gemPlayerContainer.querySelector(`#youtube-player-${gemPlayerContainer.id}`);
             if (playerDiv) {
                 playerDiv.innerHTML = `<p class="media-player-status-message" style="color:red;">Fatal Error: Could not initialize player. ${error.message}</p>`;
             }
        });
});