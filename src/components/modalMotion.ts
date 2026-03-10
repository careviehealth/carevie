"use client";

export const modalEase = [0.22, 1, 0.36, 1] as const;

export const modalOverlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalSurfaceMotion = {
  initial: { opacity: 0, y: 20, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 14, scale: 0.985 },
};

export const modalOverlayTransition = {
  duration: 0.18,
  ease: modalEase,
};

export const modalSurfaceTransition = {
  duration: 0.24,
  ease: modalEase,
};
