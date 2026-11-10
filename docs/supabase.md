# Banco de dados (Supabase)

> **Referência reconstruída a partir do código.** O projeto original tinha os arquivos `supabase/vitrine.sql`, `supabase/etapa2.sql` e `exigir-2fa.sql`; eles **não estavam neste repositório**. Se você os tiver, guarde-os aqui em `supabase/` e trate-os como a fonte oficial. Use este documento para **conferir** se o seu projeto tem tudo que o app usa. Revise antes de rodar em produção.

## O que o app usa

| Recurso | Tipo | Quem acessa | Para quê |
|---|---|---|---|
| `app_state` | tabela | só você (logado) | todos os dados da loja (estoque, vendas, despesas…) em um registro `id = 'loja'`, com controle de versão (`rev`) |
| `vitrine_publica` | tabela | leitura pública, escrita logado | catálogo que a vitrine lê (`id = 'loja'`) |
| `vitrine_cliques` | tabela | cliente grava, você lê | visitas e cliques da vitrine |
| `vitrine_avisos` | tabela | cliente grava, você gerencia | "avise-me quando chegar" |
| `fotos` | bucket **público** | você envia, todos leem | fotos dos produtos |
| `backups` | bucket **privado** | só você | backup diário na nuvem |

## Esquema e regras de acesso (RLS)

```sql
-- Dados da loja (somente usuário autenticado)
create table if not exists public.app_state (
  id text primary key,
  state jsonb not null,
  rev integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
create policy "app_state: logado" on public.app_state
  for all to authenticated using (true) with check (true);
alter publication supabase_realtime add table public.app_state;

-- Catálogo público
create table if not exists public.vitrine_publica (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.vitrine_publica enable row level security;
create policy "vitrine: leitura pública" on public.vitrine_publica
  for select to anon, authenticated using (true);
create policy "vitrine: escrita logado" on public.vitrine_publica
  for all to authenticated using (true) with check (true);

-- Cliques (o visitante só insere; você lê)
create table if not exists public.vitrine_cliques (
  id bigint generated always as identity primary key,
  produto_id text,
  tipo text not null,
  em timestamptz not null default now()
);
alter table public.vitrine_cliques enable row level security;
create policy "cliques: visitante insere" on public.vitrine_cliques
  for insert to anon, authenticated with check (true);
create policy "cliques: logado lê" on public.vitrine_cliques
  for select to authenticated using (true);

-- Avisos de volta ao estoque
create table if not exists public.vitrine_avisos (
  id bigint generated always as identity primary key,
  produto_id text,
  produto text,
  modelo text,
  cap text,
  cond text,
  whats text,
  em timestamptz not null default now(),
  avisado_em timestamptz
);
alter table public.vitrine_avisos enable row level security;
create policy "avisos: visitante insere" on public.vitrine_avisos
  for insert to anon, authenticated with check (true);
create policy "avisos: logado gerencia" on public.vitrine_avisos
  for all to authenticated using (true) with check (true);

-- Armazenamento
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('backups', 'backups', false) on conflict (id) do nothing;
create policy "fotos: logado envia" on storage.objects
  for all to authenticated using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
create policy "backups: logado" on storage.objects
  for all to authenticated using (bucket_id = 'backups') with check (bucket_id = 'backups');
```

## Pontos de atenção

- **Cadastro fechado:** em *Authentication → Providers → Email*, desligue a criação de novas contas. Só o seu usuário deve existir; a política `authenticated` libera tudo para qualquer conta logada.
- **Verificação em duas etapas (2FA):** ative em *Configurações* no app. Para **exigir** 2FA no banco, use uma política restritiva com `(auth.jwt()->>'aal') = 'aal2'`.
- **Chave pública:** o `config.js` leva só a chave *publishable/anon*. Nunca coloque `service_role` ou `sb_secret_` no repositório (o `npm run check` bloqueia isso).
- Um visitante mal-intencionado pode inserir linhas em `vitrine_cliques` e `vitrine_avisos` (é o que torna a vitrine pública). Se virar problema, limite por taxa com uma Edge Function.
