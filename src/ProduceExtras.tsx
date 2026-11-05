import type { ReactNode } from "react";

const Leaf = ({ x = 104, y = 48, color = "#64834d" }: { x?: number; y?: number; color?: string }) => (
  <path d={`M${x} ${y}q8-28 36-21-9 26-36 21Z`} fill={color} />
);
const Tuber = ({ color, light }: { color: string; light: string }) => <>
  <path d="M49 92c8-34 39-39 65-29 31-11 56 10 49 42-4 34-41 56-70 50-32 9-62-26-44-63Z" fill={color} />
  <path d="M64 91q19-25 49-14" fill="none" stroke={light} strokeWidth="11" strokeLinecap="round" />
  <g fill="#795b473e"><ellipse cx="75" cy="112" rx="4" ry="3" /><ellipse cx="120" cy="90" rx="4" ry="3" /><ellipse cx="123" cy="132" rx="3" ry="2" /></g>
</>;
const RoundFruit = ({ color, light, plum = false }: { color: string; light: string; plum?: boolean }) => <>
  <path d="M99 67C74 45 39 65 39 105c0 38 30 60 60 49 30 11 60-11 60-49 0-40-35-60-60-38Z" fill={color} />
  <path d="M67 80q-18 17-11 37" fill="none" stroke={light} strokeWidth="9" strokeLinecap="round" />
  {plum && <path d="M103 72q-12 40 1 76" fill="none" stroke={light} strokeWidth="3" />}
  <path d="M100 68q-7-22 5-34" fill="none" stroke="#7e6643" strokeWidth="6" strokeLinecap="round" /><Leaf />
</>;
const LongSquash = ({ color, light }: { color: string; light: string }) => <>
  <path d="M51 143c-11-12-10-29 4-45l67-67q14-14 29 1t0 30l-63 76q-22 24-37 5Z" fill={color} />
  <path d="m63 127 69-76" stroke={light} strokeWidth="8" strokeLinecap="round" />
  <path d="m138 32 12-16 11 7-13 15" fill="#718454" />
</>;

// Same flat silhouettes, muted harvest colors and small highlights as Produce.
export const extraProduceArt: Record<string, ReactNode> = {
  honey: <>
    <rect x="55" y="58" width="90" height="101" rx="22" fill="#cc913c" />
    <rect x="62" y="75" width="76" height="76" rx="15" fill="#e9b85d" />
    <rect x="53" y="42" width="94" height="25" rx="7" fill="#65734a" />
    <path d="M68 50h64" stroke="#92a174" strokeWidth="4" strokeLinecap="round" />
    <rect x="69" y="94" width="62" height="37" rx="5" fill="#faf0ce" />
    <path d="M100 101q-20 21 0 24 20-3 0-24" fill="#c88b35" />
    <path d="M69 79v12" stroke="#f8d898" strokeWidth="7" strokeLinecap="round" />
  </>,
  ginger: <>
    <path d="M42 117q-8-19 13-26l28-6-5-31q0-17 18-17 17 2 15 23l-1 19 26-14q21-7 24 11 1 13-21 23l-24 12 23 16q17 14 4 26-14 10-28-5l-22-18-20 20q-14 14-28 2-10-12 7-25Z" fill="#c4a073" />
    <path d="m89 49 5 34m-34 20 25-6m36-8 23-11m-43 37 26 23m-59-6 15-18" stroke="#dfc297" strokeWidth="7" strokeLinecap="round" />
  </>,
  garlic: <>
    <path d="M93 29h15l-3 36q8 12 32 24 28 17 19 43-12 27-53 26-43 1-58-25-10-24 17-43 22-13 31-25Z" fill="#e7d9bb" />
    <path d="M94 67q-37 58-14 87m23-85q21 49 14 86m-17-79v76" fill="none" stroke="#faf0d6" strokeWidth="8" strokeLinecap="round" />
    <path d="m89 160-8 10m19-11v14m11-13 8 10" stroke="#b39a78" strokeWidth="3" />
  </>,
  banana: <>
    <path d="M45 67q36 81 108 13-6 57-53 68-48 3-67-47Z" fill="#dbab46" />
    <path d="M55 40q13 83 90 52-24 48-69 36-39-17-40-59Z" fill="#edc45f" />
    <path d="M65 34q-5 66 64 63-39 28-65 3-23-25-17-52Z" fill="#f3d57d" />
    <path d="m48 44 9-15 12 5-4 13m-30 39-8 12 8 8m110-22 10-11 6 5-9 11" fill="#7b7147" />
  </>,
  avocado: <>
    <path d="M82 44q18-22 36 0l29 55c21 40-2 63-47 63s-68-23-47-63Z" fill="#55734a" />
    <path d="M89 51q11-13 22 0l27 54c15 30-2 48-38 48s-53-18-38-48Z" fill="#b4c875" />
    <ellipse cx="100" cy="115" rx="24" ry="27" fill="#9a724d" /><ellipse cx="93" cy="108" rx="12" ry="15" fill="#b78e60" />
  </>,
  mango: <>
    <path d="M129 47C88 20 44 57 47 104c1 34 17 57 50 52 43-6 72-77 32-109Z" fill="#e8b45b" />
    <path d="M119 49c-27-12-51 10-57 36" stroke="#f5d18b" strokeWidth="10" fill="none" strokeLinecap="round" />
    <path d="M130 49q5-19 21-24" stroke="#7a7149" strokeWidth="6" fill="none" /><Leaf x={137} y={45} />
  </>,
  orange: <>
    <circle cx="99" cy="105" r="55" fill="#e5a04a" /><path d="M64 80q-16 18-11 39" stroke="#f3c379" strokeWidth="10" fill="none" strokeLinecap="round" />
    <path d="m94 51 5-18" stroke="#7c7448" strokeWidth="6" /><Leaf x={104} y={48} />
    <g fill="#c67f373d"><circle cx="121" cy="89" r="2" /><circle cx="135" cy="116" r="2" /><circle cx="100" cy="137" r="2" /><circle cx="119" cy="135" r="2" /></g>
  </>,
  citrus: <>
    <path d="M43 102q-8-9 1-16 10-37 46-29 31 6 37 34 12 11 2 18-14 33-46 26-28-4-40-33Z" fill="#e8c967" />
    <path d="M53 88q10-21 33-20" stroke="#f6e4a3" strokeWidth="7" fill="none" strokeLinecap="round" />
    <circle cx="128" cy="124" r="36" fill="#789850" /><circle cx="128" cy="124" r="28" fill="#c6d68d" />
    <path d="m128 97 1 54m-25-39 47 25m-46 1 45-29" stroke="#e9ebba" strokeWidth="3" />
  </>,
  peach: <RoundFruit color="#e4a07d" light="#f3c29c" plum />,
  plum: <RoundFruit color="#8c6684" light="#b28eac" plum />,
  apple: <RoundFruit color="#c96f58" light="#e99a7d" />,
  pear: <>
    <path d="M82 57q2-23 20-23t20 25c2 20 30 37 32 59 3 27-21 42-53 42s-56-15-53-42c2-22 31-39 34-61Z" fill="#b4b66b" />
    <path d="M87 69q-2 23-20 43-8 13-2 23" stroke="#d6d396" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="M101 36q-4-16 7-23" stroke="#806d49" strokeWidth="5" fill="none" /><Leaf x={107} y={35} />
  </>,
  grapes: <>
    <path d="M102 61q-2-29 17-35" stroke="#7d7750" strokeWidth="6" fill="none" /><Leaf x={106} y={51} />
    <g fill="#9e6c88"><circle cx="73" cy="79" r="22" /><circle cx="115" cy="79" r="22" /><circle cx="94" cy="109" r="23" /><circle cx="133" cy="106" r="20" /><circle cx="66" cy="113" r="19" /><circle cx="110" cy="136" r="20" /><circle cx="86" cy="149" r="17" /></g>
    <g fill="#c094ad"><ellipse cx="67" cy="74" rx="7" ry="5" /><ellipse cx="109" cy="73" rx="7" ry="5" /><ellipse cx="89" cy="103" rx="7" ry="5" /><ellipse cx="105" cy="130" rx="6" ry="4" /></g>
  </>,
  "cherry-pepper": <>
    <path d="M72 87q-6-33 14-45m45 62q14-26 3-51" stroke="#67834e" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M73 85C40 64 26 96 39 123q15 27 38 14 25 9 35-17 8-27-16-36Z" fill="#d46e4e" />
    <path d="M131 102c-27-17-45 6-36 30q12 25 35 19 24 7 34-15 10-28-13-34Z" fill="#bd5c47" />
    <path d="m61 84 12-11 12 11m34 19 12-10 12 10" fill="#67834e" /><path d="M48 100v12m58 7v10" stroke="#ed9b72" strokeWidth="6" strokeLinecap="round" />
  </>,
  jalapeno: <>
    <path d="M85 55q23-23 43-6 28 25 0 63-17 22-58 43-11 5-7-4 21-32 13-65-5-20 9-31Z" fill="#547c49" />
    <path d="M91 65q19-15 25 4" stroke="#88a264" strokeWidth="8" fill="none" strokeLinecap="round" />
    <path d="M108 48q-5-22 11-29" stroke="#69844f" strokeWidth="8" fill="none" strokeLinecap="round" />
  </>,
  "bell-pepper": <>
    <path d="M99 66c-23-29-60-9-58 27l6 42q9 30 32 18 22 14 41 0 25 10 33-21l7-39c4-34-32-55-61-27Z" fill="#cc6a50" />
    <path d="M79 69q-11 36 0 78m39-77q11 37 0 77" stroke="#e58d6c" strokeWidth="8" fill="none" strokeLinecap="round" />
    <path d="M100 66q-9-33 9-43" stroke="#68804d" strokeWidth="10" fill="none" strokeLinecap="round" /><path d="m77 64 22-11 24 10-23 9Z" fill="#5c7b48" />
  </>,
  zucchini: <LongSquash color="#6c8652" light="#a3b27a" />,
  "spaghetti-squash": <>
    <ellipse cx="100" cy="103" rx="57" ry="50" transform="rotate(-25 100 103)" fill="#d4b763" />
    <path d="M55 100q21-48 74-29m-68 53q31-44 82-41m-58 57q32-30 62-38" fill="none" stroke="#e9ce86" strokeWidth="6" strokeLinecap="round" />
    <path d="m143 65 12-19 10 7-13 20" fill="#7c8051" />
  </>,
  "acorn-squash": <>
    <path d="M100 59c-26-21-61 1-60 31 0 39 22 59 60 75 38-16 60-36 60-75 1-30-34-52-60-31Z" fill="#566f4b" />
    <path d="M79 65q-24 45 17 90m25-90q24 45-17 90m-4-90v88" fill="none" stroke="#879761" strokeWidth="8" strokeLinecap="round" />
    <path d="M97 60q-5-23 7-35" stroke="#8b8557" strokeWidth="9" fill="none" />
  </>,
  butternut: <>
    <path d="M85 43q15-17 31 0c10 15-1 35 5 47 5 13 29 21 28 42-1 24-21 34-47 34s-47-10-48-34c-1-21 22-29 28-42 6-12-7-32 3-47Z" fill="#d6ac74" />
    <path d="M96 49q-7 22-2 36m-8 26q-17 10-15 23" stroke="#efd1a3" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="m98 39-1-18 11-2 2 20" fill="#7d8253" />
  </>,
  cabbage: <>
    <circle cx="100" cy="103" r="57" fill="#89a268" />
    <path d="M102 151Q36 146 43 98q37-2 59 53m0 0q64-9 55-53-34-5-55 53" fill="#a8bf80" />
    <path d="M98 135Q54 107 65 65q34-22 66 0 10 42-33 70" fill="#bfd29a" />
    <path d="M73 73q43-15 47 18-49-15-38 24m17-52q35 22 8 64m-52-13 42 35 46-36" fill="none" stroke="#e0e6ba" strokeWidth="4" strokeLinecap="round" />
  </>,
  beans: <>
    <g fill="none" strokeLinecap="round"><path d="M54 147Q118 117 123 40" stroke="#557b48" strokeWidth="17" /><path d="M79 157Q142 118 145 61" stroke="#7d9a59" strokeWidth="16" /><path d="M43 117Q87 83 87 45" stroke="#8aa765" strokeWidth="15" />
    <path d="M58 142q52-31 60-91m-34 98q48-38 55-80m-90 41q30-25 33-56" stroke="#aec38a" strokeWidth="3" /></g>
  </>,
  beet: <>
    <path d="M92 78Q65 32 49 38q-14 26 35 49m20-11q-5-52 18-56 25 28-10 60m2 5q29-49 47-34 2 31-40 43" fill="#68834f" />
    <path d="m94 89-23-41m31 35 21-51m-13 57 38-28" stroke="#9a6570" strokeWidth="5" />
    <path d="M99 85c-40-13-61 16-45 44 12 20 30 24 44 29l4 18 7-19c25-8 48-27 38-51-6-17-24-28-48-21Z" fill="#a36679" />
    <path d="M70 103q-10 13 0 26" stroke="#c8929e" strokeWidth="8" fill="none" strokeLinecap="round" />
  </>,
  "sweet-potato": <>
    <path d="M40 128c12-9 11-35 36-45 26-12 53-4 79-30 7-6 9 1 6 11-5 23 1 51-25 69-26 17-58 7-84 18-16 7-25-10-12-23Z" fill="#ad7966" />
    <path d="M58 125q24-31 57-28" stroke="#d8a181" strokeWidth="9" fill="none" strokeLinecap="round" />
    <path d="m83 113 3 5m36-4 3 5" stroke="#8e5f52" strokeWidth="4" strokeLinecap="round" />
  </>,
  "red-potato": <Tuber color="#b47b7c" light="#d5a09a" />,
  radish: <>
    <path d="M91 81Q54 42 62 28q23 0 39 48m7 0q-3-52 18-50 13 24-9 56m0 3q26-36 42-24-1 21-34 31" fill="#789653" />
    <path d="M98 82c-37-12-58 18-43 46 12 20 31 28 48 37 19-9 37-17 47-37 13-28-13-58-52-46Z" fill="#ce7880" />
    <path d="M57 131q43 16 91-1-11 22-45 35-32-15-46-34Z" fill="#f4e7d0" />
    <path d="m103 165 1 13" stroke="#d4baa0" strokeWidth="3" /><path d="M68 100q-9 13-2 22" stroke="#e9a0a2" strokeWidth="7" fill="none" strokeLinecap="round" />
  </>,
};
