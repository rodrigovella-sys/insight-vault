
# Insight Vault

## Rodar local (Windows)

### Pré-requisitos

- Node.js **20.x** (o backend declara `engines.node: 20.x` e usa `better-sqlite3`, que costuma falhar para instalar/compilar em Node 22 sem toolchain C++/SDK)

Para checar sua versão:

```bash
node -v
```

### Backend (API)

1) Configure variáveis de ambiente:

- Crie `backend/.env.local` (recomendado) a partir de `backend/.env.local.example`.
- Preencha pelo menos `OPENAI_API_KEY` (e `YOUTUBE_API_KEY` se for usar YouTube).
- Google Drive é opcional; sem isso, o backend salva arquivos localmente em `backend/uploads`.

Para habilitar Google Drive, configure no `backend/.env.local`:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON em uma única linha)

Obs: o backend também aceita `backend/.env` como fallback, mas o padrão local é usar `.env.local` (que não deve ir para o repositório).

2) Instale e rode:

```bash
cd backend
npm install
npm run dev
```

Backend sobe em `http://localhost:3000` (ou `PORT`).

#### Organização do backend (módulos)

- `backend/server.js`: somente boot do Express + montagem dos endpoints.
- `backend/context.js`: dependências compartilhadas (db, drive, OpenAI, YouTube) + helpers.
- `backend/src/*/controller.js`: controllers por módulo (endpoints):
	- `system` (`/health`)
	- `taxonomy` (`/pillars`, `/topics`)
	- `items` (`/vault`, `/items/:id`, `/items/:id/file`, confirm/reclassify)
	- `upload` (`/upload`)
	- `youtube` (`/youtube`, `/youtube/playlist`)
	- `database` (`/database/backup`, `/database/restore`, `/database/recover`)
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

- Se `npm install` falhar com `better-sqlite3` / `node-gyp` no Windows, normalmente é por estar usando Node 22+ ou por faltar toolchain C++/Windows SDK. A forma mais simples é usar Node **20.x**.
