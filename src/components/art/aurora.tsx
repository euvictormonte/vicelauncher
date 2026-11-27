import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useState } from "react"
import { fileSrc } from "@/lib/api"
import { useTheme } from "@/lib/theme"

/**
 * The art behind a project, first match wins: the player's own pictures
 * fading into each other; the project's own picture (its GitHub account's),
 * blown up, blurred and drifting like an album cover behind its tracklist; or
 * soft fields of colour in one of a few palettes picked by the project's name.
 * Original; nothing from any game. Grain and scrims keep the words readable.
 */
const PALETTES = [
  { base: "#1a0b24", blobs: ["#8b5cf6", "#6d3bff", "#ff8a4c"] },
  { base: "#06121f", blobs: ["#18b9d4", "#3b52ff", "#9b3bff"] },
  { base: "#1b0a10", blobs: ["#ff5636", "#8b5cf6", "#ffb24a"] },
  { base: "#04161a", blobs: ["#23d69a", "#2a74ff", "#a64bff"] },
  { base: "#120818", blobs: ["#8b5cf6", "#00c2d1", "#6b4bff"] },
] as const

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")"

type AuroraProps = { seed: string; still?: boolean; pictures?: string[]; art?: string | null }

function AuroraArt({ seed, still, pictures = [], art }: AuroraProps) {
  const [artFailed, setArtFailed] = useState<string | null>(null)
  const reduced = useReducedMotion()
  const h = hash(seed)
  const palette = PALETTES[h % PALETTES.length]
  const moving = !still && !reduced
  const blobs = useMemo(
    () =>
      palette.blobs.map((color, i) => {
        const r = (n: number) => ((h >>> (i * 5 + n)) % 1000) / 1000
        return { color, x: 10 + r(0) * 70, y: 5 + r(3) * 55, size: 55 + r(7) * 30, dx: (r(11) - 0.5) * 14, dy: (r(13) - 0.5) * 10, duration: 26 + r(17) * 16 }
      }),
    [h, palette],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: palette.base }} aria-hidden>
      {pictures.length > 0 ? (
        <Pictures paths={pictures} moving={moving} />
      ) : art && artFailed !== art ? (
        <Wash key={art} src={art} moving={moving} onFail={() => setArtFailed(art)} />
      ) : (
        blobs.map((b, i) => (
          <motion.div
            key={`${seed}-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.size}%`,
              aspectRatio: "1",
              translate: "-50% -50%",
              background: `radial-gradient(circle, ${b.color} 0%, transparent 62%)`,
              filter: "blur(48px)",
              opacity: 0.85,
              mixBlendMode: "screen",
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={moving ? { opacity: 0.85, scale: [1, 1.12, 1], x: [`0%`, `${b.dx}%`, `0%`], y: [`0%`, `${b.dy}%`, `0%`] } : { opacity: 0.85, scale: 1 }}
            transition={moving ? { duration: b.duration, repeat: Infinity, ease: "easeInOut", opacity: { duration: 0.8 } } : { duration: 0.6 }}
          />
        ))
      )}
      {/* Light from above, grain, then the scrims that keep words readable. */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 70% -10%, rgb(255 255 255 / 0.10), transparent 55%)" }} />
      <div className="absolute inset-0 opacity-[0.09] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgb(12 11 16 / 0.78) 0%, rgb(12 11 16 / 0.45) 40%, rgb(12 11 16 / 0) 70%)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(12 11 16 / 0.35) 0%, rgb(12 11 16 / 0) 22%, rgb(12 11 16 / 0) 55%, rgb(12 11 16 / 0.92) 92%, #0c0b10 100%)" }} />
    </div>
  )
}

/**
 * One small picture as a field of colour: blurred while small and then scaled
 * up (cheap to draw, and a 256 px picture has nothing finer to show), twice,
 * the second turned over, both drifting on long, unequal loops.
 */
function Wash({ src, moving, onFail }: { src: string; moving: boolean; onFail: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const layers = [
    { left: "62%", top: "40%", scale: 3.4, rotate: 0, dx: "6%", dy: "-5%", turn: 10, duration: 48, opacity: 1 },
    { left: "24%", top: "72%", scale: 3, rotate: 180, dx: "-5%", dy: "6%", turn: -12, duration: 62, opacity: 0.7 },
  ]
  return (
    <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: loaded ? 1 : 0 }} transition={{ duration: 1.2, ease: "easeOut" }}>
      {layers.map((l, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ left: l.left, top: l.top, width: "44%", height: "56%", translate: "-50% -50%", opacity: l.opacity, willChange: "transform" }}
          initial={{ scale: l.scale, rotate: l.rotate, x: "0%", y: "0%" }}
          animate={
            moving
              ? { scale: [l.scale, l.scale * 1.12, l.scale], rotate: [l.rotate, l.rotate + l.turn, l.rotate], x: ["0%", l.dx, "0%"], y: ["0%", l.dy, "0%"] }
              : { scale: l.scale, rotate: l.rotate, x: "0%", y: "0%" }
          }
          transition={moving ? { duration: l.duration, repeat: Infinity, ease: "easeInOut" } : { duration: 0.8, ease: "easeOut" }}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={onFail}
            className="size-full object-cover"
            style={{ filter: "blur(26px) saturate(1.7) brightness(0.9)" }}
          />
        </motion.div>
      ))}
      {/* Pictures can be white or pale: a veil keeps the wash a mid-tone. */}
      <div className="absolute inset-0 bg-[rgb(12_11_16/0.28)]" />
    </motion.div>
  )
}

function Pictures({ paths, moving }: { paths: string[]; moving: boolean }) {
  const [srcs, setSrcs] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  useEffect(() => {
    void Promise.all(paths.map(fileSrc)).then(setSrcs)
  }, [paths])
  useEffect(() => {
    if (srcs.length < 2 || !moving) return
    const t = setInterval(() => setIndex((i) => (i + 1) % srcs.length), 10000)
    return () => clearInterval(t)
  }, [srcs, moving])
  return (
    <AnimatePresence initial={false}>
      {srcs[index] && (
        <motion.img
          key={srcs[index]}
          src={srcs[index]}
          alt=""
          className="absolute inset-0 size-full object-cover"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: moving ? 1.1 : 1.04 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.6 }, scale: { duration: 12, ease: "linear" } }}
        />
      )}
    </AnimatePresence>
  )
}

/** The ambient glow of the dark look. The light, calm and paws looks stay flat, with no gradients. */
export function Aurora(props: AuroraProps) {
  const theme = useTheme()
  if (theme !== "dark") return <div className="absolute inset-0 bg-ground" />
  return <AuroraArt {...props} />
}
