
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

- Crie `backend/.env` a partir de `backend/.env.example`.
- Preencha pelo menos `OPENAI_API_KEY` (e `YOUTUBE_API_KEY` se for usar YouTube).
- Google Drive é opcional; sem isso, o backend salva arquivos localmente em `backend/uploads`.

2) Instale e rode:

```bash
cd backend
npm install
npm run dev
```

Backend sobe em `http://localhost:3000` (ou `PORT`).

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
