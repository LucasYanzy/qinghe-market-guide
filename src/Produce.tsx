import { useLanguage } from "./i18n";

export function Produce({
  kind,
  className = "",
}: {
  kind: string;
  className?: string;
}) {
  const art: Record<string, React.ReactNode> = {
    tomato: (
      <>
        <path
          d="M86 67C48 45 19 75 28 113c8 39 41 54 65 40 27 14 64-5 69-40 6-37-23-68-55-47Z"
          fill="#e66b4e"
        />
        <path
          d="M47 88c-9 13-9 30 0 43"
          fill="none"
          stroke="#f59c77"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="m95 78-26-21 25 6 9-28 5 28 29-9-23 24 6 15-24-10-16 9Z"
          fill="#3e7141"
        />
        <path
          d="M103 58q-1-25 12-31"
          fill="none"
          stroke="#3e7141"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </>
    ),
    carrot: (
      <>
        <path d="M76 65Q92 50 118 76L63 167Q50 183 53 161Z" fill="#ee943e" />
        <path
          d="m88 90 14 7m-24 12 13 6m-25 12 13 6"
          stroke="#cf702b"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M93 65q-18-35-8-44 22 11 18 43m1-1q2-44 20-47 13 24-13 51m0 0q25-34 39-25-2 23-34 33"
          fill="#628c4d"
        />
      </>
    ),
    broccoli: (
      <>
        <path
          d="m82 96-9 64q18 11 39 0l-8-56 25-21-14-12-20 26-22-25-13 11Z"
          fill="#91ae60"
        />
        <path
          d="m92 121 4 37"
          stroke="#c2d39a"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <g fill="#416b47">
          <circle cx="57" cy="87" r="26" />
          <circle cx="82" cy="62" r="29" />
          <circle cx="117" cy="62" r="27" />
          <circle cx="140" cy="88" r="24" />
          <circle cx="98" cy="90" r="34" />
        </g>
        <g fill="#5f8752">
          <circle cx="70" cy="65" r="15" />
          <circle cx="105" cy="48" r="13" />
          <circle cx="127" cy="78" r="16" />
          <circle cx="86" cy="86" r="16" />
        </g>
      </>
    ),
    lettuce: (
      <>
        <g fill="#8caf66">
          <ellipse
            cx="65"
            cy="101"
            rx="29"
            ry="49"
            transform="rotate(-31 65 101)"
          />
          <ellipse
            cx="130"
            cy="99"
            rx="30"
            ry="52"
            transform="rotate(30 130 99)"
          />
          <ellipse cx="99" cy="88" rx="33" ry="58" />
        </g>
        <g fill="#bad28a">
          <ellipse
            cx="77"
            cy="112"
            rx="23"
            ry="43"
            transform="rotate(-25 77 112)"
          />
          <ellipse
            cx="119"
            cy="113"
            rx="22"
            ry="43"
            transform="rotate(25 119 113)"
          />
          <ellipse cx="99" cy="107" rx="23" ry="44" />
        </g>
        <path
          d="m98 67 1 87m-36-59 35 59 34-59"
          stroke="#e3e8b6"
          strokeWidth="3"
          fill="none"
        />
      </>
    ),
    pumpkin: (
      <>
        <path d="M99 55q-10-25 4-31l12 7q-15 7-5 28" fill="#65734a" />
        <ellipse cx="62" cy="107" rx="31" ry="45" fill="#d58437" />
        <ellipse cx="135" cy="107" rx="31" ry="45" fill="#d58437" />
        <ellipse cx="82" cy="108" rx="31" ry="50" fill="#eaa247" />
        <ellipse cx="117" cy="108" rx="31" ry="50" fill="#eaa247" />
        <ellipse cx="100" cy="108" rx="24" ry="52" fill="#f3b556" />
        <path
          d="M97 72q-9 27-5 56"
          fill="none"
          stroke="#f8cb82"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </>
    ),
    cucumber: (
      <>
        <path
          d="M55 139Q34 125 52 102L116 40q24-21 42 1 15 20-8 43l-63 65q-20 13-32-10Z"
          fill="#5a7e48"
        />
        <path
          d="m61 125 72-71"
          stroke="#8ea966"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <g fill="#365e3b">
          <circle cx="73" cy="107" r="3" />
          <circle cx="96" cy="88" r="3" />
          <circle cx="122" cy="62" r="3" />
          <circle cx="90" cy="121" r="3" />
          <circle cx="113" cy="99" r="3" />
          <circle cx="140" cy="71" r="3" />
        </g>
      </>
    ),
    potato: (
      <>
        <path
          d="M58 75c19-26 55-27 77-5 40 31 19 76-13 81-25 13-68 5-77-15-12-22-6-40 13-61Z"
          fill="#c4a073"
        />
        <ellipse
          cx="82"
          cy="101"
          rx="24"
          ry="30"
          fill="#d7b88b"
          transform="rotate(35 82 101)"
        />
        <g fill="#a7845d">
          <ellipse cx="68" cy="93" rx="4" ry="3" />
          <ellipse cx="112" cy="81" rx="4" ry="3" />
          <ellipse cx="93" cy="130" rx="4" ry="3" />
          <ellipse cx="133" cy="115" rx="4" ry="3" />
          <ellipse cx="65" cy="124" rx="3" ry="2" />
        </g>
      </>
    ),
    onion: (
      <>
        <path
          d="M96 48q-24 25-46 44-24 30 4 56 37 30 78 6 35-20 21-51-8-18-43-55Z"
          fill="#a47394"
        />
        <path
          d="M97 58q-42 58-17 99m25-101q28 56 12 100"
          fill="none"
          stroke="#c99fb4"
          strokeWidth="7"
        />
        <path d="m95 51-7-25 14 13 10-18-2 29" fill="#78885c" />
        <path
          d="m83 163 4 10m12-9v11m11-12 4 10"
          stroke="#bc9e75"
          strokeWidth="3"
        />
      </>
    ),
  };
  return (
    <svg
      className={`produce-art ${className}`}
      viewBox="0 0 200 200"
      aria-hidden="true"
    >
      <ellipse cx="100" cy="166" rx="56" ry="7" fill="#234a3810" />
      {art[kind] ?? art.tomato}
    </svg>
  );
}

export function BasketArt() {
  const { t } = useLanguage();
  return (
    <div className="basket-art" aria-hidden="true">
      <div className="sun-circle" />
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <Produce kind="carrot" className="hero-carrot" />
      <Produce kind="broccoli" className="hero-broccoli" />
      <Produce kind="lettuce" className="hero-lettuce" />
      <Produce kind="tomato" className="hero-tomato" />
      <div className="basket-body">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="basket-rim" />
      <span className="hero-sticker">
        {t("GROWN LOCAL")}
        <br />
        <b>{t("100% 新鲜心意")}</b>
      </span>
      <span className="art-spark spark-one">✳</span>
      <span className="art-spark spark-two">✦</span>
    </div>
  );
}
