'use client';

import { useEffect } from 'react';

export function DarkModeApplier() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return null;
}
