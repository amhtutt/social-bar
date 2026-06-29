"use client";

// ─────────────────────────────────────────────────────────────────────────────
// lib/useTabletConnection.js  —  React hook wrapping tablet presence lifecycle
//
// CHANGED for multi-tenant: now takes venueId as its first argument.
// Manages: register on mount -> heartbeat every 10s -> mark offline on unmount.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import {
  registerTablet,
  updateTabletHeartbeat,
  markTabletOffline,
} from "./tabletService";

const HEARTBEAT_INTERVAL = 10000; // 10 seconds

export function useTabletConnection(venueId, tableNumber, tabletSlot) {
  const [connStatus, setConnStatus] = useState("connecting"); // connecting | online | reconnecting | offline
  const [lastSynced, setLastSynced] = useState(null);

  const heartbeatRef = useRef(null);

  const sendHeartbeat = useCallback(async () => {
    try {
      await updateTabletHeartbeat(venueId, tableNumber, tabletSlot);
      setConnStatus("online");
      setLastSynced(new Date());
    } catch {
      setConnStatus((prev) => (prev === "offline" ? "offline" : "reconnecting"));
    }
  }, [venueId, tableNumber, tabletSlot]);

  useEffect(() => {
    if (!venueId || !tableNumber || !tabletSlot) return;

    let cancelled = false;

    async function init() {
      try {
        await registerTablet(venueId, tableNumber, tabletSlot);
        if (cancelled) return;
        setConnStatus("online");
        setLastSynced(new Date());
        heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
      } catch {
        if (!cancelled) setConnStatus("offline");
      }
    }

    init();

    return () => {
      cancelled = true;
      clearInterval(heartbeatRef.current);
      markTabletOffline(venueId, tableNumber, tabletSlot);
    };
  }, [venueId, tableNumber, tabletSlot, sendHeartbeat]);

  return { connStatus, lastSynced };
}
