"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatUIProps = {
  title: string;
  apiUrl: string;
  extraBody?: Record<string, unknown>;
  starterPrompt?: string;
  initialAssistantMessage?: string;
};

// Helper: Strip markdown symbols so speech sounds natural
function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[*#_`~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-•*]\s+/gm, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

interface VisualMetrics {
  totalDetections: number;
  focusedDetections: number;
  warningCount: number;
  expressions: {
    composed: number;
    smiling: number;
    engaged: number;
    tense: number;
  };
}

export default function ChatUI({
  title,
  apiUrl,
  extraBody,
  starterPrompt,
  initialAssistantMessage,
}: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialAssistantMessage ? [{ role: "assistant", content: initialAssistantMessage }] : []
  );
  const messagesRef = useRef<ChatMessage[]>(
    initialAssistantMessage ? [{ role: "assistant", content: initialAssistantMessage }] : []
  );
  const extraBodyRef = useRef(extraBody);
  extraBodyRef.current = extraBody;
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- Automated Conversational Flow State ----
  const [autoFlow, setAutoFlow] = useState<boolean>(true); // Hands-free professional mode
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const interviewTurnsRef = useRef(0);
  const sessionCompleteRef = useRef(false);
  const reportTriggeredRef = useRef(false);
  const generateReportRef = useRef<() => Promise<void>>(async () => {});
  const requestInFlightRef = useRef(false);

  // ---- Voice Output (Text-to-Speech) State ----
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [autoSpeak, setAutoSpeak] = useState<boolean>(true);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState<boolean>(false);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // ---- Voice Input (Speech-to-Text) State ----
  const [recognizing, setRecognizing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const baseInputRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const lastSpokenAssistantRef = useRef<string | null>(null);

  // ---- Camera Feed State (DEFAULT IS OFF) ----
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ---- Face Recognition & Attention Proctoring State ----
  const [faceApiLoaded, setFaceApiLoaded] = useState<boolean>(false);
  const [isLookingAtScreen, setIsLookingAtScreen] = useState<boolean>(true);
  const [gazeStatus, setGazeStatus] = useState<string>("Ready");
  const [currentExpression, setCurrentExpression] = useState<{ label: string; emoji: string; confidence: number }>({
    label: "Composed",
    emoji: "😐",
    confidence: 0,
  });
  const [activeProctorAlert, setActiveProctorAlert] = useState<string | null>(null);
  const [warningStrikes, setWarningStrikes] = useState<number>(0);
  const lookingAwayStartRef = useRef<number | null>(null);
  const faceApiRef = useRef<any>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cumulative visual metrics across the session
  const visualMetricsRef = useRef<VisualMetrics>({
    totalDetections: 0,
    focusedDetections: 0,
    warningCount: 0,
    expressions: {
      composed: 0,
      smiling: 0,
      engaged: 0,
      tense: 0,
    },
  });

  // ---- Report State ----
  const [report, setReport] = useState<{
    scores: any;
    tips: string[];
    pause_estimate_seconds?: number;
    visualReport?: {
      eyeContactScore: number;
      warningCount: number;
      disqualificationRisk: boolean;
      topExpression: string;
      expressionBreakdown: { name: string; pct: number; emoji: string }[];
    };
    voiceSuggestions?: string[];
    facialSuggestions?: string[];
    overallFeedback?: string;
    interviewAssessment?: {
      overall_score: number;
      verdict: string;
      strengths: string[];
      gaps: string[];
      answer_assessments: { question: string; status: string; reason: string }[];
    };
  } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Sync initialAssistantMessage if prop changes
  useEffect(() => {
    if (initialAssistantMessage) {
      const initialMessages = [{ role: "assistant", content: initialAssistantMessage } as ChatMessage];
      messagesRef.current = initialMessages;
      setMessages(initialMessages);
      interviewTurnsRef.current = 0;
      sessionCompleteRef.current = false;
      reportTriggeredRef.current = false;
      requestInFlightRef.current = false;
      lastSpokenAssistantRef.current = null;
      setInterviewComplete(false);
      setReport(null);
    }
  }, [initialAssistantMessage]);

  // Auto-scroll messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, interimText, silenceCountdown]);

  // Load Speech Voices
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    function loadVoices() {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
      const listToUse = englishVoices.length > 0 ? englishVoices : voices;
      setAvailableVoices(listToUse);

      setSelectedVoiceName((current) => {
        if (current && listToUse.some((v) => v.name === current)) return current;
        const preferred = listToUse.find(
          (v) =>
            v.name.includes("Natural") ||
            v.name.includes("Google US English") ||
            v.name.includes("Samantha") ||
            v.name.includes("Daniel") ||
            v.name.includes("Karen") ||
            v.name.includes("Victoria")
        );
        return preferred ? preferred.name : listToUse[0].name;
      });
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Pre-load Face-API models from local public/models
  useEffect(() => {
    let isMounted = true;
    async function initFaceApi() {
      if (faceApiLoaded || faceApiRef.current) return;
      try {
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceExpressionNet.loadFromUri("/models"),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri("/models"),
        ]);
        if (isMounted) {
          setFaceApiLoaded(true);
          console.log("[face-api] Models loaded successfully from /models ✓");
        }
      } catch (err) {
        console.warn("[face-api] Error loading models:", err);
      }
    }
    initFaceApi();
    return () => {
      isMounted = false;
    };
  }, [faceApiLoaded]);

  // Cleanup camera stream and intervals on unmount
  useEffect(() => {
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  // Clear silence countdown timers
  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  const clearTurnTranscript = useCallback(() => {
    baseInputRef.current = "";
    interimTranscriptRef.current = "";
    setInput("");
    setInterimText("");
  }, []);

  // Stop speech recognition
  const stopRecognition = useCallback(() => {
    clearSilenceTimers();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    baseInputRef.current = "";
    interimTranscriptRef.current = "";
    setRecognizing(false);
    setInterimText("");
    setInput("");
  }, [clearSilenceTimers]);

  // Stop AI speech synthesis
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      activeUtteranceRef.current = null;
    }
  }, []);

  // Send message to backend
  const sendMessage = useCallback(
    async (text: string, skipAnswer = false) => {
      if ((!text.trim() && !skipAnswer) || sessionCompleteRef.current || requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      stopSpeaking();
      stopRecognition();

      const currentMessages = messagesRef.current;
      const nextMessages: ChatMessage[] = text.trim()
        ? [...currentMessages, { role: "user", content: text.trim() }]
        : currentMessages;
      const turnNumber = interviewTurnsRef.current + 1;
      interviewTurnsRef.current = turnNumber;
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setInput("");
      setInterimText("");
      setLoading(true);

      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...extraBodyRef.current,
            history: nextMessages,
            skip_answer: skipAnswer,
            turn_number: turnNumber,
          }),
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const data = await res.json();
        const responseMessages = [...nextMessages, { role: "assistant" as const, content: data.reply }];
        messagesRef.current = responseMessages;
        setMessages(responseMessages);
        if (turnNumber >= 12) {
          sessionCompleteRef.current = true;
          setInterviewComplete(true);
        }
      } catch {
        const failedMessages: ChatMessage[] = [
          ...nextMessages,
          { role: "assistant", content: "Couldn't reach the backend. Is it running?" },
        ];
        messagesRef.current = failedMessages;
        setMessages(failedMessages);
      } finally {
        requestInFlightRef.current = false;
        clearTurnTranscript();
        setLoading(false);
      }
    },
    [apiUrl, clearTurnTranscript, stopRecognition, stopSpeaking]
  );

  // Speech Recognition start
  const startRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Safari, or Edge.");
      return;
    }

    stopSpeaking();
    clearSilenceTimers();

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      baseInputRef.current = "";
      interimTranscriptRef.current = "";
      setInput("");
      setInterimText("");

      const scheduleAutoTurn = (interim: string) => {
        if (!autoFlow) return;
        clearSilenceTimers();

        let remaining = 5;
        setSilenceCountdown(remaining);
        countdownIntervalRef.current = setInterval(() => {
          remaining -= 1;
          if (remaining > 0) setSilenceCountdown(remaining);
        }, 1000);

        silenceTimerRef.current = setTimeout(() => {
          clearSilenceTimers();
          const textToSend = (baseInputRef.current + " " + interimTranscriptRef.current).trim();
          if (textToSend) {
            sendMessage(textToSend);
          } else {
            sendMessage("", true);
          }
        }, 4500);
      };

      recognition.onstart = () => {
        setRecognizing(true);
        scheduleAutoTurn("");
      };

      recognition.onresult = (event: any) => {
        let finalChunk = "";
        let currentInterim = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const transcript = item[0].transcript;
          if (item.isFinal) {
            finalChunk += transcript + " ";
          } else {
            currentInterim += transcript;
          }
        }

        if (finalChunk) {
          baseInputRef.current += finalChunk;
          setInput(baseInputRef.current.trim());
        }
        setInterimText(currentInterim);
        interimTranscriptRef.current = currentInterim;

        const fullCurrentText = (baseInputRef.current + " " + currentInterim).trim();
        if (fullCurrentText) scheduleAutoTurn(currentInterim);
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition warning:", e.error);
        if (e.error === "not-allowed") {
          alert("Microphone permission was denied. Please allow microphone access.");
        }
        setRecognizing(false);
        setInterimText("");
        clearSilenceTimers();
      };

      recognition.onend = () => {
        setRecognizing(false);
        setInterimText("");
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      setRecognizing(false);
    }
  }, [autoFlow, clearSilenceTimers, input, sendMessage, stopSpeaking]);

  // Speak text with high quality settings and automated turn transition
  const speakText = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

      // Stop mic immediately when AI speaks
      stopRecognition();
      clearSilenceTimers();
      window.speechSynthesis.cancel();
      setIsSpeaking(false);

      const cleaned = cleanTextForSpeech(text);
      if (!cleaned) return;

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = "en-US";
      utterance.rate = speechRate;
      utterance.pitch = 1.0;

      if (selectedVoiceName && availableVoices.length > 0) {
        const found = availableVoices.find((v) => v.name === selectedVoiceName);
        if (found) utterance.voice = found;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        stopRecognition();
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        activeUtteranceRef.current = null;

        // Auto-turn mic activation when AI finishes
        if (autoFlow && !sessionCompleteRef.current) {
          setTimeout(() => {
            startRecognition();
          }, 450);
        }
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
        activeUtteranceRef.current = null;
      };

      activeUtteranceRef.current = utterance;
      (window as any).__chatVoiceUtterance = utterance;

      window.speechSynthesis.speak(utterance);
    },
    [autoFlow, availableVoices, clearSilenceTimers, selectedVoiceName, speechRate, startRecognition, stopRecognition]
  );

  // Auto-speak new assistant messages
  useEffect(() => {
    if (!autoSpeak || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "assistant") return;
    const messageKey = `${messages.length - 1}:${last.content}`;
    if (lastSpokenAssistantRef.current === messageKey) return;
    lastSpokenAssistantRef.current = messageKey;
    speakText(last.content);
  }, [messages, autoSpeak, speakText]);

  // ---- Real-time Face Recognition, Attention & Expression Loop ----
  useEffect(() => {
    if (!cameraActive || !faceApiLoaded || !faceApiRef.current) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      return;
    }

    const faceapi = faceApiRef.current;

    const runDetection = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const result = await faceapi
          .detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.25 })
          )
          .withFaceLandmarks(true)
          .withFaceExpressions();

        const metrics = visualMetricsRef.current;
        metrics.totalDetections += 1;

        if (!result) {
          // No face detected in frame
          setIsLookingAtScreen(false);
          setGazeStatus("No Face In Frame");

          if (!lookingAwayStartRef.current) {
            lookingAwayStartRef.current = Date.now();
          } else if (Date.now() - lookingAwayStartRef.current > 2200) {
            // Trigger Disqualification warning
            setActiveProctorAlert(
              "⚠️ PROCTOR WARNING: No face detected! Please position yourself directly in front of the screen or you risk disqualification."
            );
            metrics.warningCount += 1;
            setWarningStrikes((prev) => Math.min(prev + 1, 3));
          }
          return;
        }

        // Face is present: Analyze eye-gaze and head yaw orientation
        const positions = result.landmarks.positions;
        const nose = positions[30]; // nose tip
        const leftEyeInner = positions[39];
        const rightEyeInner = positions[42];

        const distLeft = Math.abs(nose.x - leftEyeInner.x);
        const distRight = Math.abs(rightEyeInner.x - nose.x);
        const yawRatio = distLeft / (distRight || 0.001);

        // When looking straight forward at screen, yawRatio is balanced (~0.45 to 2.2)
        const isLookingAway = yawRatio < 0.42 || yawRatio > 2.38;

        if (isLookingAway) {
          setIsLookingAtScreen(false);
          setGazeStatus("Looking Away");

          if (!lookingAwayStartRef.current) {
            lookingAwayStartRef.current = Date.now();
          } else if (Date.now() - lookingAwayStartRef.current > 2000) {
            setActiveProctorAlert(
              "⚠️ PROCTOR ALERT: Please look directly at the screen! Continued distraction or looking away will result in disqualification."
            );
            metrics.warningCount += 1;
            setWarningStrikes((prev) => Math.min(prev + 1, 3));
          }
        } else {
          // Candidate is actively looking at screen
          setIsLookingAtScreen(true);
          setGazeStatus("Direct Eye Contact");
          lookingAwayStartRef.current = null;
          setActiveProctorAlert(null);
          metrics.focusedDetections += 1;
        }

        // Facial Expression Analysis
        const expressions = result.expressions as Record<string, number>;
        const best = Object.entries(expressions).reduce((a, b) => (a[1] > b[1] ? a : b));
        const expKey = best[0];
        const confPct = Math.round(best[1] * 100);

        if (expKey === "happy") {
          setCurrentExpression({ label: "Confident & Smiling", emoji: "😊", confidence: confPct });
          metrics.expressions.smiling += 1;
        } else if (expKey === "surprised") {
          setCurrentExpression({ label: "Engaged & Inquisitive", emoji: "😮", confidence: confPct });
          metrics.expressions.engaged += 1;
        } else if (["sad", "fearful", "angry", "disgusted"].includes(expKey)) {
          setCurrentExpression({ label: "Tense / Stressed", emoji: "😟", confidence: confPct });
          metrics.expressions.tense += 1;
        } else {
          setCurrentExpression({ label: "Composed & Focused", emoji: "😐", confidence: confPct });
          metrics.expressions.composed += 1;
        }
      } catch {
        // silent frame drop
      }
    };

    detectionIntervalRef.current = setInterval(runDetection, 600);

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [cameraActive, faceApiLoaded]);

  // ---- Camera Feed Handlers (Default OFF) ----
  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError("Could not access camera. Please allow camera permissions in your browser.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setActiveProctorAlert(null);
    setIsLookingAtScreen(true);
    setGazeStatus("Ready");
  };

  // Re-attach video stream if camera active
  useEffect(() => {
    if (cameraActive && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraActive]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    clearSilenceTimers();
    sendMessage(input.trim());
  }

  const buildVoiceSuggestions = (scores: Record<string, number>, tips: string[]) => {
    const suggestions: string[] = [];

    if ((scores.confidence ?? 0) < 70) {
      suggestions.push("Use shorter, more decisive statements and avoid tentative phrases like 'I think' or 'maybe' to sound more confident.");
    }
    if ((scores.fluency ?? 0) < 70) {
      suggestions.push("Pause for a beat before key points and reduce filler words like 'um', 'uh', and 'like' for cleaner delivery.");
    }
    if ((scores.clarity ?? 0) < 70) {
      suggestions.push("State the main point in one sentence, then support it with one example or detail to improve clarity.");
    }
    if ((scores.structure ?? 0) < 70) {
      suggestions.push("Organize your answer in a simple structure: point, reason, and result so the interviewer can follow you easily.");
    }
    if ((scores.engagement ?? 0) < 70) {
      suggestions.push("Use stronger transitions and emphasize the outcome to keep the interviewer engaged from the first sentence onward.");
    }

    if (suggestions.length === 0) {
      suggestions.push("Your delivery is strong. Keep your pace steady and emphasize your strongest idea to stay memorable.");
    }

    return [...suggestions, ...tips].slice(0, 5);
  };

  const buildFacialSuggestions = (visualReport?: any) => {
    const items: string[] = [];

    if (!visualReport || visualReport.warningCount > 0) {
      items.push("Keep your eyes on the screen and minimize glances away from the camera during your response.");
    }
    if (visualReport?.topExpression === "Tense / Stressed" || visualReport?.topExpression === "Composed & Focused") {
      items.push("Relax your jaw and forehead so your facial expression matches calm confidence instead of tension.");
    }
    if (!visualReport || visualReport.eyeContactScore < 80) {
      items.push("Maintain a steady, outward-facing posture with brief pauses to appear more composed and in control.");
    }
    if (items.length === 0) {
      items.push("Your facial expression is currently balanced. Keep your expression warm and attentive to reinforce confidence.");
    }

    return items.slice(0, 3);
  };

  // Generate evaluation report with integrated Facial & Proctoring Analytics
  const generateReport = async () => {
    const userTexts = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join(" ");

    if (!userTexts) return;
    setReportLoading(true);

    try {
      const analysisRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: userTexts }),
      });
      if (!analysisRes.ok) throw new Error(`Report request failed: ${analysisRes.status}`);
      const data = await analysisRes.json();

      let interviewAssessment = null;
      try {
        const summaryRes = await fetch("/api/mock-interview/interview-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: messages,
            resume_context: extraBodyRef.current?.resume_context || "",
          }),
        });
        if (summaryRes.ok) {
          interviewAssessment = await summaryRes.json();
        }
      } catch (summaryError) {
        console.warn("Interview summary unavailable:", summaryError);
      }

      // Compile visual metrics from session
      const metrics = visualMetricsRef.current;
      const total = metrics.totalDetections || 1;
      const eyeContactScore = Math.min(100, Math.round((metrics.focusedDetections / total) * 100)) || (cameraActive ? 85 : 0);

      const expTotal =
        metrics.expressions.composed +
        metrics.expressions.smiling +
        metrics.expressions.engaged +
        metrics.expressions.tense || 1;

      const expressionBreakdown = [
        {
          name: "Composed & Focused",
          emoji: "😐",
          pct: Math.round((metrics.expressions.composed / expTotal) * 100) || 65,
        },
        {
          name: "Confident & Smiling",
          emoji: "😊",
          pct: Math.round((metrics.expressions.smiling / expTotal) * 100) || 25,
        },
        {
          name: "Engaged / Inquisitive",
          emoji: "😮",
          pct: Math.round((metrics.expressions.engaged / expTotal) * 100) || 7,
        },
        {
          name: "Tense / Stressed",
          emoji: "😟",
          pct: Math.round((metrics.expressions.tense / expTotal) * 100) || 3,
        },
      ];

      const topExp = expressionBreakdown.reduce((a, b) => (a.pct > b.pct ? a : b)).name;

      const visualReport = {
        eyeContactScore: cameraActive ? eyeContactScore : 90,
        warningCount: warningStrikes,
        disqualificationRisk: warningStrikes >= 3,
        topExpression: topExp,
        expressionBreakdown,
      };

      const scoreEntries = Object.entries(data.scores) as [string, number][];
      const strongestSkill = scoreEntries.reduce((best, current) => current[1] > best[1] ? current : best);
      const growthArea = scoreEntries.reduce((lowest, current) => current[1] < lowest[1] ? current : lowest);
      const overallFeedback = growthArea[1] >= 75
        ? `Strong interview delivery overall, especially your ${strongestSkill[0]}.`
        : `Your strongest area was ${strongestSkill[0]}; focus next on improving ${growthArea[0]}.`;

      setReport({
        scores: data.scores,
        tips: data.tips,
        pause_estimate_seconds: data.pause_estimate_seconds,
        visualReport,
        overallFeedback,
        interviewAssessment: interviewAssessment || undefined,
        voiceSuggestions: buildVoiceSuggestions(data.scores, data.tips),
        facialSuggestions: buildFacialSuggestions(visualReport),
      });
    } catch (e) {
      console.error(e);
      alert("Failed to generate report.");
    } finally {
      setReportLoading(false);
    }
  };

  generateReportRef.current = generateReport;

  useEffect(() => {
    if (interviewComplete && !reportTriggeredRef.current) {
      reportTriggeredRef.current = true;
      void generateReportRef.current();
    }
  }, [interviewComplete, messages]);

  const finishInterview = () => {
    if (requestInFlightRef.current || sessionCompleteRef.current) return;

    const finalAnswer =
      (baseInputRef.current + " " + interimTranscriptRef.current).trim() || input.trim();
    clearSilenceTimers();
    stopRecognition();
    stopSpeaking();
    setAutoFlow(false);

    if (finalAnswer) {
      const completedMessages = [
        ...messagesRef.current,
        { role: "user" as const, content: finalAnswer },
      ];
      messagesRef.current = completedMessages;
      setMessages(completedMessages);
    }

    sessionCompleteRef.current = true;
    setInterviewComplete(true);
  };

  return (
    <div className="flex flex-col h-[780px] w-full max-w-4xl mx-auto rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl">
      {/* Header with Title and Mode Controls */}
      <div className="bg-slate-900 px-6 py-3.5 flex items-center justify-between shadow-md z-10 text-white border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-sm shadow-inner">
            🎙️
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight text-white">{title}</h2>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className={`inline-block w-2 h-2 rounded-full ${autoFlow ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`}></span>
              <span>{autoFlow ? "Automated Hands-Free Mode" : "Manual Mode"}</span>
              {cameraActive && (
                <span className="text-emerald-400 font-semibold">• AI Proctor Active</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Hands-Free Auto Mode Toggle */}
          <button
            onClick={() => {
              clearSilenceTimers();
              setAutoFlow(!autoFlow);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition flex items-center gap-1.5 border ${
              autoFlow
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
            }`}
            title="When active, AI questions auto-close mic, and finishing speaking auto-opens mic and auto-submits answers"
          >
            <span>{autoFlow ? "⚡ Auto-Flow ON" : "✋ Auto-Flow OFF"}</span>
          </button>

          {/* Auto-Speak Toggle */}
          <button
            onClick={() => {
              if (autoSpeak) stopSpeaking();
              setAutoSpeak(!autoSpeak);
            }}
            className={`p-1.5 rounded-lg text-xs font-medium transition ${
              autoSpeak ? "bg-slate-800 hover:bg-slate-700 text-white" : "bg-rose-950 text-rose-300 border border-rose-800"
            }`}
            title={autoSpeak ? "AI Voice is ON" : "AI Voice Muted"}
          >
            {autoSpeak ? "🔊" : "🔇"}
          </button>

          {/* Voice Settings Dropdown */}
          <button
            onClick={() => setShowVoiceSettings(!showVoiceSettings)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium transition text-slate-300 hover:text-white"
            title="Voice Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Voice Settings Tray */}
      {showVoiceSettings && (
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-2.5 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="font-semibold text-slate-300">Voice:</span>
            <select
              value={selectedVoiceName}
              onChange={(e) => {
                setSelectedVoiceName(e.target.value);
                stopSpeaking();
              }}
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {availableVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-300">Speed:</span>
            {[0.85, 1.0, 1.15].map((rate) => (
              <button
                key={rate}
                onClick={() => setSpeechRate(rate)}
                className={`px-2 py-0.5 rounded text-xs transition ${
                  speechRate === rate ? "bg-indigo-600 text-white font-bold" : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <button
            onClick={() => speakText("Hello! The interview stage is ready.")}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium shadow-sm transition"
          >
            ▶️ Test Voice
          </button>
        </div>
      )}

      {/* Dual Live Stage: Interviewer Status & Candidate Webcam View */}
      <div className="bg-slate-950 p-4 border-b border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: AI Interviewer Persona Stage */}
          <div className="relative rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 p-4 flex flex-col justify-between h-48 shadow-inner overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">AI Interviewer</span>
              </div>

              {isSpeaking ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-full text-[11px] font-semibold animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
                  Speaking (Mic Muted)
                </div>
              ) : recognizing ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-full text-[11px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Listening To You
                </div>
              ) : loading ? (
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-500/20 border border-amber-400/30 text-amber-300 rounded-full text-[11px] font-semibold">
                  <span>⏳ Evaluating Answer...</span>
                </div>
              ) : (
                <div className="px-2.5 py-0.5 bg-slate-800 text-slate-400 rounded-full text-[11px]">
                  Ready
                </div>
              )}
            </div>

            {/* Speaking audio visualizer animation */}
            <div className="my-auto flex items-center justify-center gap-1 py-2">
              {isSpeaking ? (
                [1, 2, 3, 4, 5, 6, 7].map((bar) => (
                  <span
                    key={bar}
                    className="w-1.5 bg-indigo-400 rounded-full animate-bounce"
                    style={{
                      height: `${12 + (bar % 3) * 10}px`,
                      animationDuration: `${0.4 + (bar % 4) * 0.15}s`,
                    }}
                  />
                ))
              ) : recognizing ? (
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  <span>Microphone Active — Speak your response</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center italic max-w-xs">
                  {messages.length > 0
                    ? `"${messages[messages.length - 1].content.slice(0, 90)}..."`
                    : "Select a question or click start to begin the interview."}
                </p>
              )}
            </div>

            {/* AI bottom status */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/80">
              <span>{isSpeaking ? "Auto-turn will activate upon completion" : autoFlow ? "Hands-free duplex enabled" : "Manual trigger mode"}</span>
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="text-rose-400 hover:text-rose-300 font-semibold transition"
                >
                  ⏹ Interrupt AI
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Candidate Live Camera Preview & Real-Time AI Proctor */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-900 h-48 shadow-inner overflow-hidden flex flex-col justify-center items-center">
            {/* Live Camera View */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${cameraActive ? "block" : "hidden"}`}
            />

            {/* Active Proctor Overlay HUD */}
            {cameraActive && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 bg-gradient-to-t from-black/70 via-transparent to-black/60">
                {/* Top status bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[10px] font-semibold text-rose-400 border border-rose-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>LIVE</span>
                    </div>

                    {/* Eye Contact / Gaze Badge */}
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 backdrop-blur-md rounded text-[10px] font-semibold border ${
                        isLookingAtScreen
                          ? "bg-emerald-950/80 text-emerald-300 border-emerald-500/40"
                          : "bg-rose-950/90 text-rose-300 border-rose-500/60 animate-pulse"
                      }`}
                    >
                      <span>{isLookingAtScreen ? "👁️ On Screen" : "⚠️ Looking Away"}</span>
                    </div>

                    {/* Warning Strikes counter */}
                    {warningStrikes > 0 && (
                      <div className="px-2 py-0.5 bg-amber-950/90 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold">
                        Strikes: {warningStrikes}/3
                      </div>
                    )}
                  </div>

                  <button
                    onClick={stopCamera}
                    className="pointer-events-auto px-2 py-0.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-slate-300 hover:text-white rounded text-[10px] font-medium transition border border-white/10"
                    title="Turn Off Camera"
                  >
                    ✕ Turn Off
                  </button>
                </div>

                {/* Bottom status bar: Face expression & candidate label */}
                <div className="flex items-center justify-between text-[11px] text-white/90">
                  <div className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] border border-white/10 flex items-center gap-1">
                    <span>{currentExpression.emoji}</span>
                    <span className="font-medium text-slate-200">{currentExpression.label}</span>
                    {currentExpression.confidence > 0 && (
                      <span className="text-slate-400">({currentExpression.confidence}%)</span>
                    )}
                  </div>

                  <div className="bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] border border-white/10 text-slate-300">
                    Candidate: You
                  </div>
                </div>
              </div>
            )}

            {/* Fallback View if camera is OFF (Default State) */}
            {!cameraActive && (
              <div className="p-4 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400 mb-2 shadow-inner">
                  📷
                </div>
                <div className="text-xs font-semibold text-slate-300 mb-1">Self-View & Proctor Camera Off</div>
                <p className="text-[11px] text-slate-500 mb-2 max-w-[220px]">
                  Turn on camera to enable self-view and real-time gaze/expression proctoring.
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow-md flex items-center gap-1.5"
                >
                  <span>📷</span>
                  <span>Turn On Camera</span>
                </button>
                {cameraError && (
                  <p className="text-[11px] text-rose-400 mt-2 font-medium">{cameraError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Real-Time Disqualification / Looking-Away Warning Banner */}
        {activeProctorAlert && (
          <div className="mt-3 px-4 py-2.5 bg-rose-950 border-2 border-rose-500/80 rounded-xl flex items-center justify-between text-xs text-rose-100 shadow-2xl animate-bounce">
            <div className="flex items-center gap-2">
              <span className="text-base">🚨</span>
              <span className="font-semibold leading-snug">{activeProctorAlert}</span>
            </div>
            <div className="px-2 py-0.5 bg-rose-800 text-white rounded font-extrabold text-[10px] tracking-wider uppercase">
              {warningStrikes >= 3 ? "DISQUALIFICATION RISK" : "ATTENTION REQUIRED"}
            </div>
          </div>
        )}

        {/* Automated silence countdown alert */}
        {silenceCountdown !== null && (
          <div className="mt-3 px-4 py-2 bg-indigo-950/80 border border-indigo-500/40 rounded-xl flex items-center justify-between text-xs text-indigo-200 animate-fade-in shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
                <span>
                Continuing in{" "}
                <strong className="text-white text-sm underline">{silenceCountdown}s</strong>...
                {baseInputRef.current || interimText ? " Your answer will be evaluated." : " If you stay silent, the interviewer will move to another topic."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => clearSilenceTimers()}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs transition"
              >
                Keep Talking
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50">
        {messages.length === 0 && starterPrompt && (
          <div className="flex justify-center mt-6">
            <p className="bg-indigo-50 text-indigo-900 px-5 py-2.5 rounded-full text-xs font-semibold shadow-sm border border-indigo-200 flex items-center gap-2">
              <span>💡</span>
              <span>{starterPrompt}</span>
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`group relative max-w-[84%] rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm"
              }`}
            >
              <div className="whitespace-pre-line">{m.content}</div>

              {/* Re-play audio button on assistant messages */}
              {m.role === "assistant" && (
                <div className="mt-2.5 flex items-center gap-3 pt-1.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => speakText(m.content)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition py-0.5"
                    title="Read this message aloud"
                  >
                    <span>🔊</span> Listen
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm text-sm leading-relaxed bg-white text-slate-800 border border-slate-200 rounded-bl-sm flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-bounce"></span>
              <span
                className="flex h-2 w-2 rounded-full bg-indigo-500 animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></span>
              <span
                className="flex h-2 w-2 rounded-full bg-indigo-500 animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></span>
              <span className="text-xs text-slate-400 ml-1">Interviewer is formulating next response...</span>
            </div>
          </div>
        )}

        {/* Live speech transcription feedback */}
        {recognizing && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs shadow-sm flex items-center gap-2 animate-pulse">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="font-bold text-emerald-700">Listening to you:</span>
              <span className="italic">{interimText || "Speak clearly into your microphone..."}</span>
            </div>
          </div>
        )}
      </div>

      {/* Input & Voice Controls Footer */}
      <div className="p-4 bg-white border-t border-slate-200 flex flex-col gap-3">
        {/* Upper toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Voice Input Button */}
            <button
              type="button"
              onClick={recognizing ? stopRecognition : startRecognition}
              disabled={loading || isSpeaking}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition shadow-sm ${
                recognizing
                  ? "bg-rose-600 text-white hover:bg-rose-700 animate-pulse"
                  : isSpeaking
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
              title={isSpeaking ? "Microphone paused while AI is speaking" : recognizing ? "Click to finish speaking" : "Click to speak your answer"}
            >
              <span>{recognizing ? "⏹" : "🎙"}</span>
              <span>{recognizing ? "Finish Speaking" : isSpeaking ? "Mic Paused (AI Talking)" : "Voice Input"}</span>
            </button>

            {/* Quick camera switch */}
            <button
              type="button"
              onClick={cameraActive ? stopCamera : startCamera}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1 border ${
                cameraActive
                  ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>📷</span>
              <span>{cameraActive ? "Turn Off Camera" : "Turn On Camera"}</span>
            </button>

            <button
              type="button"
              onClick={finishInterview}
              disabled={loading || interviewComplete}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1 border bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed"
              title="End the interview and generate your report"
            >
              <span>⏹</span>
              <span>{interviewComplete ? "Interview Finished" : "Finish Interview"}</span>
            </button>
          </div>

          {/* Performance Report */}
          <button
            type="button"
            onClick={generateReport}
            disabled={reportLoading || messages.filter((m) => m.role === "user").length === 0}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-full text-xs shadow-sm transition flex items-center gap-1"
          >
            <span>📊</span>
            <span>{reportLoading ? "Analyzing..." : "Get Performance Feedback"}</span>
          </button>
        </div>

        {/* Text input form with Auto-Flow indicators */}
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            value={input}
            onChange={(e) => {
              clearSilenceTimers();
              setInput(e.target.value);
            }}
            placeholder={
              isSpeaking
                ? "Interviewer is speaking... (Mic will automatically open when finished)"
                : recognizing
                ? "Listening... your answer is evaluated after 4.5 seconds of silence"
                  : "Speak your answer; it will be handled automatically…"
            }
            disabled={loading}
            className="w-full bg-slate-100 border border-slate-200 text-slate-900 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner disabled:opacity-60 text-xs sm:text-sm"
          />
        </form>
      </div>

      {/* Comprehensive Performance Evaluation & Facial Proctoring Report Panel */}
      {report && (
        <div className="p-5 bg-slate-50 border-t border-slate-200 max-h-72 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>📈</span> Comprehensive Interview Performance & Proctoring Report
            </h3>
            <button
              onClick={() => setReport(null)}
              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕ Close
            </button>
          </div>

          {/* Speech Scores Grid */}
          <div>
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-1">Session feedback</div>
              <p className="text-xs text-emerald-950">{report.overallFeedback}</p>
              <p className="mt-1 text-xs text-emerald-900"><strong>Next step:</strong> {report.tips[0]}</p>
            </div>

            {report.interviewAssessment && (
              <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-800">Interview verdict</div>
                  <div className="rounded-full bg-indigo-600 text-white px-2.5 py-0.5 text-[11px] font-bold">
                    {report.interviewAssessment.overall_score}/100
                  </div>
                </div>
                <p className="text-xs text-indigo-950 font-semibold">{report.interviewAssessment.verdict}</p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 mb-1">Strengths</div>
                    <ul className="text-[11px] text-indigo-900 list-disc pl-4 space-y-1">
                      {(report.interviewAssessment.strengths || []).map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 mb-1">Gaps</div>
                    <ul className="text-[11px] text-indigo-900 list-disc pl-4 space-y-1">
                      {(report.interviewAssessment.gaps || []).map((item, idx) => <li key={idx}>{item}</li>)}
                    </ul>
                  </div>
                </div>
                {report.interviewAssessment.answer_assessments?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 mb-1">Answer-by-answer check</div>
                    <div className="space-y-2">
                      {report.interviewAssessment.answer_assessments.map((item, idx) => (
                        <div key={idx} className="rounded-lg border border-indigo-200 bg-white p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] font-semibold text-slate-700">Q{idx + 1}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.status === "Strong" ? "bg-emerald-100 text-emerald-700" :
                              item.status === "Needs improvement" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{item.status}</span>
                          </div>
                          <div className="text-[11px] text-slate-700 mt-1 font-medium">{item.question}</div>
                          <div className="text-[11px] text-slate-600 mt-1">{item.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              🎙️ Speech & Content Delivery
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {Object.entries(report.scores).map(([k, v]) => (
                <div key={k} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{k}</div>
                  <div className="text-base font-extrabold text-indigo-600">{String(v)}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Facial Expression & Gaze Proctoring Section */}
          {report.visualReport && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>👁️</span> Facial Expression & Eye-Contact Proctoring
                </div>

                <div
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    report.visualReport.disqualificationRisk
                      ? "bg-rose-100 text-rose-700 border border-rose-300"
                      : report.visualReport.warningCount > 0
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  }`}
                >
                  {report.visualReport.disqualificationRisk
                    ? "🚨 Disqualification Risk"
                    : report.visualReport.warningCount > 0
                    ? `⚠️ ${report.visualReport.warningCount} Warning(s) Issued`
                    : "✅ Proctor Compliant"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Screen Attention Rate</div>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                    {report.visualReport.eyeContactScore}%
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {report.visualReport.eyeContactScore >= 80
                      ? "Maintained consistent eye contact with the screen."
                      : "Looked away frequently during responses."}
                  </p>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Primary Demeanor</div>
                  <div className="text-base font-bold text-slate-900 mt-1 flex items-center gap-1">
                    <span>{currentExpression.emoji}</span>
                    <span>{report.visualReport.topExpression}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Reflects your overall confidence & composure.</p>
                </div>

                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase">Proctor Warnings</div>
                  <div
                    className={`text-xl font-extrabold mt-0.5 ${
                      report.visualReport.warningCount > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {report.visualReport.warningCount} Strikes
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {report.visualReport.warningCount === 0
                      ? "Zero proctor distractions recorded."
                      : "Remember to keep your eyes fixed on screen."}
                  </p>
                </div>
              </div>

              {/* Expression distribution breakdown */}
              <div>
                <div className="text-[11px] font-bold text-slate-700 mb-1.5">Facial Expression Breakdown:</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {report.visualReport.expressionBreakdown.map((item) => (
                    <div key={item.name} className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-center">
                      <div className="text-sm">{item.emoji}</div>
                      <div className="text-[10px] text-slate-600 font-medium truncate">{item.name}</div>
                      <div className="text-xs font-bold text-indigo-600">{item.pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 mb-2">Voice suggestions</div>
              <ul className="space-y-2 text-xs text-emerald-900 leading-relaxed">
                {(report.voiceSuggestions ?? buildVoiceSuggestions(report.scores, report.tips)).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-800 mb-2">Facial expression suggestions</div>
              <ul className="space-y-2 text-xs text-amber-900 leading-relaxed">
                {(report.facialSuggestions ?? buildFacialSuggestions(report.visualReport)).map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Coach Tips */}
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Key Coach Feedback:</div>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-700">
              {report.tips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
              {report.visualReport && report.visualReport.warningCount > 0 && (
                <li className="text-rose-700 font-medium">
                  Eye contact notice: Avoid looking away toward secondary monitors or notes to ensure proctor compliance.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
