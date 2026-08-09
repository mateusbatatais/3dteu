"use client";

import { useEffect, useState } from "react";

// Mantém só "teu" — "tua"/"seu"/"sua" não combinam com a logo (que já
// termina em "TEU"), por pedido explícito.
const WORDS = ["espaço", "negócio", "universo", "dia", "jeito", "projeto", "mundo"];

export function RotatingTeu({ interval = 2400 }: { interval?: number }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fadeOut = setTimeout(() => setVisible(false), interval - 300);
    const advance = setTimeout(() => {
      setIndex((i) => (i + 1) % WORDS.length);
      setVisible(true);
    }, interval);

    return () => {
      clearTimeout(fadeOut);
      clearTimeout(advance);
    };
  }, [index, interval]);

  return (
    <span
      className={`inline-block text-brand-orange transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      Teu {WORDS[index]}
    </span>
  );
}
