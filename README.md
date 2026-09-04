# ws397-server

Backend en Railway para el lector (Bun + Hono). Hoy: OTA. Después: IA, voz, recordatorios.

## Deploy en Railway (una vez)

1. `git init && git add -A && git commit -m "init"` y subilo a un repo de GitHub.
2. Railway → New Project → Deploy from GitHub repo → elegí el repo. Detecta el Dockerfile.
3. En el servicio → **Variables**:
   - `OTA_TOKEN` = un token largo (el mismo que `WS397_OTA_TOKEN` en tu PC)
   - `FIRMWARE_DIR` = `/data/firmware`
4. Servicio → **Volumes** → Add Volume → mount path `/data` (para que el .bin sobreviva a los redeploys).
5. Settings → **Networking → Generate Domain**. Esa URL + `/firmware/latest` es tu `WS397_OTA_URL`.

## Probar

```powershell
Invoke-RestMethod https://TU-APP.up.railway.app/            # {"ok":true,...}
Invoke-RestMethod https://TU-APP.up.railway.app/firmware/latest   # 404 hasta el primer release.ps1
```

Local: `bun install && bun run dev`.
