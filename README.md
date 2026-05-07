# ISPDesk

Projeto separado em duas camadas:

- front: aplicacao React + Vite
- back: webhook Node/Express + Supabase (functions e migrations)

## Estrutura

- front/src: codigo do frontend
- front/public: arquivos estaticos
- back/server: webhook local
- back/supabase/functions: edge functions
- back/supabase/migrations: scripts SQL

## Comandos (raiz)

- npm run dev: sobe front e back juntos
- npm run dev:front: sobe apenas frontend
- npm run dev:back: sobe apenas backend
- npm run build: build do frontend
- npm run build:back: checagem TypeScript do backend
- npm run lint: lint do frontend

## Ambientes

O backend tenta carregar variaveis de:

1. back/.env
2. .env da raiz

Padrao recomendado:

- front/.env para variaveis do frontend
- back/.env para variaveis do webhook e scripts do backend

Arquivos de referencia:

- front/.env.example
- back/.env.example

Para desenvolvimento local simples, voce ainda pode manter um .env na raiz com as variaveis compartilhadas. O webhook continua aceitando esse fallback.
