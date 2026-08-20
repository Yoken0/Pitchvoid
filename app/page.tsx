"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "listening" | "answered" | "complete";

type Note = {
  label: string;
  spokenLabel: string;
  shortcut: string;
  semitone: number;
  accidental: boolean;
};

const NOTES: Note[] = [
  { label: "C", spokenLabel: "C", shortcut: "Q", semitone: 0, accidental: false },
  { label: "C♯", spokenLabel: "C sharp", shortcut: "W", semitone: 1, accidental: true },
  { label: "D", spokenLabel: "D", shortcut: "E", semitone: 2, accidental: false },
  { label: "D♯", spokenLabel: "D sharp", shortcut: "R", semitone: 3, accidental: true },
  { label: "E", spokenLabel: "E", shortcut: "T", semitone: 4, accidental: false },
  { label: "F", spokenLabel: "F", shortcut: "Y", semitone: 5, accidental: false },
  { label: "F♯", spokenLabel: "F sharp", shortcut: "U", semitone: 6, accidental: true },
  { label: "G", spokenLabel: "G", shortcut: "I", semitone: 7, accidental: false },
  { label: "G♯", spokenLabel: "G sharp", shortcut: "O", semitone: 8, accidental: true },
  { label: "A", spokenLabel: "A", shortcut: "P", semitone: 9, accidental: false },
  { label: "A♯", spokenLabel: "A sharp", shortcut: "[", semitone: 10, accidental: true },
  { label: "B", spokenLabel: "B", shortcut: "]", semitone: 11, accidental: false },
];

const TOTAL_ROUNDS = 10;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [target, setTarget] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedBest = Number(window.localStorage.getItem("pitchvoid-best") ?? 0);
    if (Number.isFinite(savedBest)) setBest(savedBest);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      void audioContextRef.current?.close();
    };
  }, []);

  const playTone = useCallback((noteIndex: number) => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return;

    const context =
      audioContextRef.current ?? new AudioContextClass({ latencyHint: "interactive" });
    audioContextRef.current = context;
    void context.resume();

    const now = context.currentTime;
    const frequency = 261.625565 * 2 ** (NOTES[noteIndex].semitone / 12);
    const master = context.createGain();
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();

    fundamental.type = "sine";
    fundamental.frequency.setValueAtTime(frequency, now);
    overtone.type = "triangle";
    overtone.frequency.setValueAtTime(frequency * 2, now);
    overtoneGain.gain.setValueAtTime(0.08, now);

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.34, now + 0.035);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.7);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);

    fundamental.connect(master);
    overtone.connect(overtoneGain);
    overtoneGain.connect(master);
    master.connect(context.destination);

    fundamental.start(now);
    overtone.start(now);
    fundamental.stop(now + 1.6);
    overtone.stop(now + 1.6);

    setIsPlaying(true);
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    playTimerRef.current = setTimeout(() => setIsPlaying(false), 1600);
  }, []);

  const pickTarget = useCallback((previous: number | null) => {
    let next = Math.floor(Math.random() * NOTES.length);
    if (next === previous) next = (next + 1 + Math.floor(Math.random() * 11)) % NOTES.length;
    return next;
  }, []);

  const startSession = useCallback(() => {
    const next = pickTarget(null);
    setScore(0);
    setStreak(0);
    setResults([]);
    setRound(1);
    setSelected(null);
    setTarget(next);
    setPhase("listening");
    playTone(next);
  }, [pickTarget, playTone]);

  const nextRound = useCallback(() => {
    if (round >= TOTAL_ROUNDS) {
      setPhase("complete");
      return;
    }

    const next = pickTarget(target);
    setRound((current) => current + 1);
    setSelected(null);
    setTarget(next);
    setPhase("listening");
    playTone(next);
  }, [pickTarget, playTone, round, target]);

  const handleGuess = useCallback(
    (noteIndex: number) => {
      if (phase !== "listening" || target === null) return;

      const correct = noteIndex === target;
      const nextScore = correct ? score + 1 : score;
      setSelected(noteIndex);
      setResults((current) => [...current, correct]);
      setScore(nextScore);
      setStreak((current) => (correct ? current + 1 : 0));
      setPhase("answered");

      if (nextScore > best) {
        setBest(nextScore);
        window.localStorage.setItem("pitchvoid-best", String(nextScore));
      }
    },
    [best, phase, score, target],
  );

  const handlePlay = useCallback(() => {
    if (phase === "idle" || phase === "complete" || target === null) {
      startSession();
      return;
    }
    playTone(target);
  }, [phase, playTone, startSession, target]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.code === "Space") {
        event.preventDefault();
        handlePlay();
        return;
      }

      const noteIndex = NOTES.findIndex(
        (note) => note.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (noteIndex !== -1) handleGuess(noteIndex);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGuess, handlePlay]);

  const isCorrect = selected !== null && selected === target;
  const progress = round === 0 ? 0 : ((round - (phase === "listening" ? 1 : 0)) / TOTAL_ROUNDS) * 100;

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Pitchvoid home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Pitchvoid</span>
        </a>

        <div className="session-status">
          <span className="status-dot" aria-hidden="true" />
          Ear trainer · Chromatic
        </div>
      </nav>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">One note. Twelve choices.</p>
          <h1>Hear the pitch.<br />Name the note.</h1>
          <p className="intro">
            A focused ear-training session for building sharper pitch recognition—one sound at a time.
          </p>
        </div>

        <dl className="stats" aria-label="Session statistics">
          <div>
            <dt>Score</dt>
            <dd>{score}<span>/{TOTAL_ROUNDS}</span></dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd>{streak}<span>×</span></dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>{best}<span>/{TOTAL_ROUNDS}</span></dd>
          </div>
        </dl>
      </section>

      <section className="game-card" aria-label="Pitch recognition game">
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="listening-panel">
          <div className="round-label">
            {phase === "idle" ? "Ready when you are" : phase === "complete" ? "Session complete" : `Round ${String(round).padStart(2, "0")} of ${TOTAL_ROUNDS}`}
          </div>

          <div className={`sound-stage ${isPlaying ? "is-playing" : ""}`}>
            <div className="waveform" aria-hidden="true">
              {Array.from({ length: 17 }).map((_, index) => <span key={index} />)}
            </div>
            <button
              className="play-button"
              type="button"
              onClick={handlePlay}
              aria-label={phase === "idle" || phase === "complete" ? "Start a new session and play a note" : "Play the note again"}
            >
              <span className="play-icon" aria-hidden="true" />
              <span>{phase === "idle" ? "Play note" : phase === "complete" ? "Play again" : "Replay"}</span>
            </button>
          </div>

          <div className="listening-copy">
            <p>{phase === "complete" ? `${score} out of ${TOTAL_ROUNDS} correct` : phase === "idle" ? "Press play to hear your first note" : isPlaying ? "Listen closely…" : "Choose the note you heard"}</p>
            <span><kbd>Space</kbd> to {phase === "idle" || phase === "complete" ? "start" : "replay"}</span>
          </div>

          <div className="round-dots" aria-label={`${results.filter(Boolean).length} correct answers so far`}>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, index) => {
              const result = results[index];
              const className = result === true ? "correct" : result === false ? "incorrect" : index === round - 1 && phase === "listening" ? "current" : "";
              return <span className={className} key={index} />;
            })}
          </div>
        </div>

        <div className="answer-panel">
          <div className="answer-heading">
            <div>
              <p className="panel-kicker">Choose your answer</p>
              <h2>Which note was it?</h2>
            </div>
            <span>C4–B4</span>
          </div>

          <div className="notes-grid">
            {NOTES.map((note, index) => {
              const guessed = selected === index;
              const revealedCorrect = phase === "answered" && target === index;
              const stateClass = revealedCorrect ? "is-correct" : guessed ? "is-wrong" : "";

              return (
                <button
                  className={`note-button ${note.accidental ? "accidental" : "natural"} ${stateClass}`}
                  type="button"
                  key={note.spokenLabel}
                  onClick={() => handleGuess(index)}
                  disabled={phase !== "listening"}
                  aria-label={`Choose ${note.spokenLabel}`}
                >
                  <span className="note-name">{note.label}</span>
                  <kbd>{note.shortcut}</kbd>
                </button>
              );
            })}
          </div>

          <div className={`feedback ${phase === "answered" || phase === "complete" ? "visible" : ""}`} aria-live="polite">
            {phase === "answered" && target !== null && (
              <>
                <span className={`feedback-icon ${isCorrect ? "correct" : "incorrect"}`} aria-hidden="true">
                  {isCorrect ? "✓" : "×"}
                </span>
                <div>
                  <strong>{isCorrect ? "That’s it." : `That was ${NOTES[target].label}.`}</strong>
                  <p>{isCorrect ? "Your ear is locked in—keep going." : "Replay it once more, then carry the sound forward."}</p>
                </div>
                <button type="button" onClick={nextRound}>
                  {round === TOTAL_ROUNDS ? "See results" : "Next note"}<span aria-hidden="true">→</span>
                </button>
              </>
            )}

            {phase === "complete" && (
              <>
                <span className="feedback-icon complete" aria-hidden="true">♪</span>
                <div>
                  <strong>{score >= 8 ? "Excellent ears." : score >= 5 ? "A strong start." : "Keep listening."}</strong>
                  <p>You identified {score} of {TOTAL_ROUNDS} chromatic notes.</p>
                </div>
                <button type="button" onClick={startSession}>New session<span aria-hidden="true">↻</span></button>
              </>
            )}
          </div>
        </div>
      </section>

      <footer>
        <p>Pure tone · Concert pitch A = 440 Hz</p>
        <p>Built for intentional listening.</p>
      </footer>
    </main>
  );
}
