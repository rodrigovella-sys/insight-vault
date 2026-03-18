# Análise — Riscos de usar SQLite (Insight Vault)

Data da análise: 2026-03-17

## Contexto (o que estamos rodando)

- Banco: SQLite embutido via `better-sqlite3` (Node.js) com arquivo `backend/vault.db`.
- Padrão de uso: app single-host, sem cluster, gravando e lendo no mesmo arquivo.
- Observação importante: SQLite é um banco **embarcado** (arquivo local) e não um banco client/server. Isso muda os riscos (principalmente concorrência e backup).

## 1) Última versão do SQLite

**Fonte oficial (SQLite Download Page):** a versão mais recente disponível na data desta análise é **3.51.3**.
- https://www.sqlite.org/download.html

**Versão que o nosso `vault.db` está usando atualmente (medida no ambiente):**
- `sqlite_version()` = **3.49.2**

Isso significa que estamos **duas releases atrás** do “latest” oficial.

### Nota sobre WAL-reset bug (relevante para corrupção)
No próprio documento oficial de WAL, o SQLite descreve um bug raro (“WAL-reset bug”) que **pode levar a corrupção** e que estaria presente de **3.7.0 até 3.51.2**, sendo **corrigido em 3.51.3**. O texto ressalta que é um bug de baixa probabilidade e afeta cenários específicos em **WAL mode** com concorrência de conexões.
- https://www.sqlite.org/wal.html

No nosso ambiente atual, o `journal_mode` medido está como **DELETE** (rollback journal), então **não estamos em WAL**.

## 2) Capacidade do SQLite (limites relevantes)

Os “limites” do SQLite são bem documentados pelo próprio projeto.

### 2.1 Limite de tamanho máximo do arquivo do banco
O limite teórico depende de page size e do limite de páginas (page count).
- Por padrão (desde 3.45.0), o máximo de páginas (`SQLITE_MAX_PAGE_COUNT`) pode chegar a **4.294.967.294** páginas.
- Com page size padrão **4.096 bytes**, isso dá um máximo de aproximadamente **16.00 TiB (~17.6 TB decimal)**.
- Se page size for aumentado ao máximo (65.536 bytes), o banco pode chegar a aproximadamente **281 TB**.

Fonte:
- https://www.sqlite.org/limits.html

### 2.2 Limites de tamanho por string/BLOB e por “linha”
- O limite default para string/BLOB (`SQLITE_MAX_LENGTH`) é **1.000.000.000 bytes** (1 bilhão).
- Esse mesmo limite também afeta o tamanho máximo de uma “row”, porque em parte do processamento interno o SQLite codifica a row inteira como um BLOB.

Fonte:
- https://www.sqlite.org/limits.html

### 2.3 Concorrência
- Em geral, **múltiplos leitores** podem operar ao mesmo tempo.
- Em geral, **apenas um writer** pode gravar por vez.
- WAL costuma melhorar concorrência (leitura não bloqueia escrita), mas tem restrições (ex.: não usar em filesystem de rede).

Fontes:
- FAQ: https://www.sqlite.org/faq.html
- WAL: https://www.sqlite.org/wal.html

## 3) “Buscar na internet sobre o banco corromper” — o que a documentação diz

A própria documentação do SQLite tem uma página específica: “How To Corrupt An SQLite Database File”. Pontos centrais:

- SQLite é **muito resistente** a corrupção por crash/power loss no meio de transação; o mecanismo de rollback/recuperação é automático.
- Quando ocorre corrupção, normalmente existe “ajuda externa”, como:
  - processos/threads escrevendo no arquivo indevidamente;
  - **backup/cópia do arquivo durante transação** (cópia pega partes inconsistentes);
  - **apagar/mover** arquivos de journal/WAL “quentes” após crash;
  - problemas de lock em filesystem (principalmente **filesystem de rede**);
  - falhas de sync/hardware (disco/USB/flash que “mente” sobre fsync);
  - configuração insegura (ex.: `PRAGMA synchronous=OFF`, `journal_mode=OFF`);
  - bugs históricos do SQLite (raros, mas existem).

Fontes:
- https://www.sqlite.org/howtocorrupt.html
- FAQ sobre `SQLITE_CORRUPT` e recomendações de `PRAGMA integrity_check`: https://www.sqlite.org/faq.html

## 4) Avaliação com base nos nossos dados (DB vs XLSX vs limites)

### 4.1 Métricas medidas no ambiente
Arquivo do banco:
- `backend/vault.db` = **41.107.456 bytes** (≈ **39,20 MiB**)

Fonte de import (carga inicial):
- `backend/data/biblioteca_narrativa_8_pilares.xlsx` = **6.760.971 bytes** (≈ **6,45 MiB**)

PRAGMAs relevantes (medidos):
- `journal_mode` = **delete**
- `page_size` = **4096**
- `page_count` = **10036**
- `freelist_count` = **0** (sem páginas livres acumuladas no momento)

Volume lógico de dados (medido):
- `items` = **21.610** linhas
- `itemTopics` = **14.681** linhas
- `classification_log` = **0** linhas

Aproximação do “payload textual” armazenado em `items`:
- soma de `length(text)+length(summary)+length(tags)+length(metadataJson)` ≈ **17.797.989 bytes** (~16,98 MiB)
- maior `text` ≈ **5.764 chars**
- maior `metadataJson` ≈ **7.031 chars**

### 4.2 Quanto da capacidade máxima estamos usando?
Considerando o limite de tamanho máximo por default do SQLite com page size 4096:
- Máximo teórico ≈ **16,00 TiB**
- Tamanho atual ≈ **39,20 MiB**
- Percentual ≈ **0,0002337%** do limite teórico

Conclusão: pelo critério de “tamanho máximo do arquivo”, estamos **muito longe** do teto.

## 5) Qual o risco de usar SQLite (parecer)

### 5.1 Risco por capacidade (tamanho, limites)
- **Baixo** para o cenário atual.
- O banco está em ~39 MiB e os limites documentados (tamanho máximo) estão em ordem de **dezenas de terabytes** (com page size padrão).
- Limites de row/string/BLOB também estão folgados, já que o app corta `text` em ~5000 chars e o `metadataJson` atual está na casa de poucos KB.

### 5.2 Risco por concorrência e performance
- **Médio (dependendo do crescimento de uso)**.
- SQLite funciona muito bem em “single server / baixo a médio throughput”, mas:
  - há **apenas um writer** por vez;
  - se houver muita escrita concorrente, podem aparecer `SQLITE_BUSY`/latência;
  - com `better-sqlite3`, as chamadas são **síncronas** e podem **bloquear o event loop** do Node em operações pesadas.

### 5.3 Risco de corrupção (onde costuma dar problema)
- **Baixo a médio**, dependendo de como o arquivo é armazenado e copiado.
- Pelo que a documentação do SQLite destaca, os maiores fatores de risco práticos costumam ser operacionais:
  - **copiar/backup do arquivo enquanto o app está escrevendo**;
  - **mover/apagar** arquivos auxiliares de journaling (ex.: `-journal`/`-wal`/`-shm`) quando “quentes”;
  - rodar o banco em filesystem com locking problemático (ex.: **rede/NFS/SMB**);
  - storage instável (queda de energia, mídia defeituosa, USB etc.);
  - desabilitar mecanismos de segurança (`synchronous=OFF`, `journal_mode=OFF`).

No Windows, um risco comum em times é colocar o `vault.db` dentro de pastas de sincronização/compartilhamento (ou disco de rede). Isso aumenta a chance de cenários “parecidos” com os descritos em `howtocorrupt` (cópias incoerentes, lock quebrado, arquivos auxiliares não acompanhando o principal).

### 5.4 Risco de “ficar desatualizado”
- **Médio** (risco de ficar exposto a bugs corrigidos).
- Nosso SQLite local é 3.49.2 e a última versão oficial é 3.51.3.
- Em especial, há uma correção importante citada na documentação (WAL-reset bug) **corrigida em 3.51.3**. Hoje isso só seria um risco direto se a gente habilitasse WAL e tivesse concorrência de conexões/checkpoints.

## Recomendações práticas (mitigação)

1) **Backups seguros**
- Preferir backup com o app parado (shutdown do Node) e então copiar o arquivo.
- Alternativas seguras citadas na documentação: `VACUUM INTO`, Backup API, etc.
- Se algum dia usarmos WAL, lembrar que `vault.db-wal` e `vault.db-shm` fazem parte do estado; não devem ser separados do `vault.db`.

2) **Evitar filesystem de rede / sync**
- Manter `vault.db` em disco local no host do backend.
- Evitar acesso concorrente via share de rede.

3) **Se precisar de mais concorrência, considerar WAL — mas com cautela**
- WAL melhora concorrência, mas não funciona bem em filesystem de rede.
- Se habilitar WAL, considerar atualizar o SQLite (via dependência) para uma versão que inclua correções recentes (ex.: 3.51.3+).

4) **Rotina de verificação de integridade**
- Programar (ex.: semanal/mensal) `PRAGMA quick_check;` ou `PRAGMA integrity_check;` (mais lento) para detectar cedo qualquer problema.

5) **Escala / futuro**
- Se o roadmap prever:
  - múltiplas instâncias do backend escrevendo ao mesmo tempo;
  - alta taxa de escrita;
  - necessidade de HA/replicação;
  - acesso multi-host;
  então um banco client/server (Postgres/MySQL) reduz risco operacional e melhora concorrência.

## Apêndice — Links usados

- SQLite Download (versão): https://www.sqlite.org/download.html
- SQLite Limits (tamanho máximo, limites): https://www.sqlite.org/limits.html
- How To Corrupt (causas de corrupção): https://www.sqlite.org/howtocorrupt.html
- WAL (concorrência, restrições, bug WAL-reset): https://www.sqlite.org/wal.html
- SQLite FAQ (concorrência, SQLITE_CORRUPT, integrity_check): https://www.sqlite.org/faq.html
