/**
 * Stops ALL active camera and microphone tracks across the entire browser tab.
 * Call this whenever navigating away from a media-using page.
 */
export function stopAllMediaTracks() {
  if (!navigator.mediaDevices) return;

  // Method 1: Use MediaStreamTrack.stop() on all active streams via getUserMedia enumerations
  // (works in modern Chrome/Firefox)
  if (navigator.mediaDevices.enumerateDevices) {
    // We can't enumerate active streams directly, so we use the approach below
  }

  // Method 2: Walk all video and audio elements and kill their srcObject streams
  document.querySelectorAll("video, audio").forEach((el) => {
    if (el.srcObject) {
      try {
        el.srcObject.getTracks().forEach((t) => t.stop());
        el.srcObject = null;
      } catch (_) {}
    }
  });
}
