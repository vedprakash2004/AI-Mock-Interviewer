import { useRef, useState, useCallback, useEffect } from "react";

// ─── Tuning knobs ────────────────────────────────────────────────────────────
// Check interval: only sample every 8 seconds (not constantly)
const LOOK_AWAY_INTERVAL_MS = 8000;
// Grace: must miss face in N *consecutive* checks before it counts as a look-away
const NO_FACE_GRACE_FRAMES = 2;
// Only flag the session after this many look-aways (very lenient)
const LOOK_AWAY_THRESHOLD = 8;
// ─────────────────────────────────────────────────────────────────────────────

export function useCameraGuard() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const faceDetectorRef = useRef(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [lookAwayCount, setLookAwayCount] = useState(0);
  const [flagged, setFlagged] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const noFaceFrames = useRef(0);

  // Try native FaceDetector API (Chrome experimental flag, often unavailable)
  const initDetector = useCallback(async () => {
    if ("FaceDetector" in window) {
      try {
        faceDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
        return true;
      } catch (_) {}
    }
    return false;
  }, []);

  const detectFace = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // ── Path 1: Native FaceDetector (Chrome 74+ behind flag) ──
    if (faceDetectorRef.current) {
      try {
        const faces = await faceDetectorRef.current.detect(canvas);
        if (faces.length === 0) {
          noFaceFrames.current += 1;
          if (noFaceFrames.current >= NO_FACE_GRACE_FRAMES) {
            noFaceFrames.current = 0;
            setLookAwayCount((prev) => {
              const next = prev + 1;
              if (next >= LOOK_AWAY_THRESHOLD) setFlagged(true);
              return next;
            });
          }
        } else {
          noFaceFrames.current = 0;
        }
      } catch (_) {}
      return;
    }

    // ── Path 2: Brightness-based motion heuristic (fallback) ──
    // Instead of unreliable skin-tone detection, we check overall brightness.
    // A completely empty/dark frame means the person likely left or covered camera.
    // This is far less aggressive than skin-tone matching.
    const { data } = ctx.getImageData(
      canvas.width * 0.1, canvas.height * 0.1,
      canvas.width * 0.8, canvas.height * 0.8
    );
    let totalBrightness = 0;
    let pixelCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      // Perceived brightness formula
      totalBrightness += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      pixelCount++;
    }
    const avgBrightness = totalBrightness / pixelCount;

    // Only flag if the frame is almost completely black (< 8 brightness out of 255)
    // This avoids false positives from poor lighting, dark skin tones, etc.
    if (avgBrightness < 8) {
      noFaceFrames.current += 1;
      if (noFaceFrames.current >= NO_FACE_GRACE_FRAMES) {
        noFaceFrames.current = 0;
        setLookAwayCount((prev) => {
          const next = prev + 1;
          if (next >= LOOK_AWAY_THRESHOLD) setFlagged(true);
          return next;
        });
      }
    } else {
      noFaceFrames.current = 0;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      await initDetector();
      setCameraActive(true);
      setCameraError("");
      // Start detection loop with a generous initial delay (let video stabilise)
      setTimeout(() => {
        intervalRef.current = setInterval(detectFace, LOOK_AWAY_INTERVAL_MS);
      }, 3000);
    } catch (e) {
      setCameraError("Camera access denied. Proctoring disabled.");
    }
  }, [initDetector, detectFace]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return { videoRef, canvasRef, cameraActive, lookAwayCount, flagged, cameraError, startCamera, stopCamera };
}
