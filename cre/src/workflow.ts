// Point d'entrée du workflow CRE (DAG 4 steps).
// TODO (Nohem): définir le DAG sur les primitives du CRE SDK.
//   Step 1                -> /api/convert
//   Step 2  2A ∥ 2B       -> /api/check/public ∥ /api/compare/private
//   Step 3 (après 2A)     -> /api/compare/commercial
//   Step 4 (attend 2B+3)  -> /api/report
//   Callback              -> Registry.receiveCRECallback(...)

export {};
