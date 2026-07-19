# ADR-002: Inversión de dependencias con puerto y adaptadores

Fecha: 2026-07-17
Estado: Aceptado

## Contexto

Los 7 use cases (tools LangChain) importaban directamente el cliente HTTP.
Testearlos exigía interceptar HTTP (`responses`), acoplando los tests al
transporte; cambiar de proveedor de datos implicaba tocar los use cases.

## Opciones consideradas

1. Mantener el acoplamiento directo (tests con mocks HTTP)
2. Puerto formal (Protocol) + adaptadores intercambiables inyectados
   desde el Composition Root

## Decisión

Opción 2: `PuertoDatosAcademicos` (Protocol en `src/domain/puertos.py`),
implementado por `AdaptadorApiUcacue` (HTTP real) y `AdaptadorInMemory`
(tests). `langgraph_server._build_graph()` inyecta el adaptador real vía
`configurar_puerto()`.

## Justificación

- Los tests de aceptación corren en milisegundos sin red: cambiar de HTTP
  a memoria es una línea en el fixture, no un refactor.
- Cambiar el proveedor de datos (ej. middleware Azure → conexión directa)
  se reduce a escribir un adaptador nuevo.
- Alineado con el material de Clean Architecture del máster
  (docs/Implementando-Clean-Architecture-paso-a-paso-Parte-1-1.pdf).

## Consecuencias

### Positivas
- 5 tests de aceptación in-memory (tests/application/) sin credenciales.
- La dirección de dependencias apunta al dominio.

### Negativas
- Un nivel extra de indirección para un backend pequeño.
- El puerto es un global de módulo (service locator pragmático), no
  inyección por constructor — aceptable porque las tools LangChain son
  funciones de módulo.

## Referencias

- Verificación de no-regresión: golden test de salidas idénticas pre/post.
