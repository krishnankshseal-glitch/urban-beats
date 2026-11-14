"use client";

import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedStyles = { position: "", top: "", left: "", right: "", width: "", paddingRight: "" };

/**
 * Freezes the page behind an open popup so only the popup itself can scroll,
 * without the page jumping: the page is pinned exactly where it was and put
 * back at the same scroll position when the last popup closes. Counts how many
 * popups are open, so one closing never unlocks the page while another (e.g. a
 * confirmation on top of an edit form) is still showing.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedStyles = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        paddingRight: body.style.paddingRight,
      };
      // Hiding the scrollbar would make the page jump sideways; pad by its width instead.
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) {
        Object.assign(body.style, savedStyles);
        const html = document.documentElement;
        const previousBehavior = html.style.scrollBehavior;
        html.style.scrollBehavior = "auto"; // restore instantly, never as a visible scroll animation
        window.scrollTo(0, savedScrollY);
        html.style.scrollBehavior = previousBehavior;
      }
    };
  }, [active]);
}
