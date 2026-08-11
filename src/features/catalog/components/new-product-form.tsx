"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPriceCents } from "@/lib/format";
import { slugify } from "@/lib/slugify";
import { createClient } from "@/lib/supabase/client";
import {
  getMeshExtension,
  MAX_MESH_FILE_SIZE_BYTES,
  MESH_CONTENT_TYPE_BY_EXTENSION,
  MODELS_BUCKET,
} from "@/lib/supabase/storage-constants";

import {
  applySuggestedDimensions,
  applySuggestedWeight,
  autoGenerateSizeOptions,
  confirmPartMesh,
  createMeshUploadUrl,
  createProductDraft,
  createProductPart,
  setPartMaterials,
} from "../actions";
import { measureMesh, type MeshMeasurements } from "../mesh-measure";
import { detectPaintedStates } from "../mmu-3mf";
import { estimatePrintWeight } from "../print-estimate";
import { productFormSchema } from "../schemas";

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface MaterialOption {
  id: string;
  name: string;
  hexColor: string | null;
  hexColorSecondary: string | null;
}

interface PricingSettings {
  pricePerGramCents: number | null;
  fixedFeeCents: number | null;
}

interface PartDraft {
  key: string;
  name: string;
  file: File | null;
  fileError: string | null;
  measurements: MeshMeasurements | null;
  detectedStates: number[] | null;
  isReadingFile: boolean;
  selectedMaterialIds: Set<string>;
  defaultMaterialId: string | null;
}

function makePartDraft(key: string, name: string, allMaterialIds: string[]): PartDraft {
  return {
    key,
    name,
    file: null,
    fileError: null,
    measurements: null,
    detectedStates: null,
    isReadingFile: false,
    selectedMaterialIds: new Set(allMaterialIds),
    defaultMaterialId: allMaterialIds[0] ?? null,
  };
}

export function NewProductForm({
  categories,
  allMaterials,
  pricingSettings,
}: {
  categories: Array<{ id: string; name: string }>;
  allMaterials: MaterialOption[];
  pricingSettings: PricingSettings;
}) {
  const router = useRouter();
  const allMaterialIds = allMaterials.map((m) => m.id);

  // Contador simples em vez de crypto.randomUUID(): um id aleatório gerado
  // de novo na hidratação do cliente não bate com o que o servidor gerou —
  // descoberto rodando de verdade (React acusa "hydration mismatch" no
  // atributo `name` do rádio de material padrão), não só por inspeção do
  // código. Só é lido/incrementado dentro de `addPart` (um handler de
  // clique) — nunca durante o render, que é onde o estado inicial de
  // `parts` abaixo precisa de uma key literal e determinística.
  const nextPartKeyRef = useRef(1);
  function nextPartKey(): string {
    return `part-${nextPartKeyRef.current++}`;
  }

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [basePriceReais, setBasePriceReais] = useState(0);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [parts, setParts] = useState<PartDraft[]>(() => [makePartDraft("part-0", "corpo", allMaterialIds)]);

  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();

  // Soma o peso de todas as peças com arquivo (todas imprimem juntas), e usa
  // a MAIOR medida de cada eixo entre elas como aproximação da caixa —
  // simplificado (não empacota de verdade), mas já rotulado como estimativa
  // em toda a UI, então é uma aproximação razoável pra um produto multi-peça.
  const partsWithMeasurements = parts.filter((p) => p.measurements);
  const aggregatePhysicalProps =
    partsWithMeasurements.length > 0
      ? partsWithMeasurements.reduce(
          (acc, part) => {
            const measurements = part.measurements!;
            const weight = estimatePrintWeight(measurements.volumeMm3, measurements.surfaceAreaMm2).weightGrams;
            return {
              weightGrams: acc.weightGrams + weight,
              heightCm: Math.max(acc.heightCm, Math.ceil(measurements.heightMm / 10)),
              widthCm: Math.max(acc.widthCm, Math.ceil(measurements.widthMm / 10)),
              lengthCm: Math.max(acc.lengthCm, Math.ceil(measurements.depthMm / 10)),
            };
          },
          { weightGrams: 0, heightCm: 1, widthCm: 1, lengthCm: 1 },
        )
      : null;
  const suggestedPriceCents =
    aggregatePhysicalProps && pricingSettings.pricePerGramCents
      ? Math.round(aggregatePhysicalProps.weightGrams * pricingSettings.pricePerGramCents + (pricingSettings.fixedFeeCents ?? 0))
      : null;

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function updatePart(key: string, patch: Partial<PartDraft>) {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addPart() {
    setParts((prev) => [...prev, makePartDraft(nextPartKey(), `peça ${prev.length + 1}`, allMaterialIds)]);
  }

  function removePart(key: string) {
    setParts((prev) => (prev.length > 1 ? prev.filter((p) => p.key !== key) : prev));
  }

  function toggleMaterial(partKey: string, materialId: string) {
    setParts((prev) =>
      prev.map((p) => {
        if (p.key !== partKey) return p;
        const next = new Set(p.selectedMaterialIds);
        if (next.has(materialId)) next.delete(materialId);
        else next.add(materialId);
        const defaultMaterialId = next.has(p.defaultMaterialId ?? "") ? p.defaultMaterialId : (Array.from(next)[0] ?? null);
        return { ...p, selectedMaterialIds: next, defaultMaterialId };
      }),
    );
  }

  function handlePartFileChange(partKey: string, selected: File | null) {
    if (!selected) {
      updatePart(partKey, { file: null, fileError: null, measurements: null, detectedStates: null });
      return;
    }

    const extension = getMeshExtension(selected.name);
    if (!extension) {
      updatePart(partKey, { file: null, fileError: "Formato não suportado. Use .stl, .obj ou .3mf." });
      return;
    }
    if (selected.size > MAX_MESH_FILE_SIZE_BYTES) {
      updatePart(partKey, {
        file: null,
        fileError: `Esse arquivo tem ${formatMegabytes(selected.size)}, e o máximo é ${formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}.`,
      });
      return;
    }

    updatePart(partKey, { file: selected, fileError: null, isReadingFile: true, measurements: null, detectedStates: null });
    measureMesh(selected, extension).then((measurements) => updatePart(partKey, { measurements, isReadingFile: false }));
    if (extension === "3mf") {
      detectPaintedStates(selected)
        .then((states) => updatePart(partKey, { detectedStates: states }))
        .catch(() => updatePart(partKey, { detectedStates: null }));
    }
  }

  function applySuggestedPriceToForm() {
    if (!suggestedPriceCents) return;
    setBasePriceReais(suggestedPriceCents / 100);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (parts.length === 0) {
      setError("Adicione pelo menos uma peça.");
      return;
    }
    const partWithoutColor = parts.find((p) => p.selectedMaterialIds.size === 0);
    if (partWithoutColor) {
      setError(`A peça "${partWithoutColor.name}" precisa de pelo menos uma cor marcada.`);
      return;
    }

    const values = {
      name,
      slug,
      description,
      categoryId,
      basePriceReais,
      status,
      metaTitle,
      metaDescription,
    };
    const parsed = productFormSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    startSubmitTransition(async () => {
      setProgressLabel("Criando produto...");
      const created = await createProductDraft(parsed.data);
      if (created.error || !created.productId) {
        setError(created.error ?? "Não foi possível criar o produto.");
        setProgressLabel(null);
        return;
      }
      const productId = created.productId;

      for (const [index, part] of parts.entries()) {
        setProgressLabel(`Configurando peça ${index + 1} de ${parts.length} ("${part.name}")...`);

        const partResult = await createProductPart(productId, part.name);
        if (partResult.error || !partResult.id) {
          toast.error(
            `Produto criado, mas não foi possível criar a peça "${part.name}": ${partResult.error ?? "erro desconhecido"}. Continue configurando em /admin/produtos/${productId}.`,
          );
          router.push(`/admin/produtos/${productId}`);
          return;
        }
        const partId = partResult.id;

        if (part.file) {
          const extension = getMeshExtension(part.file.name);
          if (extension) {
            const prepared = await createMeshUploadUrl(partId, extension);
            if (prepared.error || !prepared.path || !prepared.token) {
              toast.error(
                `Produto criado, mas o arquivo da peça "${part.name}" não foi enviado: ${prepared.error ?? "erro desconhecido"}. Continue em /admin/produtos/${productId}.`,
              );
            } else {
              const supabase = createClient();
              const { error: uploadError } = await supabase.storage
                .from(MODELS_BUCKET)
                .uploadToSignedUrl(prepared.path, prepared.token, part.file, {
                  contentType: MESH_CONTENT_TYPE_BY_EXTENSION[extension],
                });
              if (uploadError) {
                toast.error(`Produto criado, mas o arquivo da peça "${part.name}" falhou ao enviar: ${uploadError.message}.`);
              } else {
                const confirmed = await confirmPartMesh(productId, partId, prepared.path, part.detectedStates ?? undefined);
                if (confirmed.error) toast.error(`Arquivo da peça "${part.name}" enviado, mas não confirmado: ${confirmed.error}`);
              }
            }
          }
        }

        const formData = new FormData();
        part.selectedMaterialIds.forEach((id) => formData.append("filamentOptionId", id));
        if (part.defaultMaterialId) formData.set("defaultFilamentOptionId", part.defaultMaterialId);
        await setPartMaterials(productId, partId, formData);
      }

      if (aggregatePhysicalProps) {
        setProgressLabel("Aplicando peso e dimensões estimados...");
        await Promise.all([
          applySuggestedWeight(productId, aggregatePhysicalProps.weightGrams),
          applySuggestedDimensions(productId, aggregatePhysicalProps),
        ]);

        const firstMeasuredPart = parts.find((p) => p.measurements);
        if (firstMeasuredPart?.measurements) {
          const m = firstMeasuredPart.measurements;
          const mainDimensionMm = Math.max(m.widthMm, m.heightMm, m.depthMm);
          await autoGenerateSizeOptions(productId, mainDimensionMm);
        }
      }

      toast.success("Produto criado com sucesso.");
      router.push(`/admin/produtos/${productId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Informações básicas</h2>

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} onChange={(e) => handleNameChange(e.target.value)} required minLength={2} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            required
            minLength={2}
          />
          <p className="text-xs text-muted-foreground">Usado na URL: /produtos/seu-slug</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="categoryId">Categoria</Label>
          <Select value={categoryId || undefined} onValueChange={(value) => setCategoryId(value ?? "")}>
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Sem categoria" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Peças e cores</h2>
          <Button type="button" size="sm" variant="outline" onClick={addPart}>
            + Adicionar peça
          </Button>
        </div>
        <p className="-mt-2 text-sm text-muted-foreground">
          Uma peça é um arquivo 3D impresso separadamente. Produtos de cor única têm uma peça só; produtos multi-cor
          têm uma peça por parte impressa em separado. Pelo menos uma peça, com pelo menos uma cor marcada, é
          obrigatória.
        </p>

        {parts.map((part, index) => (
          <PartDraftCard
            key={part.key}
            part={part}
            allMaterials={allMaterials}
            canRemove={parts.length > 1}
            onNameChange={(value) => updatePart(part.key, { name: value })}
            onFileChange={(file) => handlePartFileChange(part.key, file)}
            onToggleMaterial={(materialId) => toggleMaterial(part.key, materialId)}
            onSetDefaultMaterial={(materialId) => updatePart(part.key, { defaultMaterialId: materialId })}
            onRemove={() => removePart(part.key)}
            index={index}
          />
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Preço</h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor="basePriceReais">Preço base (R$)</Label>
          <Input
            id="basePriceReais"
            type="number"
            step="0.01"
            min="0"
            value={basePriceReais}
            onChange={(e) => setBasePriceReais(Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Pode deixar 0 por enquanto (só rascunho) — só precisa ser maior que zero pra publicar.
          </p>
        </div>
        {suggestedPriceCents ? (
          <p className="text-xs text-muted-foreground">
            Preço sugerido a partir do peso estimado do(s) arquivo(s): {formatPriceCents(suggestedPriceCents)}.{" "}
            <button
              type="button"
              onClick={applySuggestedPriceToForm}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Usar esse preço
            </button>
          </p>
        ) : null}
      </section>

      <details className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <summary className="cursor-pointer text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          SEO (opcional)
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaTitle">Título para SEO</Label>
            <Input id="metaTitle" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="metaDescription">Descrição para SEO</Label>
            <Textarea id="metaDescription" rows={2} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
          </div>
        </div>
      </details>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <Label htmlFor="status">Status</Label>
        <Select value={status} onValueChange={(value) => setStatus(value as "draft" | "published")}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? (progressLabel ?? "Salvando...") : "Criar produto"}
      </Button>
    </form>
  );
}

function PartDraftCard({
  part,
  allMaterials,
  canRemove,
  index,
  onNameChange,
  onFileChange,
  onToggleMaterial,
  onSetDefaultMaterial,
  onRemove,
}: {
  part: PartDraft;
  allMaterials: MaterialOption[];
  canRemove: boolean;
  index: number;
  onNameChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  onToggleMaterial: (materialId: string) => void;
  onSetDefaultMaterial: (materialId: string) => void;
  onRemove: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const weightEstimate = part.measurements
    ? estimatePrintWeight(part.measurements.volumeMm3, part.measurements.surfaceAreaMm2)
    : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Input
          value={part.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`peça ${index + 1}`}
          className="max-w-56"
        />
        {canRemove ? (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove} className="text-destructive">
            Remover peça
          </Button>
        ) : null}
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingOver(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) onFileChange(dropped);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
          isDraggingOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40"
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-7 text-muted-foreground">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9m0 0-3 3m3-3 3 3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        <p className="text-sm font-medium">
          {part.file ? part.file.name : "Arraste o arquivo 3D aqui ou clique pra escolher"}
        </p>
        <p className="text-[11px] text-muted-foreground">STL, OBJ ou 3MF — máximo {formatMegabytes(MAX_MESH_FILE_SIZE_BYTES)}</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".stl,.obj,.3mf"
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          onClick={(event) => event.stopPropagation()}
        />
      </div>

      {part.fileError ? <p className="text-xs text-destructive">{part.fileError}</p> : null}
      {part.isReadingFile ? <p className="text-xs text-muted-foreground">Lendo arquivo...</p> : null}
      {part.measurements ? (
        <p className="text-xs text-muted-foreground">
          Medidas: {(part.measurements.widthMm / 10).toFixed(1)} × {(part.measurements.heightMm / 10).toFixed(1)} ×{" "}
          {(part.measurements.depthMm / 10).toFixed(1)} cm, ~{weightEstimate ? Math.round(weightEstimate.weightGrams) : "?"}g
          estimados — tamanhos, peso e dimensões vão ser preenchidos automaticamente ao criar o produto.
        </p>
      ) : null}
      {part.detectedStates && part.detectedStates.length > 0 ? (
        <p className="text-xs font-medium text-primary">
          Detectamos {part.detectedStates.length} região(ões) pintada(s) neste arquivo — configure uma cor por
          região depois de criar o produto, na aba Partes.
        </p>
      ) : null}

      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Cores disponíveis</p>
        {allMaterials.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Nenhum material cadastrado ainda — crie um em /admin/materiais.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            {allMaterials.map((material) => (
              <div key={material.id} className="flex items-center gap-3 text-sm">
                <label className="flex flex-1 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={part.selectedMaterialIds.has(material.id)}
                    onChange={() => onToggleMaterial(material.id)}
                    className="size-4"
                  />
                  <span
                    className="inline-block size-3.5 rounded-full border"
                    style={{
                      background: material.hexColorSecondary
                        ? `linear-gradient(135deg, ${material.hexColor} 50%, ${material.hexColorSecondary} 50%)`
                        : (material.hexColor ?? "#a1a1aa"),
                    }}
                  />
                  {material.name}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="radio"
                    name={`default-material-${part.key}`}
                    checked={part.defaultMaterialId === material.id}
                    onChange={() => onSetDefaultMaterial(material.id)}
                    disabled={!part.selectedMaterialIds.has(material.id)}
                    className="size-3.5"
                  />
                  Padrão
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
