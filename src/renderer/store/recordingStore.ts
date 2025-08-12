import { create } from 'zustand';

interface Note {
  content: string;
  timestamp: number;
  screenshots?: string[];
  audioSegment?: {
    start: number;
    end: number;
  };
}

interface RecordingStore {
  notes: Note[];
  currentSessionId: string | null;
  isRecording: boolean;
  recordingStartTime: number | null;
  audioDevices: any[];
  selectedMic: string | null;
  selectedSystem: string | null;
  
  addNote: (note: Note) => void;
  updateNote: (index: number, note: Partial<Note>) => void;
  deleteNote: (index: number) => void;
  clearNotes: () => void;
  
  setSessionId: (id: string | null) => void;
  setRecording: (status: boolean) => void;
  setRecordingStartTime: (time: number | null) => void;
  setAudioDevices: (list: any[]) => void;
  setSelectedMic: (v: string | null) => void;
  setSelectedSystem: (v: string | null) => void;
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  notes: [],
  currentSessionId: null,
  isRecording: false,
  recordingStartTime: null,
  audioDevices: [],
  selectedMic: null,
  selectedSystem: null,
  
  addNote: (note) =>
    set((state) => ({
      notes: [...state.notes, note],
    })),
  
  updateNote: (index, note) =>
    set((state) => ({
      notes: state.notes.map((n, i) => (i === index ? { ...n, ...note } : n)),
    })),
  
  deleteNote: (index) =>
    set((state) => ({
      notes: state.notes.filter((_, i) => i !== index),
    })),
  
  clearNotes: () =>
    set(() => ({
      notes: [],
    })),
  
  setSessionId: (id) =>
    set(() => ({
      currentSessionId: id,
    })),
  
  setRecording: (status) =>
    set(() => ({
      isRecording: status,
    })),
  
  setRecordingStartTime: (time) =>
    set(() => ({
      recordingStartTime: time,
    })),
  
  setAudioDevices: (list) =>
    set(() => ({
      audioDevices: list,
    })),
  
  setSelectedMic: (v) =>
    set(() => ({
      selectedMic: v,
    })),
  
  setSelectedSystem: (v) =>
    set(() => ({
      selectedSystem: v,
    })),
}));