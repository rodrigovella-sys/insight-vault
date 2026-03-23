
# Insight Vault

## Rodar local (Windows)

### Pré-requisitos

- Node.js **20.x** (o backend declara `engines.node: 20.x`)

Para checar sua versão:

```bash
node -v
```

### Backend (API)

1) Configure variáveis de ambiente:

- Crie `backend/.env.local` (recomendado) a partir de `backend/.env.example`.
- Preencha pelo menos `DATABASE_URL` (Postgres). `OPENAI_API_KEY` é necessário para classificação por IA (e `YOUTUBE_API_KEY` se for usar YouTube).
- Google Drive é opcional; sem isso, o backend salva arquivos localmente em `backend/uploads`.

Para habilitar Google Drive, configure no `backend/.env.local`:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

Para obter `GOOGLE_OAUTH_REFRESH_TOKEN` (uma vez só):

- Garanta que a tela de consentimento OAuth está configurada no seu projeto Google Cloud.
- Use o OAuth Playground (ou outro fluxo OAuth2) com o escopo `https://www.googleapis.com/auth/drive`.
- Marque `Access type: offline` e force o consentimento (`prompt=consent`) para receber `refresh_token` na primeira autorização.

### OneDrive (Microsoft Graph) — enviar arquivos

O backend também suporta OneDrive via Microsoft Graph. Se as variáveis do OneDrive estiverem configuradas, ele será usado com prioridade sobre o Google Drive.

Variáveis necessárias no `backend/.env.local`:

- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_REFRESH_TOKEN`
- (opcional) `ONEDRIVE_CLIENT_SECRET` (se você registrar como "public client", não precisa)
- (opcional) `ONEDRIVE_TENANT_ID` (padrão: `common`)
- (opcional) `ONEDRIVE_FOLDER_ID` (se omitido, usa a raiz do OneDrive)

Login (para obter `ONEDRIVE_REFRESH_TOKEN`):

1) Crie um App Registration no Microsoft Entra ID (Azure AD).
2) Em **API permissions**, adicione Microsoft Graph (Delegated): `Files.ReadWrite.All`, `User.Read` e `offline_access`.
3) Em **Certificates & secrets**, crie um `client secret`.
4) Em **Authentication**, adicione o Redirect URI: `http://localhost:3005/auth/microsoft/callback`.
5) Rode o helper local:

```bash
cd backend
npm run auth:onedrive
```

6) Abra `http://localhost:3005/auth/microsoft`, faça login e consentimento; o refresh token será impresso no terminal.

Obs: o backend também aceita `backend/.env` como fallback, mas o padrão local é usar `.env.local` (que não deve ir para o repositório).

2) Instale e rode:

```bash
cd backend
npm install
npm run dev
```

Backend sobe em `http://localhost:3000` (ou `PORT`).

Obs: por padrão, o backend executa migrações/seed do Postgres ao subir. Se você prefere rodar migração manualmente, defina `DB_MIGRATE_ON_STARTUP=false` no `backend/.env.local` e execute `cd backend && npm run db:migrate` quando necessário.

#### Organização do backend (módulos)

- `backend/server.js`: somente boot do Express + montagem dos endpoints.
- `backend/context.js`: dependências compartilhadas (db, drive, OpenAI, YouTube) + helpers.
- `backend/src/*/controller.js`: controllers por módulo (endpoints):
	- `system` (`/health`)
	- `taxonomy` (`/pillars`, `/topics`)
	- `items` (`/vault`, `/items/:id`, `/items/:id/file`, confirm/reclassify)
	- `upload` (`/upload`)
	- `youtube` (`/youtube`, `/youtube/playlist`)
- `backend/src/*/services/*`: lógica por endpoint (ex.: `getVault`, `uploadFile`, etc.).

#### Scripts de planilha (carga inicial)

Os utilitários de XLSX ficam em `backend/data/`:

```bash
cd backend
npm run inspect:xlsx
npm run import:xlsx
```

### Frontend (estático)

O frontend é HTML/CSS/JS estático.

Opção A (recomendado): servir via `npm`/`npx`:

```bash
cd frontend
npm run dev
```

Abra `http://localhost:5173`.

Opção B (rápido): abrir o arquivo direto

- Abra `frontend/index.html` no navegador.

Obs: quando o frontend estiver em `localhost`, ele chama automaticamente `http://localhost:3000`. Em produção ele continua usando a URL do Render.

## Troubleshooting

- Se o backend falhar ao subir, valide primeiro se `DATABASE_URL` está configurado no `backend/.env.local`.
