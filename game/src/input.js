// Input: keyboard + mouse, with pressed-edge detection so one keypress is one
// action even when the key is held. The game reads this, never the DOM directly.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  // Snapshot of the presses this frame is allowed to read. beginFrame moves
  // the raw presses into it and clears the raw set, so a key that lands at
  // any moment is read exactly once, on the next frame — never lost to a
  // clear that runs after the key arrived but before it was read.
  let framePressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  let interacted = false;

  function markInteracted() {
    interacted = true;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    markInteracted();
    // Keep the page from scrolling on game keys.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onMouseDown(e) {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
      markInteracted();
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    mouse,
    /** True while the key is held. */
    down(code) {
      return keys.has(code);
    },
    /** True only on the frame the key was pressed. Consumed by endFrame. */
    wasPressed(code) {
      return framePressed.has(code);
    },
    /** Like wasPressed, but clears the edge at once: one press fires one action
        even when several sim steps run in the same frame. */
    consume(code) {
      if (!framePressed.has(code)) return false;
      framePressed.delete(code);
      return true;
    },
    /** Snapshot the raw presses for this frame. Call first, before any check. */
    beginFrame() {
      framePressed = new Set(pressed);
      pressed.clear();
    },
    /** Keys this frame may read (playtest introspection). */
    get debugFramePressed() {
      return [...framePressed];
    },
    /** True once any key or click has happened (audio gesture unlock). */
    get interacted() {
      return interacted;
    },
    /** Call at the end of each tick: clears this frame's edges and the click. */
    endFrame() {
      framePressed.clear();
      mouse.clicked = false;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

/** WASD + arrows as a -1..1 movement vector, normalised. */
export function moveVector(input) {
  let x = 0;
  let y = 0;
  if (input.down('KeyA') || input.down('ArrowLeft')) x -= 1;
  if (input.down('KeyD') || input.down('ArrowRight')) x += 1;
  if (input.down('KeyW') || input.down('ArrowUp')) y -= 1;
  if (input.down('KeyS') || input.down('ArrowDown')) y += 1;
  if (x !== 0 && y !== 0) {
    const inv = 1 / Math.sqrt(2);
    x *= inv;
    y *= inv;
  }
  return { x, y };
}

/** The four car keys as one object: throttle -1..1, steer -1..1, handbrake. */
export function driveVector(input) {
  const mv = moveVector(input);
  return {
    throttle: -mv.y,
    steer: mv.x,
    handbrake: input.down('Space'),
  };
}
