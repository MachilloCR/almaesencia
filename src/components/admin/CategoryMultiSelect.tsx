import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { sileo } from "sileo";
import type { AdminCategory } from "../../services/admin-catalog";

type Props = {
  categories: AdminCategory[];
  selectedIds: string[];
  onChange: (categoryIds: string[]) => void;
  onCreateCategory: (name: string) => Promise<AdminCategory>;
  disabled?: boolean;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export default function CategoryMultiSelect({ categories, selectedIds, onChange, onCreateCategory, disabled = false }: Props) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const selected = useMemo(
    () => selectedIds.map((id) => categories.find((category) => category.id === id)).filter((category): category is AdminCategory => Boolean(category)),
    [categories, selectedIds],
  );
  const normalizedQuery = normalizeName(query);
  const suggestions = categories.filter((category) =>
    !selectedIds.includes(category.id)
    && (!normalizedQuery || normalizeName(category.name).includes(normalizedQuery)),
  );
  const exactCategoryExists = categories.some((category) => normalizeName(category.name) === normalizedQuery);
  const canCreate = normalizedQuery.length >= 2 && !exactCategoryExists;
  const optionCount = suggestions.length + Number(canCreate);
  const activeOptionId = optionCount > 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function selectCategory(category: AdminCategory) {
    if (!selectedIdsRef.current.includes(category.id)) {
      const nextIds = [...selectedIdsRef.current, category.id];
      selectedIdsRef.current = nextIds;
      onChange(nextIds);
    }
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  async function createCategory() {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      const category = await onCreateCategory(query.trim().replace(/\s+/g, " "));
      selectCategory(category);
    } catch (error) {
      sileo.error({ title: "No se pudo crear la categoría", description: error instanceof Error ? error.message : "Inténtalo de nuevo." });
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % optionCount);
    } else if (event.key === "ArrowUp" && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current - 1 + optionCount) % optionCount);
    } else if (event.key === "Enter" && open && optionCount > 0) {
      event.preventDefault();
      if (activeIndex < suggestions.length) selectCategory(suggestions[activeIndex]!);
      else void createCategory();
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(0);
    } else if (event.key === "Backspace" && query.length === 0 && !open && selectedIds.length > 0) {
      event.preventDefault();
      onChange(selectedIds.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-text-primary">Categorías</span>
        <span className="text-xs text-text-secondary">{selectedIds.length} {selectedIds.length === 1 ? "seleccionada" : "seleccionadas"}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-[#E7CCD8] bg-white focus-within:border-brand-primary focus-within:ring-3 focus-within:ring-brand-primary/12">
        <div className="flex flex-wrap items-center gap-2 p-2">
          {selected.map((category) => (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-primary-soft py-1 pl-3 pr-1 text-sm font-semibold text-brand-primary" key={category.id}>
              <span className="max-w-48 truncate">{category.name}{category.is_active ? "" : " (inactiva)"}</span>
              <button
                aria-label={`Quitar categoría ${category.name}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-primary disabled:opacity-50"
                disabled={disabled}
                onClick={() => {
                  const nextIds = selectedIdsRef.current.filter((id) => id !== category.id);
                  selectedIdsRef.current = nextIds;
                  onChange(nextIds);
                }}
                type="button"
              >
                <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </span>
          ))}
          <div className="flex w-full min-w-0 basis-full items-center gap-1">
            <input
              aria-activedescendant={open ? activeOptionId : undefined}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={open}
              aria-label="Buscar o crear categoría"
              autoComplete="off"
              className="min-h-9 min-w-0 flex-1 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none placeholder:text-text-secondary/70 focus:border-brand-primary disabled:opacity-50"
              disabled={disabled}
              onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder="Buscar o agregar…"
              role="combobox"
              value={query}
            />
            <button
              aria-controls={listboxId}
              aria-expanded={open}
              aria-label={open ? "Ocultar categorías disponibles" : "Mostrar categorías disponibles"}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-brand-primary hover:bg-brand-primary-soft focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-primary disabled:opacity-50"
              disabled={disabled}
              onClick={() => { setOpen((current) => !current); setActiveIndex(0); }}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <svg aria-hidden="true" className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <ul className="max-h-56 overflow-y-auto border-t border-border-subtle px-2 py-1" id={listboxId} role="listbox" aria-label="Categorías disponibles">
          {suggestions.map((category, index) => (
            <li key={category.id} role="presentation">
              <button
                aria-selected={activeIndex === index}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${activeIndex === index ? "bg-brand-primary-soft text-brand-primary" : "text-text-primary hover:bg-brand-primary-soft"}`}
                id={`${listboxId}-option-${index}`}
                onClick={() => selectCategory(category)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span>{category.name}{category.is_active ? "" : " (inactiva)"}</span>
                <span className="text-lg leading-none text-brand-primary" aria-hidden="true">+</span>
              </button>
            </li>
          ))}
          {canCreate && (
            <li role="presentation">
              <button
                aria-selected={activeIndex === suggestions.length}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-semibold ${activeIndex === suggestions.length ? "bg-brand-primary-soft text-brand-primary" : "text-brand-primary hover:bg-brand-primary-soft"}`}
                disabled={creating || disabled}
                id={`${listboxId}-option-${suggestions.length}`}
                onClick={() => void createCategory()}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span>{creating ? "Creando categoría…" : `Crear categoría “${query.trim()}”`}</span>
                <span className="text-lg leading-none" aria-hidden="true">+</span>
              </button>
            </li>
          )}
          {suggestions.length === 0 && !canCreate && <li className="px-3 py-2 text-sm text-text-secondary">{exactCategoryExists ? "Esa categoría ya está seleccionada." : "No hay categorías disponibles."}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
