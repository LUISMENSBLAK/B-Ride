import { useState, useEffect } from 'react';

/**
 * Custom Hook para retrasar la evaluación de valores que cambian rápidamente (ej. inputs de búsqueda).
 * Reduce significativamente los re-renders y previene llamadas a APIs innecesarias.
 * 
 * @param value El valor a observar (string, object, etc).
 * @param delay El retraso en milisegundos (ej. 300ms a 500ms).
 * @returns El valor tras haber pasado el tiempo sin nuevas pulsaciones.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Instalamos un temporizador
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Si el valor cambia ANTES de que el temporizador termine,
    // limpiamos el anterior cancelándolo. Así solo se ejecuta cuando terminas de escribir.
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
