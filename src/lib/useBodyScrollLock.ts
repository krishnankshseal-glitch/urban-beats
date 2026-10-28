"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedBodyOverflow = "";
let savedHtmlOverflow = "";
let savedPaddingRight = "";

/**
 * Freezes the page behind an open popup so only the popup itself can scroll.
 * Counts how many popups are open, so one closing never unlocks the page while
 * another (e.g. a confirmation on top of an edit form) is still showing.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const html = document.documentElement;
    if (lockCount === 0) {
      savedBodyOverflow = body.style.overflow;
      savedHtmlOverflow = html.style.overflow;
      savedPaddingRight = body.style.paddingRight;
      // Hiding the scrollbar would make the page jump sideways; pad by its width instead.
      const scrollbarWidth = window.innerWidth - html.clientWidth;
      body.style.overflow = "hidden";
      html.style.overflow = "hidden";
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) {
        body.style.overflow = savedBodyOverflow;
        html.style.overflow = savedHtmlOverflow;
        body.style.paddingRight = savedPaddingRight;
      }
    };
  }, [active]);
}
