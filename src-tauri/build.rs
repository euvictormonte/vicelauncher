fn main() {
    println!("cargo:rerun-if-env-changed=NEVES_DISCORD_CLIENT_ID");
    if let Ok(client_id) = std::env::var("NEVES_DISCORD_CLIENT_ID") {
        println!("cargo:rustc-env=NEVES_DISCORD_CLIENT_ID={client_id}");
    }
    tauri_build::build()
}
