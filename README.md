# Select Imports

Sistema de gestão e vitrine pública da loja **Select Imports** (iPhones e cosméticos importados).
É um site estático (PWA, sem build) com banco, login e armazenamento no **Supabase**.

| Parte | Endereço | O que é |
|---|---|---|
| App de gestão | `/` | vendas, estoque, lotes de compra, despesas, recibos, relatórios, garantias, pós-venda, backup |
| Vitrine pública | `/vitrine/` | catálogo para os clientes: busca, filtros, parcelas, troca de iPhone, WhatsApp |
| Prévia de link | `/p/<id>` | página com a miniatura bonita do produto para WhatsApp/Instagram (`api/p.js`) |

## Estrutura

```
index.html            app de gestão (HTML + CSS + JS em um arquivo)
vitrine/index.html    vitrine pública
supabase-shim.js      login (e-mail, senha, 2FA), gravação segura entre aparelhos, fila offline, backups
qr.js                 gerador de QR Code local (sem serviço externo)
sw.js                 modo sem internet (service worker)
config.js             configuração pública: URL e chave pública do Supabase + dados padrão da loja
api/p.js              função da Vercel para a prévia dos links
icons/                logos e ícones do app
docs/supabase.md      tabelas, buckets e regras de acesso do banco
scripts/check.mjs     verificações automáticas (npm run check)
docs/workflows/       cópias dos workflows do GitHub (ver "Como atualizar o site")
```

## Como configurar

1. **Supabase:** crie o projeto e as tabelas/regras de [`docs/supabase.md`](docs/supabase.md).
2. **`config.js`:** preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` (só a chave pública) e, em `SI_LOJA`, o telefone e o vendedor padrão dos recibos.
3. **Deploy na Vercel:** importe o repositório; não precisa de build. O `vercel.json` já traz o rewrite de `/p/:id` e os cabeçalhos de segurança. Em Netlify/Cloudflare Pages valem `_headers` e `_redirects` (a prévia de links `/p/` só funciona na Vercel).
4. **Rodar localmente:** `npm start` (ou qualquer servidor estático) e abra `http://localhost:3000`.

## Antes de cada publicação

```bash
npm run check
```

Confere a sintaxe de todos os scripts, os JSON, os arquivos referenciados (ícones e cache offline) e procura segredos.

**Ao mudar qualquer arquivo do app**, aumente a versão em `sw.js` (`const V = 'si-vNN'`), senão os aparelhos podem continuar com a versão antiga guardada.

## Como atualizar o site (upload do zip, inclusive pelo celular)

1. No GitHub, abra o repositório → **Add file → Upload files** e envie o `select-imports-arquivos-extraidos.zip` na raiz.
2. O workflow **Extrair arquivos do site** extrai o zip, roda `scripts/check.mjs` e só então salva. Se algo estiver quebrado, o job fica vermelho e **nada é publicado**.
3. A Vercel publica sozinha depois do commit.

Importante:
- O zip **não pode conter a pasta `.github`**: o GitHub impede que um workflow altere workflows. Para mudar os workflows, edite-os pelo site do GitHub; as versões atuais estão em `docs/workflows/`.
- A extração **sobrescreve** arquivos, mas **não apaga** os que saíram do projeto. Arquivos antigos que não são mais usados precisam ser excluídos à mão no GitHub.

## Cadastro de produtos e venda a prazo

- **Estoque › Cadastrar novos produtos** é um cartão único: um formulário por produto (iPhone, Cosmético, Acessório; Eletrônico quando ativado em **Configurações › Estoque › Vender Eletrônicos**), com **lote opcional** (fornecedor, taxa e frete rateado em *Fretes e custos*; cada lote aparece recolhido e abre pela seta), pagamento pelo saldo ou já pago, situação (a caminho/chegou) e **nota fiscal** por unidade ou do pedido inteiro (dividida entre as unidades).
- **Venda a prazo:** na venda, a forma de pagamento **A prazo** (com prazo em dias) lança o valor em *Contas › A receber* ligado à venda e ao cliente. O valor só entra no saldo quando é marcado como recebido. Editar ou cancelar a venda mantém tudo coerente (a lixeira restaura o valor a receber).

## Fornecedores e frete por cidade

Cada fornecedor do lote tem uma cidade, e ela define o frete:

| Cidade | Como chega até você | Frete |
|---|---|---|
| Pedro Juan Caballero (PJC) | é a base | entra só em "Frete até aqui (todos juntos)" |
| Ciudad del Este (CDE) | vai para PJC e segue | "Frete CDE → PJC" (com ou sem) **e** "Frete até aqui" |
| São Paulo (SP) | **direto para você**, sem passar por PJC | "Frete São Paulo (direto)" só para esse fornecedor; fica **fora** do "todos juntos" |

## Privacidade e segurança

- O repositório contém a URL e a chave **pública** do Supabase (feitas para ficar no navegador; a proteção real são as regras RLS do banco). **Nunca** envie `service_role` ou `sb_secret_`.
- `config.js` também guarda o telefone e o nome do vendedor usados como padrão nos recibos. Se o repositório for **público**, troque esses valores ou deixe o repositório **privado**.
- O site é `noindex` (cabeçalhos, `robots.txt` e `<meta>`): só quem tem o link acha a vitrine.
- Os dados da loja ficam no Supabase; o aparelho guarda só uma cópia local para funcionar sem internet.

## Bibliotecas externas

Fontes do Google, `@supabase/supabase-js` (jsDelivr) e jsPDF/html2canvas (cdnjs, só ao gerar PDF) carregam por CDN, sem *Subresource Integrity*. Para endurecer: baixe os arquivos para o repositório ou adicione `integrity=` com o hash oficial de cada versão.

## Direitos

Código proprietário da Select Imports. Sem licença de uso por terceiros, salvo autorização.
