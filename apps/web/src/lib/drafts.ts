import { useCallback, useEffect, useRef, useState } from 'react';

const read = (key: string) => {
  try {
    return localStorage.getItem(`draft:${key}`) ?? '';
  } catch {
    return '';
  }
};
const write = (key: string, v: string) => {
  try {
    if (v) localStorage.setItem(`draft:${key}`, v);
    else localStorage.removeItem(`draft:${key}`);
  } catch {
    /* storage unavailable */
  }
};

/** Text state that is auto-saved locally, so drafts survive reloads and network drops. */
export function useDraft(key: string) {
  const [value, setValue] = useState(() => read(key));
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValue(read(key));
    }
  }, [key]);
  useEffect(() => {
    const t = setTimeout(() => write(key, value), 300);
    return () => clearTimeout(t);
  }, [key, value]);
  const clear = useCallback(() => {
    write(key, '');
    setValue('');
  }, [key]);
  return [value, setValue, clear] as const;
}
