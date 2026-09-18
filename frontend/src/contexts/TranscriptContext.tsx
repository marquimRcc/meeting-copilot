'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode, MutableRefObject } from 'react';
import { Transcript, TranscriptUpdate } from '@/types';
import { toast } from 'sonner';
import { useRecordingState } from './RecordingStateContext';
import { transcriptService } from '@/services/transcriptService';
import { recordingService } from '@/services/recordingService';
import { indexedDBService } from '@/services/indexedDBService';

export interface TranscriptContextType {
  transcripts: Transcript[];
  transcriptsRef: MutableRefObject<Transcript[]>
  addTranscript: (update: TranscriptUpdate) => void;
  copyTranscript: () => void;
  flushBuffer: () => void;
  transcriptContainerRef: React.RefObject<HTMLDivElement>;
  meetingTitle: string;
  setMeetingTitle: (title: string) => void;
  clearTranscripts: () => void;
  clearTranscriptList: () => void;
  clearActiveSession: () => void;
  restoreTranscripts: (backup: Transcript[]) => void;
  currentMeetingId: string | null;
  markMeetingAsSaved: () => Promise<void>;
}

const TranscriptContext = createContext<TranscriptContextType | undefined>(undefined);

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [meetingTitle, setMeetingTitle] = useState('+ New Call');
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  // Recording state context - provides backend-synced state
  const recordingState = useRecordingState();

  // Refs for transcript management and strict session isolation
  const activeMeetingIdRef = useRef<string | null>(null);
  const isRecordingActiveRef = useRef<boolean>(false);
  const transcriptsRef = useRef<Transcript[]>(transcripts);
  const isUserAtBottomRef = useRef<boolean>(true);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const finalFlushRef = useRef<(() => void) | null>(null);

  // Keep activeMeetingIdRef in sync with currentMeetingId
  useEffect(() => {
    activeMeetingIdRef.current = currentMeetingId;
  }, [currentMeetingId]);

  // Keep ref updated with current transcripts
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  // Smart auto-scroll: Track user scroll position
  useEffect(() => {
    const handleScroll = () => {
      const container = transcriptContainerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10; // 10px tolerance
      isUserAtBottomRef.current = isAtBottom;
    };

    const container = transcriptContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Auto-scroll when transcripts change (only if user is at bottom)
  useEffect(() => {
    // Only auto-scroll if user was at the bottom before new content
    if (isUserAtBottomRef.current && transcriptContainerRef.current) {
      // Wait for Framer Motion animation to complete (150ms) before scrolling
      // This ensures scrollHeight includes the full rendered height of the new transcript
      const scrollTimeout = setTimeout(() => {
        const container = transcriptContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 150); // Match Framer Motion transition duration

      return () => clearTimeout(scrollTimeout);
    }
  }, [transcripts]);

  // Initialize IndexedDB and listen for recording-started/stopped events
  useEffect(() => {
    let unlistenRecordingStarted: (() => void) | undefined;
    let unlistenRecordingStopped: (() => void) | undefined;

    const setupRecordingListeners = async () => {
      try {
        // Initialize IndexedDB
        await indexedDBService.init();

        // Listen for recording-started event
        unlistenRecordingStarted = await recordingService.onRecordingStarted(async (payload) => {
          try {
            // Adopt meeting ID from backend payload or query backend directly — never invent local meeting ID
            let meetingId = payload?.meeting_id;
            if (!meetingId) {
              const backendMeetingId = await recordingService.getCurrentMeetingId();
              if (backendMeetingId) {
                meetingId = backendMeetingId;
              } else {
                console.error('[Recording Started] ❌ Rejected recording-started event with missing meeting_id and no active backend meeting');
                return;
              }
            }
            activeMeetingIdRef.current = meetingId;
            isRecordingActiveRef.current = true;
            setCurrentMeetingId(meetingId);

            // Store in sessionStorage as fallback for markMeetingAsSaved
            sessionStorage.setItem('indexeddb_current_meeting_id', meetingId);
            console.log('[Recording Started] 💾 IndexedDB meeting ID stored:', meetingId);

            // Get meeting name from payload or backend query
            const backendMeetingName = await recordingService.getRecordingMeetingName();
            const effectiveTitle = payload?.meeting_name || backendMeetingName || `Meeting ${new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-')}`;

            // Initialize meeting metadata in IndexedDB
            await indexedDBService.saveMeetingMetadata({
              meetingId,
              title: effectiveTitle,
              startTime: Date.now(),
              lastUpdated: Date.now(),
              transcriptCount: 0,
              savedToSQLite: false,
              folderPath: undefined // Will update shortly
            });

            // Synchronize meeting title to state (fixes tray stop title issue)
            setMeetingTitle(effectiveTitle);

            // Fetch folder path from backend and update metadata
            // This ensures folder path is persisted even if app crashes
            try {
              const { invoke } = await import('@tauri-apps/api/core');
              const folderPath = await invoke<string>('get_meeting_folder_path');
              if (folderPath) {
                const metadata = await indexedDBService.getMeetingMetadata(meetingId);
                if (metadata) {
                  metadata.folderPath = folderPath;
                  await indexedDBService.saveMeetingMetadata(metadata);
                }
              }
            } catch (error) {
              // Non-fatal - will be set on stop if recording completes normally
            }
          } catch (error) {
            console.error('Failed to initialize meeting in IndexedDB:', error);
          }
        });

        // Listen for recording-stopped event
        unlistenRecordingStopped = await recordingService.onRecordingStopped(async (payload) => {
          try {
            const stoppedMeetingId = activeMeetingIdRef.current || currentMeetingId;
            isRecordingActiveRef.current = false;
            activeMeetingIdRef.current = null;
            setCurrentMeetingId(null);

            if (stoppedMeetingId) {
              // Update folder path in IndexedDB
              const metadata = await indexedDBService.getMeetingMetadata(stoppedMeetingId);

              if (metadata && payload.folder_path) {
                metadata.folderPath = payload.folder_path;
                await indexedDBService.saveMeetingMetadata(metadata);
              }
            }
          } catch (error) {
            console.error('Failed to update meeting metadata on stop:', error);
          }
        });
      } catch (error) {
        console.error('Failed to setup recording listeners:', error);
      }
    };

    setupRecordingListeners();

    return () => {
      if (unlistenRecordingStarted) {
        unlistenRecordingStarted();
        console.log('🧹 Recording started listener cleaned up');
      }
      if (unlistenRecordingStopped) {
        unlistenRecordingStopped();
        console.log('🧹 Recording stopped listener cleaned up');
      }
    };
  }, []); // Run once on mount to maintain continuous IPC listener

  // Main transcript buffering logic with sequence_id ordering
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let transcriptCounter = 0;
    let transcriptBuffer = new Map<number, Transcript>();
    let lastProcessedSequence = 0;
    let processingTimer: NodeJS.Timeout | undefined;

    const processBufferedTranscripts = (forceFlush = false) => {
      const sortedTranscripts: Transcript[] = [];

      // Process all available sequential transcripts
      let nextSequence = lastProcessedSequence + 1;
      while (transcriptBuffer.has(nextSequence)) {
        const bufferedTranscript = transcriptBuffer.get(nextSequence)!;
        sortedTranscripts.push(bufferedTranscript);
        transcriptBuffer.delete(nextSequence);
        lastProcessedSequence = nextSequence;
        nextSequence++;
      }

      // Add any buffered transcripts that might be out of order
      const now = Date.now();
      const staleThreshold = 100;  // 100ms safety net only (serial workers = sequential order)
      const recentThreshold = 0;    // Show immediately - no delay needed with serial processing
      const staleTranscripts: Transcript[] = [];
      const recentTranscripts: Transcript[] = [];
      const forceFlushTranscripts: Transcript[] = [];

      for (const [sequenceId, transcript] of transcriptBuffer.entries()) {
        if (forceFlush) {
          // Force flush mode: process ALL remaining transcripts regardless of timing
          forceFlushTranscripts.push(transcript);
          transcriptBuffer.delete(sequenceId);
          console.log(`Force flush: processing transcript with sequence_id ${sequenceId}`);
        } else {
          const transcriptAge = now - ((transcript as any)._receivedAt || now);
          if (transcriptAge > staleThreshold) {
            // Process stale transcripts (>100ms old - safety net)
            staleTranscripts.push(transcript);
            transcriptBuffer.delete(sequenceId);
          } else if (transcriptAge >= recentThreshold) {
            // Process immediately (0ms threshold with serial workers)
            recentTranscripts.push(transcript);
            transcriptBuffer.delete(sequenceId);
            console.log(`Processing transcript with sequence_id ${sequenceId}, age: ${transcriptAge}ms`);
          }
        }
      }

      // Sort both stale and recent transcripts by chunk_start_time, then by sequence_id
      const sortTranscripts = (transcripts: Transcript[]) => {
        return transcripts.sort((a, b) => {
          const chunkTimeDiff = (a.chunk_start_time || 0) - (b.chunk_start_time || 0);
          if (chunkTimeDiff !== 0) return chunkTimeDiff;
          return (a.sequence_id || 0) - (b.sequence_id || 0);
        });
      };

      const sortedStaleTranscripts = sortTranscripts(staleTranscripts);
      const sortedRecentTranscripts = sortTranscripts(recentTranscripts);
      const sortedForceFlushTranscripts = sortTranscripts(forceFlushTranscripts);

      const allNewTranscripts = [...sortedTranscripts, ...sortedRecentTranscripts, ...sortedStaleTranscripts, ...sortedForceFlushTranscripts];

      if (allNewTranscripts.length > 0) {
        setTranscripts(prev => {
          let updated = [...prev];
          let hasChanges = false;

          for (const newT of allNewTranscripts) {
            if (newT.sequence_id === undefined) {
              updated.push(newT);
              hasChanges = true;
              continue;
            }

            const existingIndex = updated.findIndex(t => t.sequence_id === newT.sequence_id);
            if (existingIndex >= 0) {
              const existing = updated[existingIndex];
              // Update in-place if text was corrected by Whisper, or partial state, speaker, or timestamps changed
              if (
                existing.text !== newT.text ||
                existing.is_partial !== newT.is_partial ||
                existing.speaker !== newT.speaker ||
                existing.source !== newT.source ||
                existing.audio_end_time !== newT.audio_end_time
              ) {
                updated[existingIndex] = {
                  ...existing,
                  ...newT,
                  // Keep stable ID
                  id: existing.id || newT.id,
                };
                hasChanges = true;
                console.log(`✏️ Updated existing transcript seq_${newT.sequence_id} (partial: ${existing.is_partial} -> ${newT.is_partial})`);
              }
            } else {
              updated.push(newT);
              hasChanges = true;
            }
          }

          if (!hasChanges) {
            console.log('No transcript changes to apply - all identical');
            return prev;
          }

          // Sort by chunk_start_time first, then by sequence_id
          return updated.sort((a, b) => {
            const chunkTimeDiff = (a.chunk_start_time || 0) - (b.chunk_start_time || 0);
            if (chunkTimeDiff !== 0) return chunkTimeDiff;
            return (a.sequence_id || 0) - (b.sequence_id || 0);
          });
        });

        // Log the processing summary
        const logMessage = forceFlush
          ? `Force flush processed ${allNewTranscripts.length} transcripts (${sortedTranscripts.length} sequential, ${forceFlushTranscripts.length} forced)`
          : `Processed ${allNewTranscripts.length} transcripts (${sortedTranscripts.length} sequential, ${recentTranscripts.length} recent, ${staleTranscripts.length} stale)`;
        console.log(logMessage);
      }
    };

    // Assign final flush function to ref for external access
    finalFlushRef.current = () => processBufferedTranscripts(true);

    const setupListener = async () => {
      try {
        console.log('🔥 Setting up MAIN transcript listener during component initialization...');
        unlistenFn = await transcriptService.onTranscriptUpdate((update) => {
          const now = Date.now();
          console.log('🎯 MAIN LISTENER: Received transcript update:', {
            sequence_id: update.sequence_id,
            text: update.text.substring(0, 50) + '...',
            timestamp: update.timestamp,
            is_partial: update.is_partial,
            received_at: new Date(now).toISOString(),
            buffer_size_before: transcriptBuffer.size
          });

          // Session isolation:
          // 1. Reject orphan events when there is no active recording session
          if (!activeMeetingIdRef.current) {
            console.log('🚫 MAIN LISTENER: Dropping transcript update - no active recording session');
            return;
          }

          // 2. Reject updates from previous or different meetings
          if (update.meeting_id !== activeMeetingIdRef.current) {
            console.log('🚫 MAIN LISTENER: Dropping transcript update from different meeting:', update.meeting_id, 'expected:', activeMeetingIdRef.current);
            return;
          }

          // Check if sequence_id is already buffered with identical content
          if (transcriptBuffer.has(update.sequence_id)) {
            const existing = transcriptBuffer.get(update.sequence_id);
            if (existing && existing.text === update.text && existing.is_partial === update.is_partial) {
              console.log('🚫 MAIN LISTENER: Duplicate sequence_id with identical content, skipping buffer:', update.sequence_id);
              return;
            }
          }

          const speaker = update.source === 'Microphone'
            ? 'Você'
            : (update.source === 'System Audio' ? 'Participante' : undefined);

          const stableId = update.sequence_id !== undefined
            ? `seq_${update.sequence_id}`
            : `${Date.now()}-${transcriptCounter++}`;

          // Create transcript for buffer with stable ID, timestamp fields, and speaker attribution
          const newTranscript: Transcript = {
            id: stableId,
            text: update.text,
            timestamp: update.timestamp,
            sequence_id: update.sequence_id,
            chunk_start_time: update.chunk_start_time,
            is_partial: update.is_partial,
            confidence: update.confidence,
            // NEW: Recording-relative timestamps for playback sync
            audio_start_time: update.audio_start_time,
            audio_end_time: update.audio_end_time,
            duration: update.duration,
            source: update.source,
            speaker,
            meeting_id: update.meeting_id || activeMeetingIdRef.current || undefined,
          };
          (newTranscript as any)._receivedAt = now;

          // Add to buffer
          transcriptBuffer.set(update.sequence_id, newTranscript);
          console.log(`✅ MAIN LISTENER: Buffered transcript with sequence_id ${update.sequence_id}. Buffer size: ${transcriptBuffer.size}, Last processed: ${lastProcessedSequence}`);

          // Save to IndexedDB (non-blocking) with active session ID
          if (activeMeetingIdRef.current) {
            indexedDBService.saveTranscript(activeMeetingIdRef.current, update)
              .catch(err => console.warn('IndexedDB save failed:', err));
          }

          // Clear any existing timer and set a new one
          if (processingTimer) {
            clearTimeout(processingTimer);
          }

          // Process buffer with minimal delay for immediate UI updates (serial workers = sequential order)
          processingTimer = setTimeout(processBufferedTranscripts, 10);
        });
        console.log('✅ MAIN transcript listener setup complete');
      } catch (error) {
        console.error('❌ Failed to setup MAIN transcript listener:', error);
        alert('Failed to setup transcript listener. Check console for details.');
      }
    };

    setupListener();
    console.log('Started enhanced listener setup');

    return () => {
      console.log('🧹 CLEANUP: Cleaning up MAIN transcript listener...');
      if (processingTimer) {
        clearTimeout(processingTimer);
        console.log('🧹 CLEANUP: Cleared processing timer');
      }
      if (unlistenFn) {
        unlistenFn();
        console.log('🧹 CLEANUP: MAIN transcript listener cleaned up');
      }
    };
  }, []); // Run once on mount to keep IPC listener uninterrupted across meetings

  // Sync transcript history and meeting name from backend on reload
  // This fixes the issue where reloading during active recording causes state desync
  useEffect(() => {
    const syncFromBackend = async () => {
      // If recording is active and we have no local transcripts, sync from backend
      if (recordingState.isRecording && transcripts.length === 0) {
        try {
          console.log('[Reload Sync] Recording active after reload, retrieving active session ID...');

          // 1. Recover active meeting ID: prefer backend, fallback to sessionStorage
          let restoredMeetingId: string | null = null;
          try {
            restoredMeetingId = await recordingService.getCurrentMeetingId();
          } catch (e) {
            console.warn('[Reload Sync] Failed to get meeting ID from getCurrentMeetingId:', e);
          }

          if (!restoredMeetingId && (recordingState as any).meeting_id) {
            restoredMeetingId = (recordingState as any).meeting_id;
          }

          if (!restoredMeetingId && typeof window !== 'undefined') {
            restoredMeetingId = sessionStorage.getItem('indexeddb_current_meeting_id');
            if (restoredMeetingId) {
              console.log('[Reload Sync] Restored meeting ID from sessionStorage fallback:', restoredMeetingId);
            }
          }

          if (!restoredMeetingId) {
            console.error('[Reload Sync] ❌ Recording is active but no meeting_id could be retrieved from backend or sessionStorage. Dropping sync.');
            return;
          }

          // 2. Restore active session BEFORE loading history or accepting new events
          activeMeetingIdRef.current = restoredMeetingId;
          isRecordingActiveRef.current = true;
          setCurrentMeetingId(restoredMeetingId);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('indexeddb_current_meeting_id', restoredMeetingId);
          }
          console.log(`[Reload Sync] Restored active session: ${restoredMeetingId}`);

          // 3. Fetch transcript history from backend
          const history = await transcriptService.getTranscriptHistory();
          console.log(`[Reload Sync] Retrieved ${history.length} transcript segments from backend`);

          // 4. Convert backend format to frontend Transcript format with restoredMeetingId
          const formattedTranscripts: Transcript[] = history.map((segment: any) => ({
            id: segment.id,
            text: segment.text,
            timestamp: segment.display_time, // Use display_time for UI
            sequence_id: segment.sequence_id,
            chunk_start_time: segment.audio_start_time,
            is_partial: false, // History segments are always final
            confidence: segment.confidence,
            audio_start_time: segment.audio_start_time,
            audio_end_time: segment.audio_end_time,
            duration: segment.duration,
            source: segment.source,
            speaker: segment.source === 'Microphone'
              ? 'Você'
              : (segment.source === 'System Audio' ? 'Participante' : undefined),
            meeting_id: restoredMeetingId,
          }));

          setTranscripts(formattedTranscripts);
          console.log('[Reload Sync] ✅ Transcript history synced successfully');

          // 5. Fetch meeting name from backend
          const meetingName = await recordingService.getRecordingMeetingName();
          if (meetingName) {
            console.log('[Reload Sync] Retrieved meeting name:', meetingName);
            setMeetingTitle(meetingName);
            console.log('[Reload Sync] ✅ Meeting title synced successfully');
          }
        } catch (error) {
          console.error('[Reload Sync] Failed to sync from backend:', error);
        }
      }
    };

    syncFromBackend();
  }, [recordingState.isRecording]); // Run when recording state changes

  // Manual transcript update handler (for RecordingControls component)
  const addTranscript = useCallback((update: TranscriptUpdate) => {
    console.log('🎯 addTranscript called with:', {
      sequence_id: update.sequence_id,
      text: update.text.substring(0, 50) + '...',
      timestamp: update.timestamp,
      is_partial: update.is_partial
    });

    const activeId = activeMeetingIdRef.current || currentMeetingId;
    if (!activeId) {
      console.log('🚫 addTranscript: Dropping transcript update - no active session');
      return;
    }

    if (update.meeting_id !== activeId) {
      console.log('🚫 addTranscript: Dropping transcript update from different meeting');
      return;
    }

    const newTranscript: Transcript = {
      id: update.sequence_id ? `seq_${update.sequence_id}` : Date.now().toString(),
      text: update.text,
      timestamp: update.timestamp,
      sequence_id: update.sequence_id || 0,
      chunk_start_time: update.chunk_start_time,
      is_partial: update.is_partial,
      confidence: update.confidence,
      audio_start_time: update.audio_start_time,
      audio_end_time: update.audio_end_time,
      duration: update.duration,
      source: update.source,
      speaker: update.source === 'Microphone'
        ? 'Você'
        : (update.source === 'System Audio' ? 'Participante' : undefined),
      meeting_id: update.meeting_id || activeId || undefined,
    };

    setTranscripts(prev => {
      const existingIndex = prev.findIndex(t => t.sequence_id === newTranscript.sequence_id);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.text === newTranscript.text && existing.is_partial === newTranscript.is_partial) {
          return prev;
        }
        const updated = [...prev];
        updated[existingIndex] = { ...existing, ...newTranscript, id: existing.id || newTranscript.id };
        return updated.sort((a, b) => (a.sequence_id || 0) - (b.sequence_id || 0));
      }

      // Add new transcript and sort by sequence_id to maintain order
      const updated = [...prev, newTranscript];
      const sorted = updated.sort((a, b) => (a.sequence_id || 0) - (b.sequence_id || 0));

      console.log('✅ Added new transcript. New count:', sorted.length);
      return sorted;
    });
  }, [currentMeetingId]);

  // Copy transcript to clipboard with recording-relative timestamps
  const copyTranscript = useCallback(() => {
    // Format timestamps as recording-relative [MM:SS] instead of wall-clock time
    const formatTime = (seconds: number | undefined): string => {
      if (seconds === undefined) return '[--:--]';
      const totalSecs = Math.floor(seconds);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}]`;
    };

    const fullTranscript = transcripts
      .map(t => `${formatTime(t.audio_start_time)} ${t.text}`)
      .join('\n');
    navigator.clipboard.writeText(fullTranscript);

    toast.success("Transcript copied to clipboard");
  }, [transcripts]);

  // Force flush buffer (for final transcript processing)
  const flushBuffer = useCallback(() => {
    if (finalFlushRef.current) {
      console.log('🔄 Flushing transcript buffer...');
      finalFlushRef.current();
    }
  }, []);

  // Clear only UI transcripts list/buffer
  const clearTranscriptList = useCallback(() => {
    setTranscripts([]);
    console.log('🧹 UI transcripts list cleared');
  }, []);

  // Clear active session identifiers
  const clearActiveSession = useCallback(() => {
    activeMeetingIdRef.current = null;
    isRecordingActiveRef.current = false;
    setCurrentMeetingId(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('indexeddb_current_meeting_id');
    }
    console.log('🧹 Active meeting session cleared');
  }, []);

  // Clear transcripts (used when starting new recording or explicitly clearing session)
  const clearTranscripts = useCallback(() => {
    if (isRecordingActiveRef.current) {
      console.warn('⚠️ clearTranscripts called while recording active - preserved active transcripts and session ID:', activeMeetingIdRef.current);
      return;
    }
    setTranscripts([]);
    activeMeetingIdRef.current = null;
    setCurrentMeetingId(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('indexeddb_current_meeting_id');
    }
    console.log('🧹 Transcripts and active meeting session cleared');
  }, []);

  // Restore transcripts only if they belong strictly to the active meeting session
  const restoreTranscripts = useCallback((backup: Transcript[]) => {
    const activeId = activeMeetingIdRef.current || currentMeetingId;
    if (!activeId) {
      console.warn('⚠️ restoreTranscripts ignored: no active meeting session');
      return;
    }
    const safeBackup = backup.filter(t => t.meeting_id === activeId);
    if (safeBackup.length > 0) {
      setTranscripts(safeBackup);
      transcriptsRef.current = safeBackup;
      console.log(`🔄 Transcripts restored from backup for active session ${activeId} (${safeBackup.length} segments)`);
    } else {
      console.warn(`⚠️ restoreTranscripts: backup segments do not belong to active session ${activeId}, discarding to prevent contamination`);
    }
  }, [currentMeetingId]);

  // Mark current meeting as saved in IndexedDB
  const markMeetingAsSaved = useCallback(async () => {
    // Try active session first, fallback to context state and sessionStorage
    const meetingId = activeMeetingIdRef.current || currentMeetingId || (typeof window !== 'undefined' ? sessionStorage.getItem('indexeddb_current_meeting_id') : null);

    if (!meetingId) {
      console.error('[IndexedDB] ❌ Cannot mark meeting as saved: No meeting ID available!');
      console.error('[IndexedDB] currentMeetingId:', currentMeetingId);
      return;
    }

    try {
      await indexedDBService.markMeetingSaved(meetingId);

      // Clear all sources
      activeMeetingIdRef.current = null;
      isRecordingActiveRef.current = false;
      setCurrentMeetingId(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('indexeddb_current_meeting_id');
      }
    } catch (error) {
      console.error('[IndexedDB] ❌ Failed to mark meeting as saved:', error);
    }
  }, [currentMeetingId]);

  const value: TranscriptContextType = {
    transcripts,
    transcriptsRef,
    addTranscript,
    copyTranscript,
    flushBuffer,
    transcriptContainerRef,
    meetingTitle,
    setMeetingTitle,
    clearTranscripts,
    clearTranscriptList,
    clearActiveSession,
    restoreTranscripts,
    currentMeetingId,
    markMeetingAsSaved,
  };

  return (
    <TranscriptContext.Provider value={value}>
      {children}
    </TranscriptContext.Provider>
  );
}

export function useTranscripts() {
  const context = useContext(TranscriptContext);
  if (context === undefined) {
    throw new Error('useTranscripts must be used within a TranscriptProvider');
  }
  return context;
}
