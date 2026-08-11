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

**Decisão importante que NÃO segue o pedido original ao pé da letra**: o
preço do produto (`basePriceCents`) continua sendo um valor único, fixo,
que o admin define (com a ajuda da calculadora) — a cor que o cliente
escolhe no configurador da loja **não recalcula o preço ao vivo**. Antes
cada cor tinha um "adicional" manual; agora esse conceito foi removido
(preço vive no Tipo, não na Cor) e não foi substituído por um recálculo ao
vivo, porque isso exigiria rastrear o peso de CADA peça individualmente
(hoje só existe o peso agregado do produto todo) — escopo bem maior que o
pedido original, que era uma calculadora pra ajudar a PRECIFICAR, não um
motor de preço dinâmico por cliente. Se isso for importante (ex.: cliente
pode escolher entre um PLA barato e uma Resina cara pra mesma peça, hoje
pagando o mesmo preço pelos dois), me avisa que vira uma sub-fase nova.

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

---

## Fase 5 — Modelo 3D animado na home

**Status: 💤 aguardando o arquivo** — tecnicamente já dá pra responder a
pergunta "seria FBX?": **não, use GLB** (glTF binário). É o formato padrão
de fato pra 3D em tempo real na web — arquivo bem menor que FBX, PBR
nativo, e o projeto já usa `@react-three/drei`, cujo `useGLTF` +
`useAnimations` foi feito exatamente pra isso (carrega o modelo E toca as
animações embutidas nele, com Suspense/cache de graça). Não precisa
instalar nenhuma dependência nova.

Se o arquivo que você tem é FBX: o caminho mais simples é abrir no Blender
(gratuito) → importar o FBX → exportar como glTF Binary (.glb), marcando
"Include Animations" — preserva a animação. Se o arquivo já vier de um
fatiador/scanner sem animação nenhuma (só a peça parada), a "animação de
impressora imprimindo" provavelmente precisa ser feita à parte (Blender de
novo, ou keyframes direto no react-three-fiber caso seja algo simples tipo
girar/aparecer progressivamente).

**Quando o arquivo chegar**, preciso saber:
- Tem animação embutida de verdade (keyframes no próprio arquivo), ou é só
  a geometria estática e a "animação de imprimir" é uma ideia ainda a
  desenhar?
- Tamanho do arquivo — se for pesado (muitos MB), vale rodar por uma
  ferramenta de compressão (`gltf-transform`, Draco/Meshopt) antes de subir
  pro site, pra não pesar o carregamento da home.

---

## Como usar este documento

Quando você quiser avançar uma fase, só falar "vamos pra Fase X" (ou
descrever o próximo passo) que eu continuo dali — não preciso reler o
roadmap inteiro toda vez, mas ele fica aqui como registro de onde paramos e
por quê. Fases marcadas "⏸ aguardando decisão" têm perguntas específicas
que preciso que você responda antes de eu começar a escrever código — não é
enrolação, é porque errar o schema/fórmula de preço é caro de desfazer
depois (dado real de cliente em cima).
