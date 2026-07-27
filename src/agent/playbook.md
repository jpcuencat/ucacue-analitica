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

## Campos en desgloses (sedes/facultades/carreras)
El desglose devuelve `inscritos`, `nuevos`, `repetidores` (el campo `pagados`
se retira a propósito en la capa de datos y NO debe aparecer en respuestas).
- `inscritos`: personas inscritas en el periodo.
- `nuevos`: matriculados nuevos (equivale a "matriculados" del comparativo).
- El embudo de inscripciones es inscritos → nuevos (matriculados). No inventes
  ni pidas otras métricas de pago para estos desgloses.

## Detalle por carrera de una facultad (enriquecer, no dejar solo inscritos)
`get_carreras` es un listado ligero: solo trae `inscritos` por carrera (nada
de reservas/matrículas/tasas), y devuelve códigos granulares con muchas filas
en `inscritos: null` que NO aportan. Los KPIs completos por carrera solo los
da `get_estudiantes_kpis` filtrando una carrera a la vez. Por eso, cuando
pidan "detalle/desglose por carrera de una facultad":
1. Llama `get_carreras(periodo, facultad=...)` para ver las carreras.
2. DESCARTA las filas con `inscritos` null o 0 y ordena por inscritos desc.
3. Para las TOP 5 carreras reales, llama `get_estudiantes_kpis(
   carrera_nombre=<CARRERANOMBRE>, periodo=...)` una vez por carrera y arma
   una TABLA comparativa: inscritos · matrículas nuevas · tasa de conversión.
4. Aclara que se muestran las principales (el detalle completo por carrera
   requiere una consulta por carrera; por eso se acota a las top 5).
No entregues una tabla de solo `inscritos`: eso aporta poco.
