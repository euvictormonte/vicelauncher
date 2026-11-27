import type { Snapshot } from "@/lib/types"

/** How the missing build tools get installed on this PC, in English (callers translate it with t()). */
export function toolsInstallHint(snap: Pick<Snapshot, "os" | "tools">): string {
  const installer = snap.tools?.installer ?? null
  if (installer === "winget") return "Installs with winget; Windows asks for permission."
  if (installer) return `Installs with ${installer} and rustup; Linux asks for your password.`
  return snap.os === "windows"
    ? "winget was not found: install Git, Rust and the Visual Studio Build Tools by hand."
    : "No supported package manager was found: install Git, gcc and Rust (rustup.rs) by hand."
}
