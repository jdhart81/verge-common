'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { BoundaryMap } from '@/components/boundary-map';
import {
  coordinate,
  downloadBoundary,
  draftPoints,
  draftText,
  importBoundary,
  MAX_BOUNDARY_BYTES,
  MAX_CORNERS,
} from '@/lib/boundary-editor.mjs';
import { validateBoundary } from '@/lib/monitoring.mjs';

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

export function BoundaryEditor({ value, onChange, disabled }: Props) {
  const inputId = useId();
  const [externalMap, setExternalMap] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [selected, setSelected] = useState(-1);
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<{
    point: number[];
    request: number;
  } | null>(null);
  const current = useRef({ value, disabled });
  useLayoutEffect(() => {
    current.current = { value, disabled };
    return () => {
      current.current.disabled = true;
    };
  }, [value, disabled]);
  const draft = useMemo(() => {
    try {
      return { points: draftPoints(value) as number[][], error: '' };
    } catch (e) {
      return { points: [], error: (e as Error).message };
    }
  }, [value]);
  let validation = '';
  try {
    validateBoundary(JSON.parse(value));
  } catch (e) {
    validation = value.trim()
      ? (e as Error).message
      : 'Add at least three corners or import a boundary.';
  }

  function change(next: string) {
    if (disabled || next === value) return;
    setPast((history) => [...history.slice(-99), value]);
    setFuture([]);
    setError('');
    setMessage('');
    onChange(next);
  }
  function select(index: number) {
    setSelected(index);
    if (draft.points[index]) {
      setLongitude(String(draft.points[index][0]));
      setLatitude(String(draft.points[index][1]));
    }
  }
  function update(point: number[], index = -1) {
    try {
      if (disabled) return;
      if (draft.error)
        throw new Error('Correct or clear the GeoJSON before editing corners.');
      const p = coordinate(point[0], point[1]);
      if (index < 0 && draft.points.length >= MAX_CORNERS)
        throw new Error('Use at most 200 corners.');
      if (
        draft.points.some(
          (q, i) => i !== index && q[0] === p[0] && q[1] === p[1],
        )
      )
        throw new Error(
          'That corner already exists. The boundary closes automatically.',
        );
      const points = draft.points.map((q) => [...q]);
      if (index < 0) points.push(p);
      else points[index] = p;
      change(draftText(points));
      setSelected(index < 0 ? points.length - 1 : index);
      setLongitude(String(p[0]));
      setLatitude(String(p[1]));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function entered(action: (p: number[]) => void) {
    try {
      setError('');
      action(coordinate(longitude, latitude));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-4">
      <p className="small">
        Draw corners on a map, enter coordinates, or import a boundary file.
        Save for review or download your draft before switching parcels or
        leaving this page.
      </p>
      <div className="panel mt-3">
        <p className="small">
          Loading the background map contacts OpenFreeMap. Map requests reveal
          your IP address and viewed area. Your boundary is drawn in this
          browser; it is not uploaded to the map provider.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => {
            setExternalMap(!externalMap);
            setDrawing(false);
          }}
        >
          {externalMap ? 'Turn off background map' : 'Load background map'}
        </Button>
        {externalMap && (
          <>
            <Button
              type="button"
              variant={drawing ? 'default' : 'outline'}
              className="mt-2 ml-2"
              disabled={disabled || !!draft.error}
              aria-pressed={drawing}
              onClick={() => setDrawing(!drawing)}
            >
              {drawing ? 'Finish adding corners' : 'Draw boundary corners'}
            </Button>
            <BoundaryMap
              points={draft.points}
              drawing={drawing}
              disabled={disabled || !!draft.error}
              focus={focus}
              onAdd={(p) => update(p)}
              onMove={(i, p) => update(p, i)}
              onSelect={select}
            />
            <p className="small mt-2">
              {drawing
                ? 'Click or tap to add corners in order. The closing edge is automatic.'
                : 'Pan and zoom to find your land. Choose Draw boundary corners to start.'}{' '}
              Drag numbered corners to adjust them, or select a corner and edit
              its coordinates below.
            </p>
          </>
        )}
      </div>

      <fieldset disabled={disabled} className="mt-4">
        <legend className="font-semibold">Boundary corners</legend>
        <div className="flex flex-wrap gap-2 my-3">
          <Button
            type="button"
            variant="outline"
            disabled={!past.length}
            onClick={() => {
              const previous = past.at(-1)!;
              setPast(past.slice(0, -1));
              setFuture([...future, value]);
              onChange(previous);
              setSelected(-1);
              setError('');
            }}
          >
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!future.length}
            onClick={() => {
              setPast([...past, value]);
              onChange(future.at(-1)!);
              setFuture(future.slice(0, -1));
              setSelected(-1);
              setError('');
            }}
          >
            Redo
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!value}
            onClick={() => {
              change('');
              setSelected(-1);
            }}
          >
            Clear draft
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!!validation}
            onClick={() => {
              try {
                downloadBoundary(value);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Download GeoJSON
          </Button>
        </div>
        <div>
          <label htmlFor={`${inputId}-corner`}>Corner to edit</label>
          <NativeSelect
            id={`${inputId}-corner`}
            value={selected < draft.points.length ? selected : -1}
            onChange={(event) => select(Number(event.target.value))}
          >
            <NativeSelectOption value={-1}>New corner</NativeSelectOption>
            {draft.points.map((point, index) => (
              <NativeSelectOption key={index} value={index}>
                Corner {index + 1}: {point[0]}, {point[1]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <label htmlFor={`${inputId}-longitude`}>
            Longitude
            <Input
              id={`${inputId}-longitude`}
              type="number"
              step="any"
              min="-180"
              max="180"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </label>
          <label htmlFor={`${inputId}-latitude`}>
            Latitude
            <Input
              id={`${inputId}-latitude`}
              type="number"
              step="any"
              min="-90"
              max="90"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            type="button"
            variant="outline"
            disabled={!!draft.error || draft.points.length >= MAX_CORNERS}
            onClick={() => entered((point) => update(point))}
          >
            Add corner
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={selected < 0 || !draft.points[selected]}
            onClick={() => entered((point) => update(point, selected))}
          >
            Update corner
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={selected < 0 || !draft.points[selected]}
            onClick={() => {
              change(draftText(draft.points.filter((_, i) => i !== selected)));
              setSelected(-1);
            }}
          >
            Remove corner
          </Button>
          {externalMap && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                entered((point) => setFocus({ point, request: Date.now() }))
              }
            >
              Go to coordinates
            </Button>
          )}
        </div>
        <label className="block mt-4" htmlFor={`${inputId}-file`}>
          Import GeoJSON
          <Input
            id={`${inputId}-file`}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              const startedValue = value;
              try {
                if (file.size > MAX_BOUNDARY_BYTES)
                  throw new Error('Use a boundary file under 30 KB.');
                const imported = importBoundary(await file.text());
                if (
                  current.current.disabled ||
                  current.current.value !== startedValue
                )
                  throw new Error(
                    'The draft changed while reading the file. Import again to replace the current draft.',
                  );
                change(imported);
                setSelected(-1);
                setMessage(
                  'Boundary imported. Check its shape before saving for review.',
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        <details className="mt-4">
          <summary>Edit GeoJSON directly</summary>
          <label className="block mt-2" htmlFor={`${inputId}-geojson`}>
            GeoJSON Polygon or Feature
          </label>
          <Textarea
            className="h-48 max-h-64 overflow-auto"
            id={`${inputId}-geojson`}
            value={value}
            onChange={(e) => {
              change(e.target.value);
              setSelected(-1);
            }}
            maxLength={MAX_BOUNDARY_BYTES}
            rows={7}
          />
        </details>
      </fieldset>
      <output className="small block mt-3">
        {draft.points.length} / {MAX_CORNERS} corners ·{' '}
        {validation || 'Boundary shape is ready to submit for review.'}
      </output>
      <p className="small">
        One WGS84 polygon, no holes. A drawn boundary is an estimate and
        requires independent review; it is not a boundary survey.
      </p>
      {message && <output className="small block">{message}</output>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
