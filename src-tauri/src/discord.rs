//! Discord profile-name login for the welcome screen.
//!
//! This is a public desktop OAuth client: it uses authorization-code + PKCE,
//! asks only for `identify`, and never saves the Discord access token.

use ring::rand::{SecureRandom, SystemRandom};
use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::Emitter;
use url::Url;

const REDIRECT_URI: &str = "http://127.0.0.1:43872/oauth/discord/callback";
const CALLBACK_PATH: &str = "/oauth/discord/callback";
const AUTHORIZE_URL: &str = "https://discord.com/oauth2/authorize";
const TOKEN_URL: &str = "https://discord.com/api/oauth2/token";
const USER_URL: &str = "https://discord.com/api/users/@me";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(180);

static LOGIN_RUNNING: AtomicBool = AtomicBool::new(false);

/// Start the local callback listener and return Discord's authorization URL.
pub fn begin(app: tauri::AppHandle) -> Result<String, String> {
    let client_id = option_env!("NEVES_DISCORD_CLIENT_ID")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Discord sign-in is not configured. Add the Discord application Client ID to NEVES_DISCORD_CLIENT_ID, then rebuild the launcher.".to_string())?
        .to_owned();

    if LOGIN_RUNNING
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err("A Discord sign-in is already in progress.".into());
    }

    let listener = match TcpListener::bind("127.0.0.1:43872") {
        Ok(listener) => listener,
        Err(error) => {
            LOGIN_RUNNING.store(false, Ordering::Release);
            return Err(format!(
                "Could not open the local Discord callback: {error}"
            ));
        }
    };
    if let Err(error) = listener.set_nonblocking(true) {
        LOGIN_RUNNING.store(false, Ordering::Release);
        return Err(format!(
            "Could not prepare the local Discord callback: {error}"
        ));
    }

    let random = SystemRandom::new();
    let (state, verifier) = match (random_string(&random, 32), random_string(&random, 48)) {
        (Ok(state), Ok(verifier)) => (state, verifier),
        (Err(error), _) | (_, Err(error)) => {
            LOGIN_RUNNING.store(false, Ordering::Release);
            return Err(format!("Could not prepare secure Discord sign-in: {error}"));
        }
    };
    let challenge =
        base64_url(&ring::digest::digest(&ring::digest::SHA256, verifier.as_bytes()).as_ref());

    let mut authorization = Url::parse(AUTHORIZE_URL).expect("valid Discord OAuth URL");
    authorization
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", "identify")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");

    let worker = std::thread::Builder::new()
        .name("neves-discord-oauth".into())
        .spawn(move || {
            let _reset = LoginRunningReset;
            if let Err(error) = finish_login(listener, &client_id, &state, &verifier, &app) {
                let _ = app.emit("discord://error", error);
            }
        });
    if let Err(error) = worker {
        LOGIN_RUNNING.store(false, Ordering::Release);
        return Err(format!("Could not start Discord sign-in: {error}"));
    }

    Ok(authorization.to_string())
}

struct LoginRunningReset;

impl Drop for LoginRunningReset {
    fn drop(&mut self) {
        LOGIN_RUNNING.store(false, Ordering::Release);
    }
}

fn random_string(random: &SystemRandom, length: usize) -> Result<String, ring::error::Unspecified> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut bytes = vec![0; length];
    random.fill(&mut bytes)?;
    Ok(bytes
        .into_iter()
        .map(|byte| ALPHABET[usize::from(byte) % ALPHABET.len()] as char)
        .collect())
}

fn base64_url(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut output = String::with_capacity((input.len() * 4 + 2) / 3);
    for chunk in input.chunks(3) {
        let a = u32::from(chunk[0]);
        let b = chunk.get(1).copied().map(u32::from).unwrap_or(0);
        let c = chunk.get(2).copied().map(u32::from).unwrap_or(0);
        let block = (a << 16) | (b << 8) | c;
        output.push(ALPHABET[((block >> 18) & 63) as usize] as char);
        output.push(ALPHABET[((block >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            output.push(ALPHABET[((block >> 6) & 63) as usize] as char);
        }
        if chunk.len() > 2 {
            output.push(ALPHABET[(block & 63) as usize] as char);
        }
    }
    output
}

fn finish_login(
    listener: TcpListener,
    client_id: &str,
    expected_state: &str,
    verifier: &str,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    let (code, received_state) = loop {
        if Instant::now() >= deadline {
            return Err("Discord sign-in timed out. Please try again.".into());
        }
        match listener.accept() {
            Ok((mut stream, address)) if address.ip().is_loopback() => {
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                if let Some(callback) = read_callback(&mut stream) {
                    let result = Url::parse(&format!("http://127.0.0.1{callback}"));
                    if let Ok(url) = result {
                        if url.path() == CALLBACK_PATH {
                            let issuer = url
                                .query_pairs()
                                .find(|(key, _)| key == "iss")
                                .map(|(_, value)| value.into_owned());
                            if issuer.as_deref() != Some("https://discord.com") {
                                respond(&mut stream, 400, "Não foi possível verificar a origem", "A resposta não veio do Discord. Volte ao Neves Launcher e tente novamente.");
                                return Err("Discord sign-in could not verify the authorization source.".into());
                            }
                            if let Some((_, error)) =
                                url.query_pairs().find(|(key, _)| key == "error")
                            {
                                respond(&mut stream, 400, "Conexão cancelada", "A autorização do Discord foi cancelada. Volte ao Neves Launcher para tentar novamente.");
                                return Err(format!(
                                    "Discord authorization was cancelled: {error}"
                                ));
                            }
                            let code = url
                                .query_pairs()
                                .find(|(key, _)| key == "code")
                                .map(|(_, value)| value.into_owned());
                            let state = url
                                .query_pairs()
                                .find(|(key, _)| key == "state")
                                .map(|(_, value)| value.into_owned());
                            if let (Some(code), Some(state)) = (code, state) {
                                respond(&mut stream, 200, "Autorização recebida / Authorization received", "Volte ao Neves Launcher enquanto ele conclui a conexão. / Return to Neves Launcher while it completes the connection.");
                                break (code, state);
                            }
                            respond(&mut stream, 400, "Não foi possível conectar", "A resposta de autorização está incompleta. Feche esta página e tente novamente no Neves Launcher.");
                        } else {
                            respond(
                                &mut stream,
                                404,
                                "Página não encontrada",
                                "Volte ao Neves Launcher e tente conectar o Discord novamente.",
                            );
                        }
                    }
                }
            }
            Ok((mut stream, _)) => respond(
                &mut stream,
                403,
                "Acesso recusado",
                "Este endereço local aceita apenas a resposta do Discord neste computador.",
            ),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
            Err(error) => return Err(format!("The local Discord callback failed: {error}")),
        }
    };

    if ring::constant_time::verify_slices_are_equal(
        received_state.as_bytes(),
        expected_state.as_bytes(),
    )
    .is_err()
    {
        return Err("Discord sign-in could not be verified. Please try again.".into());
    }

    let token: TokenResponse = ureq::post(TOKEN_URL)
        .timeout(Duration::from_secs(15))
        .send_form(&[
            ("client_id", client_id),
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", REDIRECT_URI),
            ("code_verifier", verifier),
        ])
        .map_err(|_| {
            "Discord could not complete sign-in. Check your connection and try again.".to_string()
        })?
        .into_json()
        .map_err(|_| {
            "Discord returned an unexpected sign-in response. Please try again.".to_string()
        })?;

    let user: DiscordUser = ureq::get(USER_URL)
        .timeout(Duration::from_secs(15))
        .set("Authorization", &format!("Bearer {}", token.access_token))
        .call()
        .map_err(|_| "Could not load your Discord profile. Please try again.".to_string())?
        .into_json()
        .map_err(|_| "Discord returned an unexpected profile response.".to_string())?;

    let name = user
        .global_name
        .unwrap_or(user.username)
        .trim()
        .chars()
        .take(32)
        .collect::<String>();
    if name.is_empty() {
        return Err("Discord did not return a profile name.".into());
    }
    app.emit("discord://connected", name).map_err(|_| {
        "Discord connected, but Neves Launcher could not update the profile.".to_string()
    })
}

fn read_callback(stream: &mut TcpStream) -> Option<String> {
    let mut reader = BufReader::new(stream);
    let mut first_line = String::new();
    reader.take(8192).read_line(&mut first_line).ok()?;
    let mut parts = first_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    parts.next().map(str::to_owned)
}

fn respond(stream: &mut TcpStream, status: u16, title: &str, message: &str) {
    let body = format!("<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title><main style=\"font:16px system-ui;max-width:560px;margin:15vh auto;padding:24px;color:#f5f3ff;background:#191722;border:1px solid #393445;border-radius:16px\"><h1 style=\"font-size:22px\">{title}</h1><p style=\"line-height:1.6;color:#c7c2d4\">{message}</p></main>");
    let reason = if status == 200 {
        "OK"
    } else if status == 403 {
        "Forbidden"
    } else {
        "Not Found"
    };
    let _ = write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.flush();
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct DiscordUser {
    username: String,
    global_name: Option<String>,
}
