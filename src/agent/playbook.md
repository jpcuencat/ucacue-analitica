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
