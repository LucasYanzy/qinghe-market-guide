import { useId } from "react";
import { useLanguage } from "./i18n";
import { extraProduceArt, type ProduceDrawing } from "./ProduceExtras";

type Palette = readonly [string, string, string];
const palettes: Record<string, Palette> = {
  tomato: ["#f5946b", "#df6249", "#ba463b"],
  carrot: ["#f6b15b", "#e98a37", "#cc682b"],
  broccoli: ["#7e9d5e", "#507c47", "#305b3e"],
  lettuce: ["#c1d796", "#8eaf67", "#5e874c"],
  pumpkin: ["#f6c16b", "#e69e43", "#c77b32"],
  cucumber: ["#96b56c", "#60884d", "#365e3b"],
  potato: ["#e6c89a", "#c5a171", "#a38257"],
  onion: ["#d7a2b2", "#af788f", "#855770"],
  honey: ["#f3cc72", "#dda448", "#c38530"],
  ginger: ["#edd2a2", "#cfac76", "#b28b55"],
  garlic: ["#f8edda", "#e6d8bc", "#cbbb9f"],
  banana: ["#f8df88", "#e8c05c", "#cfa43e"],
  avocado: ["#91a967", "#607d46", "#3b603d"],
  mango: ["#f6d581", "#eeb15a", "#d9884d"],
  orange: ["#f7c572", "#eaa048", "#d18332"],
  citrus: ["#f8e191", "#e8cb64", "#cfaa45"],
  peach: ["#f8d2a1", "#eaa182", "#d77b6d"],
  plum: ["#b092ad", "#8b688d", "#65496e"],
  apple: ["#edac85", "#d97c63", "#b85248"],
  pear: ["#d8d78f", "#b7be70", "#8f9b52"],
  grapes: ["#c499b1", "#9c718f", "#78506f"],
  "cherry-pepper": ["#ef9b75", "#d96b50", "#b84c3d"],
  jalapeno: ["#97b772", "#638c4f", "#3d673e"],
  "bell-pepper": ["#eea079", "#d87659", "#b95241"],
  zucchini: ["#8c9f64", "#657f4a", "#3f603e"],
  "spaghetti-squash": ["#f3da8b", "#ddbf69", "#c5a051"],
  "acorn-squash": ["#899465", "#5e7750", "#38593e"],
  butternut: ["#f0d39f", "#d9b37c", "#bd935e"],
  cabbage: ["#c8d9a2", "#a1bc7f", "#7b9d5b"],
  beans: ["#aac484", "#779b57", "#4e793f"],
  beet: ["#c28997", "#a5657b", "#7e425d"],
  "sweet-potato": ["#d3a08a", "#b9816e", "#925e50"],
  "red-potato": ["#dca49f", "#bf8485", "#9a5d6a"],
  radish: ["#f0aaa1", "#d77e85", "#b9586d"],
};
const fleshPalettes: Record<string, Palette> = {
  avocado: ["#e5e7ac", "#cbd68e", "#a6bf6d"],
  cucumber: ["#f2edc7", "#e0e5b2", "#b5cf88"],
  orange: ["#f8cd7d", "#eeb05a", "#e29a46"],
  citrus: ["#e0e8aa", "#bfce7d", "#9bb55e"],
  beet: ["#d79aac", "#bb758f", "#9a506f"],
  "sweet-potato": ["#f6ce8b", "#eaae60", "#d78d45"],
};
const leafPalette: Palette = ["#9cb774", "#698d50", "#3d693f"];

const produceArt: Record<string, ProduceDrawing> = {
  ...extraProduceArt,
  tomato: ({ body, leaf }) => <>
    <path d="M98 69C73 51 39 63 32 92c-11 42 16 72 45 71 12 0 16-4 22-3 9 5 22 5 34 0 30-12 41-47 27-72-13-26-41-33-62-19Z" fill={body} />
    <path d="M52 86q-15 15-13 35" fill="none" stroke="#ffc09a" strokeWidth="4" strokeLinecap="round" />
    <path d="M140 84q20 26 6 53m-43-60q-9 24-2 39" fill="none" stroke="#b94f3d" strokeWidth="1.8" strokeLinecap="round" opacity=".5" />
    <path d="m99 68-26-14 17 22-22 9 27-2 12 17 3-23 28-7-27-7 7-17Z" fill={leaf} />
    <path d="M103 67q-3-25 11-35" fill="none" stroke="#416e3e" strokeWidth="5" strokeLinecap="round" />
    <path d="m89 73 14-3 12 3" fill="none" stroke="#b7c88a" strokeWidth="1.5" strokeLinecap="round" />
  </>,
  carrot: ({ body, leaf }) => <g transform="rotate(24 100 100)">
    <path d="M98 69C70 56 64 80 73 103l24 67q4 9 7-1l26-69c8-23-4-43-32-31Z" fill={body} />
    <path d="M79 81q-2 12 3 24l15 44" stroke="#ffd395" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    <path d="m111 89 12-3m-46 15 12 3m14 12 13-3m-31 14 10 2m6 12 5-2" stroke="#c57430" strokeWidth="2" strokeLinecap="round" />
    <path d="M96 70C75 56 62 35 73 21c17 6 23 27 23 49Zm5-1c-8-31-2-50 13-55 10 20 2 40-13 55Zm6 1c7-25 23-38 37-31-1 17-16 31-37 31Z" fill={leaf} />
    <path d="m80 34 17 33m16-38-10 38m30-20-24 22" stroke="#c2d299" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </g>,
  broccoli: ({ body, leaf }) => <>
    <path d="m88 96-8 66q17 7 36 0l-9-59 25-20-10-12-23 23-24-23-11 15Z" fill="#9eb779" />
    <path d="m98 119 2 40m-3-46-15-17m20 17 15-15" fill="none" stroke="#d6dfac" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M51 100C28 99 25 76 41 66c-2-20 18-30 34-23 9-22 35-26 47-8 21-7 38 6 38 24 23 8 23 34 5 43-6 16-26 19-38 10-14 15-38 15-51 1-11 7-23 1-25-13Z" fill={body} />
    <path d="M44 78q-1-15 13-17 1-14 19-13m10-7q18-15 32 0m16 8q16-1 18 16m-43 14q17-11 28 2M58 92q13-11 26 0" fill="none" stroke="#9dbb7b" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
    <path d="M80 70q12-19 30-8m-20 42q13 10 26-2m28-12q13 2 18-8" fill="none" stroke="#355e3b" strokeWidth="2" strokeLinecap="round" />
    <g fill="#b0c58a" opacity=".7"><circle cx="63" cy="72" r="2" /><circle cx="95" cy="45" r="2" /><circle cx="122" cy="62" r="2" /><circle cx="101" cy="84" r="2" /></g>
    <path d="M91 164q11 2 20-1" stroke={leaf} strokeWidth="2" fill="none" />
  </>,
  lettuce: ({ body, leaf }) => <>
    <path d="M96 162C66 158 40 142 35 117c-13-5-14-20-6-28-8-13-1-28 13-29-5-17 9-28 23-21 6-17 27-16 32 0 12-18 31-13 34 3 14-8 29 4 25 18 17-3 27 11 20 25 13 12 6 27-7 32-8 27-36 40-64 46Z" fill={leaf} />
    <path d="M98 160C68 150 49 127 50 110c-12-10-7-24 6-27-5-15 8-26 22-20 1-14 20-17 28-5 10-13 27-6 27 8 15-7 28 5 23 18 14 5 16 22 4 30-4 24-23 39-55 47Z" fill={body} />
    <path d="M100 159c-23-17-32-42-22-60-6-13 3-23 15-19 7-17 24-12 28 0 14-1 22 12 14 23 4 21-9 41-30 57Z" fill="#cbdca5" />
    <path d="M101 158 99 90m1 40-15-21m16 33 20-30M95 154 57 96m22 35-18-7m13-2-2-17m35 49 39-59m-23 36 20-9m-15 2 4-18" stroke="#ecedc8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </>,
  pumpkin: ({ body, leaf }) => <>
    <path d="M99 58q-9-22 3-35l14 5q-16 11-7 30Z" fill={leaf} />
    <path d="M98 61c-24-15-58-3-65 28-8 33 7 61 34 68 16 9 43 10 65 0 27-2 42-34 32-65-10-31-38-44-66-31Z" fill="#c68035" />
    <ellipse cx="78" cy="109" rx="35" ry="51" fill={body} /><ellipse cx="124" cy="109" rx="34" ry="51" fill={body} /><ellipse cx="101" cy="110" rx="26" ry="53" fill="#efb35a" />
    <path d="M77 65q-24 37-11 80m59-79q22 38 9 79m-30-80q-15 34-6 82" fill="none" stroke="#cf8b36" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M90 77q-10 29-6 52" fill="none" stroke="#ffe0a0" strokeWidth="3.5" strokeLinecap="round" />
    <path d="m93 59 10 5 12-6" fill="none" stroke="#648049" strokeWidth="3" strokeLinecap="round" />
  </>,
  cucumber: ({ body, flesh }) => <>
    <g transform="rotate(39 100 100)"><path d="M83 35c18-10 34 3 34 20l-2 82c-1 26-43 28-43-2l1-81q0-14 10-19Z" fill={body} />
      <path d="M83 49v72m18-77 1 96" fill="none" stroke="#a7c283" strokeWidth="2.5" strokeLinecap="round" />
      <g fill="#3d673e"><ellipse cx="92" cy="65" rx="1.5" ry="2" /><ellipse cx="108" cy="80" rx="1.5" ry="2" /><ellipse cx="78" cy="95" rx="1.5" ry="2" /><ellipse cx="94" cy="109" rx="1.5" ry="2" /><ellipse cx="109" cy="124" rx="1.5" ry="2" /></g>
      <path d="m90 37 2-8" stroke="#768c48" strokeWidth="3" strokeLinecap="round" /></g>
    <ellipse cx="129" cy="139" rx="31" ry="25" transform="rotate(-27 129 139)" fill="#547e45" /><ellipse cx="128" cy="135" rx="28" ry="23" transform="rotate(-27 128 135)" fill={flesh} />
    <g fill="#fff8dc" transform="rotate(-27 128 135)"><ellipse cx="118" cy="130" rx="3" ry="6" transform="rotate(-40 118 130)" /><ellipse cx="136" cy="129" rx="3" ry="6" transform="rotate(40 136 129)" /><ellipse cx="128" cy="142" rx="3" ry="6" /></g>
  </>,
  potato: ({ body }) => <>
    <path d="M44 94c-4-23 14-38 36-36 23-8 47 13 43 36-2 25-28 43-51 34-20 0-28-14-28-34Z" fill="#bba075" />
    <path d="M72 123c-5-24 16-45 41-40 29-9 53 13 51 36 6 29-22 48-49 43-25 3-44-13-43-39Z" fill={body} />
    <path d="M55 83q7-15 26-14m6 43q10-16 31-16" fill="none" stroke="#f2d9ad" strokeWidth="3.5" strokeLinecap="round" />
    <path d="m61 105 3 2m32-23 3-1m10 47 3 2m28-19 3 1m-11 36 3-1m-42-6 2 1" stroke="#99784d" strokeWidth="2.2" strokeLinecap="round" />
  </>,
  onion: ({ body, leaf }) => <>
    <path d="M97 56c-10 21-45 30-50 57-6 31 20 51 53 51 36 0 62-22 55-52-6-26-39-34-48-56Z" fill={body} />
    <path d="M96 65c-37 31-47 66-18 89m26-90c31 33 37 65 17 90m-21-83c-13 26-14 57-5 85" fill="none" stroke="#ebc0c6" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M67 97q-13 16-11 30" fill="none" stroke="#f4d3ce" strokeWidth="3.5" strokeLinecap="round" />
    <path d="m97 59-7-30 12 12 9-18-4 35" fill={leaf} /><path d="m97 60 5-13" stroke="#b4ba84" strokeWidth="1.5" />
    <path d="m88 163-5 9m11-7-1 10m8-10 2 10m6-11 6 8" stroke="#b3946c" strokeWidth="1.5" strokeLinecap="round" />
  </>,
};

export function Produce({ kind, className = "" }: { kind: string; className?: string }) {
  return <svg className={`produce-art ${className}`} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
    <ProduceFigure kind={kind} />
  </svg>;
}

function ProduceFigure({ kind, shadow = true }: { kind: string; shadow?: boolean }) {
  const id = useId();
  const palette = palettes[kind] ?? palettes.tomato;
  const flesh = fleshPalettes[kind] ?? palette;
  const drawing = produceArt[kind] ?? produceArt.tomato;
  const paints = { body: `url(#${id}-body)`, leaf: `url(#${id}-leaf)`, flesh: `url(#${id}-flesh)` };
  return <>
    <defs>
      {([['body', palette], ['leaf', leafPalette], ['flesh', flesh]] as const).map(([name, colors]) =>
        <linearGradient key={name} id={`${id}-${name}`} x1="15%" y1="10%" x2="90%" y2="95%">
          <stop stopColor={colors[0]} /><stop offset=".5" stopColor={colors[1]} /><stop offset="1" stopColor={colors[2]} />
        </linearGradient>)}
    </defs>
    {shadow && <ellipse cx="100" cy="175" rx="47" ry="5" fill="#345138" opacity=".07" />}
    {drawing(paints)}
  </>;
}

export function BasketArt() {
  const { t } = useLanguage();
  const id = useId();
  return <div className="basket-art" aria-hidden="true">
    <svg className="harvest-basket" viewBox="0 0 360 310" focusable="false">
      <defs>
        <linearGradient id={`${id}-basket`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d8b87d" /><stop offset="1" stopColor="#ad8555" /></linearGradient>
        <linearGradient id={`${id}-handle`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d4b37b" /><stop offset="1" stopColor="#a38152" /></linearGradient>
      </defs>
      <circle cx="190" cy="145" r="124" fill="#e3e8cc" />
      <path d="M72 194C23 97 91 29 163 23m123 36c63 62 54 154-14 198" fill="none" stroke="#ced9b6" strokeWidth="1" />
      <ellipse cx="185" cy="279" rx="106" ry="8" fill="#46603d" opacity=".08" />
      <g transform="rotate(-7 180 170)">
        <path d="M99 181c-13-99 14-143 82-143s95 46 82 143" fill="none" stroke={`url(#${id}-handle)`} strokeWidth="10" />
        <path d="M99 179c-12-96 15-137 82-137s92 43 82 137" fill="none" stroke="#f1d5a5" strokeWidth="2" />
        <path d="M74 169q110-25 220 0l-16 32H88Z" fill="#8c7249" />
        <g className="basket-produce basket-carrot" transform="translate(44 32) rotate(-22 70 90) scale(.79)"><ProduceFigure kind="carrot" shadow={false} /></g>
        <g className="basket-produce basket-broccoli" transform="translate(109 21) rotate(9 70 90) scale(.8)"><ProduceFigure kind="broccoli" shadow={false} /></g>
        <g className="basket-produce basket-lettuce" transform="translate(174 47) rotate(20 70 90) scale(.7)"><ProduceFigure kind="lettuce" shadow={false} /></g>
        <g className="basket-produce basket-tomato" transform="translate(112 92) scale(.67)"><ProduceFigure kind="tomato" shadow={false} /></g>
        <path d="M78 174h211l-16 76q-2 16-20 17H113q-18-1-21-17Z" fill={`url(#${id}-basket)`} />
        <path d="m101 181 13 75m25-75 7 79m29-79 1 79m30-79-4 79m33-79-10 79m30-79-15 75" fill="none" stroke="#f0d29b" strokeWidth="7" opacity=".55" />
        <path d="M84 194h199m-195 16h191m-187 16h183m-180 16h175m-169 15h162" fill="none" stroke="#987442" strokeWidth="2" opacity=".42" />
        <path d="M85 190h199m-195 16h191m-187 16h183m-180 16h175m-169 15h163" fill="none" stroke="#f4d8a2" strokeWidth="2" opacity=".55" />
        <path d="M76 171q109 8 214 0" fill="none" stroke="#a78350" strokeWidth="13" strokeLinecap="round" />
        <path d="M76 167q109 8 214 0" fill="none" stroke="#e9ca92" strokeWidth="5" strokeLinecap="round" />
        <path d="M115 258q67 10 135 0" fill="none" stroke="#bd9760" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g fill="#839862"><path d="M43 102q-14-14-6-25 15 3 6 25Zm263 104q1-15 15-20 5 14-15 20Z" /><path d="m293 44 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" /></g>
      <g fill="#c5a565"><circle cx="65" cy="56" r="2.5" /><circle cx="311" cy="145" r="2" /></g>
    </svg>
    <span className="hero-sticker">{t("GROWN LOCAL")}<br /><b>{t("100% 新鲜心意")}</b></span>
  </div>;
}
