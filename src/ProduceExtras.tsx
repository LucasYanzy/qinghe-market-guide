import type { ReactNode } from "react";

export type ProducePaint = { body: string; leaf: string; flesh: string };
export type ProduceDrawing = (paint: ProducePaint) => ReactNode;

function Leaf({ x, y, rotate = 0, scale = 1, fill }: { x: number; y: number; rotate?: number; scale?: number; fill: string }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
    <path d="M0 0C-4-18 8-32 30-32 31-12 17 0 0 0Z" fill={fill} />
    <path d="M2-3 23-25" fill="none" stroke="#f4f0c7" strokeOpacity=".4" strokeWidth="1.4" strokeLinecap="round" />
  </g>;
}

// Simple filled paths keep the illustrations sharp at bag-icon size, without filters or textures.
export const extraProduceArt: Record<string, ProduceDrawing> = {
  honey: ({ body }) => <>
    <path d="M61 64h78v13c11 6 13 15 13 29v39c0 14-9 20-22 20H70c-14 0-22-6-22-20v-39c0-14 3-23 13-29Z" fill="#e8d9b7" />
    <path d="M56 93q44 7 88 0v51q0 14-16 14H72q-16 0-16-14Z" fill={body} />
    <path d="M58 90q41 10 84 0" fill="none" stroke="#f9d386" strokeWidth="3" />
    <rect x="56" y="46" width="88" height="23" rx="6" fill="#647548" />
    <path d="M62 50h76M63 62h74" stroke="#a9b17b" strokeWidth="2" strokeLinecap="round" />
    <path d="M58 74q43 7 84 0" fill="none" stroke="#ad8d59" strokeWidth="3" />
    <path d="m132 75 12 16m-13-16q14-12 18-3-2 7-18 3Z" fill="none" stroke="#ad8d59" strokeWidth="2" strokeLinecap="round" />
    <rect x="69" y="104" width="63" height="39" rx="12" fill="#fff4d9" />
    <g transform="translate(100 124)"><path d="M-2-6q-15-15-14-2 2 9 14 6M2-6q15-15 14-2-2 9-14 6" fill="#deddb4" /><ellipse rx="9" ry="11" fill="#c7953e" /><path d="M-8-3H8M-8 4H8" stroke="#6d5c38" strokeWidth="3" /><path d="m-3-11-3-4m9 4 3-4" stroke="#6d5c38" strokeWidth="1.5" strokeLinecap="round" /></g>
    <path d="M63 86q-5 8-4 19v27" stroke="#fffbeb" strokeWidth="4" strokeOpacity=".65" fill="none" strokeLinecap="round" />
  </>,
  ginger: ({ body }) => <>
    <path d="M46 124c-15-6-12-23 1-28l24-7-7-19c-6-15 5-28 17-22 10 3 9 15 12 25l8 12 23-20c12-13 31-13 35 1 4 13-9 20-21 25l-17 12 18 12c18 8 18 26 4 31-12 5-22-9-31-15l-11-7-11 16c-9 15-25 19-33 8-6-9 3-17 8-23Z" fill={body} />
    <path d="M76 54q-8 3-3 16m60 2 14-5m-25 61 13 9m-65 8 10-14M43 105l16-4" fill="none" stroke="#f4d9a7" strokeWidth="3.5" strokeLinecap="round" />
    <path d="m69 78 12-5m-8 19 10-5m35-10 8 9m-15 8 6 8m-29 17 9 7m-21-13 7 7m32-3 7-8m9 16 6-6" stroke="#ab814d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M84 101q7-5 12 0m2 8q2 6 8 7" stroke="#dfbd84" strokeWidth="2" fill="none" strokeLinecap="round" />
  </>,
  garlic: ({ body }) => <>
    <path d="m94 30 14-2-3 40c5 15 35 18 45 40 16 34-8 55-49 55-39 0-64-22-48-54 10-21 33-26 40-41Z" fill={body} />
    <path d="M95 76q-36 22-35 49 1 21 24 30-19-36 14-79m5-1q35 22 35 49-1 24-24 32 18-38-11-81Z" fill="#faf0d9" />
    <path d="M100 73q-17 43-9 83m12-82q14 39 7 82" fill="none" stroke="#cfbca3" strokeWidth="1.5" />
    <path d="m98 35-1 30m6-32-2 27" stroke="#faf3dc" strokeWidth="2" strokeLinecap="round" />
    <path d="m88 161-6 8m12-6-1 10m8-10 2 11m6-12 7 8" fill="none" stroke="#a99169" strokeWidth="1.7" strokeLinecap="round" />
  </>,
  banana: ({ body }) => <>
    <path d="M53 48c0 51 40 85 95 48-12 43-52 62-86 42C39 125 31 91 40 61Z" fill="#c69a35" />
    <path d="M64 39c-5 51 28 80 85 46-11 43-51 66-82 48-27-16-34-49-18-80Z" fill={body} />
    <path d="M72 37c-7 47 20 70 65 47-17 32-47 42-67 23-18-17-24-41-13-64Z" fill="#f1d576" />
    <path d="M59 57q-6 43 26 58m-39-42q-2 49 37 62" fill="none" stroke="#fff0ab" strokeWidth="3" strokeLinecap="round" />
    <path d="m53 45 4-16 17 4-3 12-10-1-5 8Zm86 41 6-10 9 4-6 10Z" fill="#797047" />
    <path d="m39 102-4 6 5 8m102-7 5-4" fill="none" stroke="#9d7c35" strokeWidth="2" strokeLinecap="round" />
  </>,
  avocado: ({ body, flesh }) => <>
    <path d="M116 43q17-15 29 5c5 12 3 29 13 47 19 34 7 58-23 64-29 5-47-14-41-40 3-20 12-28 13-48 0-12 2-21 9-28Z" fill="#355c3c" />
    <path d="M83 41q18-19 32 3c8 13 3 27 16 47 23 36 17 70-27 74-47 4-68-24-46-64 14-25 15-48 25-60Z" fill={body} />
    <path d="M88 48q11-12 20 3c8 15 3 29 16 50 20 32 11 55-22 57-36 2-51-18-32-51 14-26 9-45 18-59Z" fill={flesh} />
    <ellipse cx="98" cy="122" rx="25" ry="28" transform="rotate(-9 98 122)" fill="#96643e" />
    <path d="M79 121c-1-19 15-31 28-19-17-3-23 10-23 26Z" fill="#c0935b" />
    <path d="m91 48 5-14" stroke="#617044" strokeWidth="3" strokeLinecap="round" />
  </>,
  mango: ({ body, leaf }) => <>
    <path d="M125 49C92 26 50 49 43 88c-9 41 16 75 49 73 28-1 53-29 56-60 3-26-6-43-23-52Z" fill={body} />
    <path d="M123 55c25 25 17 65-11 89 15-30 14-61-1-82Z" fill="#dc7c58" opacity=".55" />
    <path d="M67 63q-18 14-19 35" stroke="#fae1a1" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M125 49q3-17 16-23" stroke="#72633d" strokeWidth="4" fill="none" strokeLinecap="round" /><Leaf x={133} y={43} rotate={15} scale={.9} fill={leaf} />
    <path d="m62 130 2 1m7-79 1-1" stroke="#c8954a" strokeWidth="2" strokeLinecap="round" />
  </>,
  orange: ({ body, leaf, flesh }) => <>
    <circle cx="89" cy="101" r="54" fill={body} />
    <path d="M57 74q-13 14-14 32" stroke="#ffda8b" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="m88 48 3-16" stroke="#6c7441" strokeWidth="4" strokeLinecap="round" /><Leaf x={95} y={47} rotate={18} fill={leaf} />
    <g fill="#bc742a" opacity=".45"><circle cx="63" cy="120" r="1.3" /><circle cx="74" cy="138" r="1.2" /><circle cx="52" cy="111" r="1.2" /><circle cx="96" cy="65" r="1.3" /><circle cx="105" cy="76" r="1" /></g>
    <circle cx="132" cy="134" r="34" fill="#db9238" /><circle cx="132" cy="132" r="31" fill="#fff0c0" /><circle cx="132" cy="132" r="26" fill={flesh} />
    <path d="M132 106v52m-26-26h52m-44-18 36 36m0-36-36 36" stroke="#fff0c0" strokeWidth="2" /><circle cx="132" cy="132" r="3" fill="#fff0c0" />
  </>,
  citrus: ({ body, flesh, leaf }) => <>
    <path d="M47 77q-4-13 9-12c20-24 53-21 72 5 13 5 15 17 2 23-13 28-45 38-72 16-15 0-19-12-11-19Z" fill={body} transform="rotate(-19 88 88)" />
    <path d="M51 80q10-20 33-23" stroke="#fff1ae" strokeWidth="4" fill="none" strokeLinecap="round" />
    <Leaf x={114} y={56} rotate={35} scale={.85} fill={leaf} />
    <circle cx="128" cy="130" r="36" fill="#6a8b42" /><circle cx="128" cy="128" r="32" fill="#e9edbd" /><circle cx="128" cy="128" r="27" fill={flesh} />
    <path d="M128 101v54m-27-27h54m-46-19 38 38m0-38-38 38" stroke="#eef2cc" strokeWidth="2" /><circle cx="128" cy="128" r="3.5" fill="#eef2cc" />
  </>,
  peach: ({ body, leaf }) => <>
    <path d="M101 65C75 43 40 65 42 102c2 33 26 48 58 63 32-15 58-36 57-66-1-35-32-53-56-34Z" fill={body} />
    <path d="M106 65c-9 18-8 31-2 49 6 17 5 32-4 46" fill="none" stroke="#bd6e60" strokeWidth="2" strokeLinecap="round" />
    <path d="M65 77q-15 14-14 32" fill="none" stroke="#ffe3b7" strokeWidth="4" strokeLinecap="round" />
    <path d="m99 64 3-20" stroke="#85623e" strokeWidth="4" strokeLinecap="round" /><Leaf x={105} y={54} rotate={30} scale={1.05} fill={leaf} />
    <path d="m125 123 1 1m7-10 1 1m-14 21 1 1" stroke="#ce7e66" strokeWidth="1.5" strokeLinecap="round" />
  </>,
  plum: ({ body, leaf }) => <>
    <path d="M99 58c-29-15-52 12-51 47 1 34 20 57 51 57 33 0 53-24 54-56 1-35-24-61-54-48Z" fill={body} />
    <path d="M103 60c-8 29-7 66 1 93" fill="none" stroke="#503d60" strokeWidth="2" strokeLinecap="round" />
    <path d="M70 73q-17 14-14 35" fill="none" stroke="#d1b5cb" strokeWidth="4" strokeLinecap="round" />
    <path d="M62 125q7 21 27 27" fill="none" stroke="#b398b7" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" />
    <path d="M100 57q-5-16 3-28" stroke="#776344" strokeWidth="4" fill="none" strokeLinecap="round" /><Leaf x={107} y={47} rotate={22} scale={.8} fill={leaf} />
  </>,
  apple: ({ body, leaf }) => <>
    <path d="M99 63c-23-16-54-12-59 20-5 30 7 67 27 77 12 7 23-2 32-2s22 9 34 1c19-13 29-44 26-72-4-33-35-43-60-24Z" fill={body} />
    <path d="M65 73q-16 8-17 28" fill="none" stroke="#f9bb96" strokeWidth="4" strokeLinecap="round" />
    <path d="M137 83q15 35-4 63" fill="none" stroke="#ae5346" strokeWidth="2" strokeLinecap="round" opacity=".65" />
    <path d="M98 65q-8-19 2-34" fill="none" stroke="#7e5e3c" strokeWidth="4.5" strokeLinecap="round" /><Leaf x={103} y={49} rotate={25} fill={leaf} />
    <path d="m91 65 8 3 9-4m-14 95 5-3 5 3" fill="none" stroke="#8e4f39" strokeWidth="2" strokeLinecap="round" />
  </>,
  pear: ({ body, leaf }) => <>
    <path d="M82 57q0-24 19-23c15 1 21 10 22 28 2 20 27 35 31 58 6 30-18 44-51 45-34 1-60-15-55-43 4-25 33-45 34-65Z" fill={body} />
    <path d="M88 63q-2 21-22 45-8 10-9 21" stroke="#e7e2af" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M102 35q-6-15 5-25" stroke="#80623f" strokeWidth="4" fill="none" strokeLinecap="round" /><Leaf x={110} y={33} rotate={36} scale={.8} fill={leaf} />
    <g fill="#8d9550" opacity=".6"><circle cx="80" cy="130" r="1.2" /><circle cx="93" cy="146" r="1" /><circle cx="120" cy="123" r="1.2" /><circle cx="130" cy="138" r="1" /><circle cx="112" cy="94" r="1" /><circle cx="70" cy="143" r="1" /></g>
  </>,
  grapes: ({ body, leaf }) => <>
    <path d="M98 65q5-26 24-38m-22 34L75 75m27-13 24 19" stroke="#7b7043" strokeWidth="3" fill="none" strokeLinecap="round" /><Leaf x={107} y={54} rotate={30} scale={1.1} fill={leaf} />
    <g fill={body} stroke="#77536c" strokeWidth="1.2">
      <circle cx="77" cy="79" r="20" /><circle cx="114" cy="80" r="21" /><circle cx="61" cy="111" r="20" /><circle cx="131" cy="111" r="20" /><circle cx="78" cy="141" r="19" /><circle cx="112" cy="142" r="19" /><circle cx="95" cy="111" r="22" /><circle cx="96" cy="161" r="15" />
    </g>
    <path d="M66 74q2-7 10-8m28 9q2-7 10-8m-65 39q1-7 9-8m65 8q1-7 8-8m-47 5q2-8 11-9m-26 38q1-6 8-7m26 7q1-6 8-7m-23 32q1-5 6-6" fill="none" stroke="#dbb0c8" strokeWidth="2.5" strokeLinecap="round" />
  </>,
  "cherry-pepper": ({ body, leaf }) => <>
    <path d="M73 80q-9-27 7-43m47 65q12-28 2-47" stroke="#56733c" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M74 77C49 62 31 80 33 105c2 26 19 42 40 38 23 5 43-14 43-39 0-24-18-40-42-27Z" fill={body} />
    <path d="M128 100c-23-14-42 3-41 26 2 24 20 39 40 35 24 4 43-12 43-36 0-23-19-38-42-25Z" fill="#bc5748" />
    <path d="m60 80 11-12 8 9 14-3-11 13-12-3-9 6Zm54 22 11-11 8 8 13-3-8 11-12-3-10 6Z" fill={leaf} />
    <path d="M49 90q-6 10-3 21m57 5q-5 8-2 16" stroke="#f7b08a" strokeWidth="3" fill="none" strokeLinecap="round" />
  </>,
  jalapeno: ({ body, leaf }) => <>
    <path d="M86 57c19-20 46-13 52 9 14 44-38 84-84 96-7 1-7-3-1-7 31-23 27-41 23-65-3-13 0-25 10-33Z" fill={body} />
    <path d="M89 70q18-14 29 0m-10 23q-3 27-25 46" stroke="#a9c17f" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M106 53q-8-20 7-32" stroke="#5c783e" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="m88 55 16-10 18 9-12 10-11-8-11 8Z" fill={leaf} />
  </>,
  "bell-pepper": ({ body, leaf }) => <>
    <path d="M99 65c-21-23-54-15-58 14-4 24 2 65 15 77 9 9 20 7 29 1 9 10 24 10 34 1 13 7 26 1 32-12 8-17 13-51 8-69-6-25-37-35-60-12Z" fill={body} />
    <path d="M82 69c-11 24-13 60 0 86m36-85c11 27 9 62-1 85" stroke="#b44e3a" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M63 73q-12 12-12 32m39-29q-6 26-2 47" stroke="#f3aa80" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <path d="M100 61q-7-22 7-37" stroke="#58713b" strokeWidth="8" fill="none" strokeLinecap="round" />
    <path d="m76 64 20-11 25 7-8 11-14-6-13 9Z" fill={leaf} />
  </>,
  zucchini: ({ body, leaf }) => <g transform="rotate(38 100 100)">
    <path d="M79 48q20-12 40 0l3 91q1 23-22 25-24 0-23-24Z" fill={body} />
    <path d="M85 57v81q-1 13 6 17m12-100 2 98m9-96 1 80" fill="none" stroke="#acb77d" strokeWidth="2" strokeLinecap="round" />
    <path d="m90 49-2-22 19-3 6 25-13 7Z" fill={leaf} /><path d="m96 30 5 15" stroke="#b7c18a" strokeWidth="2" strokeLinecap="round" />
    <path d="M85 68v25" fill="none" stroke="#c6cea0" strokeWidth="3" strokeLinecap="round" />
  </g>,
  "spaghetti-squash": ({ body, leaf }) => <g transform="rotate(34 100 100)">
    <path d="M100 43c34 0 52 25 51 61-1 37-17 58-51 58-35 0-52-23-51-58 0-38 18-61 51-61Z" fill={body} />
    <path d="M77 53q-27 45-4 94m23-96q-13 51-1 103m25-98q20 45 4 91" fill="none" stroke="#c49e4c" strokeWidth="1.5" strokeOpacity=".7" />
    <path d="M65 80q-5 17-3 31" stroke="#fff0ba" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="m92 44 1-20 15-2 1 23Z" fill={leaf} />
  </g>,
  "acorn-squash": ({ body, leaf }) => <>
    <path d="M99 59c-24-22-58-4-59 26-2 33 18 63 59 82 41-17 64-47 61-81-2-30-35-48-61-27Z" fill={body} />
    <path d="M78 62q-36 40 20 98m22-98q35 44-19 98m-2-95v95" fill="none" stroke="#9ba06b" strokeWidth="3" strokeLinecap="round" />
    <path d="M57 80q-7 29 17 54m28 10 5 15" stroke="#d0a24b" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M97 61q-6-24 7-36l10 5q-13 12-8 30Z" fill={leaf} />
  </>,
  butternut: ({ body, leaf }) => <>
    <path d="M86 44q15-13 30 0c13 13-1 35 4 50 6 15 29 20 30 42 2 24-21 32-48 32-29 0-52-12-49-34 3-20 24-27 30-41 6-15-10-34 3-49Z" fill={body} />
    <path d="M92 49q-8 9-2 31m-13 35q-13 9-12 23" stroke="#fae2b4" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M109 49q-5 22 1 43m-2 14q21 21 18 47" stroke="#bd965f" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="m94 40-1-17 14-3 3 20" fill={leaf} /><path d="m99 25 3 11" stroke="#c1b78a" strokeWidth="2" strokeLinecap="round" />
  </>,
  cabbage: ({ body, leaf }) => <>
    <path d="M100 49c42-7 70 24 64 64-6 36-25 50-64 52-37 1-61-25-63-56-2-34 25-61 63-60Z" fill={leaf} />
    <path d="M97 154C50 153 33 127 43 91c29-1 57 21 62 58m1 6c48-4 64-30 51-65-28 0-48 20-56 58" fill={body} />
    <path d="M99 137C68 123 56 91 71 65c22-20 56-14 67 11 10 23-7 51-32 65Z" fill="#c0d39b" />
    <path d="M79 76c23-15 48-5 48 13-17-10-40-8-43 7 18-6 31 1 29 16-14-8-21-3-14 14m4-65c-7 11-7 18-3 21M53 106l43 44m-36-19 17-2-3-15m76-7-43 45m31-20-15-1 3-14" fill="none" stroke="#e8edca" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  beans: ({ body }) => <>
    <path d="M46 145c37-35 40-58 45-105 16 53-2 88-39 112Z" fill="#8ba563" />
    <path d="M65 159c43-44 58-74 59-123 18 53-1 99-52 129Z" fill={body} />
    <path d="M96 164c27-34 44-64 49-111 15 45-5 86-42 115Z" fill="#6c8a48" />
    <path d="M51 145q36-38 39-89m-18 102q48-48 51-105m-21 110q37-48 42-93" fill="none" stroke="#ccda9f" strokeWidth="1.5" strokeLinecap="round" />
    <path d="m90 43-4-12m38 8 2-14m18 31 5-12" fill="none" stroke="#62753d" strokeWidth="2" strokeLinecap="round" />
  </>,
  beet: ({ body, leaf, flesh }) => <>
    <path d="m96 89-29-49m34 45 8-61m-1 64 34-45" stroke="#a86071" strokeWidth="3" fill="none" />
    <Leaf x={83} y={65} rotate={-75} scale={1.05} fill={leaf} /><Leaf x={105} y={56} rotate={-25} scale={1.1} fill={leaf} /><Leaf x={123} y={70} rotate={17} fill={leaf} />
    <path d="M97 83c-35-8-57 9-53 34 4 27 29 35 48 43l8 18 5-20c27-8 42-27 37-48-4-21-23-33-45-27Z" fill={body} />
    <path d="M64 98q-11 9-10 22" stroke="#dea1a8" strokeWidth="3" fill="none" strokeLinecap="round" />
    <ellipse cx="136" cy="137" rx="28" ry="32" transform="rotate(23 136 137)" fill="#7f3e5b" />
    <ellipse cx="135" cy="135" rx="24" ry="29" transform="rotate(23 135 135)" fill={flesh} />
    <g fill="none" stroke="#e2a0af" strokeWidth="1.7" transform="rotate(23 135 135)"><ellipse cx="135" cy="135" rx="17" ry="22" /><ellipse cx="135" cy="135" rx="10" ry="14" /><ellipse cx="135" cy="135" rx="3" ry="5" /></g>
  </>,
  "sweet-potato": ({ body, flesh }) => <>
    <path d="M38 119c17-7 16-28 40-37 24-9 53-4 76-27 6-6 9-3 7 6-4 19 3 47-18 66-25 23-57 13-85 26-17 9-34-18-20-34Z" fill={body} />
    <path d="M52 121q23-26 58-25" stroke="#dfa88a" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="m80 118 3 3m40-27 4 3m7 18 3 3m-40 11 2 4" stroke="#895747" strokeWidth="1.5" strokeLinecap="round" />
    <ellipse cx="128" cy="137" rx="30" ry="27" transform="rotate(-24 128 137)" fill="#a66d56" /><ellipse cx="128" cy="135" rx="26" ry="23" transform="rotate(-24 128 135)" fill={flesh} />
    <path d="M111 133q13-15 29-7m-28 15q9-5 21-4" fill="none" stroke="#f4ca8a" strokeWidth="1.5" strokeLinecap="round" />
  </>,
  "red-potato": ({ body }) => <>
    <path d="M49 80c3-18 26-25 44-19 20-7 41 12 39 34-1 22-19 40-44 37-27 5-46-25-39-52Z" fill="#b67276" />
    <path d="M83 112c12-20 37-25 56-12 22 0 34 19 25 40-12 27-35 29-58 23-27-3-40-32-23-51Z" fill={body} />
    <path d="M60 80q8-14 27-12m10 47q11-11 26-10" stroke="#e7b3a5" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="m66 102 3 2m34-17 3 2m7 48 3 2m28-16 3 2m-20 28 2 1" stroke="#8b4d53" strokeWidth="2" strokeLinecap="round" />
  </>,
  radish: ({ body, leaf }) => <g transform="rotate(-15 100 100)">
    <path d="m103 88-24-47m25 45 9-52m-7 54 34-39" stroke="#79914b" strokeWidth="3" fill="none" />
    <path d="M86 62C58 63 55 42 63 29c12 4 21 13 23 33Zm23 3c-13-24-3-40 14-42 6 16 3 31-14 42Zm13 9c0-25 19-34 32-26-3 19-16 27-32 26Z" fill={leaf} />
    <path d="M102 84c-31-9-53 11-49 35 4 26 29 34 46 40 24-7 49-20 47-44-2-23-22-35-44-31Z" fill={body} />
    <path d="M60 137q39 13 77-4c-11 14-24 20-38 26-14-5-28-10-39-22Z" fill="#faeddb" />
    <path d="M99 158q3 12-4 19" stroke="#dcc2a6" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M72 97q-10 8-10 19" stroke="#f5b6ae" strokeWidth="3" fill="none" strokeLinecap="round" />
  </g>,
};
