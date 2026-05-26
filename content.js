(function () {
  let panel;
  let currentVolume = 0.2;
  let wasMutedBeforePause = false;

  let seekSlider;
  let timeLabel;
  let isSeeking = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");

    return `${mins}:${secs}`;
  }

  function getActiveVideo() {
    const videos = Array.from(document.querySelectorAll("video"));

    if (videos.length === 0) return null;

    return (
      videos.find((video) => {
        const rect = video.getBoundingClientRect();

        return (
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.width > 100 &&
          rect.height > 100
        );
      }) || videos[0]
    );
  }

  function loadPanelPosition() {
    if (!panel || !chrome?.storage?.local) return;

    chrome.storage.local.get(["panelLeft", "panelTop"], (result) => {
      const left = result.panelLeft;
      const top = result.panelTop;

      if (typeof left !== "number" || typeof top !== "number") return;

      const panelRect = panel.getBoundingClientRect();

      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;

      const safeLeft = Math.max(0, Math.min(left, maxLeft));
      const safeTop = Math.max(0, Math.min(top, maxTop));

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${safeLeft}px`;
      panel.style.top = `${safeTop}px`;
    });
  }

  function makePanelDraggable() {
    const handle = document.getElementById("rc-drag-handle");
    if (!panel || !handle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function getPointerPosition(event) {
      if (event.touches && event.touches.length > 0) {
        return {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }

      return {
        x: event.clientX,
        y: event.clientY,
      };
    }

    function startDrag(event) {
      event.preventDefault();

      const pointer = getPointerPosition(event);
      const rect = panel.getBoundingClientRect();

      isDragging = true;
      startX = pointer.x;
      startY = pointer.y;
      startLeft = rect.left;
      startTop = rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${startLeft}px`;
      panel.style.top = `${startTop}px`;

      document.addEventListener("mousemove", moveDrag);
      document.addEventListener("mouseup", stopDrag);

      document.addEventListener("touchmove", moveDrag, { passive: false });
      document.addEventListener("touchend", stopDrag);
    }

    function moveDrag(event) {
      if (!isDragging) return;

      event.preventDefault();

      const pointer = getPointerPosition(event);

      let newLeft = startLeft + (pointer.x - startX);
      let newTop = startTop + (pointer.y - startY);

      const panelRect = panel.getBoundingClientRect();

      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    }

    function stopDrag() {
      if (!isDragging) return;

      isDragging = false;

      const rect = panel.getBoundingClientRect();

      if (chrome?.storage?.local) {
        chrome.storage.local.set({
          panelLeft: rect.left,
          panelTop: rect.top,
        });
      }

      document.removeEventListener("mousemove", moveDrag);
      document.removeEventListener("mouseup", stopDrag);

      document.removeEventListener("touchmove", moveDrag);
      document.removeEventListener("touchend", stopDrag);
    }

    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("touchstart", startDrag, { passive: false });
  }

  function updateButtonStates() {
  const video = getActiveVideo();
  if (!video) return;

  const playIcon = document.getElementById("rc-play-icon");
  const playLabel = document.getElementById("rc-play-label");
  const muteIcon = document.getElementById("rc-mute-icon");
  const muteLabel = document.getElementById("rc-mute-label");

  if (playIcon && playLabel) {
    if (video.paused) {
      playIcon.textContent = "▶";
      playLabel.textContent = "Play";
    } else {
      playIcon.textContent = "⏸";
      playLabel.textContent = "Pause";
    }
  }

  if (muteIcon && muteLabel) {
    if (video.muted || video.volume === 0) {
      muteIcon.textContent = "🔇";
      muteLabel.textContent = "Muted";
    } else {
      muteIcon.textContent = "🔊";
      muteLabel.textContent = "Sound";
    }
  }
}

  function updateSeekSlider() {
    const video = getActiveVideo();

    if (!video || !seekSlider || !timeLabel || isSeeking) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    seekSlider.max = video.duration;
    seekSlider.value = video.currentTime;

    timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(
      video.duration
    )}`;
  }

  function rememberVolume(video) {
    if (!video) return;

    if (video.volume > 0) {
      currentVolume = video.volume;
    }
  }

  function restoreAudioState(video) {
    if (!video) return;

    video.muted = wasMutedBeforePause;
    video.defaultMuted = wasMutedBeforePause;

    if (!wasMutedBeforePause && video.volume === 0) {
      video.volume = currentVolume;
    }
  }

  function playAndRestoreAudio(video) {
    if (!video) return;

    video.play();

    restoreAudioState(video);

    setTimeout(() => restoreAudioState(video), 50);
    setTimeout(() => restoreAudioState(video), 150);
    setTimeout(() => restoreAudioState(video), 300);
  }

  function seekBy(seconds) {
  const video = getActiveVideo();
  if (!video) return;
  if (!Number.isFinite(video.duration)) return;

  const newTime = Math.min(
    video.duration,
    Math.max(0, video.currentTime + seconds)
  );

  video.currentTime = newTime;
  updateSeekSlider();
}

  function togglePlay() {
    const video = getActiveVideo();
    if (!video) return;

    rememberVolume(video);

    if (video.paused) {
      playAndRestoreAudio(video);
    } else {
      wasMutedBeforePause = video.muted;
      video.pause();
    }
    updateButtonStates();
  }

  function replayVideo() {
    const video = getActiveVideo();
    if (!video) return;

    rememberVolume(video);

    wasMutedBeforePause = video.muted;

    video.currentTime = 0;
    playAndRestoreAudio(video);
  }

  function toggleMute() {
    const video = getActiveVideo();
    if (!video) return;

    if (!video.muted && video.volume > 0) {
      currentVolume = video.volume;
    }

    video.muted = !video.muted;
    video.defaultMuted = video.muted;

    if (!video.muted && video.volume === 0) {
      video.volume = currentVolume;
    }
    updateButtonStates();
  }

  function changeVolume(amount) {
    const video = getActiveVideo();
    if (!video) return;

    video.volume = Math.min(1, Math.max(0, video.volume + amount));

    if (video.volume > 0) {
      currentVolume = video.volume;
      video.muted = false;
      video.defaultMuted = false;
    } else {
      video.muted = true;
      video.defaultMuted = true;
    }
    updateButtonStates();
  }

  function createPanel() {
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "reels-controller-panel";

    panel.innerHTML = `
  <div id="rc-drag-handle" aria-label="Move controls">
    <span class="rc-drag-icon">☰  </span>
    <span class="rc-title">Reel Controller</span>
  </div>

  <div id="rc-seek-row">
    <input 
      id="rc-seek-slider" 
      type="range" 
      min="0" 
      max="100" 
      value="0" 
      step="0.01"
      aria-label="Video seek slider"
    />
    <span id="rc-time-label">0:00 / 0:00</span>
  </div>

  <div id="rc-button-row">
    <button id="rc-play" class="rc-control-btn" aria-label="Play or pause video">
  <span id="rc-play-icon" class="rc-icon">⏯</span>
  <span id="rc-play-label" class="rc-label">Play/Pause</span>
</button>

<button id="rc-mute" class="rc-control-btn" aria-label="Mute or unmute video">
  <span id="rc-mute-icon" class="rc-icon">🔇</span>
  <span id="rc-mute-label" class="rc-label">Mute</span>
</button>

    <button id="rc-replay" class="rc-control-btn" aria-label="Replay video">
      <span class="rc-icon">↻</span>
      <span class="rc-label">Replay</span>
    </button>
    

    <button id="rc-vol-down" class="rc-control-btn" aria-label="Decrease volume">
      <span class="rc-icon">−</span>
      <span class="rc-label">Volume</span>
    </button>

    <button id="rc-vol-up" class="rc-control-btn" aria-label="Increase volume">
      <span class="rc-icon">+</span>
      <span class="rc-label">Volume</span>
    </button>
  </div>
`;

    document.body.appendChild(panel);

    loadPanelPosition();

    seekSlider = document.getElementById("rc-seek-slider");
    timeLabel = document.getElementById("rc-time-label");

    seekSlider.addEventListener("input", () => {
      const video = getActiveVideo();
      if (!video) return;

      isSeeking = true;

      const newTime = Number(seekSlider.value);
      video.currentTime = newTime;

      if (timeLabel && Number.isFinite(video.duration)) {
        timeLabel.textContent = `${formatTime(newTime)} / ${formatTime(
          video.duration
        )}`;
      }
    });

    seekSlider.addEventListener("change", () => {
      isSeeking = false;
      updateSeekSlider();
    });

    document.getElementById("rc-play").addEventListener("click", togglePlay);
    document.getElementById("rc-replay").addEventListener("click", replayVideo);
    document.getElementById("rc-mute").addEventListener("click", toggleMute);

    document
      .getElementById("rc-vol-down")
      .addEventListener("click", () => changeVolume(-0.1));

    document
      .getElementById("rc-vol-up")
      .addEventListener("click", () => changeVolume(0.1));

    makePanelDraggable();
  }

  function addKeyboardControls(event) {
    const tag = document.activeElement?.tagName?.toLowerCase();

    if (tag === "input" || tag === "textarea") return;

    if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    }

    if (event.key.toLowerCase() === "m") {
      toggleMute();
    }

    if (event.key.toLowerCase() === "r") {
      replayVideo();
    }

    if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekBy(-1);
    }

    if (event.key === "ArrowRight") {
        event.preventDefault();
        seekBy(1);
    }
  }

  createPanel();

  window.addEventListener("keydown", addKeyboardControls);

  setInterval(() => {
  updateSeekSlider();
  updateButtonStates();
}, 100);

  const observer = new MutationObserver(() => {
    if (!document.getElementById("reels-controller-panel")) {
      panel = null;
      createPanel();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();