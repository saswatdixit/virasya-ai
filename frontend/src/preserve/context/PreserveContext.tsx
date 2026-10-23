import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  PreserveState,
  StoryForm,
  AudioItem,
  VocabularyEntry,
  TranscriptDraftSnapshot,
  ModelTranscript,
} from "../types";
import {
  INITIAL_SAMPLE_STORY,
  INITIAL_SAMPLE_VOCAB,
  DEMO_TRANSCRIPTS,
  STEP_DEFINITIONS,
  STORAGE_KEY,
} from "../types";

import {
  uid,
  getClock,
  punctItems,
} from "../utils";
import {
  saveStoryToBackend,
  preserveStoryOnBackend,
  transcribeAudioOnBackend,
  fetchModelStatus,
  isBackendConfigured,
} from "../api";
import { useAuth } from "../../auth";
import {
  preserveStoryToSupabase,
  isSupabaseConfigured,
} from "../../supabase";

const INITIAL_STATE: PreserveState = {
  stage: 1,
  completed: {},
  skipped: {},
  form: {
    title: "",
    carrier: "",
    category: "",
    place: "",
    language: "Hindi",
    period: "",
    relationship: "",
    story: "",
    email: "",
  },
  audio: null,
  tx: {
    forAudio: "",
    gnani: { status: "idle", p: 0, text: "", model: "Gnani Prisma STT v2.5", provider: "Gnani.ai" },
    vaani: { status: "idle", p: 0, text: "" },
    conformer: { status: "idle", p: 0, text: "" },
  },
  enh: {
    status: "idle",
    base: "vaani",
    decisions: {},
  },
  ed: {
    text: "",
    loadedFrom: null,
    baseText: "",
    drafts: [],
    notice: "",
    undoStack: [],
  },
  vocab: [],
  punct: {
    status: "idle",
    decisions: {},
    manual: null,
    done: false,
  },
  final: {
    visibility: "public",
    confirmed: false,
    permissionConfirmed: false,
    isPreserved: false,
  },
};

interface SimControls {
  scenario: "success" | "fail-conformer" | "slow-vaani";
  speed: "normal" | "instant";
}

interface PreserveContextType {
  state: PreserveState;
  sim: SimControls;
  savedAt: string | null;
  resumeDraft: PreserveState | null;
  leaveModalOpen: boolean;
  dockOpen: boolean;
  isTranscribing: boolean;
  transcriptionPhase: "idle" | "checking" | "warming" | "transcribing" | "error" | "done";
  transcriptionError: string | null;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  isLanguageConfirmed: boolean;
  setIsLanguageConfirmed: (confirmed: boolean) => void;
  clearTranscriptionError: () => void;
  retryTranscription: () => Promise<void>;
  setLeaveModalOpen: (open: boolean) => void;
  setDockOpen: (open: boolean) => void;
  setSim: Dispatch<SetStateAction<SimControls>>;
  goToStep: (stepNumber: number) => void;
  updateForm: (field: keyof StoryForm, value: string) => void;
  fillSampleStory: () => void;
  setAudio: (audio: AudioItem | null) => void;
  startTranscription: () => Promise<void>;
  executeTranscription: (langOrModel?: string) => Promise<{
    success: boolean;
    gnaniDone?: boolean;
    vaaniDone: boolean;
    conformerDone: boolean;
    error?: string;
  }>;
  continueWithWrittenOnly: () => void;
  loadSampleTranscript: () => void;
  retryModel: (model: "vaani" | "conformer" | "gnani") => void;
  setEnhDecision: (id: string, decision: "accepted" | "rejected" | undefined) => void;
  acceptAllLowRiskEnh: () => void;
  setEnhBase: (base: "vaani" | "conformer") => void;
  triggerEnhancement: () => void;
  loadSourceIntoEditor: (source: "gnani" | "vaani" | "conformer" | "enhanced" | "written") => void;
  updateWorkingText: (text: string) => void;
  restoreSnapshot: (snap: TranscriptDraftSnapshot) => void;
  undoWorkingText: () => void;
  addVocabEntry: (entry: Omit<VocabularyEntry, "id">) => void;
  updateVocabEntry: (id: string, entry: Partial<VocabularyEntry>) => void;
  removeVocabEntry: (id: string) => void;
  setPunctDecision: (id: string, decision: "accepted" | "rejected" | undefined) => void;
  acceptAllPunct: () => void;
  rejectAllPunct: () => void;
  setManualPunct: (
    text: string | null,
    extra?: {
      isModelPunctuated?: boolean;
      modelSuggestion?: string | null;
      unpunctuatedDraft?: string | null;
    }
  ) => void;
  triggerPunctuation: () => void;
  setVisibility: (v: "private" | "family" | "community" | "public") => void;
  setFinalConfirmed: (val: boolean) => void;
  setPermissionConfirmed: (val: boolean) => void;
  preserveStoryAction: () => void;
  resetAll: () => void;
  resumeFromSaved: () => void;
  dismissResume: () => void;
}

const PreserveContext = createContext<PreserveContextType | null>(null);

export function PreserveProvider({ children }: { children: ReactNode }) {
  const { user, profile, openAuthModal } = useAuth();
  const [state, setState] = useState<PreserveState>(() => {
    // Determine initial stage based on URL if possible
    const path = window.location.pathname.replace(/\/+$/, "") || "/preserve-your-story";
    const found = STEP_DEFINITIONS.find((s) => s.route === path);
    return {
      ...INITIAL_STATE,
      stage: found ? found.step : 1,
    };
  });

  const [sim, setSim] = useState<SimControls>({
    scenario: "success",
    speed: "normal",
  });
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<PreserveState | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const simRef = useRef(sim);
  useEffect(() => {
    simRef.current = sim;
  }, [sim]);

  // Check localStorage for previous draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.form && (d.form.title || d.form.story || d.stage > 1)) {
          setResumeDraft(d);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Sync route on popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.replace(/\/+$/, "");
      const found = STEP_DEFINITIONS.find((s) => s.route === path);
      if (found) {
        setState((s) => ({ ...s, stage: found.step }));
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Save draft to localStorage debounced
  useEffect(() => {
    if (resumeDraft) return; // don't overwrite if waiting to resume
    const timer = setTimeout(() => {
      try {
        const safeAudio = state.audio
          ? state.audio.kind === "demo"
            ? state.audio
            : {
                kind: "lost",
                name: state.audio.name,
                size: state.audio.size,
                duration: state.audio.duration,
                url: null,
              }
          : null;
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...state, audio: safeAudio })
        );
        setSavedAt(getClock());
      } catch {
        // Ignore quota errors
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [state, resumeDraft]);



  // Navigation action
  const goToStep = useCallback((stepNumber: number) => {
    const target = STEP_DEFINITIONS.find((s) => s.step === stepNumber);
    if (target) {
      if (window.location.pathname !== target.route) {
        window.history.pushState(null, "", target.route);
      }
      setState((s) => {
        const nextState = {
          ...s,
          stage: stepNumber,
          completed: {
            ...s.completed,
            [s.stage]: true,
          },
        };

        // Asynchronously persist draft to virasya-ai local repository
        if (s.form.title || s.form.story) {
          const storyId = s.storyId || `story_${Date.now()}`;
          saveStoryToBackend({
            id: storyId,
            title: s.form.title,
            carrier: s.form.carrier,
            category: s.form.category,
            roots: s.form.place,
            language: s.form.language,
            period: s.form.period,
            relationship: s.form.relationship,
            email: s.form.email,
            writtenText: s.form.story,
            audio: s.audio
              ? {
                  filename: s.audio.name,
                  url: s.audio.url || undefined,
                  size: s.audio.size,
                  duration: s.audio.duration,
                  kind: s.audio.kind,
                }
              : null,
            workingDraft: s.punct.manual || s.ed.text || s.form.story,
            vocabulary: s.vocab,
            status: "draft",
          })
            .then((res) => {
              if (res && res.story && res.story.id) {
                setState((prev) => ({ ...prev, storyId: res.story.id }));
              }
            })
            .catch(() => {});
        }

        return nextState;
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const updateForm = useCallback((field: keyof StoryForm, value: string) => {
    setState((s) => ({
      ...s,
      form: { ...s.form, [field]: value },
    }));
  }, []);

  const fillSampleStory = useCallback(() => {
    setState((s) => ({
      ...s,
      form: { ...INITIAL_SAMPLE_STORY },
    }));
  }, []);

  const [transcriptionPhase, setTranscriptionPhase] = useState<
    "idle" | "checking" | "warming" | "transcribing" | "error" | "done"
  >("idle");
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");
  const [isLanguageConfirmed, setIsLanguageConfirmed] = useState<boolean>(false);

  const clearTranscriptionError = useCallback(() => {
    setTranscriptionError(null);
  }, []);

  const setAudio = useCallback((audio: AudioItem | null) => {
    setTranscriptionError(null);
    setTranscriptionPhase("idle");
    setIsLanguageConfirmed(false); // Revalidate/reset language confirmation when recording changes
    setState((s) => {
      if (s.audio && s.audio.url && audio && audio.url !== s.audio.url) {
        try {
          URL.revokeObjectURL(s.audio.url);
        } catch {}
      }
      return { ...s, audio };
    });
  }, []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const transcribingRef = useRef<{ vaani: boolean; conformer: boolean }>({
    vaani: false,
    conformer: false,
  });

  const executeTranscription = useCallback(
    async (lang: string = selectedLanguage) => {
      // In-flight guard: prevent concurrent requests thrashing the backend
      if (transcribingRef.current.vaani || transcribingRef.current.conformer) {
        return { success: false, vaaniDone: false, conformerDone: false, error: "Transcription already in progress" };
      }

      // Synchronously resolve current audio from state reference
      const currentAudio = stateRef.current.audio;
      const audioName = currentAudio ? currentAudio.name : "";
      if (!audioName) {
        const noAudioMsg = "No audio file found to transcribe. Please upload or record an audio file.";
        setTranscriptionError(noAudioMsg);
        return { success: false, vaaniDone: false, conformerDone: false, error: noAudioMsg };
      }

      transcribingRef.current.vaani = true;
      transcribingRef.current.conformer = true;

      // Set clean in-flight state without displaying false error
      setState((s) => ({
        ...s,
        tx: {
          ...s.tx,
          forAudio: audioName,
          gnani: { ...s.tx.gnani, status: "processing", p: 45, error: null },
          vaani: { ...s.tx.vaani, status: "processing", p: 45, error: null },
          conformer: { ...s.tx.conformer, status: "idle", p: 0, error: null },
        },
      }));

      try {
        const res = await transcribeAudioOnBackend(audioName, lang, stateRef.current.storyId);

        const gResult = res.results?.gnani || res.results?.vaani;
        const transcriptText = (
          res.transcript ||
          res.raw_text ||
          res.gnani ||
          res.vaani ||
          gResult?.text ||
          ""
        ).trim();

        const isSuccess = Boolean(transcriptText) || gResult?.status === "done";
        const errorMsg = gResult?.error || (isSuccess ? null : "Speech recognition returned empty transcript.");

        const modelItem: ModelTranscript = {
          status: isSuccess ? "done" : "error",
          p: isSuccess ? 100 : 0,
          text: transcriptText,
          model: gResult?.model || res.model || "Gnani Prisma STT v2.5",
          provider: gResult?.provider || res.provider || "Gnani Prisma",
          language: res.language || lang,
          requestedLanguage: res.requested_language || (lang.startsWith("hi") ? "Hindi" : lang),
          providerLanguage: res.provider_language || "hi",
          inferenceSeconds: gResult?.inference_seconds || res.inference_seconds,
          durationSeconds: gResult?.duration_seconds,
          error: errorMsg,
        };

        setState((s) => {
          const nextTx = {
            ...s.tx,
            forAudio: audioName,
            gnani: modelItem,
            vaani: modelItem,
            conformer: { status: "idle" as const, p: 0, text: "", error: null },
          };

          // If working editor has no text yet, initialize with Gnani transcript
          let nextEd = s.ed;
          if (!s.ed.text || s.ed.loadedFrom === "gnani" || s.ed.loadedFrom === "vaani") {
            const initialText = transcriptText || s.form.story || "";
            const initialSource = transcriptText ? ("gnani" as const) : s.form.story ? ("written" as const) : null;
            if (initialText) {
              nextEd = {
                ...s.ed,
                text: initialText,
                baseText: initialText,
                loadedFrom: initialSource,
                undoStack: [initialText],
              };
            }
          }

          return {
            ...s,
            tx: nextTx,
            ed: nextEd,
          };
        });

        return {
          success: isSuccess,
          gnaniDone: isSuccess,
          vaaniDone: isSuccess,
          conformerDone: false,
          error: isSuccess ? undefined : (errorMsg || "ASR transcription failed."),
        };
      } catch (err: any) {
        const errorMsg = err.message || "Failed to run transcription.";
        setState((s) => ({
          ...s,
          tx: {
            ...s.tx,
            forAudio: audioName,
            gnani: {
              status: "error",
              p: 0,
              text: "",
              error: errorMsg,
            },
            vaani: {
              ...s.tx.vaani,
              status: "error",
              p: 0,
              error: errorMsg,
            },
            conformer: s.tx.conformer,
          },
        }));
        return {
          success: false,
          gnaniDone: false,
          vaaniDone: false,
          conformerDone: false,
          error: errorMsg,
        };
      } finally {
        transcribingRef.current.vaani = false;
        transcribingRef.current.conformer = false;
      }
    },
    [selectedLanguage]
  );

  const startTranscription = useCallback(async () => {
    if (
      transcriptionPhase === "checking" ||
      transcriptionPhase === "warming" ||
      transcriptionPhase === "transcribing"
    ) {
      return; // prevent duplicate clicks
    }
    const currentAudio = stateRef.current.audio;
    if (!currentAudio) {
      setTranscriptionError("Please upload or record an audio file before proceeding.");
      return;
    }

    if (!isLanguageConfirmed) {
      setTranscriptionError("Please confirm the audio recording language (Hindi) before transcribing.");
      return;
    }

    setTranscriptionError(null);

    // If backend is not configured (e.g. static preview deployment), provide immediate helpful guidance
    if (!isBackendConfigured()) {
      setTranscriptionPhase("idle");
      setTranscriptionError(
        "Speech recognition models require the Virasya AI backend. You can load a sample transcript below to preview the review workflow, or continue with your written story."
      );
      return;
    }

    setTranscriptionPhase("checking");

    // Check if backend models are currently cold-starting / loading
    try {
      const statusRes = await fetchModelStatus();
      if (
        statusRes.gnani?.status === "loading" ||
        statusRes.vaani.status === "loading" ||
        statusRes.indicconformer.status === "loading" ||
        statusRes.busy
      ) {
        setTranscriptionPhase("warming");
      } else {
        setTranscriptionPhase("transcribing");
      }
    } catch {
      setTranscriptionPhase("transcribing");
    }

    try {
      const res = await executeTranscription(selectedLanguage);

      if (res.success) {
        setTranscriptionPhase("done");
        setTranscriptionError(null);
        goToStep(3); // Navigate to Review only upon success
      } else {
        setTranscriptionPhase("error");
        setTranscriptionError(
          res.error ||
            "Speech recognition models encountered an error. Your audio file is kept safe below so you can retry."
        );
        // Keep user on Step 2 with their audio selected
      }
    } catch (unexpectedErr: any) {
      setTranscriptionPhase("error");
      setTranscriptionError(
        unexpectedErr?.message || "An unexpected error occurred during transcription. Please try again."
      );
    }
  }, [transcriptionPhase, isLanguageConfirmed, selectedLanguage, executeTranscription, goToStep]);

  const retryTranscription = useCallback(async () => {
    await startTranscription();
  }, [startTranscription]);

  const loadSampleTranscript = useCallback(() => {
    const sampleItem: ModelTranscript = {
      status: "done",
      p: 100,
      text: DEMO_TRANSCRIPTS.vaani,
      model: "Gnani Prisma STT v2.5 (Sample)",
      provider: "Gnani Prisma (Demo Content)",
      inferenceSeconds: 1.82,
      durationSeconds: 47.59,
      error: null,
    };
    setState((s) => ({
      ...s,
      isSampleTranscript: true,
      completed: { ...s.completed, 2: true },
      tx: {
        forAudio: s.audio?.name || "sample_recording_odia.ogg",
        gnani: sampleItem,
        vaani: sampleItem,
        conformer: {
          status: "idle",
          p: 0,
          text: "",
          error: null,
        },
      },
      ed: {
        ...s.ed,
        text: DEMO_TRANSCRIPTS.vaani,
        baseText: DEMO_TRANSCRIPTS.vaani,
        loadedFrom: "gnani",
        notice: "Loaded sample Odia transcript (demo mode).",
      },
      vocab: s.vocab.length > 0 ? s.vocab : INITIAL_SAMPLE_VOCAB,
    }));
    setTranscriptionPhase("done");
    setTranscriptionError(null);
    goToStep(3);
  }, [goToStep]);

  const continueWithWrittenOnly = useCallback(() => {
    setState((s) => ({
      ...s,
      skipped: { ...s.skipped, 2: true },
      ed: s.ed.text
        ? s.ed
        : {
            ...s.ed,
            text: s.form.story,
            baseText: s.form.story,
            loadedFrom: "written",
          },
    }));
    goToStep(3);
  }, [goToStep]);

  const retryModel = useCallback(
    (model: "vaani" | "conformer" | "gnani" = "gnani") => {
      executeTranscription(model);
    },
    [executeTranscription]
  );

  const setEnhDecision = useCallback(
    (id: string, decision: "accepted" | "rejected" | undefined) => {
      setState((s) => {
        const next = { ...s.enh.decisions };
        if (decision) next[id] = decision;
        else delete next[id];
        return {
          ...s,
          enh: { ...s.enh, decisions: next },
        };
      });
    },
    []
  );

  const acceptAllLowRiskEnh = useCallback(() => {
    // AI enhancement intentionally disabled for this phase
  }, []);

  const setEnhBase = useCallback((base: "vaani" | "conformer") => {
    setState((s) => ({
      ...s,
      enh: { ...s.enh, base, decisions: {} },
    }));
  }, []);

  const triggerEnhancement = useCallback(() => {
    // AI enhancement intentionally disabled for this phase
  }, []);

  const loadSourceIntoEditor = useCallback(
    (source: "gnani" | "vaani" | "conformer" | "enhanced" | "written") => {
      setState((s) => {
        let textToLoad = "";
        if (source === "gnani") textToLoad = s.tx.gnani?.text || s.tx.vaani.text || "";
        else if (source === "vaani") textToLoad = s.tx.vaani.text || s.tx.gnani?.text || "";
        else if (source === "conformer") textToLoad = s.tx.conformer.text || "";
        else if (source === "written") textToLoad = s.form.story || "";
        else if (source === "enhanced") textToLoad = s.tx.gnani?.text || s.tx.vaani.text || s.form.story || "";

        const isDirty = s.ed.text && s.ed.text !== s.ed.baseText;
        const newDrafts = isDirty
          ? [
              {
                id: uid(),
                label: `Edits before loading ${source}`,
                text: s.ed.text,
                at: getClock(),
              },
              ...s.ed.drafts,
            ]
          : s.ed.drafts;

        return {
          ...s,
          ed: {
            text: textToLoad,
            baseText: textToLoad,
            loadedFrom: source,
            drafts: newDrafts,
            notice: isDirty
              ? "Your earlier edits were preserved under 'Earlier drafts'."
              : "",
            undoStack: [textToLoad],
          },
        };
      });
    },
    []
  );

  const updateWorkingText = useCallback((text: string) => {
    setState((s) => ({
      ...s,
      ed: {
        ...s.ed,
        text,
        notice: "",
        undoStack: [...s.ed.undoStack.slice(-15), text],
      },
    }));
  }, []);

  const undoWorkingText = useCallback(() => {
    setState((s) => {
      if (s.ed.undoStack.length < 2) return s;
      const newStack = [...s.ed.undoStack];
      newStack.pop(); // remove current
      const prev = newStack[newStack.length - 1];
      return {
        ...s,
        ed: {
          ...s.ed,
          text: prev,
          undoStack: newStack,
        },
      };
    });
  }, []);

  const restoreSnapshot = useCallback((snap: TranscriptDraftSnapshot) => {
    setState((s) => ({
      ...s,
      ed: {
        ...s.ed,
        text: snap.text,
        baseText: snap.text,
        loadedFrom: "draft",
        notice: `Restored snapshot from ${snap.at}.`,
      },
    }));
  }, []);

  const addVocabEntry = useCallback((entry: Omit<VocabularyEntry, "id">) => {
    setState((s) => ({
      ...s,
      vocab: [...s.vocab, { ...entry, id: uid(), isSample: false }],
    }));
  }, []);

  const updateVocabEntry = useCallback(
    (id: string, entry: Partial<VocabularyEntry>) => {
      setState((s) => ({
        ...s,
        vocab: s.vocab.map((v) => (v.id === id ? { ...v, ...entry } : v)),
      }));
    },
    []
  );

  const removeVocabEntry = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      vocab: s.vocab.filter((v) => v.id !== id),
    }));
  }, []);

  const setPunctDecision = useCallback(
    (id: string, decision: "accepted" | "rejected" | undefined) => {
      setState((s) => {
        const next = { ...s.punct.decisions };
        if (decision) next[id] = decision;
        else delete next[id];
        return {
          ...s,
          punct: { ...s.punct, decisions: next },
        };
      });
    },
    []
  );

  const acceptAllPunct = useCallback(() => {
    setState((s) => {
      const items = punctItems(s.ed.text || s.form.story || "");
      const dec: Record<string, "accepted"> = {};
      items.forEach((it) => (dec[it.id] = "accepted"));
      return {
        ...s,
        punct: { ...s.punct, decisions: dec },
      };
    });
  }, []);

  const rejectAllPunct = useCallback(() => {
    setState((s) => {
      const items = punctItems(s.ed.text || s.form.story || "");
      const dec: Record<string, "rejected"> = {};
      items.forEach((it) => (dec[it.id] = "rejected"));
      return {
        ...s,
        punct: { ...s.punct, decisions: dec },
      };
    });
  }, []);

  const setManualPunct = useCallback(
    (
      text: string | null,
      extra?: {
        isModelPunctuated?: boolean;
        modelSuggestion?: string | null;
        unpunctuatedDraft?: string | null;
      }
    ) => {
      setState((s) => ({
        ...s,
        punct: {
          ...s.punct,
          manual: text,
          ...(extra?.isModelPunctuated !== undefined ? { isModelPunctuated: extra.isModelPunctuated } : {}),
          ...(extra?.modelSuggestion !== undefined ? { modelSuggestion: extra.modelSuggestion } : {}),
          ...(extra?.unpunctuatedDraft !== undefined ? { unpunctuatedDraft: extra.unpunctuatedDraft } : {}),
        },
      }));
    },
    []
  );

  const triggerPunctuation = useCallback(() => {
    setState((s) => ({
      ...s,
      punct: { ...s.punct, status: "processing" },
    }));
  }, []);

  const setVisibility = useCallback(
    (v: "private" | "family" | "community" | "public") => {
      setState((s) => ({
        ...s,
        final: { ...s.final, visibility: v },
      }));
    },
    []
  );

  const setFinalConfirmed = useCallback((val: boolean) => {
    setState((s) => ({
      ...s,
      final: { ...s.final, confirmed: val },
    }));
  }, []);

  const setPermissionConfirmed = useCallback((val: boolean) => {
    setState((s) => ({
      ...s,
      final: { ...s.final, permissionConfirmed: val },
    }));
  }, []);

  const preserveStoryAction = useCallback(async () => {
    const storyId = state.storyId || `story_${Date.now()}`;
    const workingText = state.punct.manual || state.ed.text || state.form.story || "";
    const derivedCarrier =
      (state.form.carrier || "").trim() ||
      profile?.display_name ||
      profile?.full_name ||
      (user?.email ? user.email.split("@")[0] : "") ||
      "Community contributor";

    const payload = {
      id: storyId,
      title: state.form.title,
      carrier: derivedCarrier,
      category: state.form.category,
      roots: state.form.place,
      place: state.form.place,
      language: state.form.language,
      period: state.form.period,
      relationship: state.form.relationship,
      email: state.form.email,
      story: state.form.story,
      writtenText: state.form.story,
      audio: state.audio
        ? {
            filename: state.audio.name,
            url: state.audio.url || undefined,
            size: state.audio.size,
            duration: state.audio.duration,
            kind: state.audio.kind,
            storage_path: state.audio.storage_path,
            bucket: state.audio.bucket,
          }
        : null,
      raw_transcripts: {
        vaani: state.tx.vaani,
        indicconformer: state.tx.conformer,
      },
      working_draft: state.ed.text || state.form.story,
      final_text: workingText,
      vocabulary: state.vocab.map((v) => ({
        id: v.id,
        preferred: v.preferred,
        heard: v.heard,
        meaning: v.meaning,
        language: v.language,
        context: v.context,
        pronunciation: v.pronunciation,
      })),
      visibility: state.final.visibility,
      confirmed: state.final.confirmed,
      permissionConfirmed: state.final.permissionConfirmed,
    };

    // 1. If Supabase is configured, enforce real authenticated database persistence
    if (isSupabaseConfigured()) {
      if (!user) {
        openAuthModal();
        throw new Error(
          "Authentication required: Please sign in or create an account to permanently preserve your story to the Virasya repository."
        );
      }

      // Execute real database persistence to Supabase public.stories
      const res = await preserveStoryToSupabase(payload as any, user.id);

      // If local workbench backend is also reachable, sync to local output directory as well
      if (isBackendConfigured()) {
        try {
          await preserveStoryOnBackend(storyId, payload);
        } catch (backendErr) {
          console.warn("Local backend sync notice:", backendErr);
        }
      }

      setState((s) => ({
        ...s,
        provenanceId: res.provenance_id,
        storyId: res.story.id,
        final: { ...s.final, isPreserved: true, isPreviewPreserved: false },
      }));

      return res;
    }

    // 2. If Supabase is not configured, check if local Flask backend is configured
    if (isBackendConfigured()) {
      const res = await preserveStoryOnBackend(storyId, payload);
      setState((s) => ({
        ...s,
        provenanceId: res.provenance_id,
        storyId: res.story.id,
        final: { ...s.final, isPreserved: true, isPreviewPreserved: false },
      }));
      return res;
    }

    // 3. Fail-closed: Never claim preservation or show a fake receipt if no database/backend is connected
    throw new Error(
      "Archival database connection is not available in this environment. Permanent persistence requires an active Supabase connection."
    );
  }, [state, user, profile, openAuthModal]);

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setState({ ...INITIAL_STATE });
    setResumeDraft(null);
    setLeaveModalOpen(false);
    goToStep(1);
  }, [goToStep]);

  const resumeFromSaved = useCallback(() => {
    if (resumeDraft) {
      setState({ ...resumeDraft });
      setResumeDraft(null);
      const target = STEP_DEFINITIONS.find((s) => s.step === resumeDraft.stage);
      if (target && window.location.pathname !== target.route) {
        window.history.pushState(null, "", target.route);
      }
    }
  }, [resumeDraft]);

  const dismissResume = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setResumeDraft(null);
  }, []);

  const isTranscribing =
    transcriptionPhase === "checking" ||
    transcriptionPhase === "warming" ||
    transcriptionPhase === "transcribing";

  return (
    <PreserveContext.Provider
      value={{
        state,
        sim,
        savedAt,
        resumeDraft,
        leaveModalOpen,
        dockOpen,
        isTranscribing,
        transcriptionPhase,
        transcriptionError,
        selectedLanguage,
        setSelectedLanguage,
        isLanguageConfirmed,
        setIsLanguageConfirmed,
        clearTranscriptionError,
        retryTranscription,
        setLeaveModalOpen,
        setDockOpen,
        setSim,
        goToStep,
        updateForm,
        fillSampleStory,
        setAudio,
        startTranscription,
        executeTranscription,
        continueWithWrittenOnly,
        loadSampleTranscript,
        retryModel,
        setEnhDecision,
        acceptAllLowRiskEnh,
        setEnhBase,
        triggerEnhancement,
        loadSourceIntoEditor,
        updateWorkingText,
        restoreSnapshot,
        undoWorkingText,
        addVocabEntry,
        updateVocabEntry,
        removeVocabEntry,
        setPunctDecision,
        acceptAllPunct,
        rejectAllPunct,
        setManualPunct,
        triggerPunctuation,
        setVisibility,
        setFinalConfirmed,
        setPermissionConfirmed,
        preserveStoryAction,
        resetAll,
        resumeFromSaved,
        dismissResume,
      }}
    >
      {children}
    </PreserveContext.Provider>
  );
}

export function usePreserve() {
  const ctx = useContext(PreserveContext);
  if (!ctx) throw new Error("usePreserve must be used within PreserveProvider");
  return ctx;
}
