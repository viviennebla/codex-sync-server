# Denglema Mac preview

This preview is intentionally backend-free. It does not require Feishu login, the company LAN, or the real Denglema service.

## Run

```bash
git clone https://github.com/viviennebla/codex-sync-server.git
cd codex-sync-server
git checkout feat/denglema-feishu-h5
npm run preview
```

Open:

```text
http://127.0.0.1:1600/?preview=1
```

The preview contains six riders across four shared lanes and demonstrates normal, fast, burning, tired, and chill states. The binding dialog also works in demo mode and returns a fake pairing code.

No API calls are made in preview mode.

## Real service

The production-like internal H5 remains:

```text
http://10.21.5.77:1600/
```

Do not use the preview as evidence that Feishu OAuth, pairing, or upload is currently reachable.
