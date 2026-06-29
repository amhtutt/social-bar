"use client";

// ─────────────────────────────────────────────────────────────────────────────
// lib/useRateLimit.js  —  Client-side cooldown for tappable customer actions
//
// This is a UX/abuse-deterrent measure, NOT a security control — a
// motivated bad actor can always bypass client-side JS. Real protection
// for Call Server / Request Bill / order submission still needs
// server-side enforcement (Cloud Functions checking write frequency per
// device/table), which is tracked separately. What this DOES solve well:
// an impatient or bored customer mashing a button, which is the realistic
// day-to-day case (Call Server spam, accidental double-submits).
//
// Usage:
//   const { isLimited, secondsLeft, trigger } = useRateLimit(8000);
//   <button disabled={isLimited} onClick={() => trigger(doTheAction)}>
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from "react";

export function useRateLimit(cooldownMs = 8000) {
  const [isLimited, setIsLimited] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setIsLimited(true);
    setSecondsLeft(Math.ceil(cooldownMs / 1000));

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    timeoutRef.current = setTimeout(() => {
      setIsLimited(false);
      clearInterval(intervalRef.current);
    }, cooldownMs);
  }, [cooldownMs]);

  /**
   * trigger(action)
   * Runs `action` (sync or async) immediately, then starts the cooldown
   * regardless of whether `action` resolves successfully — a failed
   * network call shouldn't let someone instantly retry-spam either.
   * Does nothing if already limited.
   */
  const trigger = useCallback(
    async (action) => {
      if (isLimited) return;
      startCooldown();
      await action();
    },
    [isLimited, startCooldown]
  );

  return { isLimited, secondsLeft, trigger };
}
