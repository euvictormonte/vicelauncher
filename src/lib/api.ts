import type { Action, LogView, Snapshot } from "./types"
import { t } from "./i18n"

/** True inside the Tauri window; false in a plain browser (development, with a mock launcher). */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

interface Backend {
  snapshot(): Promise<Snapshot>
  act(action: Action): Promise<unknown>
  log(from: number): Promise<LogView>
  onChange(listener: () => void): Promise<() => void>
}

const tauriBackend: Backend = {
  async snapshot() {
    const { invoke } = await import("@tauri-apps/api/core")
    return invoke<Snapshot>("snapshot")
  },
  async act(action) {
    const { invoke } = await import("@tauri-apps/api/core")
    return invoke("act", { action })
  },
  async log(from) {
    const { invoke } = await import("@tauri-apps/api/core")
    return invoke<LogView>("log", { from })
  },
  async onChange(listener) {
    const { listen } = await import("@tauri-apps/api/event")
    return listen("launcher://changed", () => listener())
  },
}

let backend: Promise<Backend> | null = null

export function getBackend(): Promise<Backend> {
  if (!backend) {
    backend = inTauri ? Promise.resolve(tauriBackend) : import("@/dev/mock").then((m) => m.mockBackend)
  }
  return backend
}

export async function act<T = unknown>(action: Action): Promise<T> {
  return (await getBackend()).act(action) as Promise<T>
}

/** A file or folder picker (the system's own dialog); null when cancelled. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return null
  const { open } = await import("@tauri-apps/plugin-dialog")
  const picked = await open({ directory: true, title })
  return typeof picked === "string" ? picked : null
}

export async function pickFile(title: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!inTauri) return null
  const { open } = await import("@tauri-apps/plugin-dialog")
  const picked = await open({ title, filters, multiple: false })
  return typeof picked === "string" ? picked : null
}

export async function saveFile(title: string, defaultPath: string, filters: { name: string; extensions: string[] }[]) {
  if (!inTauri) return null
  const { save } = await import("@tauri-apps/plugin-dialog")
  return save({ title, defaultPath, filters })
}

/**
 * Copies text: the clipboard plugin, then the browser's clipboard, then a hidden text field.
 * Throws only when every route fails, so the caller can say so.
 */
export async function copyText(text: string) {
  if (inTauri) {
    try {
      const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
      await writeText(text)
      return
    } catch {
      // Try the next route.
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Try the next route.
  }
  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.opacity = "0"
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  if (!copied) throw new Error("The link could not be copied.")
}

/**
 * Opens a web link: the opener plugin, then the launcher itself (Explorer opens the default browser).
 * Throws only when both fail, so the caller can say so.
 */
export async function openUrl(url: string) {
  if (inTauri) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener")
      await openUrl(url)
      return
    } catch {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("act", { action: { type: "open_link", url } })
      return
    }
  }
  window.open(url, "_blank", "noopener")
}

/** Starts the native Discord OAuth flow and opens its authorization page. */
export async function beginDiscordLogin() {
  if (!inTauri) throw new Error("Discord sign-in is available in the installed launcher.")
  const { invoke } = await import("@tauri-apps/api/core")
  const authorizationUrl = await invoke<string>("begin_discord_login")
  await openUrl(authorizationUrl)
}

/** Makes backend OAuth errors readable in the launcher's selected language. */
export function discordErrorMessage(error: unknown) {
  const message = String(error).replace(/^Error:\s*/, "")
  const dynamic: [prefix: string, template: string][] = [
    ["Could not open the local Discord callback: ", "Could not open the local Discord callback: {reason}"],
    ["Could not prepare the local Discord callback: ", "Could not prepare the local Discord callback: {reason}"],
    ["Could not prepare secure Discord sign-in: ", "Could not prepare secure Discord sign-in: {reason}"],
    ["Could not start Discord sign-in: ", "Could not start Discord sign-in: {reason}"],
    ["The local Discord callback failed: ", "The local Discord callback failed: {reason}"],
  ]
  for (const [prefix, template] of dynamic) {
    if (message.startsWith(prefix)) return t(template, { reason: message.slice(prefix.length) })
  }
  if (message.startsWith("Discord authorization was cancelled")) return t("Discord authorization was cancelled.")
  return t(message)
}

/** A local picture as the window can load it. */
export async function fileSrc(path: string) {
  if (!inTauri) return path
  const { convertFileSrc } = await import("@tauri-apps/api/core")
  return convertFileSrc(path)
}
