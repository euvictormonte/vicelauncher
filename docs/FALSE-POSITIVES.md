# Antivirus flags and false positives

Neves Launcher is a launcher: it downloads code, runs `git`, `cargo` and `winget`, starts
game executables and replaces itself when updating. Its binaries are also unsigned and
new on every release. That mix is what heuristic engines score as suspicious even when
nothing is wrong.

Neves Launcher releases are published in its own repository. The original VILauncher
signer is not the signer for this fork; check the signature and checksum of the specific
Neves Launcher release you downloaded.

The usual result is a VirusTotal page like this:

```
Trapmine   Malicious.high.ml.score
1/70 security vendors flagged this file as malicious
```

That is not a signature for a known threat. `Malicious.high.ml.score` is Trapmine's
machine-learning bucket, and it is the weakest kind of detection VirusTotal shows.
The file is still worth checking once, but the flag can be removed.

## If you are a player and see the flag

1. Compare the SHA-256 of your download with the digest on the GitHub release page,
   or with the one printed in the release's build log. The portable build and the
   installer both have their own digest.
2. Check the Authenticode signature:
   ```powershell
   Get-AuthenticodeSignature .\Neves Launcher.exe | Format-List Status, SignerCertificate
   ```
   `Status` should be `Valid` and the signer **VIPortLive team**. `NotSigned` only means
   the release predates signing or the certificate setup; the SHA-256 check still applies.
3. Read the source. Every release is built by the public
   [Build workflow](https://github.com/euvictormonte/vicelauncher/actions/workflows/build.yml)
   from the tagged commit; nothing is added by hand.

A signed release that still gets an ML hit is a false positive. Signing does not make
Trapmine's model re-learn, so report it (below) rather than assume the worst.

Every build links to a new hash, so an old VirusTotal page says nothing about the next
release, in either direction. Report the release you actually published.

## If you maintain releases
### 1. Sign every release

Signing is the only durable fix: the certificate is checked by the OS, and its
reputation lowers the score over time. It also keeps SmartScreen quiet once the
certificate has history.

The build already supports it. It is off until you provide a certificate:

1. Get a code-signing certificate (not an SSL certificate). Free or cheap routes for a
   GPL project:
   - [SignPath Foundation](https://signpath.org/) signs open-source projects for free.
   - [Certum's open-source code signing](https://certum.store/) is heavily discounted.
   - [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/) is a
     monthly subscription; wire it up with Tauri's `signCommand` and
     `artifact-signing-cli`.
2. Export the certificate as a password-protected `.pfx`.
3. Add two repository secrets:
   - `WINDOWS_CERTIFICATE`: the `.pfx`, base64 (`certutil -encode certificate.pfx cert.txt`
     and paste the body without the BEGIN/END lines).
   - `WINDOWS_CERTIFICATE_PASSWORD`: its export password.
4. The Build workflow imports the certificate, and `scripts/sign-windows.mjs` signs and
   verifies `Neves Launcher.exe` and the installer before upload. Locally, set
   `NEVES_LAUNCHER_SIGN_THUMBPRINT` to the certificate thumbprint to sign too. The old
   `VILAUNCHER_SIGN_THUMBPRINT` name remains accepted for existing build setups. Without it the
   build is unsigned and still succeeds.

Sign the portable `.exe` **and** the installer. An unsigned installer wrapping a signed
exe still gets flagged.

### 2. Report the false positive

Do this for each release you publish, right after uploading. Keep it short and factual;
analysts need the hash and where to get the file.

Send to `fp@trapmine.com` (cc `support@trapmine.com`):

```
Subject: False positive: Neves Launcher <version> (Trapmine ML, VirusTotal)

Hello,

Neves Launcher is an open-source (GPL-3.0) Windows game launcher built with Rust and Tauri.

File: Neves Launcher.exe (portable build, also wrapped by the NSIS installer in the release)
SHA-256: <digest>
Version: <version>
Download: <GitHub release asset URL>
Source: https://github.com/euvictormonte/vicelauncher (built by the public GitHub Actions workflow)
Signature: signed by <certificate subject>, thumbprint <thumbprint>
# ...or, on an unsigned release: "unsigned; certificate setup is in progress"

Trapmine reports Malicious.high.ml.score on VirusTotal; the other vendors are clean.
It launches git, cargo and game executables and downloads project sources, which is
normal for a launcher. Please review and whitelist this build and the installer.

Thanks,
<name>
```

Then:

1. Open the VirusTotal page, press **Reanalyze** once Trapmine confirms (the row updates
   only on a new analysis).
2. Add a VirusTotal **community comment** with the SHA-256, the release link and a note
   that it is an unsigned/ML false positive. Players read those comments; a bare 1/70
   looks worse than it is.
3. Cast a community vote once you have an account.
4. Submit the same file to
   [Microsoft's file submission](https://www.microsoft.com/en-us/wdsi/filesubmission)
   for Defender and SmartScreen reputation, especially before a wide announcement.

Trapmine was acquired by SonicWall and its VirusTotal engine is legacy; replies can take
days or never come. Do the signing anyway, and start with step 1 instead of waiting.

### 3. Keep the score down

- Release the same product name and publisher every time, and keep the version
  resources in `tauri.conf.json` (`productName`, `publisher`) accurate.
- Do not UPX-pack the exe; the installer's own compression is fine.
- Prefer the signed portable exe and installer; a ZIP around the exe hides the signature
  from some scanners.
- Re-check the previous release after publishing a new one. A new hash starts with no
  history, which is exactly why the report is per release.

## Statement from the maintainers

Neves Launcher has been flagged by one machine-learning engine, Trapmine, and that flag is a
**false positive**. We have no intention of distributing malware. The launcher is open
source under GPL-3.0-or-later, every release is built from a public commit by a public
workflow, and we are happy to show proof: the source, the build logs, the SHA-256 digests
and the steps to reproduce the build. We are working on a signing certificate, which is the
long-term fix for this kind of flag, and we will report the outcome of each submission here.
