// sketch.js
// Square canvas = windowHeight x windowHeight. All (square) videos fill the canvas exactly.
// Background music (bg.mp3): Space = start/toggle play/pause (linked with video), M = mute/unmute.

let vids = [];        // pre-created hidden video elements (soft preload)
let current = null;   // currently active p5 MediaElement (video)
let idx = 0;
let started = false;

// --- background audio ---
let bg = null;        // p5.MediaElement created by createAudio
let bgMuted = true;
let bgVolume = 0.6;   // default music volume (adjust as you like)

function currentEntry() { return SEQUENCE[idx]; }
function nextIndex(i) { return (i + 1) % SEQUENCE.length; }
function prevIndex(i) { return (i - 1 + SEQUENCE.length) % SEQUENCE.length; }

function setCanvasSquareToWindowHeight() {
  const s = Math.floor(window.innerHeight * 0.85);
  if (width !== s || height !== s) resizeCanvas(s, s);
}

function setup() {
  pixelDensity(1);
  
  let c = createCanvas(10, 10); // placeholder; immediately resized below
  setCanvasSquareToWindowHeight();
  c.parent('c'); // attach canvas to specific div

  // Soft-preload hidden video elements so they are ready
  for (const entry of SEQUENCE) {
    const v = createVideo(entry.file);
    v.attribute('playsinline', '');
    v.attribute('muted', 'true');
    v.attribute('preload', 'auto');
    v.volume(0);
    v.hide();
    vids.push(v);
  }

  // Background music setup (hidden)
  bg = createAudio('bg.mp3');
  bg.attribute('preload', 'auto');
  bg.volume(bgVolume);
  bg.hide(); // drive via keyboard

  textAlign(CENTER, CENTER);
  textSize(16);
  noStroke();
}

function windowResized() {
  setCanvasSquareToWindowHeight();
}

function draw() {
  background(0);

  if (!current) {
    fill(240);
    text('Press SPACE to start.\nM = mute/unmute  \n  → / ← = next/prev', width / 2, height / 2);
    return;
  }

  // 1) Draw the current (square) video to fill the square canvas
  image(current, 0, 0, width, height);

  // 2) Apply the selected effect to the full canvas region
  const entry = currentEntry();
  if (entry && entry.effect && window.VideoEffects && typeof VideoEffects.apply === 'function') {
    const frame = get(0, 0, width, height); // grab full canvas
    VideoEffects.apply(frame, entry.effect, entry.params || {});
    image(frame, 0, 0, width, height);      // draw processed frame back
  }
}

function keyPressed() {
  // Space should start on first press, then toggle play/pause
  if (key === ' ') {
    if (!started) {
      beginPlaybackPipeline();
    } else {
      // Toggle play/pause for both video and bg audio
      if (current) {
        if (current.elt.paused) current.play(); else current.pause();
      }
      if (bg && bg.elt) {
        if (bg.elt.paused) {
          if (!bgMuted) bg.play(); // resume only if not muted
        } else {
          bg.pause();
        }
      }
    }
    return false; // prevent page scroll
  }

  if (!started) return;

  if (keyCode === RIGHT_ARROW) nextClip();
  if (keyCode === LEFT_ARROW)  prevClip();

  // Mute/unmute background music
  if (key === 'm' || key === 'M') {
    bgMuted = !bgMuted;
    if (bg) bg.volume(bgMuted ? 0 : bgVolume);
  }
}

function beginPlaybackPipeline() {
  started = true;
  startPlayback();

  // Start background music on first user gesture (space or click)
  if (bg && bg.elt && bg.elt.paused) {
    bg.loop(); // loop the track
    bg.volume(bgMuted ? 0 : bgVolume);
  }
}

function startPlayback() {
  // Stop & clean previous video
  if (current) {
    current.stop();
    current.remove();   // remove old element from DOM
    current = null;
  }

  const entry = currentEntry();

  // Recreate the element fresh at this index (clean state)
  if (vids[idx]) { vids[idx].remove(); }
  const v = createVideo(entry.file, () => {
    v.attribute('playsinline', '');
    v.attribute('muted', 'true');   // keep video muted; bg.mp3 is our audio
    v.volume(0);
    v.hide();
    v.onended(nextClip);
    v.play();
  });

  current = v;

  // Keep bg music state consistent across clip changes:
  if (bg && bg.elt && !bgMuted && started) {
    if (bg.elt.paused) bg.play();
  }
}

function nextClip() {
  idx = nextIndex(idx);
  startPlayback();
}

function prevClip() {
  idx = prevIndex(idx);
  startPlayback();
}
