"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const AnalysisScorecard = dynamic(() => import("./AnalysisScorecard"), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-md flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-sm text-indigo-700 font-semibold">
        <svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading Scorecard...
      </div>
    </div>
  ),
});

// face-api.js model CDN — official weights hosted on unpkg
const FACE_API_CDN = "https://unpkg.com/face-api.js@0.22.2/weights";

// Expression label display config
const EXPRESSION_CONFIG: Record<
  string,
  { emoji: string; label: string; color: string; bg: string; border: string }
> = {
  neutral:    { emoji: "😐", label: "Neutral",    color: "text-emerald-300", bg: "bg-emerald-900/80",  border: "border-emerald-500/60" },
  happy:      { emoji: "😊", label: "Happy",      color: "text-blue-300",    bg: "bg-blue-900/80",    border: "border-blue-500/60"   },
  surprised:  { emoji: "😮", label: "Surprised",  color: "text-amber-300",  bg: "bg-amber-900/80",   border: "border-amber-500/60"  },
  disgusted:  { emoji: "😒", label: "Disgusted",  color: "text-amber-300",  bg: "bg-amber-900/80",   border: "border-amber-500/60"  },
  sad:        { emoji: "😟", label: "Sad",        color: "text-rose-300",   bg: "bg-rose-900/80",    border: "border-rose-500/60"   },
  angry:      { emoji: "😠", label: "Angry",      color: "text-rose-300",   bg: "bg-rose-900/80",    border: "border-rose-500/60"   },
  fearful:    { emoji: "😨", label: "Fearful",    color: "text-rose-300",   bg: "bg-rose-900/80",    border: "border-rose-500/60"   },
};

// Interfaces matching the strict backend contract
interface Scores {
  clarity: number;
  confidence: number;
  structure: number;
  fluency: number;
  engagement: number;
}

interface AnalysisResponse {
  session_id: string;
  scores: Scores;
  tips: [string, string, string] | string[];
  transcript: string;
}

const TARGET_FILLERS = ["um", "uh", "like", "you know", "basically"];
const HEDGE_PHRASES = [
  "i think maybe",
  "i guess",
  "sort of",
  "kind of",
  "maybe",
  "perhaps",
  "i believe maybe",
  "probably",
];

export default function PracticePage() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>("");
  const [interimText, setInterimText] = useState<string>("");
  const [confidenceScore, setConfidenceScore] = useState<number>(100);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState<boolean>(false);

  // Camera State
  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(true);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Facial Expression State
  const [expressionKey, setExpressionKey] = useState<string>("neutral");
  const [expressionConfidence, setExpressionConfidence] = useState<number>(0);
  const [faceApiLoaded, setFaceApiLoaded] = useState<boolean>(false);
  const [faceApiLoading, setFaceApiLoading] = useState<boolean>(false);
  const [noFaceDetected, setNoFaceDetected] = useState<boolean>(false);

  // Stats
  const [wordCount, setWordCount] = useState<number>(0);
  const [fillerCounts, setFillerCounts] = useState<{ [key: string]: number }>({});
  const [hedgeCount, setHedgeCount] = useState<number>(0);

  // Audio, Video & Web Speech API Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const transcriptRef = useRef<string>("");
  const expressionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceApiRef = useRef<any>(null);

  // Keep refs in sync for event callbacks
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Load face-api.js models from CDN on mount
  useEffect(() => {
    const loadModels = async () => {
      if (faceApiLoaded || faceApiLoading) return;
      setFaceApiLoading(true);
      try {
        // Dynamically import face-api.js to avoid SSR issues
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_CDN),
          faceapi.nets.faceExpressionNet.loadFromUri(FACE_API_CDN),
        ]);

        setFaceApiLoaded(true);
        console.log("[face-api] Models loaded from CDN ✓");
      } catch (err) {
        console.warn("[face-api] Failed to load models:", err);
      } finally {
        setFaceApiLoading(false);
      }
    };
    loadModels();
  }, [faceApiLoaded, faceApiLoading]);

  // Start expression detection loop
  const startExpressionDetection = useCallback(() => {
    if (!faceApiLoaded || !faceApiRef.current || !videoRef.current) return;
    const faceapi = faceApiRef.current;

    const detect = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const result = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
          .withFaceExpressions();

        if (!result) {
          setNoFaceDetected(true);
          return;
        }
        setNoFaceDetected(false);

        const expressions = result.expressions as Record<string, number>;
        const best = Object.entries(expressions).reduce((a, b) => (a[1] > b[1] ? a : b));
        setExpressionKey(best[0]);
        setExpressionConfidence(Math.round(best[1] * 100));
      } catch {
        // silent — detection fails when video not ready
      }
    };

    detect(); // run immediately
    expressionIntervalRef.current = setInterval(detect, 800);
  }, [faceApiLoaded]);

  // Stop expression detection loop
  const stopExpressionDetection = useCallback(() => {
    if (expressionIntervalRef.current) {
      clearInterval(expressionIntervalRef.current);
      expressionIntervalRef.current = null;
    }
    setExpressionKey("neutral");
    setExpressionConfidence(0);
    setNoFaceDetected(false);
  }, []);

  // Rolling confidence score & word counter calculation
  const calculateLiveMetrics = useCallback((text: string) => {
    if (!text.trim()) {
      setWordCount(0);
      setFillerCounts({});
      setHedgeCount(0);
      setConfidenceScore(100);
      return;
    }

    const words = text.trim().split(/\s+/);
    const totalWords = words.length;
    const lowerText = text.toLowerCase();

    // Count filler words
    const fillersFound: { [key: string]: number } = {};
    let totalFillers = 0;
    TARGET_FILLERS.forEach((filler) => {
      const regex = new RegExp(`\\b${filler}\\b`, "gi");
      const matches = lowerText.match(regex);
      const count = matches ? matches.length : 0;
      fillersFound[filler] = count;
      totalFillers += count;
    });

    // Count hedge phrases
    let hedges = 0;
    HEDGE_PHRASES.forEach((phrase) => {
      const regex = new RegExp(`\\b${phrase}\\b`, "gi");
      const matches = lowerText.match(regex);
      if (matches) hedges += matches.length;
    });

    setWordCount(totalWords);
    setFillerCounts(fillersFound);
    setHedgeCount(hedges);

    // Rolling confidence formula:
    // Fewer fillers & hedge phrases relative to total words spoken = higher score
    if (totalWords < 4) {
      setConfidenceScore(95);
    } else {
      const penaltyRatio = (totalFillers * 1.0 + hedges * 1.5) / totalWords;
      // High density penalty scaling
      const rawScore = Math.max(15, Math.min(100, Math.round(100 - penaltyRatio * 150)));
      setConfidenceScore(rawScore);
    }
  }, []);

  // Update live confidence meter periodically while recording
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      const fullCurrentText = (transcriptRef.current + " " + interimText).trim();
      calculateLiveMetrics(fullCurrentText);
    }, 1500);
    return () => clearInterval(interval);
  }, [isRecording, interimText, calculateLiveMetrics]);

  // Waveform visualization using Web Audio AnalyserNode (Light Theme Palette)
  const startVisualizer = (analyser: AnalyserNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const width = canvas.width;
      const height = canvas.height;

      // Clean light mode canvas background
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(0, 0, width, height);

      // Subtle center reference line
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Vibrant indigo-to-violet gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, "#4f46e5"); // Indigo-600
      gradient.addColorStop(0.5, "#7c3aed"); // Purple-600
      gradient.addColorStop(1, "#0284c7"); // Sky-600

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = gradient;
      ctx.shadowBlur = 6;
      ctx.shadowColor = "rgba(99, 102, 241, 0.35)";
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = ((v - 1) * 1.6 + 1) * (height / 2);

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    draw();
  };

  // Toggle Camera
  const handleToggleCamera = async () => {
    if (!isRecording) {
      setIsCameraEnabled((prev) => !prev);
      return;
    }

    if (isCameraActive) {
      // Turn off video tracks
      stopExpressionDetection();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getVideoTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      setIsCameraEnabled(false);
    } else {
      // Turn on video
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.addTrack(videoTrack);
        }
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStreamRef.current;
          // Restart expression detection once video data is ready
          videoRef.current.onloadeddata = () => startExpressionDetection();
        }
        setIsCameraActive(true);
        setIsCameraEnabled(true);
      } catch (camErr) {
        console.warn("Could not enable camera:", camErr);
      }
    }
  };

  // Start Voice & Camera Engine Recording
  const handleStart = async () => {
    setError(null);
    setAnalysisResult(null);
    setTranscript("");
    setInterimText("");
    setConfidenceScore(100);
    setFillerCounts({});
    setWordCount(0);
    setHedgeCount(0);

    try {
      // 1. Request microphone & optional camera permission
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: isCameraEnabled
            ? {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user",
              }
            : false,
        });
      } catch (mediaErr) {
        // Fallback to audio-only if camera is unavailable or denied
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      }

      mediaStreamRef.current = stream;
      setMicActive(true);

      const hasVideo = stream.getVideoTracks().length > 0;
      setIsCameraActive(hasVideo);
      if (videoRef.current && hasVideo) {
        videoRef.current.srcObject = stream;
        // Start expression detection once video is ready
        videoRef.current.onloadeddata = () => startExpressionDetection();
      }

      // 2. Initialize Web Audio API AnalyserNode
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyserRef.current = analyser;
      source.connect(analyser);

      startVisualizer(analyser);

      // 3. Initialize native Web Speech API SpeechRecognition
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setError(
          "Web Speech API (SpeechRecognition) is not supported in this browser. Please use Chrome, Edge, or Safari."
        );
      } else {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          let currentInterim = "";
          let finalChunk = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcriptText = result[0].transcript;
            if (result.isFinal) {
              finalChunk += transcriptText + " ";
            } else {
              currentInterim += transcriptText;
            }
          }

          if (finalChunk) {
            setTranscript((prev) => {
              const updated = (prev + " " + finalChunk).trim();
              calculateLiveMetrics(updated);
              return updated;
            });
          }
          setInterimText(currentInterim);
        };

        recognition.onerror = (event: any) => {
          console.warn("Speech recognition warning/error:", event.error);
          if (event.error === "not-allowed") {
            setError("Microphone access was denied. Please allow microphone permissions.");
          }
        };

        recognition.onend = () => {
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore already-started errors
            }
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setIsRecording(true);
    } catch (err: any) {
      console.error("Failed to start microphone or speech engine:", err);
      setError(
        err.message ||
          "Could not access microphone. Please check permissions and try again."
      );
    }
  };

  // Stop Recording & Trigger Backend Analysis
  const handleStop = async () => {
    setIsRecording(false);
    isRecordingRef.current = false;

    // 1. Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Safe ignore
      }
      recognitionRef.current = null;
    }

    // 2. Stop audio visualizer, camera, and tracks
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.onloadeddata = null;
    }
    stopExpressionDetection();
    setIsCameraActive(false);

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicActive(false);

    // 3. Finalize transcript
    const fullFinalTranscript = (
      transcriptRef.current +
      " " +
      interimText
    ).trim();
    setTranscript(fullFinalTranscript);
    setInterimText("");
    calculateLiveMetrics(fullFinalTranscript);

    if (!fullFinalTranscript) {
      setError("No speech recorded. Speak or inject a test statement before stopping.");
      return;
    }

    // 4. Send to POST /analyze
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullFinalTranscript,
          session_id: `session_${Date.now()}`,
        }),
      });

      if (!response.ok) {
        // Fallback directly to port 8000
        const fallbackRes = await fetch("http://127.0.0.1:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: fullFinalTranscript,
            session_id: `session_${Date.now()}`,
          }),
        });
        if (!fallbackRes.ok) {
          throw new Error(`Analysis failed with status ${fallbackRes.status}`);
        }
        const data: AnalysisResponse = await fallbackRes.json();
        setAnalysisResult(data);
        return;
      }

      const data: AnalysisResponse = await response.json();
      setAnalysisResult(data);
    } catch (err: any) {
      console.error("Error analyzing speech:", err);
      try {
        const fallbackRes = await fetch("http://127.0.0.1:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: fullFinalTranscript,
            session_id: `session_${Date.now()}`,
          }),
        });
        if (fallbackRes.ok) {
          const data: AnalysisResponse = await fallbackRes.json();
          setAnalysisResult(data);
          return;
        }
      } catch (inner) {
        console.error("Fallback error:", inner);
      }

      setError(
        "Could not connect to the Python FastAPI backend on port 8000. Ensure the backend server is running."
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Helper: Simulate speech input (for testing without microphone)
  const handleSimulateTestSpeech = (sampleText: string) => {
    setTranscript((prev) => {
      const combined = prev ? `${prev} ${sampleText}` : sampleText;
      calculateLiveMetrics(combined);
      return combined;
    });

    // Animate waveform briefly for simulation
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        let frame = 0;
        const simDraw = () => {
          if (frame > 60) return;
          frame++;
          ctx.fillStyle = "#f8fafc";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.beginPath();
          ctx.strokeStyle = "#4f46e5";
          ctx.lineWidth = 2.5;
          const w = canvas.width;
          const h = canvas.height;
          for (let x = 0; x < w; x += 4) {
            const y = h / 2 + Math.sin(x * 0.05 + frame * 0.2) * 22;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          requestAnimationFrame(simDraw);
        };
        simDraw();
      }
    }
  };

  // Inline filler-word highlighter: wraps "um", "uh", "like", "you know", "basically" in <span>
  const renderHighlightedTranscript = (text: string, interim: string = "") => {
    const full = (text + (interim ? " " + interim : "")).trim();
    if (!full) {
      return (
        <span className="text-slate-400 italic">
          Your spoken words will appear here in real time...
        </span>
      );
    }

    const regex = /\b(you know|um|uh|like|basically)\b/gi;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(full)) !== null) {
      if (match.index > lastIndex) {
        parts.push(full.substring(lastIndex, match.index));
      }

      const fillerWord = match[0];
      parts.push(
        <span
          key={`filler-${match.index}`}
          className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm animate-pulse"
          title="Detected Filler Word"
        >
          {fillerWord}
        </span>
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < full.length) {
      parts.push(full.substring(lastIndex));
    }

    return parts;
  };



  // Gauge color determination
  const getGaugeColor = (score: number) => {
    if (score >= 80) return "#059669"; // Emerald-600
    if (score >= 60) return "#d97706"; // Amber-600
    return "#e11d48"; // Rose-600
  };

  const getConfidenceLabel = (score: number) => {
    if (score >= 80) return "High Confidence";
    if (score >= 60) return "Moderate Confidence";
    return "High Filler Rate";
  };

  const totalFillersSpoken = Object.values(fillerCounts).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <main className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col gap-8">
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 mb-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            AI Debate &amp; Interview Coach
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            Voice &amp; Video Engine
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">
            Real-time vocal delivery coaching, video composure mirror, filler-word diagnostics, and AI acoustic evaluation.
          </p>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold border ${
              isRecording
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRecording ? "bg-rose-600 animate-ping" : "bg-slate-400"
              }`}
            />
            {isRecording ? "Session Active" : "Studio Standby"}
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <svg
              className="w-4 h-4 text-indigo-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Claude 3.5 + spaCy
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-sm">
          <svg
            className="w-5 h-5 text-rose-600 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div className="flex-1 font-medium">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-rose-700 hover:text-rose-900 text-xs underline font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 3-Card Studio Grid: Camera Feed, Acoustic Waveform & Controls, Confidence Meter */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Col 1: Live Video Camera Feed (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Speaker Video Feed
              </h2>
              <p className="text-[11px] text-slate-500">
                Eye contact &amp; posture · live expression detection
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* face-api.js loading indicator */}
              {faceApiLoading && (
                <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
                  <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Loading AI...
                </span>
              )}
              {faceApiLoaded && !faceApiLoading && (
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Expression AI Ready
                </span>
              )}
              <button
                onClick={handleToggleCamera}
                className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition flex items-center gap-1.5 ${
                  isCameraEnabled
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                }`}
                title="Toggle camera feed on or off"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCameraEnabled ? "bg-emerald-600" : "bg-slate-400"
                  }`}
                />
                {isCameraEnabled ? "Camera On" : "Camera Off"}
              </button>
            </div>
          </div>

          {/* Video Container */}
          <div className="relative w-full h-44 bg-slate-950 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                isCameraActive ? "block" : "hidden"
              }`}
            />
            {!isCameraActive && (
              <div className="flex flex-col items-center justify-center text-center p-4 text-slate-400 gap-2">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center border border-slate-700">
                  <svg
                    className="w-5 h-5 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <p className="text-xs text-slate-300">
                  {isCameraEnabled
                    ? "Click 'Start Practice' to activate video"
                    : "Camera disabled via toggle"}
                </p>
              </div>
            )}

            {/* Top-left: Live Camera badge */}
            {isCameraActive && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300 bg-slate-900/90 px-2 py-0.5 rounded border border-emerald-500/50 backdrop-blur">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live
              </div>
            )}

            {/* Top-right: Live Expression Badge */}
            {isCameraActive && isRecording && faceApiLoaded && (() => {
              const cfg = EXPRESSION_CONFIG[expressionKey] ?? EXPRESSION_CONFIG.neutral;
              return (
                <div
                  className={`absolute top-2 right-2 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border backdrop-blur-sm transition-all duration-500 ${
                    cfg.color
                  } ${cfg.bg} ${cfg.border}`}
                >
                  <span className="text-base leading-none">{cfg.emoji}</span>
                  <div className="flex flex-col leading-none">
                    <span>{cfg.label}</span>
                    {expressionConfidence > 0 && (
                      <span className="text-[9px] opacity-70 font-mono">{expressionConfidence}%</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* No face detected hint */}
            {isCameraActive && isRecording && faceApiLoaded && noFaceDetected && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 bg-slate-900/70 px-3 py-1 rounded-full border border-slate-700 backdrop-blur">
                No face detected
              </div>
            )}
          </div>

          {/* Framing Guide Note */}
          <div className="flex items-center gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <svg
              className="w-4 h-4 text-indigo-600 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Aim for <strong>Neutral</strong> or <strong>Happy</strong> — avoid angry, sad, or fearful expressions during judging.</span>
          </div>
        </div>

        {/* Col 2: Acoustic Waveform & Recording Controls (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                  />
                </svg>
                Acoustic Waveform
              </h2>
              <p className="text-[11px] text-slate-500">
                Web Audio API AnalyserNode
              </p>
            </div>

            {/* Quick Demo Injection button */}
            <button
              id="simulate-speech-btn"
              onClick={() =>
                handleSimulateTestSpeech(
                  "Um, basically like I think maybe our debate argument is solid because, you know, renewable energy cuts carbon emissions."
                )
              }
              className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium transition flex items-center gap-1.5"
              title="Feed sample test sentence with fillers into the transcript"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              + Inject Test Speech
            </button>
          </div>

          {/* Waveform Canvas */}
          <div className="relative w-full h-44 bg-slate-50 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={500}
              height={176}
              className="w-full h-full object-cover"
            />
            {!isRecording && !transcript && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 font-medium">
                Click &quot;Start Practice&quot; to activate microphone
              </div>
            )}
            {isRecording && (
              <div className="absolute top-2 right-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                Live Mic Stream
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isRecording ? (
              <button
                id="start-record-btn"
                onClick={handleStart}
                disabled={isAnalyzing}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition shadow-md shadow-indigo-200 disabled:opacity-50"
              >
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                  />
                </svg>
                Start Practice Session
              </button>
            ) : (
              <button
                id="stop-record-btn"
                onClick={handleStop}
                disabled={isAnalyzing}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 transition shadow-md shadow-rose-200 animate-recording-ring"
              >
                <span className="w-2.5 h-2.5 rounded-sm bg-white" />
                Stop &amp; Analyze Delivery
              </button>
            )}

            {isAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-indigo-700 font-semibold">
                <svg
                  className="animate-spin h-4 w-4 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Scoring Delivery...
              </div>
            )}
          </div>
        </div>

        {/* Col 3: Live Confidence Meter (3 cols) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-slate-900">
                Live Confidence
              </h2>
              <span
                className="text-[11px] px-2 py-0.5 rounded-md font-semibold border"
                style={{
                  backgroundColor: `${getGaugeColor(confidenceScore)}15`,
                  color: getGaugeColor(confidenceScore),
                  borderColor: `${getGaugeColor(confidenceScore)}40`,
                }}
              >
                {getConfidenceLabel(confidenceScore)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Rolling filler &amp; hedge ratio
            </p>
          </div>

          {/* Circular Visual Gauge */}
          <div className="flex flex-col items-center justify-center my-3">
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke="#e2e8f0"
                  strokeWidth="9"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="transparent"
                  stroke={getGaugeColor(confidenceScore)}
                  strokeWidth="9"
                  strokeDasharray={264}
                  strokeDashoffset={264 - (264 * confidenceScore) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-700 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span
                  id="confidence-score-val"
                  className="text-2xl font-black tracking-tight"
                  style={{ color: getGaugeColor(confidenceScore) }}
                >
                  {confidenceScore}%
                </span>
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-mono font-bold">
                  Confidence
                </span>
              </div>
            </div>
          </div>

          {/* Quick Stat Badges */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-center">
            <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200">
              <div className="text-[9px] text-slate-500 uppercase font-semibold">Words</div>
              <div id="metric-word-count" className="text-sm font-bold text-slate-900">
                {wordCount}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200">
              <div className="text-[9px] text-slate-500 uppercase font-semibold">Fillers</div>
              <div
                id="metric-filler-count"
                className="text-sm font-bold text-amber-600"
              >
                {totalFillersSpoken}
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-200">
              <div className="text-[9px] text-slate-500 uppercase font-semibold">Hedges</div>
              <div
                id="metric-hedge-count"
                className="text-sm font-bold text-sky-600"
              >
                {hedgeCount}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Transcript with Filler Word Highlighting */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                />
              </svg>
              Live Speech Transcript &amp; Filler Diagnostics
            </h2>
            <p className="text-xs text-slate-500">
              Targeted fillers: &quot;um&quot;, &quot;uh&quot;, &quot;like&quot;, &quot;you know&quot;, &quot;basically&quot;
            </p>
          </div>

          {/* Filler Breakdown Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {TARGET_FILLERS.map((filler) => {
              const count = fillerCounts[filler] || 0;
              return (
                <span
                  key={filler}
                  className={`text-xs px-2.5 py-0.5 rounded-full border transition ${
                    count > 0
                      ? "bg-amber-100 text-amber-900 border-amber-300 font-bold"
                      : "bg-slate-100 text-slate-500 border-slate-200 font-medium"
                  }`}
                >
                  &quot;{filler}&quot;: {count}
                </span>
              );
            })}
          </div>
        </div>

        {/* Live Transcript Display Box */}
        <div
          id="live-transcript-box"
          className="mt-4 p-5 min-h-[120px] max-h-60 overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm sm:text-base leading-relaxed font-normal"
        >
          {renderHighlightedTranscript(transcript, interimText)}
        </div>
      </section>

      {/* Post-Stop Scoring & Radar Chart Section (Lazy-loaded) */}
      {analysisResult && (
        <AnalysisScorecard
          analysisResult={analysisResult}
          onReset={() => {
            setAnalysisResult(null);
            setTranscript("");
            setInterimText("");
          }}
        />
      )}
    </main>
  );
}
