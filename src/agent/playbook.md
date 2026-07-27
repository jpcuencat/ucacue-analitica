# Playbook del Analista — técnicas y reglas aprendidas

Estas técnicas se aprendieron resolviendo casos reales. Aplícalas directamente:
NUNCA respondas "no se puede" si el resultado es derivable componiendo herramientas.

## Rangos de fechas (semana, quincena, mes, trimestre)
- `get_comparativo_periodo(fecha_corte="YYYY-MM-DD")` devuelve ACUMULADOS al
  corte para AMBOS periodos (aplica el mismo día/mes al periodo anterior
  automáticamente).
- Lo generado DENTRO de un rango = corte_final − corte_inicial (solo 2 llamadas):
  · "Julio de este periodo vs julio del anterior" → corte 30-jun y corte 31-jul
    (o hoy si julio está en curso); julio = la resta, comparable en ambos periodos.
  · "Semana del 13 al 17" → corte día 12 y corte día 17; la semana = la resta.
- Si el rango incluye fechas futuras, usa hoy como corte final y aclara que el
  periodo actual va "a la fecha".

## Serie día a día (detalle diario)
- Cortes consecutivos y resta entre adyacentes: para el detalle de N días se
  necesitan N+1 llamadas con fecha_corte de cada día. Lanza las llamadas en
  paralelo en una sola ronda.
- Solo para rangos ≤10 días (más días = demasiadas llamadas; ofrece el
  agregado del rango con 2 llamadas como alternativa).
- Presenta la serie como tabla markdown (fecha | periodo actual | periodo
  anterior | diferencia).

## Derivados que puedes calcular tú (sin herramienta adicional)
- Participación %: valor de cada sede/facultad/carrera sobre el total del desglose.
- Brechas: diferencia entre la categoría mayor y menor de un desglose.
- Variaciones: absoluta y porcentual entre dos cortes o dos periodos.

## Reglas de negocio confirmadas
- `/api/sedes` NO filtra por periodo: para "por sede de un periodo concreto",
  llama `get_estudiantes_kpis` una vez por sede.
- `tasa_perdida` SOLO existe en `get_cohortes`; nunca la midas en el periodo
  activo (daría -100% falso).
- Hoy los datos del periodo activo son parciales: toda comparación justa contra
  otro periodo debe ser al mismo corte (`get_comparativo_periodo`), nunca contra
  el total cerrado del periodo anterior.

## Significado de los campos en desgloses (sedes/facultades/carreras)
El desglose devuelve `inscritos`, `pagados`, `nuevos`, `repetidores`. NO son
un embudo `inscritos → pagados`; son medidas distintas:
- `inscritos`: personas inscritas en el periodo.
- `nuevos`: matriculados nuevos (equivale a "matriculados" del comparativo).
- `pagados` = `Total_Pagos`: total de pagos/matrículas pagadas, que INCLUYE a
  los repetidores y otros flujos de pago. Por eso `pagados` PUEDE superar a
  `inscritos` sin que sea un error (ej. Salud: 589 pagados vs 518 inscritos =
  normal, porque los repetidores pagan pero no cuentan como inscritos del
  periodo). En el acumulado se confirma: pagados ≈ nuevos + repetidores.
Reglas al responder:
- NUNCA presentes `pagados > inscritos` como inconsistencia, duplicidad o dato
  a vigilar: es el comportamiento esperado de dos métricas diferentes.
- Para preguntas de INSCRIPCIONES, el embudo real es inscritos → nuevos
  (matriculados). Menciona `pagados` solo si lo piden, aclarando que es total
  de pagos (incluye repetidores), no un subconjunto de inscritos.
- No mezcles `nuevos` (del desglose) con `pagados`: son cosas distintas.
