# Roadmap — 3D Teu

Documento de trabalho pra acompanhar os pedidos grandes do usuário, divididos
em fases. Cada fase tem status, escopo, decisões em aberto (quando existem) e
o que já foi feito. Atualizar este arquivo a cada rodada que avançar algo
aqui — igual o `CLAUDE.md`, mas focado no que falta fazer, não no histórico
do que já foi feito.

**Convenção de status**: `✅ feito` / `🔜 próximo` / `⏸ aguardando decisão` /
`💤 não iniciado`.

---

## ✅ Feito nesta rodada

- **Tooltip de tamanho**: no configurador do produto, ao lado do label
  "Tamanho", um ícone de info explica que o valor escolhido é a maior
  dimensão da peça — as outras acompanham proporcionalmente. Componente
  `Tooltip` novo (`src/components/ui/tooltip.tsx`, `@base-ui/react/tooltip`,
  mesmo padrão dos outros componentes do design system) — não existia
  nenhum tooltip no projeto até agora.

---

## Fase 1 — Hierarquia de material (Material → Tipo → Cor) + calculadora de preço

**Status: ⏸ aguardando decisão** — é a mudança mais estrutural do roadmap
(schema novo, recalcula preço, mexe em quase todo componente de admin e loja
que hoje fala de "filamento"/"cor"). Melhor confirmar o desenho antes de
implementar do que refazer depois.

### O que muda

Hoje `filament_options` é uma lista achatada (cada linha = uma cor, com um
`type` que na verdade só distingue cor-única/dual-color/especial — não tem
noção de material físico nenhuma). Vira uma hierarquia de 3 níveis:

```
Material (Resina | Plástico)
  └─ Tipo (Plástico: ABS, PLA, Emborrachado — Resina: Cristal, Opaca, Resistente, Dental, Emborrachada)
       └─ Cor (nome + hex, dual-color só permitido se o Material permitir)
```

- **Dual-color só em Plástico** — Resina nunca tem 2ª cor (regra do
  negócio, não é uma limitação técnica). Vai ser reforçado no servidor
  (nunca confiar só na UI escondendo o campo) — mesmo tipo de bug já
  corrigido antes num contexto parecido: um form que não valida no back
  deixa passar um dado que a regra de negócio não permite.
- **Preço por kg é cadastrado no Tipo**, não na Cor — todas as cores de um
  mesmo Tipo custam o mesmo por grama.
- **Resina tem um custo de pós-processamento maior** (lavagem, cura,
  remoção de suporte — trabalho manual, não escala com o peso do jeito que
  o custo de material escala). Modelado como uma taxa fixa por peça,
  configurável por Material (não por Tipo — é uma característica do
  processo de resina como um todo, não de uma cor específica).

### Schema proposto (aditivo, migração nova)

```
materials            (id, name, allows_dual_color bool, post_processing_fee_cents int, created_at)
material_types       (id, material_id FK, name, price_per_kg_cents int,
                       print_speed_value numeric,  -- unidade depende do material (ver cálculo de preço)
                       description text,           -- pro texto explicativo da Fase 3
                       created_at)
material_colors      (id, material_type_id FK, name, hex_color, hex_color_secondary nullable,
                       swatch_image_url, created_at)
```

`filament_options` (tabela atual) fica **sem uso, não é apagada** — pedidos
antigos guardam a configuração vendida como snapshot JSON em
`order_items.configuration`, então não dependem da tabela viva pra manter o
histórico correto. As referências ao vivo que hoje apontam pra
`filament_options` (`product_parts.default_filament_option_id`,
`product_part_regions.default_filament_option_id`,
`product_part_material_options.filament_option_id`) passam a apontar pra
`material_colors` — **isso significa reatribuir manualmente as cores de cada
peça já cadastrada** depois da migração, não tem como preservar
automaticamente (o mapeamento antigo não carrega informação de qual
Material/Tipo cada cor pertencia). Preciso confirmar: **quantos produtos
reais você já tem cadastrados hoje?** Se forem poucos, refazer na mão no
admin novo é rápido; se forem muitos, vale eu escrever um script de migração
de dados assumindo um mapeamento (ex.: tudo que existe hoje vira "Plástico
→ PLA" por padrão, e você ajusta manualmente as exceções).

### Cálculo de preço proposto

Curto: **custo total = material + energia + pós-processamento**, preço
final = custo total com margem de lucro em cima, mais a taxa fixa que já
existe hoje.

```
peso_g = peso estimado da peça (já existe, vem do arquivo 3D — rodada 22)
custo_material = peso_g * (price_per_kg_cents do Tipo / 1000)

tempo_impressão_h = depende do material:
  - Plástico: peso_g / velocidade_g_por_hora (cadastrada no Tipo)
  - Resina: altura_mm / velocidade_mm_por_hora (cadastrada no Tipo — resina
    imprime camada inteira de uma vez, então o tempo depende da ALTURA da
    peça, não do peso/volume, diferente de FDM)
custo_energia = tempo_impressão_h * potência_impressora_kw * preço_kwh
  (potência e preço do kWh são configurações da loja, não por produto)

custo_pos_processamento = taxa fixa do Material (0 pra a maioria dos
  Plásticos, um valor real pra Resina)

custo_total = custo_material + custo_energia + custo_pos_processamento
preço_sugerido = custo_total * (1 + margem_de_lucro%) + taxa_fixa_da_loja
```

**Decisões que preciso de você antes de implementar isso**:
1. Confirma o formato "R$/kg por Tipo" mesmo (não por Material, não por Cor)?
2. Pra estimar tempo de impressão, a ideia é você cadastrar uma "velocidade"
   por Tipo (ex.: "PLA imprime a ~20g/h nas minhas impressoras", "Resina
   Cristal sobe ~15mm/h") — você tem uma noção real desses números, ou
   prefiro sugerir um valor padrão de mercado pra você ajustar depois?
3. Potência da impressora (kW) e preço do kWh — configuração única da loja
   (`/admin/configuracoes`) ou você tem impressoras/processos bem diferentes
   que precisariam de valores por Tipo também?
4. Margem de lucro: um percentual único da loja, ou também por Material
   (ex.: margem maior em Resina por ser mais trabalhosa)?
5. As configurações antigas de sugestão de preço (`price_per_gram_cents`/
   `fixed_fee_cents`, rodada 22) ficam obsoletas com isso — tudo bem
   substituir por esse cálculo novo, ou você quer manter as duas coisas
   coexistindo (ex.: essa fórmula nova só pra quem cadastrar
   material/tipo/cor, a antiga como fallback)?

### Impacto no código (pra dimensionar o tamanho do trabalho, não é a lista final)

- `src/server/db/schema.ts` + migração nova (tabelas acima)
- `src/features/catalog/pricing.ts` (+ `pricing.test.ts`) — cálculo novo
- `/admin/materiais` — vira um CRUD de 3 níveis (hoje é uma lista só)
- `src/features/catalog/components/product-parts-manager.tsx`,
  `part-regions-panel.tsx`, `new-product-form.tsx`, `mesh-upload-form.tsx` —
  todo lugar que hoje lista "materiais disponíveis" passa a navegar
  Material → Tipo → Cor
- `src/features/catalog/components/product-configurator.tsx` (loja: cliente
  escolhe cor, mas pode precisar mostrar o Tipo também — ver Fase 3)
- `src/features/catalog/components/product-viewer-3d.tsx` — a differenciação
  visual da Fase 2 pluga aqui

---

## Fase 2 — Diferenciação visual do material no preview 3D

**Status: 💤 não iniciado, depende da Fase 1** (precisa saber se a peça é
Resina ou Plástico pra escolher o material do Three.js — essa informação só
existe depois da hierarquia nova).

Ideia técnica (viável, sem biblioteca nova): `buildPartMaterial()` em
`product-viewer-3d.tsx` hoje sempre cria um `THREE.MeshStandardMaterial`
opaco fosco. Dá pra variar por família de material:

- **Resina**: `THREE.MeshPhysicalMaterial` com `clearcoat` alto (~0.9) e
  `roughness` baixa (~0.15-0.25) — simula o acabamento brilhante/liso típico
  de impressão em resina. Pro tipo "Cristal" especificamente, dá pra ligar
  `transmission`/`opacity` reduzida pra sugerir translucidez.
- **Plástico**: `MeshStandardMaterial` com `roughness` mais alta (~0.6-0.8) —
  acabamento fosco, mais parecido com FDM de verdade (que tem as camadas
  visíveis, ainda que não simuladas aqui).

`MeshPhysicalMaterial` já é parte do `three` (dependência existente, não
precisa instalar nada) — só é mais pesado pra renderizar que
`MeshStandardMaterial`, mas em objetos pequenos como esses (uma peça por
vez) não deve ser perceptível.

---

## Fase 3 — Textos explicativos de material/tipo/cor

**Status: 💤 não iniciado, depende da Fase 1** (o campo `description` já
está no schema proposto de `material_types` acima — só falta o admin
preencher e a loja exibir).

Ideia de UI: no configurador, ao lado do nome do Tipo selecionado, um texto
curto (tipo o tooltip da Fase 0) explicando pra que serve — ex.: "Resina
Cristal: translúcida, ótima pra decoração; mais frágil que a Resistente."
O texto vem do campo `description` do Tipo (editável no admin), não
hardcoded — você escreve o texto de cada tipo como quiser, o código só
exibe.

---

## Fase 4 — Pedido de modelo customizado via IA (imagem → 3D)

**Status: ⏸ aguardando decisão** (depende de escolher um provedor pago e
definir o fluxo — não dá pra simplesmente "implementar", é uma decisão de
produto + custo).

Pesquisei as opções reais disponíveis hoje (2026): existem várias APIs
comerciais de imagem-pra-3D que já exportam direto em STL pronto pra
fatiar — não é mais ficção científica, mas também não é mágica perfeita.

- **Meshy** — API REST, aceita JPG/PNG, devolve GLB/FBX/OBJ/USDZ/STL/3MF.
  Marca mais estabelecida do grupo, boa documentação.
- **Neural4D** — a que mais chamou atenção pro seu caso específico: alega
  STL "watertight" (sem furos) e "estruturalmente espessado" **pronto pra
  fatiar sem reparo manual** — é literalmente o problema mais comum de
  malha gerada por IA (furos, paredes finas demais pra imprimir).
- **Tripo 3D**, **3D AI Studio**, **Hyper3D** — alternativas parecidas,
  todas com export STL.

[How to Use Image to 3D Model API: A Complete Guide 2026](https://www.meshy.ai/tutorials/api-quickstart-image-to-3d) ·
[Neural4D API](https://www.neural4d.com/api) ·
[Tripo 3D](https://www.tripo3d.ai/) ·
[Hyper3D API](https://hyper3d.ai/features/api) ·
[3D AI Studio Platform](https://www.3daistudio.com/Platform)

**Minha recomendação**: não automatizar de ponta a ponta na v1. Modelo 3D
gerado por IA a partir de foto de cliente tende a vir com qualidade
inconsistente (depende muito da foto, do ângulo, da complexidade do
objeto) — imprimir direto sem revisão é arriscado (desperdiça filamento,
gera reclamação). Proposta de fluxo v1:

1. Formulário novo na loja: "Peça um modelo customizado" — cliente sobe
   1+ fotos e descreve o que quer, sem preço/checkout ainda (vira um pedido
   de orçamento, não uma compra direta).
2. Você (admin) recebe o pedido, chama a API de imagem-pra-3D manualmente
   (ou automatizado só pra gerar um preview, mas sempre revisado antes de
   confirmar orçamento) — dá pra rodar a chamada de API do lado do servidor
   mesmo sem UI nenhuma pro cliente ver o resultado bruto.
3. Depois de validar a malha (abre no fatiador, confere se imprime de
   verdade), você aprova e manda um orçamento real pro cliente.
4. Só depois de rodar esse fluxo manual algumas vezes — e você decidir que
   a taxa de sucesso compensa — automatizar mais (gerar preview pro
   cliente ver antes de confirmar, por exemplo).

**Decisões que preciso de você**: qual provedor topa testar primeiro
(a maioria tem créditos grátis/trial — dá pra validar qualidade antes de
comprometer com um plano pago), e se concorda com o fluxo "pedido de
orçamento revisado por você" em vez de checkout automático na v1.

Sources:
- [How to Use Image to 3D Model API: A Complete Guide 2026](https://www.meshy.ai/tutorials/api-quickstart-image-to-3d)
- [Free Image to 3D Model 2026 — Photo to 3D in a Minute | Meshy](https://www.meshy.ai/features/image-to-3d)
- [3D AI Studio API - Developer Platform for 3D Model Generation](https://www.3daistudio.com/Platform)
- [AI 3D Model Generation API - Text to 3D and Image to 3D | Hyper3D](https://hyper3d.ai/features/api)
- [AI 3D Model Generator from Text & Images | Tripo 3D](https://www.tripo3d.ai/)
- [Neural4D API - Best Text-to-3D & Image-to-3D API for Developers](https://www.neural4d.com/api)

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
