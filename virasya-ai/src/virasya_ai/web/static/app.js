(() => {
  "use strict";

  const state = {
    file: null,
    fileName: "",
    fileSize: 0,
    language: "hi-IN",
    rawText: "",
    editedText: "",
    transcribed: false,
    transcribing: false,
    dirty: false,
    saved: false,
    savedAt: "",
    saveInProgress: false,
    page: "select",
  };

  const $ = (id) => document.getElementById(id);
  const pages = [...document.querySelectorAll("[data-page]")];
  const accepted = new Set(["wav", "mp3", "ogg", "flac", "aac", "m4a"]);

  function formatBytes(bytes) {
    if (!bytes) return "0 KB";
    return `${(bytes / 1024 / 1024 < 1 ? bytes / 1024 : bytes / 1024 / 1024).toFixed(1)} ${bytes / 1024 / 1024 < 1 ? "KB" : "MB"}`;
  }

  function setMessage(id, text, kind = "error") {
    const node = $(id);
    node.textContent = text || "";
    node.className = text ? `message ${kind}` : "message is-hidden";
  }

  function showPage(page) {
    if (page === "edit" && !state.file) return showPage("select");
    if (page === "final" && !state.transcribed) return showPage("edit");
    state.page = page;
    pages.forEach((section) => {
      const active = section.dataset.page === page;
      section.hidden = !active;
      section.classList.toggle("is-active", active);
    });
    document.querySelectorAll(".progress-step").forEach((step) => {
      const target = step.dataset.go;
      const order = ["select", "edit", "final"];
      step.classList.toggle("is-active", target === page);
      step.classList.toggle("is-done", order.indexOf(target) < order.indexOf(page));
    });
    syncView();
    history.replaceState(null, "", `#${page}`);
  }

  function syncView() {
    ["edit-file-name", "final-file-name"].forEach((id) => { $(id).textContent = state.fileName || "No audio selected"; });
    ["edit-language", "final-language"].forEach((id) => { $(id).textContent = languageLabel(state.language); });
    $("final-saved-at").textContent = state.savedAt ? `Saved ${new Date(state.savedAt).toLocaleString()}` : "Not saved yet";
    $("raw-text").value = state.rawText;
    $("edited-text").value = state.editedText;
    $("final-text").textContent = state.editedText;
    $("comparison-text").textContent = state.rawText;
    $("to-final-button").disabled = !state.transcribed || state.transcribing;
    $("edit-status").textContent = state.dirty ? "Unsaved changes" : state.saved ? "Saved" : "Not yet saved";
    $("edit-status").classList.toggle("is-dirty", state.dirty);
    $("save-button").disabled = state.saveInProgress || !state.transcribed || !state.editedText.trim() || (state.saved && !state.dirty);
    $("new-button").classList.toggle("is-hidden", !state.saved);
  }

  let languages = [];
  function languageLabel(code) {
    const item = languages.find((entry) => entry.code === code);
    return item ? `${item.name} · ${item.code}` : code;
  }

  async function loadLanguages() {
    try {
      const response = await fetch("/api/languages", { cache: "no-store" });
      const data = await response.json();
      languages = data.languages || [];
    } catch (_error) {
      languages = [
        ["Hindi", "hi-IN"], ["Bengali", "bn-IN"], ["Gujarati", "gu-IN"],
        ["Kannada", "kn-IN"], ["Malayalam", "ml-IN"], ["Marathi", "mr-IN"],
        ["Punjabi", "pa-IN"], ["Tamil", "ta-IN"], ["English (India)", "en-IN"],
        ["Telugu", "te-IN"],
      ].map(([name, code]) => ({ name, code, provider_configured: true }));
    }
    const select = $("language-select");
    select.replaceChildren();
    languages.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.code;
      option.textContent = item.provider_configured ? `${item.name} (${item.code})` : `${item.name} (${item.code} · provider not configured)`;
      option.disabled = !item.provider_configured;
      select.append(option);
    });
    select.value = state.language;
    syncView();
  }

  function chooseFile(file) {
    if (!file) return;
    if (state.file && (state.file.name !== file.name || state.file.size !== file.size) && (state.transcribed || state.dirty)) {
      if (!window.confirm("Replace the current audio and discard its unsaved transcription?")) return;
      state.rawText = "";
      state.editedText = "";
      state.transcribed = false;
      state.dirty = false;
      state.saved = false;
      state.savedAt = "";
    }
    const extension = file.name.split(".").pop().toLowerCase();
    if (!accepted.has(extension)) {
      setMessage("select-error", "That format is not supported. Choose WAV, MP3, OGG, FLAC, AAC, or M4A.");
      return;
    }
    state.file = file;
    state.fileName = file.name;
    state.fileSize = file.size;
    $("file-name").textContent = file.name;
    $("file-meta").textContent = `${formatBytes(file.size)} · ${extension.toUpperCase()}`;
    $("file-card").classList.remove("is-hidden");
    setMessage("select-error", "");
  }

  function removeFile() {
    state.file = null;
    state.fileName = "";
    state.fileSize = 0;
    $("audio-input").value = "";
    $("file-card").classList.add("is-hidden");
    setMessage("select-error", "");
  }

  function continueToEdit() {
    if (!state.file) return setMessage("select-error", "Choose an audio file before continuing.");
    const selected = languages.find((item) => item.code === state.language);
    if (!selected || !selected.provider_configured) return setMessage("select-error", "That language is not configured in the current provider setup.");
    showPage("edit");
  }

  function startTranscription() {
    if (state.transcribing) return;
    if (!state.file) return setMessage("edit-message", "Go back and choose an audio file first.");
    if (state.transcribed) {
      $("confirm-dialog").showModal();
      return;
    }
    submitTranscription();
  }

  async function submitTranscription() {
    state.transcribing = true;
    setMessage("edit-message", "Transcribing audio…", "status");
    $("transcribe-button").disabled = true;
    $("transcribe-button").textContent = "Transcribing…";
    syncView();
    const form = new FormData();
    form.append("audio_file", state.file, state.file.name);
    form.append("language_code", state.language);
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Transcription could not be completed.");
      state.rawText = data.raw_text;
      state.editedText = data.raw_text;
      state.transcribed = true;
      state.dirty = false;
      state.saved = false;
      state.savedAt = "";
      setMessage("edit-message", "Transcription complete. Review the editable copy below.", "success");
    } catch (error) {
      setMessage("edit-message", error.message || "Transcription failed. You can try again.");
    } finally {
      state.transcribing = false;
      $("transcribe-button").disabled = false;
      $("transcribe-button").textContent = "Transcribe audio ✦";
      syncView();
    }
  }

  async function saveTranscript() {
    if (state.saveInProgress || !state.transcribed) return;
    if (!state.editedText.trim()) return setMessage("save-message", "The final reviewed text cannot be empty.");
    state.saveInProgress = true;
    setMessage("save-message", "Saving transcript…", "status");
    syncView();
    try {
      const response = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audio_filename: state.fileName, language: state.language, raw_text: state.rawText, reviewed_text: state.editedText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The transcript could not be saved.");
      state.saved = true;
      state.savedAt = data.record.created_at;
      state.dirty = false;
      setMessage("save-message", "Transcript saved locally to the workspace.", "success");
    } catch (error) {
      setMessage("save-message", error.message || "The transcript could not be saved. Your edits are still here.");
    } finally {
      state.saveInProgress = false;
      syncView();
    }
  }

  function resetWorkflow() {
    if (state.dirty && !window.confirm("You have unsaved edits. Start a new transcription anyway?")) return;
    Object.assign(state, { file: null, fileName: "", fileSize: 0, rawText: "", editedText: "", transcribed: false, transcribing: false, dirty: false, saved: false, savedAt: "", saveInProgress: false });
    removeFile();
    setMessage("save-message", "");
    showPage("select");
  }

  $("browse-button").addEventListener("click", () => $("audio-input").click());
  $("audio-input").addEventListener("change", (event) => chooseFile(event.target.files[0]));
  $("remove-file").addEventListener("click", removeFile);
  $("drop-zone").addEventListener("click", (event) => { if (event.target.tagName !== "BUTTON") $("audio-input").click(); });
  $("drop-zone").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("audio-input").click(); } });
  ["dragenter", "dragover"].forEach((eventName) => $("drop-zone").addEventListener(eventName, (event) => { event.preventDefault(); $("drop-zone").classList.add("is-dragging"); }));
  ["dragleave", "drop"].forEach((eventName) => $("drop-zone").addEventListener(eventName, (event) => { event.preventDefault(); $("drop-zone").classList.remove("is-dragging"); }));
  $("drop-zone").addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));
  $("language-select").addEventListener("change", (event) => {
    const nextLanguage = event.target.value;
    if (state.transcribed && nextLanguage !== state.language) {
      if (!window.confirm("Changing language will clear the current transcription. Continue?")) {
        event.target.value = state.language;
        return;
      }
      state.rawText = "";
      state.editedText = "";
      state.transcribed = false;
      state.dirty = false;
      state.saved = false;
      state.savedAt = "";
    }
    state.language = nextLanguage;
    syncView();
  });
  $("continue-button").addEventListener("click", continueToEdit);
  $("transcribe-button").addEventListener("click", startTranscription);
  $("confirm-dialog").addEventListener("close", () => { if ($("confirm-dialog").returnValue === "confirm") submitTranscription(); });
  $("edited-text").addEventListener("input", (event) => { state.editedText = event.target.value; state.dirty = state.editedText !== state.rawText; state.saved = false; state.savedAt = ""; syncView(); });
  $("to-final-button").addEventListener("click", () => showPage("final"));
  $("save-button").addEventListener("click", saveTranscript);
  $("new-button").addEventListener("click", resetWorkflow);
  document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.back)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.go)));

  const themeToggle = $("theme-toggle");
  function applyTheme(theme) { document.documentElement.dataset.theme = theme; themeToggle.textContent = theme === "dark" ? "☀" : "☾"; themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme"); localStorage.setItem("virasya-theme", theme); }
  const storedTheme = localStorage.getItem("virasya-theme");
  applyTheme(storedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  loadLanguages();
  syncView();
})();
