(function () {
  let panel;
  let currentVolume = 0.2;
  let wasMutedBeforePause = false;
  let preferredMuted = false;

  let seekSlider;
  let timeLabel;
  let isSeeking = false;

  let guardedVideos = new WeakSet();
  let isApplyingAudioState = false;
  let lastActiveVideo = null;
  let isApplyingVolumeState = false;
  let userPaused = false;
  let userHasInteracted = false;

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, "0");

    return `${mins}:${secs}`;
  }

  function scheduleAudioRestore(video = getActiveVideo()) {
  if (!video) return;

  applyPreferredAudioState(video);

  setTimeout(() => applyPreferredAudioState(video), 50);
  setTimeout(() => applyPreferredAudioState(video), 150);
  setTimeout(() => applyPreferredAudioState(video), 300);
  setTimeout(() => applyPreferredAudioState(video), 600);
  setTimeout(() => applyPreferredAudioState(video), 1000);
}

function forcePauseIfUserPaused(video = getActiveVideo()) {
  if (!video) return;

  if (userPaused && !video.paused) {
    video.pause();
  }
}

function applyPreferredVolume(video) {
  if (!video) return;
  video.volume = currentVolume;
}

  function getActiveVideo() {
  const videos = Array.from(document.querySelectorAll("video"));

  if (videos.length === 0) return null;

  let bestVideo = null;
  let bestScore = 0;

  videos.forEach((video) => {
    const rect = video.getBoundingClientRect();

    const visibleWidth =
      Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);

    const visibleHeight =
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);

    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    const totalArea = rect.width * rect.height;

    if (totalArea <= 0) return;

    const visibilityRatio = visibleArea / totalArea;

    const isUsableVideo =
      rect.width > 100 &&
      rect.height > 100 &&
      visibilityRatio > 0.4;

    if (isUsableVideo && visibilityRatio > bestScore) {
      bestScore = visibilityRatio;
      bestVideo = video;
    }
  });

  return bestVideo || videos[0];
}

function handleActiveVideoChange() {
  const video = getActiveVideo();
  if (!video) return;

  if (video !== lastActiveVideo) {
    lastActiveVideo = video;

    applyPreferredVolume(video);
    scheduleAudioRestore(video);

    setTimeout(() => {
      const activeVideo = getActiveVideo();
      applyPreferredVolume(activeVideo);
      scheduleAudioRestore(activeVideo);
    }, 100);

    setTimeout(() => {
      const activeVideo = getActiveVideo();
      applyPreferredVolume(activeVideo);
      scheduleAudioRestore(activeVideo);
    }, 300);

    setTimeout(() => {
      const activeVideo = getActiveVideo();
      applyPreferredVolume(activeVideo);
      scheduleAudioRestore(activeVideo);
    }, 700);
  }
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
  const soundWave = document.getElementById("rc-sound-wave");

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
      muteLabel.textContent = "Muted";

      if (soundWave) {
        soundWave.setAttribute("d", "M16 9l4 6M20 9l-4 6");
      }
    } else {
      muteLabel.textContent = "Sound";

      if (soundWave) {
        soundWave.setAttribute(
          "d",
          "M16 8.5c1.2 1.2 1.8 2.4 1.8 3.5s-.6 2.3-1.8 3.5"
        );
      }
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

  function updateVolumeLabel() {
  const video = getActiveVideo();
  const volumeLabel = document.getElementById("rc-volume-label");

  if (!volumeLabel) return;

  if (!video) {
    volumeLabel.textContent = "Volume: --%";
    return;
  }

  const volumePercent = Math.round(video.volume * 100);

  if (video.muted || video.volume === 0) {
    volumeLabel.textContent = `Volume: ${volumePercent}% (Muted)`;
  } else {
    volumeLabel.textContent = `Volume: ${volumePercent}%`;
  }
}

function applyPreferredVolume(video) {
  if (!video) return;

  isApplyingVolumeState = true;

  video.volume = currentVolume;

  setTimeout(() => {
    isApplyingVolumeState = false;
  }, 0);
}

  function restoreAudioState(video) {
  applyPreferredAudioState(video);
}

function applyPreferredAudioState(video) {
  if (!video) return;

  isApplyingAudioState = true;

  try {
    // Muting is always safe.
    if (preferredMuted) {
      video.muted = true;
      video.defaultMuted = true;
    } else {
      // Unmuting can be blocked by Chrome before user interaction.
      const hasBrowserActivation =
        navigator.userActivation && navigator.userActivation.hasBeenActive;

      if (!userHasInteracted && !hasBrowserActivation) {
        // Do not force unmute yet. Wait until the user interacts.
        isApplyingAudioState = false;
        updateButtonStates();
        updateVolumeLabel();
        return;
      }

      video.muted = false;
      video.defaultMuted = false;
      applyPreferredVolume(video);
    }
  } catch (error) {
    console.warn("ReelPlus could not apply audio state:", error);
  }

  updateButtonStates();
  updateVolumeLabel();

  setTimeout(() => {
    isApplyingAudioState = false;
  }, 0);
}

  function attachAudioGuardsToVideos() {
  const videos = Array.from(document.querySelectorAll("video"));

  videos.forEach((video) => {
    if (guardedVideos.has(video)) return;

    guardedVideos.add(video);

    video.addEventListener("play", () => {
  if (userPaused) {
    video.pause();
    return;
  }

  scheduleAudioRestore(video);
});

video.addEventListener("playing", () => {
  if (userPaused) {
    video.pause();
    return;
  }

  scheduleAudioRestore(video);
});

    video.addEventListener("ended", () => {
      scheduleAudioRestore(video);
    });

    video.addEventListener("timeupdate", () => {
      if (!preferredMuted && !video.paused && video.muted) {
        scheduleAudioRestore(video);
      }
    });

    video.addEventListener("volumechange", () => {
      if (isApplyingAudioState || isApplyingVolumeState) return;

      const activeVideo = getActiveVideo();

      // If this is not the active video, ignore it.
      if (video !== activeVideo) return;

      // If Instagram/TikTok changes the active video's volume,
      // restore the user's preferred ReelPlus volume instead of saving the site's value.
      if (Math.abs(video.volume - currentVolume) > 0.02) {
        applyPreferredVolume(video);
        updateVolumeLabel();
        return;
      }

      // If Instagram/TikTok mutes the active video even though
      // the user preference is sound, restore sound.
      if (!preferredMuted && video.muted && !video.paused) {
        scheduleAudioRestore(video);
        return;
      }

      updateButtonStates();
      updateVolumeLabel();
    });
  });
}

  function playAndRestoreAudio(video) {
  if (!video) return;

  userPaused = false;
  video.play();
  scheduleAudioRestore(video);
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
  userHasInteracted = true;

  const video = getActiveVideo();
  if (!video) return;

  if (video.paused) {
    userPaused = false;
    playAndRestoreAudio(video);
  } else {
    userPaused = true;
    preferredMuted = video.muted || video.volume === 0;
    video.pause();
  }

  updateButtonStates();
  updateVolumeLabel();
}

  function replayVideo() {
  const video = getActiveVideo();
  if (!video) return;

  rememberVolume(video);

  preferredMuted = video.muted;

  video.currentTime = 0;
  playAndRestoreAudio(video);

  updateButtonStates();
}

  function toggleMute() {
  userHasInteracted = true;

  const video = getActiveVideo();
  if (!video) return;

  preferredMuted = !(video.muted || video.volume === 0);

  applyPreferredAudioState(video);

  setTimeout(() => applyPreferredAudioState(getActiveVideo()), 50);
  setTimeout(() => applyPreferredAudioState(getActiveVideo()), 150);
  setTimeout(() => applyPreferredAudioState(getActiveVideo()), 300);
  setTimeout(() => applyPreferredAudioState(getActiveVideo()), 600);

  updateButtonStates();
  updateVolumeLabel();
}

  function changeVolume(amount) {
  const video = getActiveVideo();
  if (!video) return;

  const nextVolume = Math.min(1, Math.max(0, currentVolume + amount));

  currentVolume = nextVolume;

  isApplyingVolumeState = true;
  video.volume = currentVolume;

  if (currentVolume > 0) {
    preferredMuted = false;
    video.muted = false;
    video.defaultMuted = false;
  } else {
    preferredMuted = true;
    video.muted = true;
    video.defaultMuted = true;
  }

  setTimeout(() => {
    isApplyingVolumeState = false;
  }, 0);

  updateButtonStates();
  updateVolumeLabel();
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

  <div id="rc-volume-row">
  <span id="rc-volume-label">Volume: 20%</span>
</div>

  <div id="rc-button-row">
    <button id="rc-play" class="rc-control-btn" aria-label="Play or pause video">
  <span id="rc-play-icon" class="rc-icon">⏯</span>
  <span id="rc-play-label" class="rc-label">Play/Pause</span>
</button>

<button id="rc-mute" class="rc-control-btn" aria-label="Mute or unmute video">
  <span id="rc-mute-icon" class="rc-icon rc-svg-icon">
    <svg id="rc-mute-svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill="currentColor"
      />
      <path
        id="rc-sound-wave"
        d="M16 8.5c1.2 1.2 1.8 2.4 1.8 3.5s-.6 2.3-1.8 3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </span>
  <span id="rc-mute-label" class="rc-label">Sound</span>
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
    timeLabel.textContent = `${formatTime(newTime)} / ${formatTime(video.duration)}`;
  }
});

seekSlider.addEventListener("change", () => {
  isSeeking = false;
  updateSeekSlider();
  seekSlider.blur();
});

seekSlider.addEventListener("mouseup", () => {
  seekSlider.blur();
});

seekSlider.addEventListener("touchend", () => {
  seekSlider.blur();
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
  const active = document.activeElement;
  const tag = active?.tagName?.toLowerCase();
  const type = active?.getAttribute("type");

  if (
    tag === "textarea" ||
    (tag === "input" && type !== "range")
  ) {
    return;
  }

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

// Step 6: handle tab switching / minimizing
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (userPaused) {
      forcePauseIfUserPaused();
    }
    return;
  }

  setTimeout(() => forcePauseIfUserPaused(), 50);
  setTimeout(() => forcePauseIfUserPaused(), 200);
  setTimeout(() => forcePauseIfUserPaused(), 500);
});

// Step 7: handle browser window losing / regaining focus
window.addEventListener("blur", () => {
  if (userPaused) {
    forcePauseIfUserPaused();
  }
});

window.addEventListener("focus", () => {
  setTimeout(() => forcePauseIfUserPaused(), 50);
  setTimeout(() => forcePauseIfUserPaused(), 200);
  setTimeout(() => forcePauseIfUserPaused(), 500);
});

function markUserInteraction() {
  userHasInteracted = true;
}

window.addEventListener("pointerdown", markUserInteraction, true);
window.addEventListener("keydown", markUserInteraction, true);
window.addEventListener("touchstart", markUserInteraction, true);

setInterval(() => {
  attachAudioGuardsToVideos();
  handleActiveVideoChange();
  forcePauseIfUserPaused();
  updateSeekSlider();
  updateButtonStates();
  updateVolumeLabel();
}, 250);

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