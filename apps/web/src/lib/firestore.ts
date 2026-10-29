import {
  type DocumentReference,
  type Query,
  doc,
  getDoc,
  onSnapshot,
  queryEqual,
  refEqual,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { db } from './firebase';

interface LiveState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Realtime single document. Pass null to disable. Unsubscribes on unmount. */
export function useLiveDoc<T>(path: string | null): LiveState<T | null> {
  const [state, setState] = useState<LiveState<T | null>>({ data: null, loading: !!path, error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      doc(db, path),
      (snap) => setState({ data: (snap.exists() ? (snap.data() as T) : null), loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [path]);
  return state;
}

/** Realtime query. Keep queries bounded (limit) – never listen to a whole class history. */
export function useLiveQuery<T>(q: Query | null): LiveState<T[]> {
  const [state, setState] = useState<LiveState<T[]>>({ data: [], loading: !!q, error: null });
  const prev = useRef<Query | null>(null);
  const stable = q && prev.current && queryEqual(q, prev.current) ? prev.current : q;
  prev.current = stable;
  useEffect(() => {
    if (!stable) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      stable,
      (snap) => setState({ data: snap.docs.map((d) => d.data() as T), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
  }, [stable]);
  return state;
}

/** One-off read (e.g. my reaction on a post). */
export function useOnceDoc<T>(path: string | null, version = 0) {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    getDoc(doc(db, path))
      .then((s) => alive && setData((s.data() as T) ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [path, version]);
  return [data, setData] as const;
}

export const sameRef = (a: DocumentReference | null, b: DocumentReference | null) => (a && b ? refEqual(a, b) : a === b);
