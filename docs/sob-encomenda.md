# Aba "Sob encomenda"

No app: **Mais → Catálogo → Sob encomenda**.

1. Informe a **cotação do dólar**, o **frete e custos estimados** (valor geral, em reais), a **nota** (%) e o **arredondamento**.
2. **Cole a lista do fornecedor** (texto do WhatsApp) e toque em "Ler lista e atualizar". A lista nova substitui a anterior.
3. Defina a **margem de lucro por modelo**. Modelo sem margem não aparece na vitrine.
4. A **margem fica salva** por modelo até você mudar. Se o modelo sair da lista e voltar dias depois, a última margem volta junto (e aparece em "Salvas, fora da lista de hoje").
5. Marque cada item como **Novo (lacrado)** ou **Seminovo** (a marcação fica salva entre listas).

A lista pode vir em dois estilos: tudo numa linha (modelo, capacidade, cor e preço) ou com **cabeçalho** de modelo + capacidade e uma linha por cor embaixo (`Cor | região | $preço`). Nesse segundo estilo, cada linha de cor precisa ter `$` ou `|`. Confira sempre a contagem de aparelhos lidos antes de confirmar.

Preço na vitrine = (US$ × cotação + frete e custos + margem) ÷ (1 − nota%), arredondado para cima.

- O app guarda só o essencial de cada linha: modelo, capacidade, cor e preço em dólar. Chip, região e código do aparelho são ignorados.
- Itens iguais (mesmo modelo, capacidade e cor) com preços diferentes: fica só o mais barato.
- A vitrine mostra o prazo de entrega em um quadro próprio. O link de cada produto usa só modelo, capacidade e cor, então não muda de um dia para o outro.
- A data escrita na lista (📅) é lida; se não for a de hoje, o app avisa.
- Fotos vêm do **Banco de fotos** (por modelo e cor). Aparelho sem foto no banco **não vai para a vitrine**, a menos que você ligue "Publicar também aparelhos sem foto".
- Na vitrine, Sob encomenda tem entrada própria (fora dos círculos de categorias) e o botão da página do produto diz só "Quero encomendar".
- O card mostra pontinhos só das fotos do aparelho exibido.
- "Criar encomenda" abre a nova encomenda já preenchida (preço de venda e custo estimado, que inclui a nota).
- Nada de dólar, custo ou margem é publicado: a vitrine recebe só o preço final.

## Seminovos (quadro separado)

- A aba tem um segundo quadro, só para a lista de seminovos. Colar um quadro não apaga o outro.
- Só entra o aparelho escrito exatamente como **Grade A** (`GRADO A` ou `GRADE A`). A-, A+, B, C, outras grades e linhas sem grade são descartadas, assim como produtos que não são iPhone.
- O app lê modelo, capacidade, cor e preço em dólar (último número da linha). Código do fornecedor, chip, região e "S/G" são ignorados.
- Mesmo modelo, capacidade e cor repetidos: fica o mais barato.
- Preço do seminovo = a mesma fórmula dos lacrados (cotação, frete, nota e arredondamento), mas com **margem própria** ("Margem dos seminovos"). Sem margem ou sem foto, não vai para a vitrine.
- Na vitrine, eles aparecem como Seminovo. O botão "Criar encomenda" existe só para os lacrados.

## Vitrine e tela do app (novidades)

- No app, cada modelo mostra só a primeira opção e tem o botão "Ver mais N opções" / "Minimizar".
- O quadro de colar a lista de seminovos fica logo abaixo do quadro dos lacrados, e a margem dos seminovos aparece logo abaixo dele depois que a lista é lida.

## Alterações da lista

- Ao colar uma lista nova (novos ou seminovos), o app compara com a anterior por modelo, capacidade e cor e guarda: o que entrou, o que saiu, o que subiu e o que desceu de preço em dólar.
- O resultado aparece em um quadro "Alterações da lista" logo abaixo do quadro de colar, com a data da lista anterior, e fica até a próxima colagem. A primeira lista não tem comparação.
- O quadro começa fechado e só abre quando você toca nele. Se abrir, continua aberto enquanto você mexe nas margens; ao colar uma lista nova, volta a ficar fechado.
- Ao mexer em margem, dólar ou cor, só a tela de Sob encomenda é atualizada: a rolagem não pula e o campo que você tocou em seguida continua selecionado.
- Quando há modelos sem margem, aparece no topo o selo "N modelos sem margem". Ao tocar nele, o app leva ao primeiro campo que falta (e troca para Seminovos, se for lá).
- Os seminovos mantêm a mesma garantia dos demais, usam as fotos do Banco de fotos e aparecem na vitrine só como "Seminovo", sem a grade.

## Cotação separada

- Os lacrados/novos usam a cotação do dólar do fornecedor deles, e os seminovos usam a cotação do fornecedor de seminovos. São dois campos em "Valores do dia".
- Frete e custos, nota e arredondamento continuam sendo um só valor para as duas listas.
- Seminovo sem a sua cotação não recebe preço e não vai para a vitrine; o app avisa. O mesmo vale para os novos.

## Vitrine: linha de filtros

- A contagem ("12 de 26 produtos"), o botão "Só disponíveis" e os botões de grade/lista ficam sempre na mesma linha, em todas as abas (Todos, iPhones, Cosméticos, Acessórios e Sob encomenda). A palavra "Exibindo" saiu para a contagem caber.

## Refinamento visual (vitrine e app)

- **Vitrine:** no celular, só busca e categorias ficam à mostra; o botão **Filtrar** (ao lado da busca) abre e fecha os filtros e fica destacado quando há filtro ativo. A faixa Sob encomenda ficou fina, com título manuscrito (fonte do sistema do iPhone).
- **Cards:** Novo/Seminovo viram selo na foto; foto no quadro inteiro, com fundo branco como antes; coração de favoritar e setas das fotos pequenos, para a foto ficar limpa; os cards sobem de leve ao passar o dedo/mouse e entram com uma animação suave (desligada para quem usa "reduzir movimento").
- **Aba Sob encomenda:** um só aviso de entrega, sem repetir "Sob encomenda" em cada card.
- **WhatsApp:** botão menor, esconde ao rolar para baixo e depois de 2 segundos parado; a página ganhou espaço no fim.
- **App:** valores em dólar no padrão brasileiro (US$ 1.275,00) e "Criar encomenda" como botão principal.
- Os cards não escrevem mais "4 cores", "2 cores"; as bolinhas de cor já mostram as cores disponíveis.

## Visual da aba (v90)

- Duas abas, **Novos** e **Seminovos**, cada uma com seu dólar, sua lista e suas margens.
- A **margem fica dentro do card de cada modelo**; campo em destaque quando falta.
- Cada aparelho mostra preço, US$, custo e lucro. "Criar encomenda" e Novo/Seminovo só aparecem quando já há preço.
- Pendências ficam juntas em um aviso recolhido. Frete, nota, arredondamento, prazo e nomes das cores ficam em "Ajustes".

## Reajuste durante o dia (v91)

- **Dólar mudou:** altere o campo "Dólar dos novos" (ou dos seminovos). Todos os preços em reais são recalculados na hora, e a vitrine atualiza sozinha.
- **Um aparelho reajustou:** toque no valor em US$ da linha e digite o novo preço. Só aquele aparelho muda.
- **Vários reajustes:** em "Nova lista", cole só as linhas que mudaram e use **Só atualizar preços**. O app mostra quantos preços mudam e não apaga o resto da lista.
