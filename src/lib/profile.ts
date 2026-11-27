const NICKNAME_KEY = "neves-launcher.nickname"
const WELCOME_DONE_KEY = "neves-launcher.welcome-completed"
export const PROFILE_CHANGED_EVENT = "neves-profile-changed"

function announceProfileChange(nickname: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(PROFILE_CHANGED_EVENT, { detail: nickname }))
}

export function getNickname() {
  try { return localStorage.getItem(NICKNAME_KEY)?.trim() ?? "" } catch { return "" }
}

export function hasCompletedWelcome() {
  try { return localStorage.getItem(WELCOME_DONE_KEY) === "1" } catch { return true }
}

export function saveNickname(value: string) {
  const nickname = value.trim().slice(0, 32)
  if (!nickname) return false
  try {
    localStorage.setItem(NICKNAME_KEY, nickname)
    localStorage.setItem(WELCOME_DONE_KEY, "1")
  } catch { /* The current session can still use the entered nickname. */ }
  announceProfileChange(nickname)
  return true
}

export function finishWelcome() {
  try { localStorage.setItem(WELCOME_DONE_KEY, "1") } catch { /* The current session can still continue. */ }
}
