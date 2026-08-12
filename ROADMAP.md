# Roadmap — 3D Teu

Documento de trabalho pra acompanhar os pedidos grandes do usuário, divididos
em fases. Cada fase tem status, escopo, decisões em aberto (quando existem) e
o que já foi feito. Atualizar este arquivo a cada rodada que avançar algo
aqui — igual o `CLAUDE.md`, mas focado no que falta fazer, não no histórico
do que já foi feito.

**Convenção de status**: `✅ feito` / `🔜 próximo` / `⏸ aguardando decisão` /
`💤 não iniciado`.

---

## ✅ Feito recentemente

- **Fase 4b completa** (enviar STL próprio pra orçamento, sem IA) — mesma
  tela `/conta/modelo-3d` da Fase 4, com um toggle novo. Falta rodar a
  migração `0014_omniscient_sister_grimm.sql` em produção.
- **Fase 1c completa** (preço ao vivo por material/cor, reverte a decisão
  de preço fixo da Fase 1) — ver detalhes na seção da própria fase, mais
  abaixo. Falta rodar a migração `0013_quiet_timeslip.sql` em produção.
- **Fase 2 completa** (diferenciação visual Resina/Plástico no preview 3D)
  — ver detalhes na seção da própria fase, mais abaixo.
- **Fase 1b completa** (recomendar material por categoria) — ver detalhes
  na seção da própria fase, mais abaixo.
- **Fase 1 completa** (hierarquia Material→Tipo→Cor + calculadora de preço)
  — ver detalhes na seção da própria fase, mais abaixo. Falta rodar as
  migrações `0009_tiny_zeigeist.sql` e `0010_known_tarantula.sql` em
  produção.
- **Tooltip de tamanho**: no configurador do produto, ao lado do label
  "Tamanho", um ícone de info explica que o valor escolhido é a maior
  dimensão da peça — as outras acompanham proporcionalmente. Componente
  `Tooltip` novo (`src/components/ui/tooltip.tsx`, `@base-ui/react/tooltip`,
  mesmo padrão dos outros componentes do design system) — não existia
  nenhum tooltip no projeto até agora.

---

## Fase 1 — Hierarquia de material (Material → Tipo → Cor) + calculadora de preço

**Status: ✅ feito** (schema + admin + loja + calculadora — falta só rodar a
migração em produção, ver abaixo).

`filament_options` (lista achatada de cores) virou uma hierarquia de 3
níveis: `materials` (Resina/Plástico, com `print_process` fdm/resin,
`allows_dual_color`, `post_processing_fee_cents`) → `material_types` (PLA,
ABS, Cristal... com `price_per_kg_cents`, `print_speed_value`,
`description`) → `material_colors` (nome + hex, dual-color só quando o
Material permite — reforçado no servidor, não só escondendo o campo na UI).
Admin novo em `/admin/materiais` (`MaterialManager`) navega os 3 níveis;
todo lugar que antes listava "materiais disponíveis" (upload de arquivo,
cadastro de produto) agora lista cores com rótulo "Material · Tipo · Cor".

**Calculadora de preço** (`estimateMaterialCost` em `print-estimate.ts`):
`custo = peso×preço/kg (material) + tempo_impressão×potência×preço_kWh
(energia) + taxa do Material (pós-processamento)`, tempo de impressão
calculado diferente por processo (FDM: peso/velocidade; Resina:
altura/velocidade, já que resina cura uma camada inteira de cada vez —
tempo depende da altura, não do peso). `preço_sugerido = custo × (1 +
margem%) + taxa_fixa_da_loja`. Config de energia/potência/margem nova em
`/admin/configuracoes`, substituindo o "preço por grama" genérico da rodada
22. Widget `PriceSuggestionCalculator` em `ProductPartsManager` deixa o
admin escolher qual Tipo usar como referência e aplicar o preço sugerido
com um clique (nunca automático).

**Decisão revertida na Fase 1c (ver seção abaixo)**: esta fase original
decidiu deliberadamente que `basePriceCents` seria um valor único, sem
recálculo ao vivo por cor — o usuário reportou isso como bug depois
("Estou selecionando diferentes materiais e o preço não está mudando") e
confirmou explicitamente que queria o recálculo ao vivo. A Fase 1c
implementa isso por cima do que já existe aqui (Tipo→preço/kg continua a
mesma fonte de dado, só passou a alimentar também o preço do cliente, não
só a calculadora do admin).

**Migração**: `drizzle/0009_tiny_zeigeist.sql` — cria as 3 tabelas novas +
enum, e reaponta as colunas que hoje referenciam `filament_options` pra
`material_colors` (**qualquer cor já atribuída a uma peça existente é
desatribuída** nesse processo — é esperado reatribuir na tela nova depois
de rodar). `filament_options` e o enum antigo (`filament_type`) ficam
órfãos no banco (não usados por nenhum código), seguro dropar numa limpeza
futura depois de confirmar que está tudo certo. Ainda **não rodada em
produção** — mesmo procedimento de sempre (rodar o SQL no editor do
Supabase ou `npm run db:migrate`).

---

## Fase 1c — Preço ao vivo por material/cor (reverte a Fase 1)

**Status: ✅ feito** (falta rodar a migração `0013_quiet_timeslip.sql` em
produção).

Reverte a decisão de "preço fixo" da Fase 1: o preço agora muda ao vivo no
configurador conforme o material/cor escolhido, pelo custo REAL de cada
peça (peso próprio × preço/kg + energia + pós-processamento), não um valor
opinativo por Tipo. Duas colunas novas: `product_parts.weight_grams` (peso
só daquela peça, medido do arquivo 3D dela) e
`materials.dual_color_fee_cents` (taxa fixa quando a cor escolhida é
dual-color).

**Modelo: delta sobre o material padrão, não custo absoluto** —
`basePriceCents` continua sendo o preço-âncora (o que o admin definiu
assumindo o material PADRÃO de cada peça); o preço ao vivo só diverge dele
pelo delta de custo real quando o cliente escolhe algo diferente do
padrão. Isso garante que a config padrão sempre resulta EXATAMENTE no
preço já cadastrado — zero risco de quebrar preço de produto existente.
Sem margem reaplicada sobre o delta (se o admin quiser margem embutida na
diferença de material, já pode inflar `pricePerKgCents` um pouco, mesma
alavanca da calculadora do admin).

**Simplificação documentada**: o tempo de impressão pro componente de
energia sempre usa peso/velocidade (mesmo pra resina, que fisicamente
escala com altura) — não existe altura por PEÇA no schema (só por produto
inteiro), e a calculadora do admin (`estimateMaterialCost`, inalterada)
continua com a fórmula mais precisa (altura/velocidade pra resina) porque
opera sobre o produto inteiro. Peça com regiões pintadas (.3mf MMU) divide
o peso igualmente entre as regiões (sem dado melhor disponível).

**Limitação real, sem solução automática**: peças cadastradas ANTES desta
migração ficam com `weight_grams: null` até o admin reenviar/reconfirmar o
mesmo arquivo 3D — sem isso, a peça não contribui com nenhum ajuste de
preço (cai pro preço-âncora, nunca quebra, só fica "sem a funcionalidade
extra" até ser reconfirmada).

**Fix lateral encontrado nesta rodada**: `applySuggestedWeight` (usado
desde a rodada 22) sobrescrevia `products.weightGrams` com o peso de UMA
peça só a cada upload — em produto multi-peça, reconfirmar uma peça
apagava a contribuição das outras. Corrigido: `confirmPartMesh` agora
recalcula o agregado do produto como a SOMA do peso de todas as peças que
já têm peso próprio.

---

## Fase 1b — Recomendar material por categoria

**Status: ✅ feito** (falta só rodar a migração `0010_known_tarantula.sql`
em produção junto com a `0009` da Fase 1).

No admin, ao editar uma categoria (`/admin/categorias`), uma seção nova
"Materiais recomendados" deixa marcar quais Tipos combinam com produtos
dessa categoria (ex.: "Decoração" → Resina Cristal + Plástico PLA). Na
tela de cadastro de produto (`NewProductForm`), escolher essa categoria
troca a seleção padrão de cor de todas as peças pra só as cores dos tipos
recomendados (com um toast avisando o porquê) — o admin ainda pode marcar
outras cores manualmente. Categoria sem recomendação configurada continua
caindo no "marca tudo" de sempre (rodada 26), sem regressão.

Tabela nova: `category_recommended_material_types` (`category_id` FK,
`material_type_id` FK, par único) — recomendação no nível de Tipo, não de
Cor específica (mais simples de configurar: "recomendo PLA pra essa
categoria", não "recomendo especificamente o PLA azul"). UI
mais natural em `/admin/categorias` (editar categoria → checklist de tipos
recomendados), já que é de lá que a decisão "que material combina com essa
categoria" faz mais sentido sair.

---

## Fase 2 — Diferenciação visual do material no preview 3D

**Status: ✅ feito**.

`buildPartMaterial()` em `product-viewer-3d.tsx` agora recebe o
`printProcess` da cor escolhida (`MaterialColor.printProcess`, Fase 1) e
escolhe o material do Three.js de acordo: **Resina** vira
`THREE.MeshPhysicalMaterial` com `clearcoat: 0.9`/`roughness: 0.2`
(acabamento liso e brilhante); **Plástico** (ou qualquer cor sem
`printProcess`, ex. placeholder) continua `THREE.MeshStandardMaterial` com
`roughness: 0.7` (fosco). `MeshPhysicalMaterial` estende o shader do
`MeshStandardMaterial`, então o patch de dual-color (gradiente entre duas
cores via `onBeforeCompile`) funciona sem duplicar código pros dois casos.
Aplicado no preview da loja (`ProductConfigurator`) e no preview do admin
(`ProductPartsManager`/`PartThumbnailCapture`) — regiões pintadas (.3mf
MMU) ficaram de fora de propósito (pintura MMU é um recurso específico de
fatiador FDM, não faz sentido prático numa peça de resina).

**Não implementado** (proposta original tinha isso como extra, não como
essencial): translucidez específica pro tipo "Cristal" via
`transmission`/`opacity` — a diferenciação Resina/Plástico já cobre o
pedido principal; translucidez por tipo específico pode virar um ajuste
fino depois se fizer falta.

**Testado**: comparei dois screenshots do mesmo cubo de teste (mesma cor
base) — um com material "Resina", outro "Plástico" — via Playwright. As
imagens são visivelmente diferentes (Resina mostra reflexos/brilho
nítidos do ambiente nas faces; Plástico fica completamente fosco/uniforme,
sem reflexo nenhum), confirmando que a diferenciação funciona de verdade,
não só no código.

---

## Fase 3 — Textos explicativos de material/tipo/cor

**Status: ✅ feito**. O campo `description` já existia em `material_types`
desde a Fase 1 (editável em `/admin/materiais` via `MaterialTypeForm`) mas
nunca era exibido em lugar nenhum — só faltava a loja mostrar.

`ProductConfigurator` ganhou `MaterialTypeDescription`: sempre que o cliente
tem uma cor selecionada (parte sem regiões ou região pintada ativa) e o Tipo
dessa cor tem uma `description` preenchida, aparece um texto curto logo
abaixo dos swatches — ex.: "Resina · Cristal: Translúcida, ótima pra
decoração — mais frágil que a Resistente." Sem descrição cadastrada pro
Tipo, não mostra nada (não força um texto genérico). Nenhuma mudança de
schema ou de admin foi necessária — só a exibição no configurador.

**Testado**: página mockada com duas cores (PLA sem `description`, Resina
Cristal com `description`) confirmou via Playwright que a cor padrão (PLA)
não mostra nenhum texto, e clicar na cor com Resina Cristal faz aparecer o
texto exato cadastrado — sem erro de console.

---

## Fase 4 — Pedido de modelo customizado via IA (imagem → 3D)

**Status: ✅ feito** (decisões confirmadas: Meshy como provedor, 1 geração
grátis por cliente/dia, taxa de modelagem customizada com valor fixo — ver
implementação mais abaixo, depois da pesquisa original).

Pesquisei as opções reais disponíveis hoje (2026): existem várias APIs
comerciais de imagem-pra-3D que já exportam direto em STL pronto pra
fatiar — não é mais ficção científica, mas também não é mágica perfeita.

- **Meshy** — API REST, aceita JPG/PNG, devolve GLB/FBX/OBJ/USDZ/STL/3MF.
  Marca mais estabelecida do grupo, boa documentação. **Você já testou e
  aprovou a qualidade.**
- **Tripo 3D** — mesma categoria. **Você já testou e aprovou a qualidade
  também.**
- **Neural4D** — não testado por você ainda, mas alega STL "watertight"
  (sem furos) e "estruturalmente espessado" **pronto pra fatiar sem reparo
  manual** — vale considerar como terceira opção se Meshy/Tripo derem
  algum problema recorrente de malha.
- **3D AI Studio**, **Hyper3D** — alternativas parecidas, não testadas.

### Como funciona o custo (a pergunta real desta rodada)

Os dois provedores que você testou usam **crédito por geração**, não
"grátis pra sempre":

- **Meshy**: plano Free dá 100 créditos/mês (sem cartão), e uma geração
  completa (malha + textura) custa ~20 créditos — dá pra gerar ~5
  modelos/mês de graça, com **download incluído** (mas limitado por mês, só
  no motor mais recente, licença CC BY 4.0 que permite uso comercial com
  atribuição). O plano Pro (US$20/mês, ~R$110) dá 1.000 créditos/mês
  (~50 gerações), download ilimitado e direitos comerciais completos sem
  atribuição.
- **Tripo3D**: a API é **pré-paga** — tem um trial de 300 créditos por 2
  semanas pra testar, mas depois disso não existe um "plano grátis"
  contínuo pra uso via API (o app web Tripo Studio tem plano free, mas é um
  produto/cobrança separada da API). Uma geração custa ~20-30+ créditos
  dependendo da qualidade pedida.

**Ou seja**: não dá pra oferecer geração ilimitada de graça pro cliente —
cada geração custa dinheiro de verdade (seu, via crédito comprado), mesmo
que pareça "grátis" na hora H. Isso confirma que **o modelo que você
propôs é o caminho certo**: gerar o preview é um custo de vendas que você
assume (como uma amostra), e só quando o cliente confirma o pedido é que
esse custo (fixo ou por token) entra na conta final — igual uma taxa de
"modelagem customizada" soma no preço do produto.

### Fluxo proposto (revisado com a confirmação de qualidade)

1. Formulário novo na loja: "Peça um modelo customizado" — cliente loga
   (contas de cliente já existem desde a rodada 16, isso ajuda a evitar
   abuso) e sobe 1+ fotos + descrição.
2. Servidor chama a API (Meshy ou Tripo) automaticamente e mostra um
   **preview** do modelo gerado pro cliente — sem cobrar nada ainda.
3. Se o cliente gostar e confirmar, o preço final do pedido já inclui uma
   **taxa de modelagem customizada** (fixa, ou calculada a partir do custo
   real do crédito gasto) — aí sim vira uma venda de verdade.
4. Se o cliente não gostar/desistir, você perde só o crédito daquela
   geração (custo pequeno e previsível, tipo uma amostra grátis) — melhor
   que gerar tudo manualmente sem saber se vai vender.
5. **Guardrail contra abuso**: limitar quantas gerações grátis por
   cliente/dia (ex.: 1-2), já que cada uma tem custo real — sem isso,
   alguém poderia gerar dezenas de modelos só de curiosidade e estourar o
   crédito do mês.

**Decisões que preciso de você**: Meshy ou Tripo como provedor principal
pra começar (dá pra trocar depois, a integração fica isolada num arquivo
só, mesmo padrão já usado pra Woovi/Superfrete), se topa o limite de
gerações grátis por cliente, e se a "taxa de modelagem customizada" é um
valor fixo (mais simples) ou calculada a partir do crédito real gasto
(mais preciso, mas exige guardar quanto cada chamada custou).

Sources:
- [How to Use Image to 3D Model API: A Complete Guide 2026](https://www.meshy.ai/tutorials/api-quickstart-image-to-3d)
- [Free Image to 3D Model 2026 — Photo to 3D in a Minute | Meshy](https://www.meshy.ai/features/image-to-3d)
- [Meshy Official Pricing: Free, Pro, Studio & Enterprise Plans](https://www.meshy.ai/pricing)
- [Tripo AI vs. Other AI 3D Model Generators 2026](https://www.tripo3d.ai/tutorials/tripo-ai-vs-other-ai-3d-generators)
- [Pricing | Tripo OpenAPI docs](https://docs.tripo3d.ai/get-started/pricing.html)
- [3D AI Studio API - Developer Platform for 3D Model Generation](https://www.3daistudio.com/Platform)
- [AI 3D Model Generation API - Text to 3D and Image to 3D | Hyper3D](https://hyper3d.ai/features/api)
- [Neural4D API - Best Text-to-3D & Image-to-3D API for Developers](https://www.neural4d.com/api)

### Implementado

Fluxo completo de ponta a ponta: `/conta/modelo-3d` (formulário — descrição
+ 1 a 4 fotos, mesmo padrão de dropzone+upload direto pro Supabase Storage
já usado no admin) → `submitCustomModelRequest` chama a Meshy
(`multi-image-to-3d`, sempre pedindo `target_formats: ["stl"]` — o mesmo
formato que o projeto já sabe carregar/medir, zero código de viewer novo)
→ `/conta/modelo-3d/[id]` faz polling (a cada 4s) enquanto gera, e quando
pronto baixa o STL + thumbnail da Meshy e re-hospeda nos buckets já
existentes (`models`/`product-media` — as URLs da Meshy expiram) →
`measureMeshFromBuffer` (extraído de `measureMesh`, mesma lógica de
volume/peso já usada no admin, agora reaproveitável no servidor) mede o
arquivo de verdade, nunca confiando em nenhum valor vindo do cliente →
cliente escolhe material/cor (mesmo catálogo Material→Tipo→Cor da Fase 1,
reaproveitando `ColorSwatches`/`MaterialTypeDescription` do configurador) e
vê o preço ao vivo (`estimateMaterialCost` + a taxa fixa de modelagem
customizada nova) → ao confirmar, um produto oculto (`status: "draft"`,
100% invisível no catálogo público) é criado com as MESMAS server actions
que o admin usa pra cadastrar produto, e o pedido é criado direto — aparece
normalmente em `/admin/pedidos`, `/pedido/[token]`, recebe Pix da Woovi e
e-mail de confirmação sem nenhuma mudança no código de pedidos existente.
Guardrail de 1 geração grátis por cliente por dia (primeiro rate-limit do
projeto). Admin ganhou um link "Ver produto" em cada item de
`/admin/pedidos/[id]`, dando acesso ao preview 3D + arquivo STL pra
imprimir qualquer pedido (customizado ou não) sem nenhuma tela nova.

Ver a rodada correspondente no `CLAUDE.md` pra detalhes completos de
arquitetura, arquivos alterados e o que foi (e não pôde ser) testado nesta
sessão.

### Fase 4b — Enviar STL próprio pra orçamento (sem IA)

**Status: ✅ feito** (falta rodar a migração `0014_omniscient_sister_grimm.sql`
em produção).

Extensão direta da Fase 4 pra quem já TEM o próprio arquivo 3D e só quer um
orçamento — mesma tela `/conta/modelo-3d`, com um toggle no topo ("Já tenho
o arquivo 3D" vs "Quero que a IA gere um modelo"). Cliente sobe o
STL/OBJ/3MF direto (mesmo bucket `models` já usado pro catálogo), o
servidor mede o arquivo de verdade e a request nasce já em `status:
"ready"` — pula `pending`/`generating`/Meshy inteiramente. Todo o resto
(viewer 3D, seletor de material, preço ao vivo, formulário de entrega,
confirmação que cria produto oculto + pedido) é o MESMO código da Fase 4,
sem nenhuma mudança — só precisa que a linha em `custom_model_requests` já
esteja em "ready" com peso/dimensões preenchidos.

Coluna nova `custom_model_requests.origin` (`"ai" | "upload"`, default
`"ai"`) diferencia os dois casos em dois pontos que precisavam mesmo:
**não cobra** a taxa de "modelagem customizada" (`customModelFeeCents`) de
quem já mandou o arquivo — essa taxa cobre o crédito de IA gasto, que não
existe aqui — e o guardrail de 1 geração/dia passou a contar só `origin =
"ai"` (upload direto não gasta crédito nenhum, não devia ser bloqueado por
esse limite nem contar pra ele).

Ver a rodada correspondente no `CLAUDE.md` pra detalhes completos.

---

## Fase 5 — Modelo 3D animado na home

**Status: 🔜 UI pronta, aguardando os arquivos finais de verdade.** Formato
confirmado: **GLB** (glTF binário), não FBX — arquivo bem menor, PBR
nativo, `@react-three/drei` (`useGLTF`+`useAnimations`) já cobre o caso de
uso sem dependência nova. Se só sobrar um FBX, converte no Blender
(importar → exportar como glTF Binary, marcando "Include Animations").

**Decisão de design revisada**: o usuário pediu explicitamente pra tirar
qualquer legenda/explicação dos modelos — "não era pra falar nada, só
deixa o modelo lá rodando", puramente decorativo. `AnimatedModelViewer`
(`src/components/animated-model-viewer.tsx`) perdeu a prop `label` visível
e o placeholder de erro/carregamento virou um espaço em branco discreto
(sem ícone nem texto) em vez de "Em breve". A seção educativa "Como
imprimimos" (que explicava FDM vs resina) foi removida — os dois modelos
viraram só flourish visual em dois lugares novos:
- Um gira ao lado do texto do **hero** (banner principal).
- O outro ilustra a nova seção **"Imprima algo customizado"** — bloco
  novo, com badge "Novidade", texto curto e botão linkando pra
  `/conta/modelo-3d` (a Fase 4), dando destaque de verdade pra esse
  recurso na home, que antes só existia dentro de `/conta`.

**Arquivos atuais**: o usuário forneceu 2 arquivos de teste pra validar o
pipeline (`public/animatedfile1/model.glb` = um jipe, `animatedfile2/
model.glb` = um cubo mágico) — **não são impressoras de verdade**, só
placeholders com animação real pra confirmar que tudo funciona. Trocar
pelos modelos definitivos de impressora é só substituir esses dois
arquivos (mesmo nome, mesmo caminho) — nenhuma mudança de código.

**Testado**: Playwright confirmou visualmente (desktop e mobile) que os
dois modelos giram nos lugares certos, sem nenhuma legenda/texto
"Impressora"/"Em breve" vazando na página, com zero erros de console.
Também confirmado (rodada anterior) o caminho de carregamento de verdade
com um GLB real (bug de `Suspense` fora do `<Canvas>` já corrigido — ver
CLAUDE.md).

**Ainda pendente**: os 2 modelos reais de impressora (FDM + resina/SLA)
animados, exportados em `.glb`.

---

## Como usar este documento

Quando você quiser avançar uma fase, só falar "vamos pra Fase X" (ou
descrever o próximo passo) que eu continuo dali — não preciso reler o
roadmap inteiro toda vez, mas ele fica aqui como registro de onde paramos e
por quê. Fases marcadas "⏸ aguardando decisão" têm perguntas específicas
que preciso que você responda antes de eu começar a escrever código — não é
enrolação, é porque errar o schema/fórmula de preço é caro de desfazer
depois (dado real de cliente em cima).
