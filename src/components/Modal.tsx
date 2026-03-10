"use client";

import { motion } from "framer-motion";
import {
  modalOverlayMotion,
  modalOverlayTransition,
  modalSurfaceMotion,
  modalSurfaceTransition,
} from "@/components/modalMotion";

export default function Modal({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      {...modalOverlayMotion}
      transition={modalOverlayTransition}
    >
      <motion.div
        className={`bg-white w-full rounded-2xl p-6 relative ${className ?? 'max-w-xl'}`.trim()}
        {...modalSurfaceMotion}
        transition={modalSurfaceTransition}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-black"
        >
          ✕
        </button>
        {children}
      </motion.div>
    </motion.div>
  );
}
