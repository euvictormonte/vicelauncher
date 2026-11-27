# Discord login for Neves Launcher

The launcher uses Discord only to read the account's display name for its welcome message. It requests the `identify` scope and does not save the OAuth access token.

## One-time setup in Discord

1. Sign in at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an application named **Neves Launcher** (or select the existing Neves Launcher application).
3. Open **OAuth2** and copy its **Client ID**. Do not create a bot token and do not share a Client Secret; the launcher is a public desktop client and uses PKCE.
4. Under **Redirects**, add this exact URI and save:

   `http://127.0.0.1:43872/oauth/discord/callback`

5. In the repository `euvictormonte/vicelauncher`, open **Settings → Secrets and variables → Actions → Variables**, create a repository variable named `NEVES_DISCORD_CLIENT_ID`, and paste the Client ID as its value.
6. Start a new build or release workflow. The installer built after the variable is set will include the public Client ID.

Only the public Client ID belongs in the repository variable. Never put a Discord bot token or Client Secret in the launcher or in a client-side variable.

## Local development build

In PowerShell, set the same variable before building or running the Tauri app:

```powershell
$env:NEVES_DISCORD_CLIENT_ID = "YOUR_DISCORD_APPLICATION_CLIENT_ID"
pnpm tauri dev
```

The variable is embedded when Rust compiles. If it changes, Cargo rebuilds the app. A build made without it shows a setup error when someone chooses Discord sign-in.

## What happens during sign-in

The launcher opens Discord's authorization page in the browser, listens only on `127.0.0.1:43872`, validates OAuth `state`, and uses PKCE with the S256 challenge. After the user approves the `identify` scope, it reads `global_name` (or `username` if there is no display name), saves that name locally, and discards the access token. The local callback is temporary and times out after three minutes.
